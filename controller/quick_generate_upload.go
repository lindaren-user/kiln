package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// quickGenerateUploadErrorStatus maps an upload failure onto the status and
// message the console shows; storage outages never leak the vendor response.
func quickGenerateUploadErrorStatus(c *gin.Context, err error) (int, string) {
	switch {
	case errors.Is(err, service.ErrQuickGenerateUploadDisabled),
		errors.Is(err, service.ErrQuickGenerateMultipartDisabled):
		return http.StatusServiceUnavailable, err.Error()
	case errors.Is(err, service.ErrQuickGenerateStorageUnavailable):
		logger.LogError(c.Request.Context(), common.LogText("quick generate upload storage operation failed: %v", err))
		return http.StatusBadGateway, service.ErrQuickGenerateStorageUnavailable.Error()
	default:
		return http.StatusBadRequest, err.Error()
	}
}

func PrepareQuickGenerateUpload(c *gin.Context) {
	var request service.QuickGenerateUploadRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	grant, err := service.PrepareQuickGenerateUpload(c.Request.Context(), request)
	c.Header("Cache-Control", "private, no-store")
	if err != nil {
		status, message := quickGenerateUploadErrorStatus(c, err)
		common.ApiErrorStatus(c, status, common.NewMessage(message))
		return
	}
	common.ApiSuccess(c, grant)
}

func RefreshQuickGenerateUploadURL(c *gin.Context) {
	var request service.QuickGenerateUploadSignRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	signedURL, err := service.RefreshQuickGenerateUploadURL(request.URL)
	c.Header("Cache-Control", "private, no-store")
	if err != nil {
		status, message := quickGenerateUploadErrorStatus(c, err)
		common.ApiErrorStatus(c, status, common.NewMessage(message))
		return
	}
	common.ApiSuccess(c, gin.H{"url": signedURL})
}

func BeginQuickGenerateMultipartUpload(c *gin.Context) {
	var request service.QuickGenerateMultipartBeginRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	grant, err := service.BeginQuickGenerateMultipartUpload(c.Request.Context(), request)
	c.Header("Cache-Control", "private, no-store")
	if err != nil {
		status, message := quickGenerateUploadErrorStatus(c, err)
		common.ApiErrorStatus(c, status, common.NewMessage(message))
		return
	}
	common.ApiSuccess(c, grant)
}

func CompleteQuickGenerateMultipartUpload(c *gin.Context) {
	var request service.QuickGenerateMultipartCompleteRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	grant, err := service.CompleteQuickGenerateMultipartUpload(c.Request.Context(), request)
	c.Header("Cache-Control", "private, no-store")
	if err != nil {
		status, message := quickGenerateUploadErrorStatus(c, err)
		common.ApiErrorStatus(c, status, common.NewMessage(message))
		return
	}
	common.ApiSuccess(c, grant)
}

func QuickGenerateUploadEnabled(c *gin.Context) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	c.Header("Cache-Control", "private, no-store")
	common.ApiSuccess(c, gin.H{
		"enabled":           err == nil && config.Endpoint != "",
		"multipart_enabled": err == nil && config.Endpoint != "",
	})
}
