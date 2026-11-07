package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertGenerationProfileChannel(t *testing.T, channelID int, otherSettings string) {
	t.Helper()
	require.NoError(t, DB.Create(&Channel{
		Id:            channelID,
		Type:          constant.ChannelTypeOpenAI,
		Key:           "key",
		Status:        common.ChannelStatusEnabled,
		Name:          "codekey",
		OtherSettings: otherSettings,
	}).Error)
	InitChannelCache()
}

// A reseller that proxies only /v1/images/generations must not inherit the
// official gpt-image contract, which also offers sizes such as "auto", a
// quality control and image editing.
func TestChannelGenerationSchemaReplacesNativeContract(t *testing.T) {
	resetPricingEndpointTestTables(t)
	insertGenerationProfileChannel(t, 1, `{"generation_profiles":[{"kind":"image","fields":[`+
		`{"key":"size","labelKey":"Size","type":"select","defaultValue":"1024x1024",`+
		`"options":[{"value":"1024x1024","label":"1024x1024"}],"requestPath":["size"]}]}]}`)

	schema := channelGenerationSchema(1, "image", "gpt-image-1", "gpt-image-1")

	require.NotNil(t, schema)
	assert.Nil(t, schema.ReferenceImages)
	require.Len(t, schema.Fields, 1)
	assert.Equal(t, "size", schema.Fields[0].Key)
	assert.Equal(t, "1024x1024", schema.Fields[0].DefaultValue)
}

func TestChannelGenerationSchemaKeepsUnlistedModelsOnNativeContract(t *testing.T) {
	resetPricingEndpointTestTables(t)
	insertGenerationProfileChannel(t, 1, `{"generation_profiles":[{"kind":"image","models":["sd-turbo"],"fields":[]}]}`)

	assert.Nil(t, channelGenerationSchema(1, "image", "gpt-image-1", "gpt-image-1"))

	declared := channelGenerationSchema(1, "image", "sd-turbo", "sd-turbo")
	require.NotNil(t, declared)
	assert.Empty(t, declared.Fields)
}

func TestChannelGenerationSchemaIgnoresMalformedDeclaration(t *testing.T) {
	resetPricingEndpointTestTables(t)
	insertGenerationProfileChannel(t, 1, `{"generation_profiles":"not-a-list"}`)

	assert.Nil(t, channelGenerationSchema(1, "image", "gpt-image-1", "gpt-image-1"))
}

func TestPricingGenerationSchemasUsesChannelDeclaration(t *testing.T) {
	resetPricingEndpointTestTables(t)
	insertGenerationProfileChannel(t, 1, `{"generation_profiles":[{"kind":"image","fields":[`+
		`{"key":"size","labelKey":"Size","type":"select","defaultValue":"1024x1024",`+
		`"options":[{"value":"1024x1024","label":"1024x1024"}],"requestPath":["size"]}]}]}`)

	schemas := pricingGenerationSchemas([]AbilityWithChannel{{
		Ability:     Ability{Model: "gpt-image-1", ChannelId: 1},
		ChannelType: constant.ChannelTypeOpenAI,
	}}, nil, nil)

	schema := schemas["gpt-image-1"]["image"]
	require.Len(t, schema.Fields, 1)
	assert.Equal(t, "size", schema.Fields[0].Key)
	assert.Nil(t, schema.ReferenceImages)
}
