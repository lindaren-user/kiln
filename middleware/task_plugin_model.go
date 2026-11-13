package middleware

import (
	"io"
	"mime"
	"strconv"
	"strings"

	"github.com/MoeForge/moego/ojson"
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// isJSONRequest reports whether the request declares a JSON body, including
// the +json media types.
func isJSONRequest(c *gin.Context) bool {
	mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil {
		return false
	}
	return mediaType == "application/json" || strings.HasSuffix(mediaType, "+json")
}

// replaceRequestBody swaps the stored request body for replacement, keeping
// the cached raw body and the content length in step with it.
func replaceRequestBody(c *gin.Context, storage common.BodyStorage, replacement []byte) error {
	newStorage, err := common.CreateBodyStorage(replacement)
	if err != nil {
		return err
	}
	_ = storage.Close()
	c.Set(common.KeyBodyStorage, newStorage)
	c.Set(common.KeyRequestBody, nil)
	c.Request.Body = io.NopCloser(newStorage)
	c.Request.ContentLength = int64(len(replacement))
	c.Request.Header.Set("Content-Length", strconv.Itoa(len(replacement)))
	return nil
}

// rewriteTaskPluginJSONModel patches the top-level JSON "model" field and
// replaces BodyStorage. Non-JSON bodies are left untouched.
func rewriteTaskPluginJSONModel(c *gin.Context, spelling string) error {
	if !isJSONRequest(c) {
		return nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return err
	}
	raw, err := storage.Bytes()
	if err != nil {
		return err
	}
	patched, err := ojson.SetBytes(raw, "model", spelling)
	if err != nil {
		return err
	}
	return replaceRequestBody(c, storage, patched)
}
