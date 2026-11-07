package model

import (
	"fmt"
	"slices"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	_ "github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetPricingEndpointTestTables(t *testing.T) {
	t.Helper()
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	require.NoError(t, DB.AutoMigrate(&Channel{}, &Ability{}, &Model{}, &Vendor{}))
	for _, table := range []string{"abilities", "channels", "models", "vendors"} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
	InitChannelCache()
	InvalidatePricingCache()
	t.Cleanup(func() {
		for _, table := range []string{"abilities", "channels", "models", "vendors"} {
			require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
		}
		InitChannelCache()
		InvalidatePricingCache()
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
	})
}

func insertPricingEndpointChannel(t *testing.T, channelID int, channelType int, settings dto.ChannelOtherSettings) {
	t.Helper()
	channel := &Channel{
		Id:     channelID,
		Type:   channelType,
		Key:    fmt.Sprintf("key-%d", channelID),
		Status: common.ChannelStatusEnabled,
		Name:   fmt.Sprintf("channel-%d", channelID),
	}
	if settings.AdvancedCustom != nil {
		channel.SetOtherSettings(settings)
	}
	require.NoError(t, DB.Create(channel).Error)
}

func insertPricingEndpointAbility(t *testing.T, channelID int, modelName string) {
	t.Helper()
	require.NoError(t, DB.Create(&Ability{
		Group:     "default",
		Model:     modelName,
		ChannelId: channelID,
		Enabled:   true,
	}).Error)
}

func pricingEndpointAdvancedCustomConfig(routes ...dto.AdvancedCustomRoute) dto.ChannelOtherSettings {
	return dto.ChannelOtherSettings{
		AdvancedCustom: &dto.AdvancedCustomConfig{
			Routes: routes,
		},
	}
}

func pricingEndpointTypesByModel(t *testing.T) map[string][]constant.EndpointType {
	t.Helper()
	InitChannelCache()
	return pricingEndpointTypesFromPricing(GetPricing())
}

func pricingEndpointTypesFromPricing(pricings []Pricing) map[string][]constant.EndpointType {
	byModel := make(map[string][]constant.EndpointType)
	for _, pricing := range pricings {
		byModel[pricing.ModelName] = pricing.SupportedEndpointTypes
	}
	return byModel
}

func TestPricingTaskPluginVideoModelsUseVideoEndpoint(t *testing.T) {
	resetPricingEndpointTestTables(t)

	setting := `{"task_plugin_key":"top-image"}`
	channel := &Channel{
		Id:      301,
		Type:    constant.ChannelTypeTaskPlugin,
		Key:     "key-301",
		Status:  common.ChannelStatusEnabled,
		Name:    "top-image",
		Setting: &setting,
	}
	require.NoError(t, DB.Create(channel).Error)
	insertPricingEndpointAbility(t, 301, "sd2.0满血版")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAIVideo,
		constant.EndpointTypeOpenAIResponse,
	}, byModel["sd2.0满血版"])
}

