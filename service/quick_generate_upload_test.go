package service

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

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
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ENDPOINT", server.URL)
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_BUCKET", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_REGION", "auto")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY", "access")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_SECRET_KEY", "secret")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_PREFIX", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_URL_TTL_SECONDS", "3600")

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
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ENDPOINT", server.URL)
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_BUCKET", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_REGION", "auto")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY", "access")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_SECRET_KEY", "secret")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_PREFIX", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_URL_TTL_SECONDS", "3600")

	digest := sha256.Sum256([]byte("quick-generate R2 error diagnostics"))
	_, err := PrepareQuickGenerateUpload(t.Context(), QuickGenerateUploadRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "image/png", Size: 14,
	})
	require.ErrorIs(t, err, ErrQuickGenerateStorageUnavailable)
	assert.Contains(t, err.Error(), "HEAD returned status 403")
	assert.Contains(t, err.Error(), "R2 request_id=\"r2-request\"")
	assert.Contains(t, err.Error(), "cf_ray=\"cf-ray-id\"")
}
