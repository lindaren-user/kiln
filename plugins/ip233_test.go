package plugins_test

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relay/channel"
	taskplugin "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func loadIP233Plugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("ip233")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "ip233"})
	require.NoError(t, err)
	return plugin
}

func callIP233Hook(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var decoded map[string]any
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	return decoded
}

func ip233SubmitContext(modelName string, request map[string]any) map[string]any {
	return map[string]any{
		"requestBody":   request,
		"model":         modelName,
		"upstreamModel": modelName,
		"baseUrl":       "https://api-new.ip233.example",
		"apiKey":        "sk-redeem",
	}
}

// The body is the one IP233 documents for that model: a field the model does
// not publish is dropped rather than forwarded and rejected upstream.
func TestIP233VideoSubmitRequest(t *testing.T) {
	plugin := loadIP233Plugin(t)
	for _, testCase := range []struct {
		name       string
		model      string
		request    map[string]any
		wantBody   string
		wantAction string
	}{
		{
			name:     "seedance per call takes seconds and aspect_ratio",
			model:    "seedance2.0-B2",
			request:  map[string]any{"prompt": "p", "seconds": 8, "resolution": "720p", "aspect_ratio": "9:16"},
			wantBody: `{"model":"seedance2.0-B2","prompt":"p","seconds":8,"aspect_ratio":"9:16","resolution":"720p"}`,
		},
		{
			name:     "a size becomes the nearest published frame ratio",
			model:    "seedance2.0-B2",
			request:  map[string]any{"prompt": "p", "size": "1920x1080"},
			wantBody: `{"model":"seedance2.0-B2","prompt":"p","seconds":4,"aspect_ratio":"16:9","resolution":"720p"}`,
		},
		{
			name:     "models that frame with size take no aspect_ratio",
			model:    "seedance2.0-mini-B1",
			request:  map[string]any{"prompt": "p", "duration": 8, "size": "720x1280"},
			wantBody: `{"model":"seedance2.0-mini-B1","prompt":"p","duration":8,"size":"9:16"}`,
		},
		{
			name:     "a documented ratio list keeps its own spelling",
			model:    "seedance2.5-A2",
			request:  map[string]any{"prompt": "p", "seconds": 12, "resolution": "1080p", "aspect_ratio": "21:9"},
			wantBody: `{"model":"seedance2.5-A2","prompt":"p","seconds":12,"aspect_ratio":"21:9","resolution":"1080p"}`,
		},
		{
			name:       "wan reference images and audio",
			model:      "wan3.0-video",
			request:    map[string]any{"prompt": "p", "seconds": 5, "resolution": "1080p", "reference_images": []any{"https://cdn.example/a.png"}, "audio": true},
			wantBody:   `{"model":"wan3.0-video","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"1080p","reference_images":["https://cdn.example/a.png"],"audio":true}`,
			wantAction: "image_to_video",
		},
		{
			name:       "wan first and last frame",
			model:      "wan3.0-video",
			request:    map[string]any{"prompt": "p", "first_frame": "https://cdn.example/f.png", "last_frame": "https://cdn.example/l.png"},
			wantBody:   `{"model":"wan3.0-video","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"1080p","first_frame":"https://cdn.example/f.png","last_frame":"https://cdn.example/l.png"}`,
			wantAction: "image_to_video",
		},
		{
			name:     "minimax keeps the vendor model name",
			model:    "ip233-minimax-h3",
			request:  map[string]any{"prompt": "p", "seconds": 6},
			wantBody: `{"model":"minimax-h3","prompt":"p","seconds":6,"aspect_ratio":"16:9","resolution":"768p"}`,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			descriptor := callIP233Hook(t, plugin, "buildSubmitRequest", ip233SubmitContext(testCase.model, testCase.request))
			assert.Equal(t, "https://api-new.ip233.example/v1/videos", descriptor["url"])
			assert.Equal(t, "POST", descriptor["method"])
			if testCase.wantAction != "" {
				assert.Equal(t, testCase.wantAction, descriptor["action"])
			}
			body, err := common.Marshal(descriptor["body"])
			require.NoError(t, err)
			assert.JSONEq(t, testCase.wantBody, string(body))
		})
	}
}

