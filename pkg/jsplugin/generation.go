package jsplugin

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// GenerationSchema describes client inputs, independently of billing usage facts.
// Paths address the host generation request, not the provider's private wire format.
type GenerationSchema struct {
	Fields          []GenerationField          `json:"fields"`
	ReferenceImages *GenerationReferenceImages `json:"referenceImages,omitempty"`
	MediaNotice     bool                       `json:"mediaNotice,omitempty"`
}

type GenerationProfile struct {
	Models []string `json:"models"`
	Kind   string   `json:"kind"`
	GenerationSchema
}

type GenerationReferenceImages struct {
	Max      int    `json:"max"`
	Field    string `json:"field"`
	Encoding string `json:"encoding"`
	Edit     bool   `json:"edit,omitempty"`
}

type GenerationOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type GenerationField struct {
	Key          string             `json:"key"`
	LabelKey     string             `json:"labelKey"`
	Label        LocalizedText      `json:"label,omitempty"`
	Type         string             `json:"type"`
	DefaultValue any                `json:"defaultValue"`
	Options      []GenerationOption `json:"options,omitempty"`
	Min          *float64           `json:"min,omitempty"`
	Max          *float64           `json:"max,omitempty"`
	RequestPath  []string           `json:"requestPath"`
	ValueType    string             `json:"valueType,omitempty"`
}

func (m Meta) GenerationForModels(kind string, models ...string) *GenerationSchema {
	for _, model := range models {
		for _, profile := range m.GenerationProfiles {
			if profile.Kind != kind {
				continue
			}
			for _, declared := range profile.Models {
				if strings.EqualFold(declared, model) {
					schema := CloneGenerationSchema(profile.GenerationSchema)
					return &schema
				}
			}
		}
	}
	return nil
}

func CloneGenerationSchema(schema GenerationSchema) GenerationSchema {
	schema.Fields = slices.Clone(schema.Fields)
	for i := range schema.Fields {
		field := &schema.Fields[i]
		field.Options = slices.Clone(field.Options)
		field.RequestPath = slices.Clone(field.RequestPath)
		field.Label = maps.Clone(field.Label)
		if field.Min != nil {
			v := *field.Min
			field.Min = &v
		}
		if field.Max != nil {
			v := *field.Max
			field.Max = &v
		}
	}
	if schema.ReferenceImages != nil {
		refs := *schema.ReferenceImages
		schema.ReferenceImages = &refs
	}
	return schema
}

func decodeGenerationProfiles(value any) ([]GenerationProfile, error) {
	items, ok := value.([]any)
	if !ok || len(items) > 1024 {
		return nil, fmt.Errorf("generationProfiles must be an array of at most 1024 profiles")
	}
	for _, item := range items {
		object, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("generation profile must be an object")
		}
		for key := range object {
			if !slices.Contains([]string{"models", "kind", "fields", "referenceImages", "mediaNotice"}, key) {
				return nil, fmt.Errorf("generation profile has unknown field %q", key)
			}
		}
		fields, ok := object["fields"].([]any)
		if !ok || len(fields) > 32 {
			return nil, fmt.Errorf("generation profile fields must be an array of at most 32 fields")
		}
		for _, raw := range fields {
			field, ok := raw.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("generation field must be an object")
			}
			for key := range field {
				if !slices.Contains([]string{"key", "labelKey", "label", "type", "defaultValue", "options", "min", "max", "requestPath", "valueType"}, key) {
					return nil, fmt.Errorf("generation field has unknown field %q", key)
				}
			}
		}
	}
	encoded, err := common.Marshal(value)
	if err != nil {
		return nil, err
	}
	var profiles []GenerationProfile
	if err := common.Unmarshal(encoded, &profiles); err != nil {
		return nil, fmt.Errorf("invalid generationProfiles: %w", err)
	}
	return profiles, nil
}