func TestPricingMappedTaskModelsKeepGenerationEndpoints(t *testing.T) {
	for _, memoryCache := range []bool{true, false} {
		t.Run(fmt.Sprintf("memory_cache=%t", memoryCache), func(t *testing.T) {
			resetPricingEndpointTestTables(t)
			common.MemoryCacheEnabled = memoryCache
			setting := `{"task_plugin_key":"ip233"}`
			aliasMapping := `{
				"minimax-h3":"ip233-minimax-h3",
				"public-video":"intermediate-video",
				"intermediate-video":"ip233-minimax-h3"
			}`
			vendorMapping := `{"ip233-minimax-h3":"vendor-endpoint"}`
			for _, channel := range []*Channel{
				{
					Id: 310, Type: constant.ChannelTypeTaskPlugin, Key: "key-310", Status: common.ChannelStatusEnabled,
					Name: "aliases", Setting: &setting, ModelMapping: &aliasMapping,
					Models: "minimax-h3,public-video,IP233-MINIMAX-H3,unknown-model",
				},
				{
					Id: 311, Type: constant.ChannelTypeTaskPlugin, Key: "key-311", Status: common.ChannelStatusEnabled,
					Name: "vendor-id", Setting: &setting, ModelMapping: &vendorMapping, Models: "ip233-minimax-h3",
				},
			} {
				require.NoError(t, DB.Create(channel).Error)
				for _, name := range channel.GetModels() {
					insertPricingEndpointAbility(t, channel.Id, name)
				}
			}

			byModel := pricingEndpointTypesByModel(t)
			videoEndpoints := []constant.EndpointType{constant.EndpointTypeOpenAIVideo, constant.EndpointTypeOpenAIResponse}
			for _, name := range []string{"minimax-h3", "public-video", "IP233-MINIMAX-H3", "ip233-minimax-h3"} {
				assert.Equal(t, videoEndpoints, byModel[name], "catalog model %q must remain selectable as a video", name)
			}
			assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, byModel["unknown-model"])
			require.Equal(t, "ip233-minimax-h3", PublicModelUpstreams()["minimax-h3"])

			updatedMapping := `{"minimax-h3":"seedance2.5-B2"}`
			require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 310).Update("model_mapping", updatedMapping).Error)
			updated := pricingEndpointTypesByModel(t)
			assert.Equal(t, videoEndpoints, updated["minimax-h3"])
			assert.Equal(t, "seedance2.5-B2", PublicModelUpstreams()["minimax-h3"], "channel changes must refresh the menu's upstream identity")
		})
	}
}

func TestPricingGenerationSchemasFollowMappedChannelModels(t *testing.T) {
	abilities := []AbilityWithChannel{{
		Ability:     Ability{Model: "minimax-h3", ChannelId: 310},
		ChannelType: constant.ChannelTypeTaskPlugin,
	}}
	configs := map[int]pricingTaskPluginConfig{
		310: {
			key:          "ip233",
			modelMapping: map[string]string{"minimax-h3": "ip233-minimax-h3"},
		},
	}

	schemas := pricingGenerationSchemas(abilities, nil, configs)
	videoSchema, ok := schemas["minimax-h3"]["video"]
	require.True(t, ok)
	field := func(key string) (jsplugin.GenerationField, bool) {
		index := slices.IndexFunc(videoSchema.Fields, func(field jsplugin.GenerationField) bool {
			return field.Key == key
		})
		if index < 0 {
			return jsplugin.GenerationField{}, false
		}
		return videoSchema.Fields[index], true
	}

	seconds, ok := field("seconds")
	require.True(t, ok)
	assert.Equal(t, "select", seconds.Type)
	assert.Len(t, seconds.Options, 12, "every length from 4 to 15 is offered")
	assert.Equal(t, "4", seconds.DefaultValue)

	resolution, ok := field("resolution")
	require.True(t, ok)
	assert.Equal(t, "768p", resolution.DefaultValue)
	assert.Equal(t, []jsplugin.GenerationOption{{Value: "768p", Label: "768p"}}, resolution.Options)
}

func TestPricingGenerationSchemasUseNativeImageChannelModel(t *testing.T) {
	schemas := pricingGenerationSchemas([]AbilityWithChannel{{
		Ability:     Ability{Model: "gpt-image-1", ChannelId: 410},
		ChannelType: constant.ChannelTypeOpenAI,
	}}, nil, nil)

	imageSchema, ok := schemas["gpt-image-1"]["image"]
	require.True(t, ok)
	require.Len(t, imageSchema.Fields, 3)
	assert.Equal(t, "size", imageSchema.Fields[0].Key)
	assert.Equal(t, "count", imageSchema.Fields[1].Key)
	assert.Len(t, imageSchema.Fields[1].Options, 10, "gpt-image-1 keeps the ten-image allowance")
	assert.Equal(t, "quality", imageSchema.Fields[2].Key)
	require.NotNil(t, imageSchema.ReferenceImages)
	assert.True(t, imageSchema.ReferenceImages.Edit)
}

