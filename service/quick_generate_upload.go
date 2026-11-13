package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
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
var errQuickGenerateInvalidUploadURL = errors.New("Invalid upload URL")

const (
	quickGenerateUploadPutTTLSeconds = 600
	quickGenerateUploadExistsTTL     = time.Minute
)

var quickGenerateUploadHTTPClient = &http.Client{Timeout: 8 * time.Second}

// quickGenerateUploadPutClient carries file bytes the gateway uploads itself;
// the probe client's 8 seconds is too short for a reference video.
var quickGenerateUploadPutClient = &http.Client{Timeout: 2 * time.Minute}

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

// QuickGenerateUploadSignRequest asks for a fresh read URL; the URL identifies
// an object this gateway already stores.
type QuickGenerateUploadSignRequest struct {
	URL string `json:"url"`
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

// loadQuickGenerateUploadConfig reports configured storage as disabled when
// only part of the endpoint settings is present.
func loadQuickGenerateUploadConfig() (system_setting.QuickGenerateUploadConfig, error) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	if err != nil {
		return config, err
	}
	if config.Endpoint == "" {
		return config, ErrQuickGenerateUploadDisabled
	}
	return config, nil
}

func PrepareQuickGenerateUpload(ctx context.Context, input QuickGenerateUploadRequest) (*QuickGenerateUploadGrant, error) {
	config, err := loadQuickGenerateUploadConfig()
	if err != nil {
		return nil, err
	}
	return prepareQuickGenerateUpload(ctx, config, input)
}

func prepareQuickGenerateUpload(ctx context.Context, config system_setting.QuickGenerateUploadConfig, input QuickGenerateUploadRequest) (*QuickGenerateUploadGrant, error) {
	if err := validateQuickGenerateUploadRequest(input); err != nil {
		return nil, err
	}

	objectURL, err := quickGenerateDigestObjectURL(config, input.SHA256)
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

// QuickGenerateUploadConfigured reports whether the object storage that holds
// uploaded reference media is configured.
func QuickGenerateUploadConfigured() bool {
	_, err := loadQuickGenerateUploadConfig()
	return err == nil
}

// StoreQuickGenerateObject uploads bytes the gateway already holds and returns
// a signed read URL that any client can fetch without credentials. Repeated
// content reuses the stored object.
func StoreQuickGenerateObject(ctx context.Context, contentType string, data []byte) (string, error) {
	_, url, _, err := storeQuickGenerateObject(ctx, contentType, data)
	return url, err
}

// storeQuickGenerateObject is the one object-write path: it returns the
// content digest, the signed read URL, and the config that signed it, so
// callers that also key on the digest share the upload semantics.
func storeQuickGenerateObject(ctx context.Context, contentType string, data []byte) (string, string, system_setting.QuickGenerateUploadConfig, error) {
	config, err := loadQuickGenerateUploadConfig()
	if err != nil {
		return "", "", config, err
	}
	digest := sha256.Sum256(data)
	hexDigest := hex.EncodeToString(digest[:])
	grant, err := prepareQuickGenerateUpload(ctx, config, QuickGenerateUploadRequest{
		SHA256:      hexDigest,
		ContentType: contentType,
		Size:        int64(len(data)),
	})
	if err != nil {
		return "", "", config, err
	}
	if !grant.Exists {
		if err := putQuickGenerateObject(ctx, grant, data); err != nil {
			return "", "", config, err
		}
	}
	return hexDigest, grant.URL, config, nil
}

// putQuickGenerateObject sends the bytes a grant reserved a slot for.
func putQuickGenerateObject(ctx context.Context, grant *QuickGenerateUploadGrant, data []byte) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, grant.PutURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	for name, value := range grant.Headers {
		request.Header.Set(name, value)
	}
	response, err := quickGenerateUploadPutClient.Do(request)
	if err != nil {
		return fmt.Errorf("%w: upload failed: %v", ErrQuickGenerateStorageUnavailable, quickGenerateStorageRequestCause(err))
	}
	_, _ = io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return quickGenerateStorageResponseError(http.MethodPut, response)
	}
	return nil
}

// RefreshQuickGenerateUploadURL re-signs a read URL this gateway issued. A
// stored reference URL can expire while a task waits or after a page reload,
// so the console exchanges it for a fresh signature before resubmitting.
func RefreshQuickGenerateUploadURL(rawURL string) (string, error) {
	config, err := loadQuickGenerateUploadConfig()
	if err != nil {
		return "", err
	}
	objectURL, err := quickGenerateObjectURLFromReference(config, rawURL)
	if err != nil {
		return "", err
	}
	return signStoredObjectURL(config, objectURL)
}

// signStoredObjectURL signs a read URL for an object the gateway already
// stores, so upload, refresh and asset resolution share one signing path.
func signStoredObjectURL(config system_setting.QuickGenerateUploadConfig, objectURL string) (string, error) {
	grant, err := newQuickGenerateUploadStorage(config).grantExistingObject(objectURL)
	if err != nil {
		return "", err
	}
	return grant.URL, nil
}

