package middleware

import (
	"net/http"
	"net/url"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type turnstileCheckResponse struct {
	Success bool `json:"success"`
}

func TurnstileCheck() gin.HandlerFunc {
	return turnstileCheck(false)
}

// RegisterTurnstileCheck skips Turnstile when email verification is enabled:
// the mailbox OTP already gates register, and Turnstile already gated the
// verification-email send.
func RegisterTurnstileCheck() gin.HandlerFunc {
	return turnstileCheck(true)
}

func abortTurnstileTransportError(c *gin.Context, err error) {
	common.SysLog(err.Error())
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": err.Error(),
	})
	c.Abort()
}

func turnstileCheck(skipWhenEmailVerification bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if skipWhenEmailVerification && common.EmailVerificationEnabled {
			c.Next()
			return
		}
		if !common.TurnstileCheckEnabled {
			c.Next()
			return
		}

		response := c.Query("turnstile")
		if response == "" {
			common.ApiErrorT(c, "Turnstile token is empty")
			c.Abort()
			return
		}

		rawRes, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
			"secret":   {common.TurnstileSecretKey},
			"response": {response},
			"remoteip": {c.ClientIP()},
		})
		if err != nil {
			abortTurnstileTransportError(c, err)
			return
		}
		defer rawRes.Body.Close()

		var res turnstileCheckResponse
		if err := common.DecodeJson(rawRes.Body, &res); err != nil {
			abortTurnstileTransportError(c, err)
			return
		}
		if !res.Success {
			common.ApiErrorT(c, "Turnstile verification failed, please refresh and try again!")
			c.Abort()
			return
		}
		c.Next()
	}
}
