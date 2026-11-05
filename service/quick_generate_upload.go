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

var quickGenerateUploadHTTPClient = &http.Client{Timeout: 8 * time.Second}
var quickGenerateUploadObjectCache = struct {
	sync.Mutex
	objects map[string]quickGenerateUploadObject
}{objects: make(map[string]quickGenerateUploadObject)}

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

func PrepareQuickGenerateUpload(ctx context.Context, input QuickGenerateUploadRequest) (*QuickGenerateUploadGrant, error) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	if err != nil {
		return nil, err
	}
	if config.Endpoint == "" {
		return nil, ErrQuickGenerateUploadDisabled
	}
	if len(input.SHA256) != sha256.Size*2 {
		return nil, errors.New("Invalid file digest")
	}
	if _, err := hex.DecodeString(input.SHA256); err != nil || strings.ToLower(input.SHA256) != input.SHA256 {
		return nil, errors.New("Invalid file digest")
	}
	if input.Size <= 0 || input.Size > system_setting.QuickGenerateUploadMaxBytes {
		return nil, errors.New("File exceeds the upload limit")
	}
	if !supportedQuickGenerateMediaType(input.ContentType) {
		return nil, errors.New("Unsupported file type")
	}

	key := input.SHA256
	if prefix := strings.Trim(config.Prefix, "/"); prefix != "" {
		key = prefix + "/" + key
	}
	objectURL, err := quickGenerateObjectURL(config, key)
	if err != nil {
		return nil, err
	}
	credentials := aws.Credentials{
		AccessKeyID: config.AccessKey, SecretAccessKey: config.SecretKey,
		Source: "quick-generate-r2",
	}
	signer := v4.NewSigner()
	now := time.Now()
	quickGenerateUploadObjectCache.Lock()
	for cachedURL, cached := range quickGenerateUploadObjectCache.objects {
		if !now.Before(cached.expiresAt) {
			delete(quickGenerateUploadObjectCache.objects, cachedURL)
		}
	}
	cached, exists := quickGenerateUploadObjectCache.objects[objectURL]
	quickGenerateUploadObjectCache.Unlock()
	if exists {
		if cached.size != input.Size || cached.mediaType != input.ContentType {
			return nil, errors.New("Stored file does not match this upload")
		}
		readURL, err := presignQuickGenerateObject(signer, credentials, http.MethodGet, objectURL, config.Region, config.TTLSeconds)
		if err != nil {
			return nil, ErrQuickGenerateStorageUnavailable
		}
		return &QuickGenerateUploadGrant{Exists: true, URL: readURL}, nil
	}
	exists, err = objectExists(ctx, signer, credentials, objectURL, config, input.Size, input.ContentType)
	if err != nil {
		if errors.Is(err, ErrQuickGenerateStorageUnavailable) {
			return nil, ErrQuickGenerateStorageUnavailable
		}
		return nil, err
	}
	if exists {
		quickGenerateUploadObjectCache.Lock()
		quickGenerateUploadObjectCache.objects[objectURL] = quickGenerateUploadObject{
			size: input.Size, mediaType: input.ContentType, expiresAt: time.Now().Add(time.Minute),
		}
		quickGenerateUploadObjectCache.Unlock()
		readURL, err := presignQuickGenerateObject(signer, credentials, http.MethodGet, objectURL, config.Region, config.TTLSeconds)
		if err != nil {
			return nil, ErrQuickGenerateStorageUnavailable
		}
		return &QuickGenerateUploadGrant{Exists: true, URL: readURL}, nil
	}

	putRequest, err := http.NewRequest(http.MethodPut, objectURL, nil)
	if err != nil {
		return nil, err
	}
	putRequest.Header.Set("Content-Type", input.ContentType)
	putRequest.Header.Set("x-amz-checksum-sha256", base64SHA256(input.SHA256))
	putRequest.ContentLength = input.Size
	query := putRequest.URL.Query()
	query.Set("X-Amz-Expires", "600")
	putRequest.URL.RawQuery = query.Encode()
	putURL, signedHeaders, err := signer.PresignHTTP(ctx, credentials, putRequest, "UNSIGNED-PAYLOAD", "s3", config.Region, time.Now(), func(options *v4.SignerOptions) {
		options.DisableHeaderHoisting = true
	})
	if err != nil {
		return nil, ErrQuickGenerateStorageUnavailable
	}
	readURL, err := presignQuickGenerateObject(signer, credentials, http.MethodGet, objectURL, config.Region, config.TTLSeconds)
	if err != nil {
		return nil, ErrQuickGenerateStorageUnavailable
	}
	headers := map[string]string{
		"Content-Type":          input.ContentType,
		"x-amz-checksum-sha256": base64SHA256(input.SHA256),
	}
	if values := signedHeaders.Values("Content-Type"); len(values) > 0 {
		headers["Content-Type"] = values[0]
	}
	return &QuickGenerateUploadGrant{URL: readURL, PutURL: putURL, Headers: headers}, nil
}

func supportedQuickGenerateMediaType(contentType string) bool {
	if strings.ContainsAny(contentType, "\r\n") {
		return false
	}
	return strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "video/") || strings.HasPrefix(contentType, "audio/")
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

func objectExists(ctx context.Context, signer *v4.Signer, credentials aws.Credentials, objectURL string, config system_setting.QuickGenerateUploadConfig, expectedSize int64, expectedType string) (bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodHead, objectURL, nil)
	if err != nil {
		return false, err
	}
	if err = signer.SignHTTP(ctx, credentials, request, fmt.Sprintf("%x", sha256.Sum256(nil)), "s3", config.Region, time.Now()); err != nil {
		return false, err
	}
	response, err := quickGenerateUploadHTTPClient.Do(request)
	if err != nil {
		return false, fmt.Errorf("%w: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		if response.ContentLength != expectedSize {
			return false, errors.New("Stored file does not match this upload")
		}
		if response.Header.Get("Content-Type") != expectedType {
			return false, errors.New("Stored file does not match this upload")
		}
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("%w: object check returned status %d", ErrQuickGenerateStorageUnavailable, response.StatusCode)
	}
}

func presignQuickGenerateObject(signer *v4.Signer, credentials aws.Credentials, method, objectURL, region string, ttlSeconds int) (string, error) {
	request, err := http.NewRequest(method, objectURL, nil)
	if err != nil {
		return "", err
	}
	query := request.URL.Query()
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", ttlSeconds))
	request.URL.RawQuery = query.Encode()
	signedURL, _, err := signer.PresignHTTP(context.Background(), credentials, request, "UNSIGNED-PAYLOAD", "s3", region, time.Now())
	return signedURL, err
}

func base64SHA256(hexDigest string) string {
	digest, _ := hex.DecodeString(hexDigest)
	return base64.StdEncoding.EncodeToString(digest)
}
