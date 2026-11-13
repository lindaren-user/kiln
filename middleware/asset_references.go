package middleware

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// ResolveAssetReferences replaces assets:// values in a JSON generation
// request with the public URL of the stored asset, before any handler reads
// the body. Non-JSON bodies, such as multipart image edits, pass through
// untouched.
func ResolveAssetReferences() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isJSONRequest(c) {
			c.Next()
			return
		}
		storage, err := common.GetBodyStorage(c)
		if err != nil {
			// The handler reports a body that cannot be read with its own error.
			c.Next()
			return
		}
		body, err := storage.Bytes()
		if err != nil {
			c.Next()
			return
		}
		resolved, changed, err := service.ResolveAssetReferences(c.Request.Context(), body, service.ResolveAssetURL)
		if err != nil {
			abortAssetResolution(c, err)
			return
		}
		if !changed {
			c.Next()
			return
		}
		if err := replaceRequestBody(c, storage, resolved); err != nil {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "Failed to prepare the request body")
			return
		}
		c.Next()
	}
}

// abortAssetResolution tells the client which reference failed and why, and
// keeps storage outages distinct from a reference that is simply unknown.
func abortAssetResolution(c *gin.Context, err error) {
	status, key := http.StatusBadRequest, i18n.MsgAssetInvalidReference
	switch {
	case errors.Is(err, service.ErrAssetNotFound):
		status, key = http.StatusNotFound, i18n.MsgAssetNotFound
	case errors.Is(err, service.ErrQuickGenerateUploadDisabled):
		status, key = http.StatusServiceUnavailable, i18n.MsgAssetStorageUnavailable
	case errors.Is(err, service.ErrQuickGenerateStorageUnavailable):
		status, key = http.StatusBadGateway, i18n.MsgAssetStorageUnavailable
	}
	var params map[string]any
	var referenceError *service.AssetReferenceError
	if errors.As(err, &referenceError) {
		params = map[string]any{"Reference": referenceError.Reference}
	}
	abortWithOpenAiMessage(c, status, i18n.T(c, key, params))
}
