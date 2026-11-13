package service

import (
	"bytes"
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// assetScheme prefixes the id a client stores instead of a URL. The id is the
// content digest, so the same bytes always come back as the same asset and no
// database is needed to find the object again.
const assetScheme = "assets://"

var (
	ErrAssetInvalidReference = errors.New("Invalid asset reference")
	ErrAssetNotFound         = errors.New("Asset not found")
)

// AssetReferenceError names the reference a request failed on, so the error
// returned to the client can point at the value it sent.
type AssetReferenceError struct {
	Reference string
	Err       error
}

func (e *AssetReferenceError) Error() string { return e.Err.Error() }
func (e *AssetReferenceError) Unwrap() error { return e.Err }

// AssetURLResolver turns an assets:// reference into a URL the gateway can
// forward upstream.
type AssetURLResolver func(ctx context.Context, reference string) (string, error)

// assetURLs caches the signed URL of a resolved asset, so a request that uses
// the same asset twice signs it once. Entries expire before their signature,
// so a cached URL is still valid whenever it is returned; an evicted entry
// costs one HEAD and one signature, never an upload.
var assetURLs = struct {
	sync.Mutex
	entries map[string]assetURLEntry
}{entries: make(map[string]assetURLEntry)}

// assetURLCacheMaxEntries bounds memory a client can claim by resolving
// distinct digests. The cache is an optimization, so dropping it wholesale is
// safe and cheaper than tracking recency.
const assetURLCacheMaxEntries = 4096

type assetURLEntry struct {
	url       string
	expiresAt time.Time
}

// parseAssetID accepts only the scheme followed by a SHA-256 digest, so the
// reference is a name for a key in our own bucket and nothing else.
func parseAssetID(reference string) (string, bool) {
	digest, ok := strings.CutPrefix(reference, assetScheme)
	if !ok || !quickGenerateDigestValid(digest) {
		return "", false
	}
	return digest, true
}

// StoreAsset stores bytes the gateway already holds and returns the reference
// clients keep. The signed URL stays inside the gateway: callers only ever see
// the assets:// id. Repeated content reuses the stored object.
func StoreAsset(ctx context.Context, contentType string, data []byte) (string, error) {
	digest, url, config, err := storeQuickGenerateObject(ctx, contentType, data)
	if err != nil {
		return "", err
	}
	cacheAssetURL(digest, url, config)
	return assetScheme + digest, nil
}

// ResolveAssetURL returns a signed URL for an asset reference. A cached URL is
// returned as is; otherwise the object is confirmed in storage and signed
// again, so the reference keeps working after the cache or the process is gone.
func ResolveAssetURL(ctx context.Context, reference string) (string, error) {
	digest, ok := parseAssetID(reference)
	if !ok {
		return "", ErrAssetInvalidReference
	}
	if url, ok := lookupAssetURL(digest); ok {
		return url, nil
	}
	config, err := loadQuickGenerateUploadConfig()
	if err != nil {
		return "", err
	}
	objectURL, err := quickGenerateDigestObjectURL(config, digest)
	if err != nil {
		return "", err
	}
	_, _, stored, err := newQuickGenerateUploadStorage(config).objectStored(ctx, objectURL)
	if err != nil {
		return "", err
	}
	if !stored {
		return "", ErrAssetNotFound
	}
	url, err := signStoredObjectURL(config, objectURL)
	if err != nil {
		return "", err
	}
	cacheAssetURL(digest, url, config)
	return url, nil
}

// assetReferencePattern matches a whole JSON string that begins with the
// scheme, valid or not, so an unusable reference is refused here instead of
// reaching the vendor as a bogus URL. A string that merely mentions the scheme
// in passing does not start with it and is left alone.
var assetReferencePattern = regexp.MustCompile(`"` + regexp.QuoteMeta(assetScheme) + `[^"\\]*"`)

// assetReferencePrefix is the literal the pattern must start with, so a body
// that only mentions the scheme in prose skips the regex scan entirely.
var assetReferencePrefix = []byte(`"` + assetScheme)

// ResolveAssetReferences replaces every assets:// value in a JSON request body
// with its public URL and reports whether the body changed. A malformed or
// unresolvable reference fails the request rather than being forwarded.
func ResolveAssetReferences(ctx context.Context, body []byte, resolve AssetURLResolver) ([]byte, bool, error) {
	if !bytes.Contains(body, assetReferencePrefix) {
		return body, false, nil
	}
	var resolveErr error
	changed := false
	resolved := assetReferencePattern.ReplaceAllFunc(body, func(match []byte) []byte {
		if resolveErr != nil {
			return match
		}
		reference := string(match[1 : len(match)-1])
		if _, ok := parseAssetID(reference); !ok {
			resolveErr = &AssetReferenceError{Reference: reference, Err: ErrAssetInvalidReference}
			return match
		}
		url, err := resolve(ctx, reference)
		if err != nil {
			resolveErr = &AssetReferenceError{Reference: reference, Err: err}
			return match
		}
		quoted, err := common.Marshal(url)
		if err != nil {
			resolveErr = err
			return match
		}
		changed = true
		return quoted
	})
	if resolveErr != nil {
		return nil, false, resolveErr
	}
	return resolved, changed, nil
}

func cacheAssetURL(digest, url string, config system_setting.QuickGenerateUploadConfig) {
	assetURLs.Lock()
	defer assetURLs.Unlock()
	if len(assetURLs.entries) >= assetURLCacheMaxEntries {
		clear(assetURLs.entries)
	}
	ttl := time.Duration(config.TTLSeconds) * time.Second
	// Keep the cached URL shorter-lived than its signature.
	assetURLs.entries[digest] = assetURLEntry{
		url:       url,
		expiresAt: time.Now().Add(ttl - ttl/5),
	}
}

func lookupAssetURL(digest string) (string, bool) {
	assetURLs.Lock()
	defer assetURLs.Unlock()
	entry, ok := assetURLs.entries[digest]
	if !ok {
		return "", false
	}
	if !time.Now().Before(entry.expiresAt) {
		delete(assetURLs.entries, digest)
		return "", false
	}
	return entry.url, true
}