// Every bound is checked before the vendor is charged for a request it will
// refuse, and each fact the plugin reports stays inside the host's own limits.
func TestIP233RejectsOutOfContractRequests(t *testing.T) {
	plugin := loadIP233Plugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		wantErr string
	}{
		{"seconds outside the published list", "seedance2.0-A1", map[string]any{"prompt": "p", "seconds": 7}, "duration must be one of 5, 10, 15"},
		{"seconds above the maximum", "wan3.0-video", map[string]any{"prompt": "p", "seconds": 31}, "duration must be between 2 and 30"},
		{"fractional seconds", "wan3.0-video", map[string]any{"prompt": "p", "seconds": 5.5}, "duration must be an integer"},
		{"unlisted resolution", "wan3.0-video", map[string]any{"prompt": "p", "resolution": "4k"}, "resolution must be one of 480p, 720p, 1080p"},
		{"frame ratios cannot be combined with references", "wan3.0-video", map[string]any{
			"prompt": "p", "first_frame": "https://cdn.example/f.png", "last_frame": "https://cdn.example/l.png",
			"reference_images": []any{"https://cdn.example/a.png"},
		}, "cannot be combined with reference media"},
		{"a lone last frame", "wan3.0-video", map[string]any{"prompt": "p", "last_frame": "https://cdn.example/l.png"}, "must be provided together"},
		{"uploaded files are not accepted", "seedance2.0-B2", map[string]any{"prompt": "p", "images": []any{"data:image/png;base64,AAA"}}, "must be an http or https URL"},
		{"prompt is required", "seedance2.0-B2", map[string]any{"seconds": 5}, "field prompt is required"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ip233SubmitContext(testCase.model, testCase.request))
			require.ErrorContains(t, err, testCase.wantErr)
		})
	}
}

// IP233 answers an image request with a task id, so the plugin claims the
// OpenAI Images protocol and lets the host poll and settle it.
func TestIP233ImageSubmitRequest(t *testing.T) {
	plugin := loadIP233Plugin(t)
	submit := func(model string, request map[string]any) map[string]any {
		descriptor := callIP233Hook(t, plugin, "buildSubmitRequest", ip233SubmitContext(model, request))
		assert.Equal(t, "https://api-new.ip233.example/v1/images/generations", descriptor["url"])
		body, ok := descriptor["body"].(map[string]any)
		require.True(t, ok)
		return body
	}

	t.Run("size-based model keeps the ratio", func(t *testing.T) {
		body := submit("ip233-gpt-image-2", map[string]any{"prompt": "p", "size": "1536x1024"})
		assert.Equal(t, "gpt-image-2", body["model"])
		assert.Equal(t, "3:2", body["size"])
		assert.Equal(t, true, body["async"])
		assert.Equal(t, "url", body["response_format"])
		assert.Equal(t, float64(1), body["n"])
	})

	t.Run("aspect-based model gets an aspect_ratio", func(t *testing.T) {
		body := submit("gpt-image-2.5", map[string]any{"prompt": "p", "size": "16:9"})
		assert.Equal(t, "16:9", body["aspect_ratio"])
		assert.NotContains(t, body, "size")
	})

	t.Run("openai quality maps onto the vendor vocabulary", func(t *testing.T) {
		assert.Equal(t, "high", submit("gpt-image-2.5-flare-1k", map[string]any{"prompt": "p", "quality": "hd"})["quality"])
		assert.Equal(t, "medium", submit("gpt-image-2.5-flare-1k", map[string]any{"prompt": "p"})["quality"])
	})

	t.Run("the nano banana tier is the price tier", func(t *testing.T) {
		assert.Equal(t, "4K", submit("gemini-nano-banana-2.1", map[string]any{"prompt": "p", "quality": "4K"})["quality"])
		assert.Equal(t, "2K", submit("gemini-nano-banana-2.1", map[string]any{"prompt": "p", "size": "2048x2048"})["quality"])
		assert.Equal(t, "1K", submit("gemini-nano-banana-2.1", map[string]any{"prompt": "p"})["quality"])
	})

	t.Run("reference images pass through as URLs", func(t *testing.T) {
		body := submit("gpt-image-2-1k", map[string]any{"prompt": "p", "images": []any{"https://cdn.example/a.png"}})
		assert.Equal(t, []any{"https://cdn.example/a.png"}, body["images"])
	})

	t.Run("one image per request", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ip233SubmitContext("ip233-gpt-image-2", map[string]any{"prompt": "p", "n": 2}))
		require.ErrorContains(t, err, "one image per request")
	})
}

