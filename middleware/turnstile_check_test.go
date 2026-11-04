package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRegisterTurnstileCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)
	prevTurnstile := common.TurnstileCheckEnabled
	prevEmail := common.EmailVerificationEnabled
	t.Cleanup(func() {
		common.TurnstileCheckEnabled = prevTurnstile
		common.EmailVerificationEnabled = prevEmail
	})
	common.TurnstileCheckEnabled = true

	tests := []struct {
		name                   string
		emailVerification      bool
		wantBodyContains       string
		wantBodyNotContains    string
	}{
		{
			name:                "skips when email verification is enabled",
			emailVerification:   true,
			wantBodyContains:    `"ok":true`,
			wantBodyNotContains: "Turnstile token is empty",
		},
		{
			name:                "requires token without email verification",
			emailVerification:   false,
			wantBodyContains:    "Turnstile token is empty",
			wantBodyNotContains: `"ok":true`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			common.EmailVerificationEnabled = tt.emailVerification

			router := gin.New()
			router.POST("/register", RegisterTurnstileCheck(), func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"ok": true})
			})

			req := httptest.NewRequest(http.MethodPost, "/register", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.Equal(t, http.StatusOK, rec.Code)
			require.Contains(t, rec.Body.String(), tt.wantBodyContains)
			require.NotContains(t, rec.Body.String(), tt.wantBodyNotContains)
		})
	}
}
