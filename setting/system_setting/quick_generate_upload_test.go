package system_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateQuickGenerateUploadConfig(t *testing.T) {
	valid := QuickGenerateUploadConfig{
		Endpoint: "https://account.r2.cloudflarestorage.com", Bucket: "quick-generate",
		Region: "auto", AccessKey: "access", SecretKey: "secret",
		Prefix: "quick-generate", TTLSeconds: QuickGenerateUploadDefaultTTLSeconds,
	}
	require.NoError(t, ValidateQuickGenerateUploadConfig(QuickGenerateUploadConfig{}))
	require.NoError(t, ValidateQuickGenerateUploadConfig(valid))

	tests := []struct {
		name   string
		mutate func(*QuickGenerateUploadConfig)
	}{
		{name: "partial credentials", mutate: func(config *QuickGenerateUploadConfig) { config.SecretKey = "" }},
		{name: "non HTTPS endpoint", mutate: func(config *QuickGenerateUploadConfig) { config.Endpoint = "http://objects.example.com" }},
		{name: "endpoint credentials", mutate: func(config *QuickGenerateUploadConfig) { config.Endpoint = "https://user:pass@objects.example.com" }},
		{name: "bucket syntax", mutate: func(config *QuickGenerateUploadConfig) { config.Bucket = "Bad_Bucket" }},
		{name: "prefix traversal", mutate: func(config *QuickGenerateUploadConfig) { config.Prefix = "quick/../other" }},
		{name: "ttl bound", mutate: func(config *QuickGenerateUploadConfig) { config.TTLSeconds = QuickGenerateUploadMaxTTLSeconds + 1 }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			config := valid
			test.mutate(&config)
			require.Error(t, ValidateQuickGenerateUploadConfig(config))
		})
	}
}
