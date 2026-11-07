/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuickGenerateUploadStorageFailureIsLoggedButHiddenFromClient(t *testing.T) {
	var output bytes.Buffer
	common.LogWriterMu.Lock()
	previousWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previousWriter
		common.LogWriterMu.Unlock()
	})

	requestID := "quick-generate-upload-request"
	request := httptest.NewRequest(http.MethodPost, "/api/quick-generate/upload", nil)
	request = request.WithContext(context.WithValue(request.Context(), common.RequestIdKey, requestID))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = request

	status, message := quickGenerateUploadErrorStatus(c, fmt.Errorf("%w: object HEAD returned status 403 (R2 request_id=%q)", service.ErrQuickGenerateStorageUnavailable, "r2-request"))

	assert.Equal(t, http.StatusBadGateway, status)
	assert.Equal(t, service.ErrQuickGenerateStorageUnavailable.Error(), message)
	require.Contains(t, output.String(), requestID)
	assert.Contains(t, output.String(), "object HEAD returned status 403")
	assert.Contains(t, output.String(), "R2 request_id=\"r2-request\"")
	assert.NotContains(t, message, "403")
}
