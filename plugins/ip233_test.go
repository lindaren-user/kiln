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
			model:    "seedance2.5-B2",
			request:  map[string]any{"prompt": "p", "seconds": 12, "resolution": "720p", "aspect_ratio": "9:16"},
			wantBody: `{"model":"seedance2.5-B2","prompt":"p","seconds":12,"aspect_ratio":"9:16","resolution":"720p"}`,
		},
		{
			name:     "a size becomes the nearest published frame ratio",
			model:    "seedance2.0-A1",
			request:  map[string]any{"prompt": "p", "size": "1920x1080"},
			wantBody: `{"model":"seedance2.0-A1","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720p"}`,
		},
		{
			name:     "a documented ratio list keeps its own spelling",
			model:    "seedance2.5-B2",
			request:  map[string]any{"prompt": "p", "seconds": 12, "resolution": "720p", "aspect_ratio": "21:9"},
			wantBody: `{"model":"seedance2.5-B2","prompt":"p","seconds":12,"aspect_ratio":"21:9","resolution":"720p"}`,
		},
		{
			name:       "reference images are forwarded as URLs",
			model:      "seedance2.0-A1",
			request:    map[string]any{"prompt": "p", "seconds": 5, "reference_images": []any{"https://cdn.example/a.png"}},
			wantBody:   `{"model":"seedance2.0-A1","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720p","reference_image_urls":["https://cdn.example/a.png"]}`,
			wantAction: "image_to_video",
		},
		{
			name:     "minimax keeps the vendor model name",
			model:    "ip233-minimax-h3",
			request:  map[string]any{"prompt": "p", "seconds": 6},
			wantBody: `{"model":"minimax-h3","prompt":"p","seconds":6,"aspect_ratio":"16:9","resolution":"768p"}`,
		},
		{
			name:  "minimax forwards reference video and audio beside images",
			model: "ip233-minimax-h3",
			request: map[string]any{
				"prompt":           "p",
				"seconds":          6,
				"reference_images": []any{"https://cdn.example/a.png"},
				"reference_videos": []any{"https://cdn.example/a.mp4"},
				"reference_audios": []any{"https://cdn.example/a.mp3"},
			},
			wantBody: `{"model":"minimax-h3","prompt":"p","seconds":6,"aspect_ratio":"16:9","resolution":"768p","reference_image_urls":["https://cdn.example/a.png"],"reference_videos":["https://cdn.example/a.mp4"],"reference_audios":["https://cdn.example/a.mp3"]}`,
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
		{"seconds above the maximum", "ip233-minimax-h3", map[string]any{"prompt": "p", "seconds": 31}, "duration must be between 4 and 15"},
		{"fractional seconds", "seedance2.5-B2", map[string]any{"prompt": "p", "seconds": 5.5}, "duration must be an integer"},
		{"unlisted resolution", "ip233-minimax-h3", map[string]any{"prompt": "p", "resolution": "4k"}, "resolution must be one of 768p"},
		{"uploaded files are not accepted", "seedance2.5-B2", map[string]any{"prompt": "p", "images": []any{"data:image/png;base64,AAA"}}, "must be an http or https URL"},
		{"prompt is required", "seedance2.5-B2", map[string]any{"seconds": 5}, "field prompt is required"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ip233SubmitContext(testCase.model, testCase.request))
			require.ErrorContains(t, err, testCase.wantErr)
		})
	}
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
			model:   "ip233-minimax-h3",
			request: map[string]any{"prompt": "p", "seconds": 12},
			want:    map[string]any{"seconds": float64(12), "resolution": "768p"},
		},
		{
			name:    "per-call video reserves one generation and its resolution",
			model:   "seedance2.5-B2",
			request: map[string]any{"prompt": "p", "seconds": 20},
			want:    map[string]any{"count": float64(1), "resolution": "720p"},
		},
		{
			name:    "a resolution derived from a size is bounded to a published tier",
			model:   "seedance2.0-A1",
			request: map[string]any{"prompt": "p", "size": "3840x2160"},
			want:    map[string]any{"count": float64(1), "resolution": "720p"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, callIP233Hook(t, plugin, "extractUsage", ip233SubmitContext(testCase.model, testCase.request)))
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
		parsed := callIP233Hook(t, plugin, "parseSubmitResponse", map[string]any{"model": "seedance2.0-B2"},
			map[string]any{"body": map[string]any{"id": "task_1", "status": "queued"}})
		assert.Equal(t, "task_1", parsed["taskId"])
	})
	t.Run("a vendor error names its message", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{"model": "seedance2.0-B2"},
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
}

// The OpenAI Video create path accepts the same request the plugin will send.
func TestIP233OpenAIVideoDecode(t *testing.T) {
	plugin := loadIP233Plugin(t)
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "seedance2.5-B2", "prompt": "p", "seconds": 12}},
		"model":         "seedance2.5-B2",
		"upstreamModel": "seedance2.5-B2",
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
