package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetStatusAnnouncementBar(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	originalEnabled := settings.AnnouncementBarEnabled
	originalText := settings.AnnouncementBarText
	originalOptionMap := common.OptionMap
	t.Cleanup(func() {
		settings.AnnouncementBarEnabled = originalEnabled
		settings.AnnouncementBarText = originalText
		common.OptionMap = originalOptionMap
	})
	common.OptionMap = map[string]string{}

	statusData := func(t *testing.T) map[string]any {
		t.Helper()
		response := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(response)
		context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

		GetStatus(context)

		var payload struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		return payload.Data
	}

	settings.AnnouncementBarEnabled = true
	settings.AnnouncementBarText = "Scheduled maintenance tonight"
	data := statusData(t)
	assert.True(t, data["announcement_bar_enabled"].(bool))
	assert.Equal(t, "Scheduled maintenance tonight", data["announcement_bar_text"])

	settings.AnnouncementBarEnabled = false
	data = statusData(t)
	assert.False(t, data["announcement_bar_enabled"].(bool))
	_, textPublished := data["announcement_bar_text"]
	assert.False(t, textPublished)
}
