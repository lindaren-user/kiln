package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

var (
	ErrQuickGenerateMultipartDisabled = errors.New("quick generate multipart upload is not configured")
	ErrQuickGenerateMultipartInvalid  = errors.New("Invalid multipart upload request")
)

const (
	quickGeneratePartMinBytes = 5 << 20
	quickGeneratePartBytes    = 8 << 20
	quickGeneratePartTTL      = 15 * time.Minute
	quickGenerateMaxPartCount = 10000
)

var quickGenerateETagPattern = regexp.MustCompile(`^"?[0-9a-zA-Z-]{1,128}"?$`)

type QuickGenerateMultipartBeginRequest struct {
	SHA256      string `json:"sha256"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type QuickGenerateMultipartPart struct {
	PartNumber int    `json:"part_number"`
	URL        string `json:"url"`
}

type QuickGenerateMultipartGrant struct {
	Exists   bool                         `json:"exists"`
	URL      string                       `json:"url"`
	Key      string                       `json:"key,omitempty"`
	UploadID string                       `json:"upload_id,omitempty"`
	PartSize int64                        `json:"part_size,omitempty"`
	Parts    []QuickGenerateMultipartPart `json:"parts,omitempty"`
}

type QuickGenerateMultipartETag struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
}

type QuickGenerateMultipartCompleteRequest struct {
	Key         string                       `json:"key"`
	UploadID    string                       `json:"upload_id"`
	ContentType string                       `json:"content_type"`
	Size        int64                        `json:"size"`
	SHA256      string                       `json:"sha256"`
	Parts       []QuickGenerateMultipartETag `json:"parts"`
}

type quickGenerateInitiateMultipartResult struct {
	UploadID string `xml:"UploadId"`
}

// BeginQuickGenerateMultipartUpload reserves a multipart upload and returns one
// presigned URL per part, so a large file reaches the bucket in slices instead
// of a single long request the browser may abandon.
func BeginQuickGenerateMultipartUpload(ctx context.Context, input QuickGenerateMultipartBeginRequest) (*QuickGenerateMultipartGrant, error) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	if err != nil {
		return nil, err
	}
	if config.Endpoint == "" {
		return nil, ErrQuickGenerateMultipartDisabled
	}
	request := QuickGenerateUploadRequest{SHA256: input.SHA256, ContentType: input.ContentType, Size: input.Size}
	if err := validateQuickGenerateUploadRequest(request); err != nil {
		return nil, err
	}

	key := quickGenerateObjectKey(config.Prefix, input.SHA256)
	objectURL, err := quickGenerateObjectURL(config, key)
	if err != nil {
		return nil, err
	}
	storage := newQuickGenerateUploadStorage(config)

	stored, err := storage.findObject(ctx, objectURL, request)
	if err != nil {
		return nil, err
	}
	if stored {
		grant, err := storage.grantExistingObject(objectURL)
		if err != nil {
			return nil, err
		}
		return &QuickGenerateMultipartGrant{Exists: true, URL: grant.URL}, nil
	}

	uploadID, err := storage.initiateMultipart(ctx, objectURL)
	if err != nil {
		return nil, err
	}
	partSize := quickGenerateMultipartPartSize(input.Size)
	partCount := int((input.Size + partSize - 1) / partSize)
	if partCount == 0 || partCount > quickGenerateMaxPartCount {
		return nil, ErrQuickGenerateMultipartInvalid
	}
	parts := make([]QuickGenerateMultipartPart, 0, partCount)
	for number := 1; number <= partCount; number++ {
		partURL, err := storage.presignPart(objectURL, uploadID, number)
		if err != nil {
			return nil, ErrQuickGenerateStorageUnavailable
		}
		parts = append(parts, QuickGenerateMultipartPart{PartNumber: number, URL: partURL})
	}
	return &QuickGenerateMultipartGrant{
		Key:      key,
		UploadID: uploadID,
		PartSize: partSize,
		Parts:    parts,
	}, nil
}

// CompleteQuickGenerateMultipartUpload assembles the parts and verifies the
// stored object against the declared size and type before handing back a URL.
func CompleteQuickGenerateMultipartUpload(ctx context.Context, input QuickGenerateMultipartCompleteRequest) (*QuickGenerateUploadGrant, error) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	if err != nil {
		return nil, err
	}
	if config.Endpoint == "" {
		return nil, ErrQuickGenerateMultipartDisabled
	}
	request := QuickGenerateUploadRequest{SHA256: input.SHA256, ContentType: input.ContentType, Size: input.Size}
	if err := validateQuickGenerateUploadRequest(request); err != nil {
		return nil, err
	}
	key := quickGenerateObjectKey(config.Prefix, input.SHA256)
	if input.Key != key || strings.TrimSpace(input.UploadID) == "" || len(input.Parts) == 0 {
		return nil, ErrQuickGenerateMultipartInvalid
	}

	objectURL, err := quickGenerateObjectURL(config, key)
	if err != nil {
		return nil, err
	}
	storage := newQuickGenerateUploadStorage(config)
	if err := storage.completeMultipart(ctx, objectURL, input.UploadID, input.Parts); err != nil {
		return nil, err
	}
	exists, err := storage.objectExists(ctx, objectURL, input.Size, input.ContentType)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, errQuickGenerateUploadMismatch
	}
	quickGenerateUploadCacheStore(objectURL, request)
	return storage.grantExistingObject(objectURL)
}

// quickGenerateMultipartPartSize grows the slice for bigger files, keeping a
// 100 MB reference under two dozen requests.
func quickGenerateMultipartPartSize(size int64) int64 {
	partSize := int64(quickGeneratePartBytes)
	for size/partSize > 12 && partSize < 32<<20 {
		partSize *= 2
	}
	return max(partSize, int64(quickGeneratePartMinBytes))
}

func (s quickGenerateUploadStorage) initiateMultipart(ctx context.Context, objectURL string) (string, error) {
	endpoint, err := url.Parse(objectURL)
	if err != nil {
		return "", err
	}
	endpoint.RawQuery = "uploads="
	response, err := s.send(ctx, http.MethodPost, endpoint, nil, nil)
	if err != nil {
		return "", err
	}
	var result quickGenerateInitiateMultipartResult
	if err := xml.Unmarshal(response, &result); err != nil || result.UploadID == "" {
		return "", ErrQuickGenerateStorageUnavailable
	}
	return result.UploadID, nil
}

func (s quickGenerateUploadStorage) presignPart(objectURL, uploadID string, partNumber int) (string, error) {
	endpoint, err := url.Parse(objectURL)
	if err != nil {
		return "", err
	}
	query := endpoint.Query()
	query.Set("partNumber", strconv.Itoa(partNumber))
	query.Set("uploadId", uploadID)
	query.Set("X-Amz-Expires", strconv.Itoa(int(quickGeneratePartTTL.Seconds())))
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequest(http.MethodPut, endpoint.String(), nil)
	if err != nil {
		return "", err
	}
	signed, _, err := s.signer.PresignHTTP(context.Background(), s.credentials, request, "UNSIGNED-PAYLOAD", "s3", s.config.Region, time.Now())
	return signed, err
}

// completeMultipart sends the part list the browser reported. ETags come from
// the client, so every one is validated before it enters the XML body.
func (s quickGenerateUploadStorage) completeMultipart(ctx context.Context, objectURL, uploadID string, parts []QuickGenerateMultipartETag) error {
	numbers := make([]int, 0, len(parts))
	var body strings.Builder
	body.WriteString("<CompleteMultipartUpload>")
	for _, part := range parts {
		if part.PartNumber < 1 || part.PartNumber > quickGenerateMaxPartCount || !quickGenerateETagPattern.MatchString(part.ETag) {
			return ErrQuickGenerateMultipartInvalid
		}
		numbers = append(numbers, part.PartNumber)
		fmt.Fprintf(&body, "<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>", part.PartNumber, part.ETag)
	}
	body.WriteString("</CompleteMultipartUpload>")
	sorted := slices.Clone(numbers)
	slices.Sort(sorted)
	if len(slices.Compact(slices.Clone(sorted))) != len(sorted) {
		return ErrQuickGenerateMultipartInvalid
	}

	endpoint, err := url.Parse(objectURL)
	if err != nil {
		return err
	}
	query := endpoint.Query()
	query.Set("uploadId", uploadID)
	endpoint.RawQuery = query.Encode()
	payload := []byte(body.String())
	_, err = s.send(ctx, http.MethodPost, endpoint, payload, map[string]string{"Content-Type": "application/xml"})
	return err
}

// send signs a small object-store request with its payload hash and returns the
// response body; an unreadable or failing store maps to the shared error.
func (s quickGenerateUploadStorage) send(ctx context.Context, method string, endpoint *url.URL, payload []byte, headers map[string]string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	request.ContentLength = int64(len(payload))
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	sum := sha256.Sum256(payload)
	if err := s.signer.SignHTTP(ctx, s.credentials, request, hex.EncodeToString(sum[:]), "s3", s.config.Region, time.Now()); err != nil {
		return nil, ErrQuickGenerateStorageUnavailable
	}
	response, err := quickGenerateUploadHTTPClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("%w: object store returned status %d", ErrQuickGenerateStorageUnavailable, response.StatusCode)
	}
	return body, nil
}
