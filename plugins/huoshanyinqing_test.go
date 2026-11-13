package plugins_test

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func loadHuoshanPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("huoshanyinqing")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "huoshanyinqing"})
	require.NoError(t, err)
	return plugin
}

func callHuoshanHook(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	return decodePluginValue(t, value)
}

func huoshanyinqingContext(modelName, upstreamModel string, request map[string]any) map[string]any {
	if upstreamModel == "" {
		upstreamModel = modelName
	}
	return map[string]any{
		"requestBody":   request,
		"model":         modelName,
		"upstreamModel": upstreamModel,
		"baseUrl":       "https://huoshanyinqing.example",
		"apiKey":        "sk-sd",
	}
}

// bodyOf asserts the submit descriptor carries a JSON object body and returns it.
func bodyOf(t *testing.T, submit map[string]any) map[string]any {
	t.Helper()
	body, ok := submit["body"].(map[string]any)
	require.True(t, ok, "submit.body must be a JSON object")
	return body
}

// rolesOf lists each content item as "type" or "type:role", in order, so a test
// can assert both the media the plugin emits and the role it assigns.
func rolesOf(t *testing.T, body map[string]any) []string {
	t.Helper()
	content, ok := body["content"].([]any)
	require.True(t, ok, "body.content must be an array")
	roles := make([]string, 0, len(content))
	for _, raw := range content {
		item, ok := raw.(map[string]any)
		require.True(t, ok)
		role, _ := item["role"].(string)
		kind, _ := item["type"].(string)
		if role == "" {
			roles = append(roles, kind)
		} else {
			roles = append(roles, kind+":"+role)
		}
	}
	return roles
}

// The quick-generate composer sends a flat TaskSubmitReq. The huoshanyinqing driver
// rebuilds Ark's multimodal content from it so the three input modes reach the
// gateway: first/last frame (image_mode), all-reference media (attached video and
// audio), and the 480p sample draft toggle.
func TestHuoshanQuickGenerateBuildsArkContent(t *testing.T) {
	plugin := loadHuoshanPlugin(t)

	t.Run("first and last frame with references and draft", func(t *testing.T) {
		submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.5", "", map[string]any{
			"prompt":   "p",
			"images":   []any{"https://cdn/a.png", "https://cdn/b.png"},
			"duration": 5,
			"metadata": map[string]any{
				"resolution":      "720p",
				"image_mode":      "first_last",
				"draft":           true,
				"reference_video": []any{"https://cdn/ref.mp4"},
				"reference_audio": []any{"https://cdn/ref.mp3"},
			},
		}))
		assert.Equal(t, "https://huoshanyinqing.example/api/v3/contents/generations/tasks", submit["url"])
		assert.Equal(t, "image_to_video", submit["action"])
		body := bodyOf(t, submit)
		assert.Equal(t, "Seedance2.5", body["model"])
		// The 480p sample forces its own output tier regardless of the request.
		assert.Equal(t, "480p", body["resolution"])
		assert.EqualValues(t, 5, body["duration"])
		assert.Equal(t, true, body["draft"])
		// Seedance 2.5 first/last-frame work must leave the ratio to the frames.
		assert.Equal(t, "adaptive", body["ratio"])
		assert.Equal(t, []string{
			"image_url:first_frame",
			"image_url:last_frame",
			"video_url:reference_video",
			"audio_url:reference_audio",
			"text",
		}, rolesOf(t, body))
	})

	t.Run("single first frame", func(t *testing.T) {
		submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.5", "", map[string]any{
			"prompt":   "p",
			"images":   []any{"https://cdn/a.png"},
			"duration": 5,
			"metadata": map[string]any{"resolution": "720p", "image_mode": "first_frame"},
		}))
		assert.Equal(t, []string{"image_url:first_frame", "text"}, rolesOf(t, bodyOf(t, submit)))
	})

	t.Run("reference images keep the reference role and no forced ratio", func(t *testing.T) {
		submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.0", "", map[string]any{
			"prompt":   "p",
			"images":   []any{"https://cdn/a.png"},
			"duration": 5,
			"metadata": map[string]any{"resolution": "1080p", "image_mode": "reference"},
		}))
		body := bodyOf(t, submit)
		assert.Nil(t, body["ratio"])
		assert.Equal(t, []string{"image_url:reference_image", "text"}, rolesOf(t, body))
	})

	t.Run("only Seedance 2.5 forces an adaptive ratio", func(t *testing.T) {
		submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.0", "", map[string]any{
			"prompt":   "p",
			"images":   []any{"https://cdn/a.png", "https://cdn/b.png"},
			"duration": 5,
			"metadata": map[string]any{"resolution": "720p", "image_mode": "first_last"},
		}))
		assert.Nil(t, bodyOf(t, submit)["ratio"])
	})
}