// Every GPT Image release shares the OpenAI Images contract, so a newer model
// name must still expose size, count, quality and reference images.
func TestPricingGenerationSchemasCoverTheGptImageFamily(t *testing.T) {
	for _, name := range []string{"gpt-image-2", "gpt-image-2.6"} {
		schemas := pricingGenerationSchemas([]AbilityWithChannel{{
			Ability:     Ability{Model: name, ChannelId: 411},
			ChannelType: constant.ChannelTypeOpenAI,
		}}, nil, nil)

		imageSchema, ok := schemas[name]["image"]
		require.True(t, ok, name)
		require.Len(t, imageSchema.Fields, 3, name)
		assert.Equal(t, "size", imageSchema.Fields[0].Key)
		assert.Greater(t, len(imageSchema.Fields[0].Options), 1, "sizes must be selectable")
		assert.Equal(t, "count", imageSchema.Fields[1].Key)
		assert.Len(t, imageSchema.Fields[1].Options, 4, "gpt-image-2 accepts up to four images")
		require.NotNil(t, imageSchema.ReferenceImages, name)
		assert.True(t, imageSchema.ReferenceImages.Edit, "image-to-image must be offered")
	}
}

func TestPricingGenerationSchemasIntersectProvidersForPublicModel(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Model: "minimax-h3", ChannelId: 420}, ChannelType: constant.ChannelTypeTaskPlugin},
		{Ability: Ability{Model: "minimax-h3", ChannelId: 421}, ChannelType: constant.ChannelTypeTaskPlugin},
	}
	configs := map[int]pricingTaskPluginConfig{
		420: {key: "ip233", modelMapping: map[string]string{"minimax-h3": "ip233-minimax-h3"}},
		421: {key: "hailuo", modelMapping: map[string]string{"minimax-h3": "MiniMax-H3"}},
	}

	schemas := pricingGenerationSchemas(abilities, nil, configs)
	videoSchema := schemas["minimax-h3"]["video"]
	require.Len(t, videoSchema.Fields, 1)
	seconds := videoSchema.Fields[0]
	assert.Equal(t, "seconds", seconds.Key)
	// IP233 lists the lengths it accepts while hailuo gives a range; the shared
	// contract keeps the list so the console can still offer a dropdown.
	assert.Equal(t, "select", seconds.Type)
	assert.Len(t, seconds.Options, 12)
	assert.Nil(t, seconds.Min)
	assert.Equal(t, "4", seconds.DefaultValue)
	require.NotNil(t, videoSchema.ReferenceImages)
	assert.Equal(t, 2, videoSchema.ReferenceImages.Max)
	assert.True(t, videoSchema.MediaNotice)
}

func TestIntersectGenerationSchemasDropsAnEmptyLengthSelection(t *testing.T) {
	minimum, maximum := 20.0, 30.0
	first := jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{
		{Key: "seconds", Type: "select", DefaultValue: "4", RequestPath: []string{"duration"}, Options: []jsplugin.GenerationOption{{Value: "4", Label: "4"}, {Value: "5", Label: "5"}}},
	}}
	second := jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{
		{Key: "seconds", Type: "number", Min: &minimum, Max: &maximum, RequestPath: []string{"duration"}},
	}}

	merged := intersectGenerationSchemas(first, second)
	assert.Empty(t, merged.Fields, "a range with no listed length shares nothing with the list")
}

