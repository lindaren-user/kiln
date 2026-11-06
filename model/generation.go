package model

import (
	"slices"
	"strconv"
	"strings"

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

func intersectGenerationSchemas(first, second jsplugin.GenerationSchema) jsplugin.GenerationSchema {
	merged := jsplugin.CloneGenerationSchema(first)
	merged.Fields = make([]jsplugin.GenerationField, 0)
	for _, field := range first.Fields {
		index := slices.IndexFunc(second.Fields, func(other jsplugin.GenerationField) bool {
			return field.Key == other.Key && field.Type == other.Type && field.ValueType == other.ValueType && slices.Equal(field.RequestPath, other.RequestPath)
		})
		if index < 0 {
			continue
		}
		other := second.Fields[index]
		if field.Type == "select" {
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
		} else {
			minimum, maximum := max(*field.Min, *other.Min), min(*field.Max, *other.Max)
			if minimum > maximum {
				continue
			}
			field.Min, field.Max = &minimum, &maximum
			// Use an accepted default even when the providers' ranges differ.
			field.DefaultValue = minimum
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

// Native image relays have no task-plugin manifest. Keep their explicit API
// contracts here, scoped to provider channel types and exact upstream models.
func nativeImageGenerationSchema(channelType int, model string) *jsplugin.GenerationSchema {
	if channelType != constant.ChannelTypeOpenAI && channelType != constant.ChannelTypeAzure {
		return nil
	}
	var sizes, qualities []string
	maxCount := 10
	var refs *jsplugin.GenerationReferenceImages
	switch strings.ToLower(model) {
	case "dall-e-2":
		sizes = []string{"1024x1024", "512x512", "256x256"}
	case "dall-e-3":
		sizes = []string{"1024x1024", "1792x1024", "1024x1792"}
		qualities = []string{"standard", "hd"}
		maxCount = 1
	case "gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "chatgpt-image-latest":
		sizes = []string{"auto", "1024x1024", "1536x1024", "1024x1536"}
		qualities = []string{"auto", "low", "medium", "high"}
		refs = &jsplugin.GenerationReferenceImages{Max: 16, Field: "image", Encoding: "dataUrl", Edit: true}
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
