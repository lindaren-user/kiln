package model

import (
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// A public model can route to several providers. Only their common accepted
// inputs are safe to offer without pinning a private channel in the browser.
func pricingGenerationSchemas(abilities []AbilityWithChannel, advanced map[int]*dto.AdvancedCustomConfig, configs map[int]pricingTaskPluginConfig) map[string]map[string]jsplugin.GenerationSchema {
	result := make(map[string]map[string]jsplugin.GenerationSchema)
	generation := jsplugin.DefaultRegistry.Generation()
	for _, ability := range abilities {
		config := configs[ability.ChannelId]
		upstream, cyclic := followChannelModelMapping(config.modelMapping, ability.Model)
		if cyclic {
			upstream = ""
		}
		var candidates []*jsplugin.LoadedPlugin
		switch ability.ChannelType {
		case constant.ChannelTypeTaskPlugin:
			if plugin, ok := generation.Get(config.key); ok {
				candidates = append(candidates, plugin)
			}
		case constant.ChannelTypeNewAPI:
			for _, key := range config.bindings {
				if plugin, ok := generation.Get(key); ok {
					candidates = append(candidates, plugin)
				}
			}
		default:
			if plugin, ok := generation.GetByChannelType(ability.ChannelType); ok {
				candidates = append(candidates, plugin)
			}
		}
		endpoints := getPricingEndpointTypesForAbility(ability, advanced, configs)
		for _, kind := range []string{"image", "video"} {
			endpoint := constant.EndpointTypeImageGeneration
			protocol := "openai_image"
			if kind == "video" {
				endpoint = constant.EndpointTypeOpenAIVideo
				protocol = "openai_video"
			}
			if !slices.Contains(endpoints, endpoint) {
				continue
			}
			var selected *jsplugin.GenerationSchema
			for _, plugin := range candidates {
				declared := ""
				for _, candidate := range []string{upstream, ability.Model} {
					if canonical, ok := generation.CanonicalModel(candidate); ok && slices.ContainsFunc(plugin.Meta.Models, func(model string) bool { return strings.EqualFold(model, canonical) }) {
						declared = canonical
						break
					}
				}
				if declared == "" {
					continue
				}
				claimed := slices.ContainsFunc(plugin.Meta.Protocols, func(claim jsplugin.ProtocolClaim) bool {
					return claim.Name == protocol && (len(claim.Models) == 0 || slices.Contains(claim.Models, declared))
				})
				if !claimed {
					continue
				}
				schema := plugin.Meta.GenerationForModels(kind, upstream, ability.Model)
				if schema == nil {
					schema = &jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{}}
				}
				if selected == nil {
					selected = schema
				} else {
					merged := intersectGenerationSchemas(*selected, *schema)
					selected = &merged
				}
			}
			if selected == nil {
				selected = channelGenerationSchema(ability.ChannelId, kind, upstream, ability.Model)
			}
			if selected == nil {
				selected = nativeImageGenerationSchema(ability.ChannelType, upstream)
				if kind != "image" || selected == nil {
					selected = &jsplugin.GenerationSchema{Fields: []jsplugin.GenerationField{}}
				}
			}
			if result[ability.Model] == nil {
				result[ability.Model] = make(map[string]jsplugin.GenerationSchema)
			}
			if previous, ok := result[ability.Model][kind]; ok {
				result[ability.Model][kind] = intersectGenerationSchemas(previous, *selected)
			} else {
				result[ability.Model][kind] = *selected
			}
		}
	}
	return result
}