func TestIntersectGenerationSchemasKeepsOnlySharedInputs(t *testing.T) {
	minimumA, maximumA := 4.0, 15.0
	minimumB, maximumB := 6.0, 12.0
	first := jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{
		{Key: "seconds", Type: "number", Min: &minimumA, Max: &maximumA, RequestPath: []string{"duration"}},
		{Key: "ratio", Type: "select", RequestPath: []string{"metadata", "ratio"}, Options: []jsplugin.GenerationOption{{Value: "16:9", Label: "16:9"}, {Value: "9:16", Label: "9:16"}}},
	}}
	second := jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{
		{Key: "seconds", Type: "number", Min: &minimumB, Max: &maximumB, RequestPath: []string{"duration"}},
		{Key: "ratio", Type: "select", RequestPath: []string{"metadata", "ratio"}, Options: []jsplugin.GenerationOption{{Value: "9:16", Label: "9:16"}}},
	}}

	merged := intersectGenerationSchemas(first, second)
	require.Len(t, merged.Fields, 2)
	assert.Equal(t, 6.0, *merged.Fields[0].Min)
	assert.Equal(t, 12.0, *merged.Fields[0].Max)
	assert.Equal(t, 6.0, merged.Fields[0].DefaultValue)
	assert.Equal(t, []jsplugin.GenerationOption{{Value: "9:16", Label: "9:16"}}, merged.Fields[1].Options)
}

func TestPricingAdvancedCustomUsesConfiguredEndpointTypes(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 101, constant.ChannelTypeAdvancedCustom, pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/chat/completions",
			UpstreamPath: "/v1/chat/completions",
		},
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/responses",
			UpstreamPath: "/v1beta/models/{model}:generateContent",
			Converter:    "openai_responses_to_gemini_generate_content",
			Models:       []string{"re:^gemini-"},
		},
	))
	insertPricingEndpointAbility(t, 101, "gemini-2.5-flash")
	insertPricingEndpointAbility(t, 101, "gpt-4o")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
	}, byModel["gemini-2.5-flash"])
	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAI,
	}, byModel["gpt-4o"])
}

func TestPricingModelMetadataEndpointsMergeWithAdvancedCustomInference(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 103, constant.ChannelTypeAdvancedCustom, pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/responses",
			UpstreamPath: "/v1beta/models/{model}:generateContent",
			Converter:    "openai_responses_to_gemini_generate_content",
			Models:       []string{"re:^gemini-"},
		},
	))
	insertPricingEndpointAbility(t, 103, "gemini-2.5-flash")
	require.NoError(t, DB.Create(&Model{
		ModelName: "gemini-2.5-flash",
		Endpoints: `{
			"openai": "/v1/chat/completions"
		}`,
		Status:   1,
		NameRule: NameRuleExact,
	}).Error)

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAIResponse,
		constant.EndpointTypeOpenAI,
	}, byModel["gemini-2.5-flash"])
}

func TestPricingModelMetadataEndpointsCanProvideEndpointWithoutChannelInference(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 104, constant.ChannelTypeAdvancedCustom, pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/responses",
			UpstreamPath: "/v1beta/models/{model}:generateContent",
			Converter:    "openai_responses_to_gemini_generate_content",
			Models:       []string{"re:^gemini-"},
		},
	))
	insertPricingEndpointAbility(t, 104, "metadata-only-model")
	require.NoError(t, DB.Create(&Model{
		ModelName: "metadata-only-model",
		Endpoints: `{
			"openai": "/v1/chat/completions"
		}`,
		Status:   1,
		NameRule: NameRuleExact,
	}).Error)

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, byModel["metadata-only-model"])
}

func TestPricingAdvancedCustomMissingConfigFallsBackToChannelType(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 102, constant.ChannelTypeAdvancedCustom, dto.ChannelOtherSettings{})
	insertPricingEndpointAbility(t, 102, "gpt-4o")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, byModel["gpt-4o"])
}

func TestPricingNativeChannelEndpointTypesUnchanged(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 201, constant.ChannelTypeOpenAI, dto.ChannelOtherSettings{})
	insertPricingEndpointChannel(t, 202, constant.ChannelTypeGemini, dto.ChannelOtherSettings{})
	insertPricingEndpointChannel(t, 203, constant.ChannelTypeAnthropic, dto.ChannelOtherSettings{})
	insertPricingEndpointAbility(t, 201, "gpt-4o")
	insertPricingEndpointAbility(t, 202, "gemini-2.5-flash")
	insertPricingEndpointAbility(t, 203, "claude-3-5-sonnet")

	byModel := pricingEndpointTypesByModel(t)

	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, byModel["gpt-4o"])
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeGemini, constant.EndpointTypeOpenAI}, byModel["gemini-2.5-flash"])
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeAnthropic, constant.EndpointTypeOpenAI}, byModel["claude-3-5-sonnet"])
}

