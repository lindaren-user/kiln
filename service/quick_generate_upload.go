package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/signer/v4"
)

var ErrQuickGenerateUploadDisabled = errors.New("quick generate upload storage is not configured")
var ErrQuickGenerateStorageUnavailable = errors.New("Temporary file storage is unavailable")
var errQuickGenerateUploadMismatch = errors.New("Stored file does not match this upload")
var errQuickGenerateInvalidDigest = errors.New("Invalid file digest")

const (
	quickGenerateUploadPutTTLSeconds = 600
	quickGenerateUploadExistsTTL     = time.Minute
)

var quickGenerateUploadHTTPClient = &http.Client{Timeout: 8 * time.Second}

var quickGenerateUploadObjects = struct {
	sync.Mutex
	entries map[string]quickGenerateUploadObject
}{entries: make(map[string]quickGenerateUploadObject)}

type quickGenerateUploadObject struct {
	size      int64
	mediaType string
	expiresAt time.Time
}

type QuickGenerateUploadRequest struct {
	SHA256      string `json:"sha256"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type QuickGenerateUploadGrant struct {
	Exists  bool              `json:"exists"`
	URL     string            `json:"url"`
	PutURL  string            `json:"put_url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// quickGenerateUploadStorage signs requests for one configured bucket.
type quickGenerateUploadStorage struct {
	signer      *v4.Signer
	credentials aws.Credentials
	config      system_setting.QuickGenerateUploadConfig
}

func newQuickGenerateUploadStorage(config system_setting.QuickGenerateUploadConfig) quickGenerateUploadStorage {
	return quickGenerateUploadStorage{
		signer: v4.NewSigner(),
		credentials: aws.Credentials{
			AccessKeyID:     config.AccessKey,
			SecretAccessKey: config.SecretKey,
			Source:          "quick-generate-r2",
		},
		config: config,
	}
}

func PrepareQuickGenerateUpload(ctx context.Context, input QuickGenerateUploadRequest) (*QuickGenerateUploadGrant, error) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	if err != nil {
		return nil, err
	}
	if config.Endpoint == "" {
		return nil, ErrQuickGenerateUploadDisabled
	}
	if err := validateQuickGenerateUploadRequest(input); err != nil {
		return nil, err
	}

	objectURL, err := quickGenerateObjectURL(config, quickGenerateObjectKey(config.Prefix, input.SHA256))
	if err != nil {
		return nil, err
	}
	storage := newQuickGenerateUploadStorage(config)

	stored, err := storage.findObject(ctx, objectURL, input)
	if err != nil {
		return nil, err
	}
	if stored {
		return storage.grantExistingObject(objectURL)
	}
	return storage.grantNewObject(ctx, objectURL, input)
}

func validateQuickGenerateUploadRequest(input QuickGenerateUploadRequest) error {
	if len(input.SHA256) != sha256.Size*2 || strings.ToLower(input.SHA256) != input.SHA256 {
		return errQuickGenerateInvalidDigest
	}
	if _, err := hex.DecodeString(input.SHA256); err != nil {
		return errQuickGenerateInvalidDigest
	}
	if input.Size <= 0 || input.Size > system_setting.QuickGenerateUploadMaxBytes {
		return errors.New("File exceeds the upload limit")
	}
	if !supportedQuickGenerateMediaType(input.ContentType) {
		return errors.New("Unsupported file type")
	}
	return nil
}

func supportedQuickGenerateMediaType(contentType string) bool {
	if strings.ContainsAny(contentType, "\r\n") {
		return false
	}
	return strings.HasPrefix(contentType, "image/") ||
		strings.HasPrefix(contentType, "video/") ||
		strings.HasPrefix(contentType, "audio/")
}

func quickGenerateObjectKey(prefix, digest string) string {
	if prefix = strings.Trim(prefix, "/"); prefix != "" {
		return prefix + "/" + digest
	}
	return digest
}

func quickGenerateObjectURL(config system_setting.QuickGenerateUploadConfig, key string) (string, error) {
	endpoint, err := url.Parse(config.Endpoint)
	if err != nil {
		return "", err
	}
	objectURL := *endpoint
	objectURL.Path = strings.TrimRight(endpoint.Path, "/") + "/" + config.Bucket + "/" + key
	objectURL.RawPath = ""
	return objectURL.String(), nil
}

// findObject reports whether the object is already stored, using a short-lived
// cache so a repeated reference does not cost a HEAD request.
func (s quickGenerateUploadStorage) findObject(ctx context.Context, objectURL string, input QuickGenerateUploadRequest) (bool, error) {
	if cached, ok := quickGenerateUploadCacheLookup(objectURL); ok {
		if cached.size != input.Size || cached.mediaType != input.ContentType {
			return false, errQuickGenerateUploadMismatch
		}
		return true, nil
	}
	exists, err := s.objectExists(ctx, objectURL, input.Size, input.ContentType)
	if err != nil {
		if errors.Is(err, ErrQuickGenerateStorageUnavailable) {
			return false, ErrQuickGenerateStorageUnavailable
		}
		return false, err
	}
	if exists {
		quickGenerateUploadCacheStore(objectURL, input)
	}
	return exists, nil
}