// A provider that lists the lengths it accepts and one that gives a numeric
// range describe the same input. The values are comparable only when both mean
// whole numbers, which is what the length fields do.
func integerOptionValues(field jsplugin.GenerationField) ([]string, bool) {
	if field.Type == "select" {
		values := make([]string, 0, len(field.Options))
		for _, option := range field.Options {
			if _, err := strconv.Atoi(option.Value); err != nil {
				return nil, false
			}
			values = append(values, option.Value)
		}
		return values, len(values) > 0
	}
	if field.Type != "number" || field.Min == nil || field.Max == nil || *field.Min > *field.Max {
		return nil, false
	}
	if *field.Min != math.Trunc(*field.Min) || *field.Max != math.Trunc(*field.Max) {
		return nil, false
	}
	values := make([]string, 0)
	for value := int(*field.Min); value <= int(*field.Max); value++ {
		values = append(values, strconv.Itoa(value))
	}
	return values, len(values) > 0
}

func intersectGenerationSchemas(first, second jsplugin.GenerationSchema) jsplugin.GenerationSchema {
	merged := jsplugin.CloneGenerationSchema(first)
	merged.Fields = make([]jsplugin.GenerationField, 0)
	for _, field := range first.Fields {
		index := slices.IndexFunc(second.Fields, func(other jsplugin.GenerationField) bool {
			if field.Key != other.Key || field.ValueType != other.ValueType || !slices.Equal(field.RequestPath, other.RequestPath) {
				return false
			}
			if field.Type == other.Type {
				return true
			}
			_, firstListed := integerOptionValues(field)
			_, secondListed := integerOptionValues(other)
			return firstListed && secondListed
		})
		if index < 0 {
			continue
		}
		other := second.Fields[index]
		switch {
		case field.Type == "select" && other.Type == "select":
			options := make([]jsplugin.GenerationOption, 0)
			for _, option := range field.Options {
				if slices.ContainsFunc(other.Options, func(candidate jsplugin.GenerationOption) bool { return candidate.Value == option.Value }) {
					options = append(options, option)
				}
			}
			if len(options) == 0 {
				continue
			}
			field.Options = options
			if !slices.ContainsFunc(options, func(option jsplugin.GenerationOption) bool { return option.Value == field.DefaultValue }) {
				field.DefaultValue = options[0].Value
			}
		case field.Type == "number" && other.Type == "number":
			minimum, maximum := max(*field.Min, *other.Min), min(*field.Max, *other.Max)
			if minimum > maximum {
				continue
			}
			field.Min, field.Max = &minimum, &maximum
			// Use an accepted default even when the providers' ranges differ.
			field.DefaultValue = minimum
		default:
			// Keep the listed lengths that fall inside the range, so the
			// console can still offer a dropdown for the shared model.
			listed, _ := integerOptionValues(field)
			ranged, _ := integerOptionValues(other)
			options := make([]jsplugin.GenerationOption, 0)
			for _, value := range listed {
				if slices.Contains(ranged, value) {
					options = append(options, jsplugin.GenerationOption{Value: value, Label: value})
				}
			}
			if len(options) == 0 {
				continue
			}
			field.Type = "select"
			field.Options = options
			field.Min, field.Max = nil, nil
			if !slices.ContainsFunc(options, func(option jsplugin.GenerationOption) bool { return option.Value == field.DefaultValue }) {
				field.DefaultValue = options[0].Value
			}
		}
		merged.Fields = append(merged.Fields, field)
	}
	merged.MediaNotice = first.MediaNotice && second.MediaNotice
	if first.ReferenceImages == nil || second.ReferenceImages == nil || first.ReferenceImages.Field != second.ReferenceImages.Field || first.ReferenceImages.Encoding != second.ReferenceImages.Encoding || first.ReferenceImages.Edit != second.ReferenceImages.Edit {
		merged.ReferenceImages = nil
	} else {
		merged.ReferenceImages.Max = min(first.ReferenceImages.Max, second.ReferenceImages.Max)
	}
	return merged
}

