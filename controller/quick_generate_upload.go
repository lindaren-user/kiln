package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

func PrepareQuickGenerateUpload(c *gin.Context) {
	var request service.QuickGenerateUploadRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	grant, err := service.PrepareQuickGenerateUpload(c.Request.Context(), request)
	c.Header("Cache-Control", "private, no-store")
	if err != nil {
		status := http.StatusBadRequest
		message := err.Error()
		switch {
		case errors.Is(err, service.ErrQuickGenerateUploadDisabled):
			status = http.StatusServiceUnavailable
		case errors.Is(err, service.ErrQuickGenerateStorageUnavailable):
			status = http.StatusBadGateway
			message = service.ErrQuickGenerateStorageUnavailable.Error()
		}
		common.ApiErrorStatus(c, status, common.NewMessage(message))
		return
	}
	common.ApiSuccess(c, grant)
}

func QuickGenerateUploadEnabled(c *gin.Context) {
	config, err := system_setting.LoadQuickGenerateUploadConfig()
	c.Header("Cache-Control", "private, no-store")
	common.ApiSuccess(c, gin.H{"enabled": err == nil && config.Endpoint != ""})
}