func quickGenerateUploadCacheLookup(objectURL string) (quickGenerateUploadObject, bool) {
	now := time.Now()
	quickGenerateUploadObjects.Lock()
	defer quickGenerateUploadObjects.Unlock()
	for cachedURL, cached := range quickGenerateUploadObjects.entries {
		if !now.Before(cached.expiresAt) {
			delete(quickGenerateUploadObjects.entries, cachedURL)
		}
	}
	cached, ok := quickGenerateUploadObjects.entries[objectURL]
	return cached, ok
}

func quickGenerateUploadCacheStore(objectURL string, input QuickGenerateUploadRequest) {
	quickGenerateUploadObjects.Lock()
	defer quickGenerateUploadObjects.Unlock()
	quickGenerateUploadObjects.entries[objectURL] = quickGenerateUploadObject{
		size:      input.Size,
		mediaType: input.ContentType,
		expiresAt: time.Now().Add(quickGenerateUploadExistsTTL),
	}
}

func (s quickGenerateUploadStorage) grantExistingObject(objectURL string) (*QuickGenerateUploadGrant, error) {
	readURL, err := s.presign(http.MethodGet, objectURL, s.config.TTLSeconds)
	if err != nil {
		return nil, ErrQuickGenerateStorageUnavailable
	}
	return &QuickGenerateUploadGrant{Exists: true, URL: readURL}, nil
}

func (s quickGenerateUploadStorage) grantNewObject(ctx context.Context, objectURL string, input QuickGenerateUploadRequest) (*QuickGenerateUploadGrant, error) {
	putURL, headers, err := s.presignPut(ctx, objectURL, input)
	if err != nil {
		return nil, err
	}
	readURL, err := s.presign(http.MethodGet, objectURL, s.config.TTLSeconds)
	if err != nil {
		return nil, ErrQuickGenerateStorageUnavailable
	}
	return &QuickGenerateUploadGrant{URL: readURL, PutURL: putURL, Headers: headers}, nil
}

func (s quickGenerateUploadStorage) objectExists(ctx context.Context, objectURL string, expectedSize int64, expectedType string) (bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodHead, objectURL, nil)
	if err != nil {
		return false, err
	}
	if err = s.sign(ctx, request); err != nil {
		return false, err
	}
	response, err := quickGenerateUploadHTTPClient.Do(request)
	if err != nil {
		return false, fmt.Errorf("%w: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		if response.ContentLength != expectedSize || response.Header.Get("Content-Type") != expectedType {
			return false, errQuickGenerateUploadMismatch
		}
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("%w: object check returned status %d", ErrQuickGenerateStorageUnavailable, response.StatusCode)
	}
}

func (s quickGenerateUploadStorage) presignPut(ctx context.Context, objectURL string, input QuickGenerateUploadRequest) (string, map[string]string, error) {
	checksum := base64SHA256(input.SHA256)
	request, err := http.NewRequest(http.MethodPut, objectURL, nil)
	if err != nil {
		return "", nil, err
	}
	request.Header.Set("Content-Type", input.ContentType)
	request.Header.Set("x-amz-checksum-sha256", checksum)
	request.ContentLength = input.Size
	query := request.URL.Query()
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", quickGenerateUploadPutTTLSeconds))
	request.URL.RawQuery = query.Encode()

	putURL, signedHeaders, err := s.signer.PresignHTTP(ctx, s.credentials, request, "UNSIGNED-PAYLOAD", "s3", s.config.Region, time.Now(), func(options *v4.SignerOptions) {
		options.DisableHeaderHoisting = true
	})
	if err != nil {
		return "", nil, ErrQuickGenerateStorageUnavailable
	}
	headers := map[string]string{
		"Content-Type":          input.ContentType,
		"x-amz-checksum-sha256": checksum,
	}
	if values := signedHeaders.Values("Content-Type"); len(values) > 0 {
		headers["Content-Type"] = values[0]
	}
	return putURL, headers, nil
}

func (s quickGenerateUploadStorage) presign(method, objectURL string, ttlSeconds int) (string, error) {
	request, err := http.NewRequest(method, objectURL, nil)
	if err != nil {
		return "", err
	}
	query := request.URL.Query()
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", ttlSeconds))
	request.URL.RawQuery = query.Encode()
	signedURL, _, err := s.signer.PresignHTTP(context.Background(), s.credentials, request, "UNSIGNED-PAYLOAD", "s3", s.config.Region, time.Now())
	return signedURL, err
}

func (s quickGenerateUploadStorage) sign(ctx context.Context, request *http.Request) error {
	return s.signer.SignHTTP(ctx, s.credentials, request, fmt.Sprintf("%x", sha256.Sum256(nil)), "s3", s.config.Region, time.Now())
}

func base64SHA256(hexDigest string) string {
	digest, _ := hex.DecodeString(hexDigest)
	return base64.StdEncoding.EncodeToString(digest)
}