func TestIP233UsageFacts(t *testing.T) {
	plugin := loadIP233Plugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		want    map[string]any
	}{
		{
			name:    "per-second video reserves the requested seconds",
			model:   "wan3.0-video",
			request: map[string]any{"prompt": "p", "seconds": 12},
			want:    map[string]any{"seconds": float64(12), "resolution": "1080p"},
		},
		{
			name:    "per-call video reserves one generation and its resolution",
			model:   "seedance2.5-B1",
			request: map[string]any{"prompt": "p", "seconds": 20},
			want:    map[string]any{"count": float64(1), "resolution": "720p"},
		},
		{
			name:    "a resolution derived from a size is bounded to a published tier",
			model:   "seedance2.0-B2",
			request: map[string]any{"prompt": "p", "size": "3840x2160"},
			want:    map[string]any{"count": float64(1), "resolution": "720p"},
		},
		{
			name:    "image quality is a billing dimension of that model",
			model:   "gpt-image-2.5-flare-2k",
			request: map[string]any{"prompt": "p", "quality": "xhigh"},
			want:    map[string]any{"image_count": float64(1), "quality": "xhigh"},
		},
		{
			name:    "the nano banana tier is its own fact",
			model:   "gemini-nano-banana-2.1",
			request: map[string]any{"prompt": "p", "quality": "2K"},
			want:    map[string]any{"image_count": float64(1), "image_resolution": "2K"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, callIP233Hook(t, plugin, "extractUsage", ip233SubmitContext(testCase.model, testCase.request)))
		})
	}
}

// The completion count comes from the image payloads of the terminal reply so
// a settled task never bills more images than IP233 delivered.
func TestIP233CompletionUsageFacts(t *testing.T) {
	plugin := loadIP233Plugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		body    string
		want    map[string]any
		wantErr string
	}{
		{
			name:  "data array",
			model: "ip233-gpt-image-2",
			body:  `{"status":"completed","data":[{"url":"https://cdn.example/a.png"}]}`,
			want:  map[string]any{"image_count": float64(1)},
		},
		{
			name:  "result_urls array",
			model: "gpt-image-2.5",
			body:  `{"status":"completed","result_urls":["https://cdn.example/a.png"]}`,
			want:  map[string]any{"image_count": float64(1)},
		},
		{
			name:  "a payload-less entry bills nothing",
			model: "ip233-gpt-image-2",
			body:  `{"status":"completed","data":[{"revised_prompt":"p"}]}`,
			want:  map[string]any{},
		},
		{
			name:  "video completion leaves the reservation in place",
			model: "wan3.0-video",
			body:  `{"status":"completed","result_url":"https://cdn.example/v.mp4"}`,
			want:  map[string]any{},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var body any
			require.NoError(t, common.UnmarshalJsonStr(testCase.body, &body))
			ctx := map[string]any{"model": testCase.model, "upstreamModel": testCase.model}
			if testCase.wantErr != "" {
				_, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", ctx, nil, body)
				require.ErrorContains(t, err, testCase.wantErr)
				return
			}
			assert.Equal(t, testCase.want, callIP233Hook(t, plugin, "extractUsageOnComplete", ctx, nil, body))
		})
	}
}

func TestIP233ParseTaskResult(t *testing.T) {
	plugin := loadIP233Plugin(t)
	for _, testCase := range []struct {
		name       string
		body       string
		wantStatus string
		wantURL    string
		wantReason string
	}{
		{"queued", `{"status":"queued","progress":0}`, "QUEUED", "", ""},
		{"running", `{"status":"in_progress","progress":40}`, "IN_PROGRESS", "", ""},
		{"waiting for the billing figure", `{"status":"completed","billing_pending":true,"result_url":"https://cdn.example/v.mp4"}`, "IN_PROGRESS", "", ""},
		{"completed", `{"status":"completed","progress":100,"result_url":"https://cdn.example/v.mp4"}`, "SUCCESS", "https://cdn.example/v.mp4", ""},
		{"failed", `{"status":"failed","error":{"message":"sensitive content"}}`, "FAILURE", "", "sensitive content"},
		{"unrecognised", `{"status":"weird"}`, "UNKNOWN", "", "unrecognized status: weird"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var body any
			require.NoError(t, common.UnmarshalJsonStr(testCase.body, &body))
			result := callIP233Hook(t, plugin, "parseTaskResult", map[string]any{}, body)
			assert.Equal(t, testCase.wantStatus, result["status"])
			assert.Equal(t, testCase.wantURL, common.Interface2String(result["url"]))
			assert.Equal(t, testCase.wantReason, common.Interface2String(result["reason"]))
		})
	}
}