// A channel that maps the declared model to an endpoint id still gets the 2.5
// adaptive behavior (capability follows the declared name) and rewrites the wire
// model to the mapped id.
func TestHuoshanMappedModelStillAdaptive(t *testing.T) {
	plugin := loadHuoshanPlugin(t)
	submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.5", "ep-2026", map[string]any{
		"prompt":   "p",
		"images":   []any{"https://cdn/a.png", "https://cdn/b.png"},
		"duration": 5,
		"metadata": map[string]any{"resolution": "720p", "image_mode": "first_last"},
	}))
	body := bodyOf(t, submit)
	assert.Equal(t, "ep-2026", body["model"])
	assert.Equal(t, "adaptive", body["ratio"])
}

// A native Ark body is forwarded untouched (roles, draft, ratio and all); only
// the wire model is rewritten.
func TestHuoshanNativeBodyPassesThrough(t *testing.T) {
	plugin := loadHuoshanPlugin(t)
	submit := callHuoshanHook(t, plugin, "buildSubmitRequest", huoshanyinqingContext("Seedance2.5", "ep-2026", map[string]any{
		"vendorBody": map[string]any{
			"model": "Seedance2.5",
			"ratio": "adaptive",
			"draft": true,
			"content": []any{
				map[string]any{"type": "image_url", "role": "last_frame", "image_url": map[string]any{"url": "https://cdn/b.png"}},
				map[string]any{"type": "text", "text": "t"},
			},
		},
	}))
	body := bodyOf(t, submit)
	assert.Equal(t, "ep-2026", body["model"])
	assert.Equal(t, true, body["draft"])
	assert.Equal(t, "adaptive", body["ratio"])
	assert.Equal(t, []string{"image_url:last_frame", "text"}, rolesOf(t, body))
}

// A reference video carried only in the quick-generate metadata still bills:
// the facts report video_input, and the reservation ratio applies the lower
// with-reference-video token rate (Seedance2.5 720p = 6.4 / 10.7). Without one,
// the ratio is 1 and the billing-ratios hook returns nothing.
func TestHuoshanUsageDetectsMetadataReferenceVideo(t *testing.T) {
	plugin := loadHuoshanPlugin(t)

	withVideo := huoshanyinqingContext("Seedance2.5", "", map[string]any{
		"prompt":   "p",
		"duration": 5,
		"metadata": map[string]any{"resolution": "720p", "reference_video": []any{"https://cdn/ref.mp4"}},
	})
	facts := callHuoshanHook(t, plugin, "extractUsage", withVideo)
	assert.Equal(t, "video", facts["video_input"])

	withVideo["usagePurpose"] = "billing_ratios"
	ratios := callHuoshanHook(t, plugin, "extractUsage", withVideo)
	ratio, ok := ratios["video_input_ratio"].(float64)
	require.True(t, ok)
	assert.InDelta(t, 6.4/10.7, ratio, 1e-9)

	without := huoshanyinqingContext("Seedance2.5", "", map[string]any{
		"prompt":   "p",
		"duration": 5,
		"metadata": map[string]any{"resolution": "720p"},
	})
	assert.Equal(t, "none", callHuoshanHook(t, plugin, "extractUsage", without)["video_input"])
	without["usagePurpose"] = "billing_ratios"
	_, hasRatio := callHuoshanHook(t, plugin, "extractUsage", without)["video_input_ratio"]
	assert.False(t, hasRatio)
}
