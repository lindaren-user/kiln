package system_setting

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
)

const (
	QuickGenerateUploadEndpointEnv      = "QUICK_GENERATE_UPLOAD_S3_ENDPOINT"
	QuickGenerateUploadBucketEnv        = "QUICK_GENERATE_UPLOAD_S3_BUCKET"
	QuickGenerateUploadRegionEnv        = "QUICK_GENERATE_UPLOAD_S3_REGION"
	QuickGenerateUploadAccessKeyEnv     = "QUICK_GENERATE_UPLOAD_S3_ACCESS_KEY"
	QuickGenerateUploadSecretKeyEnv     = "QUICK_GENERATE_UPLOAD_S3_SECRET_KEY"
	QuickGenerateUploadPrefixEnv        = "QUICK_GENERATE_UPLOAD_S3_PREFIX"
	QuickGenerateUploadURLTTLSecondsEnv = "QUICK_GENERATE_UPLOAD_URL_TTL_SECONDS"

	QuickGenerateUploadMaxBytes          = 100 << 20
	QuickGenerateUploadDefaultTTLSeconds = 6 * 60 * 60
	QuickGenerateUploadMaxTTLSeconds     = 24 * 60 * 60
)

var quickGenerateUploadBucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

type QuickGenerateUploadConfig struct {
	Endpoint   string
	Bucket     string
	Region     string
	AccessKey  string
	SecretKey  string
	Prefix     string
	TTLSeconds int
}

func LoadQuickGenerateUploadConfig() (QuickGenerateUploadConfig, error) {
	config := QuickGenerateUploadConfig{
		Endpoint:   common.GetEnvOrDefaultString(QuickGenerateUploadEndpointEnv, ""),
		Bucket:     common.GetEnvOrDefaultString(QuickGenerateUploadBucketEnv, ""),
		Region:     common.GetEnvOrDefaultString(QuickGenerateUploadRegionEnv, "auto"),
		AccessKey:  common.GetEnvOrDefaultString(QuickGenerateUploadAccessKeyEnv, ""),
		SecretKey:  common.GetEnvOrDefaultString(QuickGenerateUploadSecretKeyEnv, ""),
		Prefix:     strings.Trim(common.GetEnvOrDefaultString(QuickGenerateUploadPrefixEnv, "quick-generate"), "/"),
		TTLSeconds: common.GetEnvOrDefault(QuickGenerateUploadURLTTLSecondsEnv, QuickGenerateUploadDefaultTTLSeconds),
	}
	if err := ValidateQuickGenerateUploadConfig(config); err != nil {
		return QuickGenerateUploadConfig{}, err
	}
	return config, nil
}

func ValidateQuickGenerateUploadConfig(config QuickGenerateUploadConfig) error {
	values := []string{config.Endpoint, config.Bucket, config.AccessKey, config.SecretKey}
	configured := 0
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			configured++
		}
	}
	if configured == 0 {
		return nil
	}
	if configured != len(values) {
		return errors.New("R2 endpoint, bucket, access key, and secret key must all be set")
	}
	endpoint, err := url.Parse(config.Endpoint)
	if err != nil || endpoint == nil || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || endpoint.Scheme != "https" {
		return errors.New("R2 endpoint must be an absolute HTTPS URL without credentials, query, or fragment")
	}
	if !quickGenerateUploadBucketPattern.MatchString(config.Bucket) || strings.Contains(config.Bucket, "..") {
		return errors.New("R2 bucket name is invalid")
	}
	if config.Region == "" || strings.TrimSpace(config.Region) != config.Region {
		return errors.New("R2 signing region is required")
	}
	if config.TTLSeconds <= 0 || config.TTLSeconds > QuickGenerateUploadMaxTTLSeconds {
		return errors.New("upload URL TTL is outside the supported range")
	}
	if strings.Contains(config.Prefix, "\\") || strings.HasPrefix(config.Prefix, "/") || strings.HasSuffix(config.Prefix, "/") || len(config.Prefix) > 512 {
		return errors.New("R2 object prefix is invalid")
	}
	for part := range strings.SplitSeq(config.Prefix, "/") {
		if part == ".." || part == "." {
			return errors.New("R2 object prefix must not contain dot segments")
		}
		for _, character := range part {
			if unicode.IsControl(character) {
				return errors.New("R2 object prefix must not contain control characters")
			}
		}
	}
	return nil
}