func validateGenerationProfiles(meta *Meta) error {
	seen := make(map[string]bool)
	for i := range meta.GenerationProfiles {
		profile := &meta.GenerationProfiles[i]
		if (profile.Kind != "image" && profile.Kind != "video") || len(profile.Models) == 0 || profile.Fields == nil {
			return fmt.Errorf("generation profile requires models, image/video kind and fields")
		}
		for _, model := range profile.Models {
			key := profile.Kind + "::" + model
			if !slices.Contains(meta.Models, model) || seen[key] {
				return fmt.Errorf("generation profile model %q must be declared and unique for its kind", model)
			}
			seen[key] = true
		}
		fields := make(map[string]bool)
		paths := make(map[string]bool)
		for j := range profile.Fields {
			field := &profile.Fields[j]
			if field.Key == "" || strings.TrimSpace(field.Key) != field.Key || fields[field.Key] || field.LabelKey == "" {
				return fmt.Errorf("generation field requires a unique canonical key and labelKey")
			}
			if field.Label != nil {
				if err := validateLocalizedText(field.Label, "generation field label", maxMetaDescriptionRunes); err != nil {
					return err
				}
			}
			fields[field.Key] = true
			if len(field.RequestPath) == 0 || len(field.RequestPath) > 8 {
				return fmt.Errorf("generation field %q requires a requestPath of 1 to 8 segments", field.Key)
			}
			for _, segment := range field.RequestPath {
				if segment == "" || strings.Contains(segment, ".") || slices.Contains([]string{"__proto__", "constructor", "prototype", "model", "prompt"}, segment) {
					return fmt.Errorf("generation field %q has an invalid requestPath", field.Key)
				}
			}
			path := strings.Join(field.RequestPath, ".")
			for other := range paths {
				if path == other || strings.HasPrefix(path, other+".") || strings.HasPrefix(other, path+".") {
					return fmt.Errorf("generation field requestPaths must not overlap")
				}
			}
			paths[path] = true
			if field.ValueType != "" && field.ValueType != "number" && field.ValueType != "boolean" {
				return fmt.Errorf("generation field %q has an invalid valueType", field.Key)
			}
			switch field.Type {
			case "select":
				value, ok := field.DefaultValue.(string)
				valid := false
				options := make(map[string]bool)
				for _, option := range field.Options {
					if option.Value == "" || options[option.Value] || option.Label == "" {
						return fmt.Errorf("generation field %q requires distinct non-empty options", field.Key)
					}
					options[option.Value] = true
					valid = valid || option.Value == value
					if field.ValueType == "number" {
						n, err := strconv.ParseFloat(option.Value, 64)
						if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
							return fmt.Errorf("generation field %q requires finite numeric options", field.Key)
						}
					}
					if field.ValueType == "boolean" && option.Value != "true" && option.Value != "false" {
						return fmt.Errorf("generation boolean field requires true/false options")
					}
				}
				if !ok || !valid || len(field.Options) > 128 {
					return fmt.Errorf("generation field %q default must match an option", field.Key)
				}
			case "number":
				n, ok := field.DefaultValue.(float64)
				if !ok || math.IsNaN(n) || math.IsInf(n, 0) || field.Min == nil || field.Max == nil || math.IsNaN(*field.Min) || math.IsNaN(*field.Max) || math.IsInf(*field.Min, 0) || math.IsInf(*field.Max, 0) || *field.Min > n || n > *field.Max || field.ValueType == "boolean" || len(field.Options) != 0 {
					return fmt.Errorf("generation numeric field %q requires finite bounds and an in-range default", field.Key)
				}
				field.ValueType = "number"
			default:
				return fmt.Errorf("unsupported generation field type %q", field.Type)
			}
		}
		if ref := profile.ReferenceImages; ref != nil {
			if ref.Max < 1 || ref.Max > 128 || (ref.Field != "image" && ref.Field != "images") || (ref.Encoding != "dataUrl" && ref.Encoding != "base64") || (ref.Edit && profile.Kind != "image") {
				return fmt.Errorf("invalid generation referenceImages declaration")
			}
		}
	}
	return nil
}
