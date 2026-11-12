package service

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrepareQuickGenerateUploadSignsNewObjectAndReusesExistingObject(t *testing.T) {
	var statusCode = http.StatusNotFound
	headRequests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodHead, request.Method)
		headRequests++
		require.Contains(t, request.Header.Get("Authorization"), "Credential=access/")
		if statusCode == http.StatusOK {
			writer.Header().Set("Content-Length", "14")
			writer.Header().Set("Content-Type", "image/png")
		}
		writer.WriteHeader(statusCode)
	}))
	defer server.Close()

	previousClient := quickGenerateUploadHTTPClient
	quickGenerateUploadHTTPClient = server.Client()
	t.Cleanup(func() { quickGenerateUploadHTTPClient = previousClient })
	setQuickGenerateUploadTestEnv(t, server.URL)

	digest := sha256.Sum256([]byte("reference image"))
	grant, err := PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "image/png", Size: 14,
	})
	require.NoError(t, err)
	require.False(t, grant.Exists)
	require.NotEmpty(t, grant.PutURL)
	require.Equal(t, "image/png", grant.Headers["Content-Type"])
	require.NotEmpty(t, grant.Headers["x-amz-checksum-sha256"])
	putURL, err := url.Parse(grant.PutURL)
	require.NoError(t, err)
	require.Contains(t, putURL.Query().Get("X-Amz-SignedHeaders"), "content-length")
	require.Contains(t, putURL.Query().Get("X-Amz-SignedHeaders"), "x-amz-checksum-sha256")
	readURL, err := url.Parse(grant.URL)
	require.NoError(t, err)
	require.Equal(t, "3600", readURL.Query().Get("X-Amz-Expires"))
	require.True(t, strings.Contains(readURL.Path, hex.EncodeToString(digest[:])))

	statusCode = http.StatusOK
	grant, err = PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "image/png", Size: 14,
	})
	require.NoError(t, err)
	require.True(t, grant.Exists)
	require.Empty(t, grant.PutURL)
	require.Equal(t, 2, headRequests)

	grant, err = PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "image/png", Size: 14,
	})
	require.NoError(t, err)
	require.True(t, grant.Exists)
	require.Equal(t, 2, headRequests)
}

func TestPrepareQuickGenerateUploadRejectsInvalidInput(t *testing.T) {
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ENDPOINT", "")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_BUCKET", "")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY", "")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_SECRET_KEY", "")
	_, err := PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{})
	require.ErrorIs(t, err, ErrQuickGenerateUploadDisabled)

	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ENDPOINT", "https://account.r2.cloudflarestorage.com")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_BUCKET", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY", "access")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_SECRET_KEY", "secret")
	_, err = PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: "not-a-digest", ContentType: "image/png", Size: 1,
	})
	require.Error(t, err)

	digest := sha256.Sum256([]byte("audio"))
	_, err = PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "text/plain", Size: 5,
	})
	require.Error(t, err)
	_, err = PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "audio/mpeg", Size: 100 << 20,
	})
	require.Error(t, err)
}

func TestPrepareQuickGenerateUploadPreservesR2StatusForServerDiagnostics(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodHead, request.Method)
		writer.Header().Set("x-amz-request-id", "r2-request")
		writer.Header().Set("cf-ray", "cf-ray-id")
		writer.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	previousClient := quickGenerateUploadHTTPClient
	quickGenerateUploadHTTPClient = server.Client()
	t.Cleanup(func() { quickGenerateUploadHTTPClient = previousClient })
	setQuickGenerateUploadTestEnv(t, server.URL)

	digest := sha256.Sum256([]byte("quick-generate R2 error diagnostics"))
	_, err := PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "image/png", Size: 14,
	})
	require.ErrorIs(t, err, ErrQuickGenerateStorageUnavailable)
	assert.Contains(t, err.Error(), "HEAD returned status 403")
	assert.Contains(t, err.Error(), "R2 request_id=\"r2-request\"")
	assert.Contains(t, err.Error(), "cf_ray=\"cf-ray-id\"")
}

func TestRefreshQuickGenerateUploadURLSignsOnlyStoredObjectURLs(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		t.Fatalf("refresh must not call the store, got %s %s", request.Method, request.URL.Path)
	}))
	defer server.Close()
	setQuickGenerateUploadTestEnv(t, server.URL)

	digest := sha256.Sum256([]byte("reference image"))
	digestHex := hex.EncodeToString(digest[:])
	stored := server.URL + "/kiln-prod/quick-generate/" + digestHex + "?X-Amz-Signature=old"

	signed, err := RefreshQuickGenerateUploadURL(stored)
	require.NoError(t, err)
	parsed, err := url.Parse(signed)
	require.NoError(t, err)
	require.Equal(t, "/kiln-prod/quick-generate/"+digestHex, parsed.Path)
	require.Equal(t, "3600", parsed.Query().Get("X-Amz-Expires"))
	require.NotEmpty(t, parsed.Query().Get("X-Amz-Signature"))
	require.NotEqual(t, "old", parsed.Query().Get("X-Amz-Signature"))

	for _, rejected := range []string{
		"https://other.example/kiln-prod/quick-generate/" + digestHex,
		server.URL + "/other-bucket/quick-generate/" + digestHex,
		server.URL + "/kiln-prod/quick-generate/not-a-digest",
		server.URL + "/kiln-prod/quick-generate/" + digestHex + "/extra",
	} {
		_, err := RefreshQuickGenerateUploadURL(rejected)
		require.ErrorIs(t, err, errQuickGenerateInvalidUploadURL, rejected)
	}
}

func TestRefreshQuickGenerateUploadURLRequiresConfiguredStorage(t *testing.T) {
	t.Setenv(system_setting.QuickGenerateUploadEndpointEnv, "")
	t.Setenv(system_setting.QuickGenerateUploadBucketEnv, "")
	t.Setenv(system_setting.QuickGenerateUploadAccessKeyEnv, "")
	t.Setenv(system_setting.QuickGenerateUploadSecretKeyEnv, "")
	_, err := RefreshQuickGenerateUploadURL("https://example.test/kiln-prod/quick-generate/" + strings.Repeat("a", 64))
	require.ErrorIs(t, err, ErrQuickGenerateUploadDisabled)
}

// setQuickGenerateUploadTestEnv points upload storage at endpoint with a
// complete configuration.
func setQuickGenerateUploadTestEnv(t *testing.T, endpoint string) {
	t.Setenv(system_setting.QuickGenerateUploadEndpointEnv, endpoint)
	t.Setenv(system_setting.QuickGenerateUploadBucketEnv, "kiln-prod")
	t.Setenv(system_setting.QuickGenerateUploadRegionEnv, "auto")
	t.Setenv(system_setting.QuickGenerateUploadAccessKeyEnv, "access")
	t.Setenv(system_setting.QuickGenerateUploadSecretKeyEnv, "secret")
	t.Setenv(system_setting.QuickGenerateUploadPrefixEnv, "quick-generate")
	t.Setenv(system_setting.QuickGenerateUploadURLTTLSecondsEnv, "3600")
}
