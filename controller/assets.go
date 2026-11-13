package controller

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// UploadAsset stores a reference file and returns the assets:// id a client
// sends back in later generation requests. Repeating an upload of identical
// bytes returns the same id without storing the file twice.
func UploadAsset(c *gin.Context) {
	limit := int64(system_setting.QuickGenerateUploadMaxBytes)
	// The multipart envelope adds a little on top of the file itself.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit+(1<<20))
	file, err := c.FormFile("file")
	if err != nil {
		if common.IsRequestBodyTooLargeError(err) {
			respondAssetError(c, http.StatusRequestEntityTooLarge, "File exceeds the upload limit")
			return
		}
		respondAssetError(c, http.StatusBadRequest, "Missing file field")
		return
	}
	if file.Size > limit {
		respondAssetError(c, http.StatusRequestEntityTooLarge, "File exceeds the upload limit")
		return
	}
	opened, err := file.Open()
	if err != nil {
		respondAssetError(c, http.StatusBadRequest, "Unable to read the uploaded file")
		return
	}
	defer opened.Close()
	data, err := io.ReadAll(opened)
	if err != nil {
		respondAssetError(c, http.StatusBadRequest, "Unable to read the uploaded file")
		return
	}
	contentType := assetContentType(file.Filename, file.Header.Get("Content-Type"), data)
	id, err := service.StoreAsset(c.Request.Context(), contentType, data)
	if err != nil {
		status, message := quickGenerateUploadErrorStatus(c, err)
		if errors.Is(err, service.ErrQuickGenerateUploadDisabled) ||
			errors.Is(err, service.ErrQuickGenerateStorageUnavailable) {
			message = i18n.T(c, i18n.MsgAssetStorageUnavailable, nil)
		}
		respondAssetError(c, status, message)
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// assetContentType prefers what the client declared, falls back to the file
// extension for types the stdlib cannot sniff (HEIC, for one), and only then
// sniffs the bytes.
func assetContentType(name, declared string, data []byte) string {
	if mediaType, _, err := mime.ParseMediaType(declared); err == nil && mediaType != "" {
		declared = mediaType
	}
	if usableAssetContentType(declared) {
		return declared
	}
	if byExtension := service.GetMimeTypeByExtension(strings.TrimPrefix(filepath.Ext(name), ".")); usableAssetContentType(byExtension) {
		return byExtension
	}
	if detected := http.DetectContentType(data); usableAssetContentType(detected) {
		return detected
	}
	return "application/octet-stream"
}

func usableAssetContentType(mediaType string) bool {
	return mediaType != "" && mediaType != "application/octet-stream"
}

func respondAssetError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"message": common.MessageWithRequestId(message, c.GetString(common.RequestIdKey)),
			"type":    "new_api_error",
			"code":    "",
		},
	})
}