// A channel can declare the inputs it really accepts when the provider's
// official contract does not hold for it, for example a reseller that proxies
// only /v1/images/generations. The declaration wins over the provider's
// built-in contract for that channel; models it does not list keep the
// built-in one. A malformed declaration is ignored rather than failing the
// whole pricing view.
func channelGenerationSchema(channelID int, kind, upstream, model string) *jsplugin.GenerationSchema {
	channel, err := CacheGetChannel(channelID)
	if err != nil || channel == nil {
		return nil
	}
	var settings dto.ChannelOtherSettings
	if err := common.UnmarshalJsonStr(channel.OtherSettings, &settings); err != nil {
		return nil
	}
	if len(settings.GenerationProfiles) == 0 {
		return nil
	}
	var profiles []jsplugin.GenerationProfile
	if err := common.Unmarshal(settings.GenerationProfiles, &profiles); err != nil {
		return nil
	}
	for _, profile := range profiles {
		if profile.Kind != kind {
			continue
		}
		if len(profile.Models) == 0 {
			schema := jsplugin.CloneGenerationSchema(profile.GenerationSchema)
			return &schema
		}
		for _, declared := range profile.Models {
			if strings.EqualFold(declared, upstream) || strings.EqualFold(declared, model) {
				schema := jsplugin.CloneGenerationSchema(profile.GenerationSchema)
				return &schema
			}
		}
	}
	return nil
}

// Native image relays have no task-plugin manifest. Keep their explicit API
// contracts here, scoped to provider channel types and exact upstream models.
func nativeImageGenerationSchema(channelType int, model string) *jsplugin.GenerationSchema {
	if channelType != constant.ChannelTypeOpenAI && channelType != constant.ChannelTypeAzure {
		return nil
	}
	var sizes, qualities []string
	maxCount := 10
	var refs *jsplugin.GenerationReferenceImages
	switch lower := strings.ToLower(model); {
	case lower == "dall-e-2":
		sizes = []string{"1024x1024", "512x512", "256x256"}
	case lower == "dall-e-3":
		sizes = []string{"1024x1024", "1792x1024", "1024x1792"}
		qualities = []string{"standard", "hd"}
		maxCount = 1
	case strings.HasPrefix(lower, "gpt-image-"), lower == "chatgpt-image-latest":
		// Every GPT Image model shares one request contract; matching the
		// family instead of a version list keeps new releases (gpt-image-2,
		// gpt-image-2.6, ...) selectable without another edit here.
		sizes = []string{"auto", "1024x1024", "1536x1024", "1024x1536"}
		qualities = []string{"auto", "low", "medium", "high"}
		refs = &jsplugin.GenerationReferenceImages{Max: 16, Field: "image", Encoding: "dataUrl", Edit: true}
		// gpt-image-2 accepts up to four images per request; the earlier
		// releases keep the ten-image allowance.
		if strings.HasPrefix(lower, "gpt-image-2") {
			maxCount = 4
		}
	default:
		return nil
	}
	sizeOptions := make([]jsplugin.GenerationOption, 0, len(sizes))
	for _, size := range sizes {
		sizeOptions = append(sizeOptions, jsplugin.GenerationOption{Value: size, Label: size})
	}
	countOptions := make([]jsplugin.GenerationOption, 0, maxCount)
	for i := range maxCount {
		value := strconv.Itoa(i + 1)
		countOptions = append(countOptions, jsplugin.GenerationOption{Value: value, Label: value})
	}
	schema := &jsplugin.GenerationSchema{
		Fields: []jsplugin.GenerationField{
			{Key: "size", LabelKey: "Size", Type: "select", DefaultValue: sizes[0], Options: sizeOptions, RequestPath: []string{"size"}},
			{Key: "count", LabelKey: "Count", Type: "select", ValueType: "number", DefaultValue: "1", Options: countOptions, RequestPath: []string{"n"}},
		},
		ReferenceImages: refs,
	}
	if len(qualities) > 0 {
		options := make([]jsplugin.GenerationOption, 0, len(qualities))
		for _, quality := range qualities {
			options = append(options, jsplugin.GenerationOption{Value: quality, Label: quality})
		}
		schema.Fields = append(schema.Fields, jsplugin.GenerationField{Key: "quality", LabelKey: "Quality", Type: "select", DefaultValue: qualities[0], Options: options, RequestPath: []string{"quality"}})
	}
	return schema
}