func TestInitChannelCacheInvalidatesPricingCache(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 301, constant.ChannelTypeAdvancedCustom, pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/chat/completions",
			UpstreamPath: "/v1/chat/completions",
		},
	))
	insertPricingEndpointAbility(t, 301, "gemini-3.5-flash")
	InitChannelCache()

	initial := pricingEndpointTypesByModel(t)
	require.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, initial["gemini-3.5-flash"])

	var channel Channel
	require.NoError(t, DB.First(&channel, "id = ?", 301).Error)
	channel.SetOtherSettings(pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/chat/completions",
			UpstreamPath: "/v1/chat/completions",
		},
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/responses",
			UpstreamPath: "/v1beta/models/{model}:generateContent",
			Converter:    "openai_responses_to_gemini_generate_content",
			Models:       []string{"re:^gemini-"},
		},
	))
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 301).Update("settings", channel.OtherSettings).Error)
	InitChannelCache()

	updated := pricingEndpointTypesByModel(t)
	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
	}, updated["gemini-3.5-flash"])
}

func TestInitChannelCacheInvalidatesStartupPricingBuiltBeforeChannelCache(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 302, constant.ChannelTypeAdvancedCustom, pricingEndpointAdvancedCustomConfig(
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/chat/completions",
			UpstreamPath: "/v1/chat/completions",
		},
		dto.AdvancedCustomRoute{
			IncomingPath: "/v1/responses",
			UpstreamPath: "/v1beta/models/{model}:generateContent",
			Converter:    "openai_responses_to_gemini_generate_content",
			Models:       []string{"re:^gemini-"},
		},
	))
	insertPricingEndpointAbility(t, 302, "gemini-3.5-flash")

	staleByModel := pricingEndpointTypesFromPricing(GetPricing())
	require.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, staleByModel["gemini-3.5-flash"])

	InitChannelCache()

	rebuiltByModel := pricingEndpointTypesFromPricing(GetPricing())
	assert.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
	}, rebuiltByModel["gemini-3.5-flash"])
}

func TestCacheUpdateChannelSyncsAdvancedCustomConfig(t *testing.T) {
	resetPricingEndpointTestTables(t)

	channel := &Channel{
		Id:     401,
		Type:   constant.ChannelTypeAdvancedCustom,
		Key:    "key-401",
		Status: common.ChannelStatusEnabled,
		Name:   "channel-401",
	}
	channel.SetOtherSettings(pricingEndpointAdvancedCustomConfig(dto.AdvancedCustomRoute{
		IncomingPath: "/v1/responses",
		UpstreamPath: "/v1beta/models/{model}:generateContent",
		Converter:    "openai_responses_to_gemini_generate_content",
	}))
	CacheUpdateChannel(channel)

	require.NotNil(t, channel2advancedCustomConfig[401])
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIResponse}, channel2advancedCustomConfig[401].SupportedEndpointTypesForModel("gemini-3.5-flash"))

	channel.SetOtherSettings(pricingEndpointAdvancedCustomConfig(dto.AdvancedCustomRoute{
		IncomingPath: "/v1/chat/completions",
		UpstreamPath: "/v1/chat/completions",
	}))
	CacheUpdateChannel(channel)

	require.NotNil(t, channel2advancedCustomConfig[401])
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, channel2advancedCustomConfig[401].SupportedEndpointTypesForModel("gemini-3.5-flash"))

	channel.Type = constant.ChannelTypeOpenAI
	CacheUpdateChannel(channel)

	assert.Nil(t, channel2advancedCustomConfig[401])
}