func TestIP233ParseSubmitResponse(t *testing.T) {
	plugin := loadIP233Plugin(t)
	t.Run("video create", func(t *testing.T) {
		parsed := callIP233Hook(t, plugin, "parseSubmitResponse", map[string]any{"model": "wan3.0-video"},
			map[string]any{"body": map[string]any{"id": "task_1", "status": "queued"}})
		assert.Equal(t, "task_1", parsed["taskId"])
	})
	t.Run("image create returns a task id", func(t *testing.T) {
		parsed := callIP233Hook(t, plugin, "parseSubmitResponse", map[string]any{"model": "ip233-gpt-image-2"},
			map[string]any{"body": map[string]any{"task_id": "task_img_1", "status": "queued"}})
		assert.Equal(t, "task_img_1", parsed["taskId"])
	})
	t.Run("an image answered at once completes immediately", func(t *testing.T) {
		parsed := callIP233Hook(t, plugin, "parseSubmitResponse", map[string]any{"model": "ip233-gpt-image-2", "publicTaskId": "task_pub"},
			map[string]any{"body": map[string]any{"data": []any{map[string]any{"url": "https://cdn.example/a.png"}}}})
		immediate, ok := parsed["immediate"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "SUCCESS", immediate["status"])
	})
	t.Run("a vendor error names its message", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{"model": "wan3.0-video"},
			map[string]any{"body": map[string]any{"error": map[string]any{"message": "insufficient balance"}}})
		require.ErrorContains(t, err, "insufficient balance")
	})
}

func TestIP233ArtifactsAndContent(t *testing.T) {
	plugin := loadIP233Plugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ApiKey: "sk-redeem", ChannelBaseUrl: "https://api-new.ip233.example"}})

	t.Run("a signed result URL is proxied without credentials", func(t *testing.T) {
		task := &model.Task{
			TaskID: "task_pub",
			Status: model.TaskStatusSuccess,
			Data:   []byte(`{"status":"completed","result_url":"https://cdn.example/v.mp4?sig=1"}`),
		}
		artifacts, err := adaptor.ListArtifacts(task)
		require.NoError(t, err)
		assert.Equal(t, []channel.TaskArtifact{{Key: "video", Type: "video", MimeType: "video/mp4"}}, artifacts)

		descriptor, err := adaptor.BuildContentRequest(t.Context(), task, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
		require.NoError(t, err)
		assert.Equal(t, "https://cdn.example/v.mp4?sig=1", descriptor.URL)
		assert.True(t, descriptor.Credentialless)
	})

	t.Run("a task without a result URL downloads from the content endpoint", func(t *testing.T) {
		task := &model.Task{
			TaskID:      "task_pub",
			Status:      model.TaskStatusSuccess,
			Data:        []byte(`{"status":"completed"}`),
			PrivateData: model.TaskPrivateData{UpstreamTaskID: "task_up"},
		}
		descriptor, err := adaptor.BuildContentRequest(t.Context(), task, "video", channel.TaskArtifactClientRequest{Method: http.MethodHead})
		require.NoError(t, err)
		assert.Equal(t, "https://api-new.ip233.example/v1/videos/task_up/content", descriptor.URL)
		assert.Equal(t, http.MethodHead, descriptor.Method)
	})

	t.Run("every rendered image is an artifact", func(t *testing.T) {
		task := &model.Task{
			TaskID: "task_pub",
			Status: model.TaskStatusSuccess,
			Data:   []byte(`{"status":"completed","data":[{"url":"https://cdn.example/a.png"},{"url":"https://cdn.example/b.png"}]}`),
		}
		artifacts, err := adaptor.ListArtifacts(task)
		require.NoError(t, err)
		require.Len(t, artifacts, 2)
		assert.Equal(t, "image-2", artifacts[1].Key)
		assert.Equal(t, "image", artifacts[1].Type)
	})
}

// The OpenAI Video create path accepts the same request the plugin will send.
func TestIP233OpenAIVideoDecode(t *testing.T) {
	plugin := loadIP233Plugin(t)
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "wan3.0-video", "prompt": "p", "seconds": 8}},
		"model":         "wan3.0-video",
		"upstreamModel": "wan3.0-video",
	})
	require.NoError(t, err)
	intent := decodePluginValue(t, value)
	assert.Equal(t, "submit", intent["kind"])
	assert.Equal(t, "text_to_video", intent["action"])

	_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "seedance2.0-A1", "prompt": "p", "seconds": 8}},
		"model":         "seedance2.0-A1",
		"upstreamModel": "seedance2.0-A1",
	})
	require.ErrorContains(t, err, "duration must be one of 5, 10, 15")
}
