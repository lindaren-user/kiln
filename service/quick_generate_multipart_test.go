package service

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
)

// multipartStore fakes the S3 multipart calls: create, assemble and the final
// HEAD that confirms the object exists.
type multipartStore struct {
	t          *testing.T
	uploadID   string
	partCount  int
	completeAt []byte
	headOK     bool
	size       int64
	contentTyp string
}

func (s *multipartStore) handler(writer http.ResponseWriter, request *http.Request) {
	s.t.Helper()
	switch {
	case request.Method == http.MethodHead:
		if !s.headOK {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		writer.Header().Set("Content-Length", strconv.FormatInt(s.size, 10))
		writer.Header().Set("Content-Type", s.contentTyp)
		writer.WriteHeader(http.StatusOK)
	case request.Method == http.MethodPost && request.URL.Query().Has("uploads"):
		writer.Header().Set("Content-Type", "application/xml")
		io.WriteString(writer, `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><UploadId>`+s.uploadID+`</UploadId></InitiateMultipartUploadResult>`)
	case request.Method == http.MethodPost && request.URL.Query().Get("uploadId") != "":
		body, err := io.ReadAll(request.Body)
		require.NoError(s.t, err)
		s.completeAt = body
		writer.Header().Set("Content-Type", "application/xml")
		io.WriteString(writer, `<CompleteMultipartUploadResult><Key>k</Key></CompleteMultipartUploadResult>`)
	default:
		writer.WriteHeader(http.StatusBadRequest)
	}
}

func newMultipartTestStore(t *testing.T) (*multipartStore, func()) {
	t.Helper()
	store := &multipartStore{t: t, uploadID: "upload-1", size: 12 << 20, contentTyp: "video/mp4", headOK: true}
	server := httptest.NewTLSServer(http.HandlerFunc(store.handler))
	previousClient := quickGenerateUploadHTTPClient
	quickGenerateUploadHTTPClient = server.Client()

	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ENDPOINT", server.URL)
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_BUCKET", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_REGION", "auto")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY", "access")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_SECRET_KEY", "secret")
	t.Setenv("QUICK_GENERATE_UPLOAD_S3_PREFIX", "quick-generate")
	t.Setenv("QUICK_GENERATE_UPLOAD_URL_TTL_SECONDS", "3600")

	return store, func() {
		quickGenerateUploadHTTPClient = previousClient
		server.Close()
	}
}

func TestBeginQuickGenerateMultipartUploadSignsEveryPart(t *testing.T) {
	store, cleanup := newMultipartTestStore(t)
	defer cleanup()
	store.headOK = false
	quickGenerateUploadObjects.Lock()
	quickGenerateUploadObjects.entries = map[string]quickGenerateUploadObject{}
	quickGenerateUploadObjects.Unlock()

	digest := sha256.Sum256([]byte("a large video"))
	grant, err := BeginQuickGenerateMultipartUpload(t.Context(), QuickGenerateMultipartBeginRequest{
		SHA256: hex.EncodeToString(digest[:]), ContentType: "video/mp4", Size: store.size,
	})
	require.NoError(t, err)
	require.Equal(t, "upload-1", grant.UploadID)
	require.Equal(t, int64(quickGeneratePartBytes), grant.PartSize)
	require.Len(t, grant.Parts, 2)
	require.False(t, grant.Exists)

	for _, part := range grant.Parts {
		parsed, err := url.Parse(part.URL)
		require.NoError(t, err)
		require.Equal(t, "upload-1", parsed.Query().Get("uploadId"))
		require.Equal(t, strconv.Itoa(part.PartNumber), parsed.Query().Get("partNumber"))
		require.NotEmpty(t, parsed.Query().Get("X-Amz-Signature"))
	}
}

func TestCompleteQuickGenerateMultipartUploadRejectsATamperedETag(t *testing.T) {
	store, cleanup := newMultipartTestStore(t)
	defer cleanup()

	digest := sha256.Sum256([]byte("a large video"))
	key := quickGenerateObjectKey("quick-generate", hex.EncodeToString(digest[:]))
	_, err := CompleteQuickGenerateMultipartUpload(t.Context(), QuickGenerateMultipartCompleteRequest{
		Key: key, UploadID: "upload-1", ContentType: "video/mp4", Size: store.size,
		SHA256: hex.EncodeToString(digest[:]),
		Parts:  []QuickGenerateMultipartETag{{PartNumber: 1, ETag: `<script>`}},
	})
	require.ErrorIs(t, err, ErrQuickGenerateMultipartInvalid)
	require.Nil(t, store.completeAt)
}

func TestCompleteQuickGenerateMultipartUploadAssemblesAndVerifiesTheObject(t *testing.T) {
	store, cleanup := newMultipartTestStore(t)
	defer cleanup()

	digest := sha256.Sum256([]byte("a large video"))
	key := quickGenerateObjectKey("quick-generate", hex.EncodeToString(digest[:]))
	grant, err := CompleteQuickGenerateMultipartUpload(t.Context(), QuickGenerateMultipartCompleteRequest{
		Key: key, UploadID: "upload-1", ContentType: "video/mp4", Size: store.size,
		SHA256: hex.EncodeToString(digest[:]),
		Parts: []QuickGenerateMultipartETag{
			{PartNumber: 1, ETag: `"etag-1"`},
			{PartNumber: 2, ETag: `"etag-2"`},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, grant.URL)
	require.Contains(t, string(store.completeAt), `<PartNumber>1</PartNumber><ETag>"etag-1"</ETag>`)
	require.Contains(t, string(store.completeAt), `<PartNumber>2</PartNumber><ETag>"etag-2"</ETag>`)
}

func TestCompleteQuickGenerateMultipartUploadRejectsDuplicatePartNumbers(t *testing.T) {
	store, cleanup := newMultipartTestStore(t)
	defer cleanup()

	digest := sha256.Sum256([]byte("a large video"))
	key := quickGenerateObjectKey("quick-generate", hex.EncodeToString(digest[:]))
	_, err := CompleteQuickGenerateMultipartUpload(t.Context(), QuickGenerateMultipartCompleteRequest{
		Key: key, UploadID: "upload-1", ContentType: "video/mp4", Size: store.size,
		SHA256: hex.EncodeToString(digest[:]),
		Parts: []QuickGenerateMultipartETag{
			{PartNumber: 1, ETag: `"etag-1"`},
			{PartNumber: 1, ETag: `"etag-2"`},
		},
	})
	require.ErrorIs(t, err, ErrQuickGenerateMultipartInvalid)
}

func TestCompleteQuickGenerateMultipartUploadRejectsAForeignKey(t *testing.T) {
	store, cleanup := newMultipartTestStore(t)
	defer cleanup()

	digest := sha256.Sum256([]byte("a large video"))
	_, err := CompleteQuickGenerateMultipartUpload(t.Context(), QuickGenerateMultipartCompleteRequest{
		Key: "quick-generate/somebody-else", UploadID: "upload-1", ContentType: "video/mp4", Size: store.size,
		SHA256: hex.EncodeToString(digest[:]),
		Parts:  []QuickGenerateMultipartETag{{PartNumber: 1, ETag: `"etag-1"`}},
	})
	require.ErrorIs(t, err, ErrQuickGenerateMultipartInvalid)
}