func validateQuickGenerateUploadRequest(input QuickGenerateUploadRequest) error {
	if !quickGenerateDigestValid(input.SHA256) {
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

// quickGenerateDigestObjectURL addresses the object a content digest names, so
// every reader that only knows the digest builds the URL the same way.
func quickGenerateDigestObjectURL(config system_setting.QuickGenerateUploadConfig, digest string) (string, error) {
	return quickGenerateObjectURL(config, quickGenerateObjectKey(config.Prefix, digest))
}

func quickGenerateDigestValid(digest string) bool {
	if len(digest) != sha256.Size*2 || strings.ToLower(digest) != digest {
		return false
	}
	_, err := hex.DecodeString(digest)
	return err == nil
}

// quickGenerateObjectURLFromReference accepts only a read URL this gateway
// issued and returns the object URL it addresses, so a refresh can never sign
// an arbitrary host or key. Rebuilding the object URL with the same helpers
// that mint it keeps the layout in one place.
func quickGenerateObjectURLFromReference(config system_setting.QuickGenerateUploadConfig, rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", errQuickGenerateInvalidUploadURL
	}
	digest := path.Base(parsed.Path)
	if !quickGenerateDigestValid(digest) {
		return "", errQuickGenerateInvalidUploadURL
	}
	objectURL, err := quickGenerateDigestObjectURL(config, digest)
	if err != nil {
		return "", errQuickGenerateInvalidUploadURL
	}
	expected, err := url.Parse(objectURL)
	if err != nil || parsed.Scheme != expected.Scheme || parsed.Host != expected.Host || parsed.Path != expected.Path {
		return "", errQuickGenerateInvalidUploadURL
	}
	return objectURL, nil
}

// stagedObjectMatchesInput reports whether the size and media type storage
// reports for an object are the ones the request declared.
func stagedObjectMatchesInput(size int64, mediaType string, input QuickGenerateUploadRequest) bool {
	return size == input.Size && mediaType == input.ContentType
}

// findObject reports whether the object is already stored, using a short-lived
// cache so a repeated reference does not cost a HEAD request.
func (s quickGenerateUploadStorage) findObject(ctx context.Context, objectURL string, input QuickGenerateUploadRequest) (bool, error) {
	if cached, ok := quickGenerateUploadCacheLookup(objectURL); ok {
		if !stagedObjectMatchesInput(cached.size, cached.mediaType, input) {
			return false, errQuickGenerateUploadMismatch
		}
		return true, nil
	}
	size, mediaType, exists, err := s.objectStored(ctx, objectURL)
	if err != nil {
		if errors.Is(err, ErrQuickGenerateStorageUnavailable) {
			return false, fmt.Errorf("check existing object: %w", err)
		}
		return false, err
	}
	if exists && !stagedObjectMatchesInput(size, mediaType, input) {
		return false, errQuickGenerateUploadMismatch
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
		return nil, fmt.Errorf("%w: sign download URL: %v", ErrQuickGenerateStorageUnavailable, err)
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
		return nil, fmt.Errorf("%w: sign download URL: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	return &QuickGenerateUploadGrant{URL: readURL, PutURL: putURL, Headers: headers}, nil
}

// objectStored reports whether the object exists and, when it does, the size
// and media type storage reports for it.
func (s quickGenerateUploadStorage) objectStored(ctx context.Context, objectURL string) (int64, string, bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodHead, objectURL, nil)
	if err != nil {
		return 0, "", false, fmt.Errorf("%w: create object HEAD request: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	if err = s.sign(ctx, request); err != nil {
		return 0, "", false, fmt.Errorf("%w: sign object HEAD request: %v", ErrQuickGenerateStorageUnavailable, err)
	}
	response, err := quickGenerateUploadHTTPClient.Do(request)
	if err != nil {
		return 0, "", false, fmt.Errorf("%w: object HEAD request failed: %v", ErrQuickGenerateStorageUnavailable, quickGenerateStorageRequestCause(err))
	}
	response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		return response.ContentLength, response.Header.Get("Content-Type"), true, nil
	case http.StatusNotFound:
		return 0, "", false, nil
	default:
		return 0, "", false, quickGenerateStorageResponseError(http.MethodHead, response)
	}
}

func quickGenerateStorageResponseError(method string, response *http.Response) error {
	return fmt.Errorf("%w: %s returned status %d (R2 request_id=%q, cf_ray=%q)", ErrQuickGenerateStorageUnavailable, method, response.StatusCode, response.Header.Get("x-amz-request-id"), response.Header.Get("cf-ray"))
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
		return "", nil, fmt.Errorf("%w: sign upload URL: %v", ErrQuickGenerateStorageUnavailable, err)
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

func quickGenerateStorageRequestCause(err error) error {
	var requestError *url.Error
	if errors.As(err, &requestError) {
		return requestError.Err
	}
	return err
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

// sign authorizes a request with SigV4. The payload hash must also travel as a
// header: R2 answers 400 InvalidArgument (Authorization) for a header-signed
// request that omits x-amz-content-sha256.
func (s quickGenerateUploadStorage) sign(ctx context.Context, request *http.Request) error {
	payloadHash := fmt.Sprintf("%x", sha256.Sum256(nil))
	request.Header.Set("x-amz-content-sha256", payloadHash)
	return s.signer.SignHTTP(ctx, s.credentials, request, payloadHash, "s3", s.config.Region, time.Now())
}

func base64SHA256(hexDigest string) string {
	digest, _ := hex.DecodeString(hexDigest)
	return base64.StdEncoding.EncodeToString(digest)
}
