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

func loadVimoPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("vimo")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "vimo"})
	require.NoError(t, err)
	return plugin
}

func callVimoHook(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	return decodePluginValue(t, value)
}

func vimoSubmitContext(modelName string, request map[string]any) map[string]any {
	return map[string]any{
		"requestBody":   request,
		"model":         modelName,
		"upstreamModel": modelName,
		"baseUrl":       "https://vimo.asia/api/v1",
		"apiKey":        "sk-vimo",
	}
}

// The body is the one Vimo documents for that tier: the generic task endpoint
// carries ratio and resolution in metadata, and both are read from either level.
func TestVimoVideoSubmitRequest(t *testing.T) {
	plugin := loadVimoPlugin(t)
	for _, testCase := range []struct {
		name       string
		model      string
		request    map[string]any
		wantBody   string
		wantAction string
	}{
		{
			name:       "a per-call tier sends the catalog parameters",
			model:      "v6k-seadanco2-5-720-2",
			request:    map[string]any{"prompt": "p", "duration": 12, "metadata": map[string]any{"aspect_ratio": "9:16", "resolution": "720P"}},
			wantBody:   `{"model":"v6k-seadanco2-5-720-2","prompt":"p","seconds":12,"aspect_ratio":"9:16","resolution":"720P"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "defaults come from the catalog",
			model:      "v6k-seadanco2-5-720-2",
			request:    map[string]any{"prompt": "p"},
			wantBody:   `{"model":"v6k-seadanco2-5-720-2","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720P"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a size becomes the published ratio",
			model:      "v6k-seadanco2-5-720-2",
			request:    map[string]any{"prompt": "p", "duration": 10, "size": "1920x1080"},
			wantBody:   `{"model":"v6k-seadanco2-5-720-2","prompt":"p","seconds":10,"aspect_ratio":"16:9","resolution":"720P"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a single reference URL becomes input_reference",
			model:      "v6k-seadanco2-5-720-2",
			request:    map[string]any{"prompt": "p", "duration": 5, "images": []any{"https://cdn.example/a.png"}},
			wantBody:   `{"model":"v6k-seadanco2-5-720-2","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720P","input_reference":"https://cdn.example/a.png"}`,
			wantAction: "image_to_video",
		},
		{
			name:       "the fixed-length tier keeps its single duration",
			model:      "image2pro-seedance2-0",
			request:    map[string]any{"prompt": "p", "duration": 15, "metadata": map[string]any{"aspect_ratio": "9:16", "resolution": "480P"}},
			wantBody:   `{"model":"image2pro-seedance2-0","prompt":"p","seconds":15,"aspect_ratio":"9:16","resolution":"480P"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "the per-second tier accepts its own range",
			model:      "gway-seedance-2-0-g4",
			request:    map[string]any{"prompt": "p", "duration": 10},
			wantBody:   `{"model":"gway-seedance-2-0-g4","prompt":"p","seconds":10,"aspect_ratio":"16:9","resolution":"720P"}`,
			wantAction: "text_to_video",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			descriptor := callVimoHook(t, plugin, "buildSubmitRequest", vimoSubmitContext(testCase.model, testCase.request))
			assert.Equal(t, "https://vimo.asia/api/v1/videos/generations", descriptor["url"])
			assert.Equal(t, "POST", descriptor["method"])
			assert.Equal(t, testCase.wantAction, descriptor["action"])
			body, err := common.Marshal(descriptor["body"])
			require.NoError(t, err)
			assert.JSONEq(t, testCase.wantBody, string(body))
		})
	}

	t.Run("the public task id makes the submission idempotent", func(t *testing.T) {
		ctx := vimoSubmitContext("v6k-seadanco2-5-720-2", map[string]any{"prompt": "p"})
		ctx["publicTaskId"] = "task_public"
		descriptor := callVimoHook(t, plugin, "buildSubmitRequest", ctx)
		body, err := common.Marshal(descriptor["body"])
		require.NoError(t, err)
		assert.Contains(t, string(body), `"client_request_id":"task_public"`)
	})
}

// Every bound is checked before the vendor is charged for a request it will
// refuse, and each fact the plugin reports stays inside the host's own limits.
func TestVimoRejectsOutOfContractRequests(t *testing.T) {
	plugin := loadVimoPlugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		wantErr string
	}{
		{"seconds below the range", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "duration": 4}, "seconds must be between 5 and 30"},
		{"seconds above the range", "gway-seedance-2-0-g4", map[string]any{"prompt": "p", "duration": 30}, "seconds must be between 5 and 15"},
		{"fractional seconds", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "seconds": "5.5"}, "seconds must be an integer"},
		{"unlisted resolution", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "resolution": "4K"}, "resolution must be one of 720P"},
		{"unlisted aspect ratio", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "aspect_ratio": "2:1"}, "aspect_ratio must be one of 16:9, 9:16, 1:1"},
		{"two references", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "images": []any{"https://cdn.example/a.png", "https://cdn.example/b.png"}}, "single input_reference"},
		{"uploaded files are not accepted", "v6k-seadanco2-5-720-2", map[string]any{"prompt": "p", "images": []any{"data:image/png;base64,AAA"}}, "must be a public http or https URL"},
		{"prompt is required", "v6k-seadanco2-5-720-2", map[string]any{"duration": 5}, "field prompt is required"},
		{"an undeclared model", "v6k-wan", map[string]any{"prompt": "p"}, "is not a Vimo video model"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", vimoSubmitContext(testCase.model, testCase.request))
			require.ErrorContains(t, err, testCase.wantErr)
		})
	}
}

func TestVimoUsageFacts(t *testing.T) {
	plugin := loadVimoPlugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		want    map[string]any
	}{
		{
			name:    "per-second video reserves the requested seconds",
			model:   "gway-seedance-2-0-g4",
			request: map[string]any{"prompt": "p", "duration": 12},
			want:    map[string]any{"seconds": float64(12)},
		},
		{
			name:    "per-call video reserves one generation",
			model:   "v6k-seadanco2-5-720-2",
			request: map[string]any{"prompt": "p", "duration": 20},
			want:    map[string]any{"count": float64(1)},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, callVimoHook(t, plugin, "extractUsage", vimoSubmitContext(testCase.model, testCase.request)))
		})
	}
}

func TestVimoParseTaskResult(t *testing.T) {
	plugin := loadVimoPlugin(t)
	for _, testCase := range []struct {
		name       string
		body       string
		wantStatus string
		wantReason string
	}{
		{"queued", `{"status":"queued"}`, "QUEUED", ""},
		{"running", `{"status":"in_progress"}`, "IN_PROGRESS", ""},
		{"completed", `{"status":"completed","video_url":"https://vimo.asia/api/tasks/task_up/content"}`, "SUCCESS", ""},
		{"failed", `{"status":"failed","error":{"code":"UPSTREAM_FAILED","message":"生成失败"}}`, "FAILURE", "生成失败"},
		{"unrecognised", `{"status":"weird"}`, "UNKNOWN", "unrecognized status: weird"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var body any
			require.NoError(t, common.UnmarshalJsonStr(testCase.body, &body))
			result := callVimoHook(t, plugin, "parseTaskResult", map[string]any{}, body)
			assert.Equal(t, testCase.wantStatus, result["status"])
			assert.Equal(t, testCase.wantReason, common.Interface2String(result["reason"]))
			// video_url is a credentialed address, so the host keeps its own
			// artifact URL instead of proxying the vendor's.
			assert.NotContains(t, result, "url")
		})
	}
}

func TestVimoParseSubmitResponse(t *testing.T) {
	plugin := loadVimoPlugin(t)
	t.Run("video create", func(t *testing.T) {
		parsed := callVimoHook(t, plugin, "parseSubmitResponse", map[string]any{"model": "v6k-seadanco2-5-720-2"},
			map[string]any{"body": map[string]any{"id": "task_1", "status": "queued"}})
		assert.Equal(t, "task_1", parsed["taskId"])
	})
	t.Run("a vendor error names its message", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{"model": "v6k-seadanco2-5-720-2"},
			map[string]any{"body": map[string]any{"error": map[string]any{"code": "INSUFFICIENT_CREDITS", "message": "余额不足"}}})
		require.ErrorContains(t, err, "余额不足")
	})
}

// video_url needs the channel key, so content is fetched with credentials
// instead of being handed to the client as a direct address.
func TestVimoArtifactsAndContent(t *testing.T) {
	plugin := loadVimoPlugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ApiKey: "sk-vimo", ChannelBaseUrl: "https://vimo.asia/api/v1"}})

	task := &model.Task{
		TaskID: "task_pub",
		Status: model.TaskStatusSuccess,
		Data:   []byte(`{"status":"completed","video_url":"https://vimo.asia/api/tasks/task_up/content"}`),
	}
	artifacts, err := adaptor.ListArtifacts(task)
	require.NoError(t, err)
	assert.Equal(t, []channel.TaskArtifact{{Key: "video", Type: "video", MimeType: "video/mp4"}}, artifacts)

	descriptor, err := adaptor.BuildContentRequest(t.Context(), task, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
	require.NoError(t, err)
	assert.Equal(t, "https://vimo.asia/api/tasks/task_up/content", descriptor.URL)
	assert.Equal(t, http.MethodGet, descriptor.Method)
	assert.False(t, descriptor.Credentialless)
	assert.Equal(t, "Bearer sk-vimo", descriptor.Headers["Authorization"])

	missing := &model.Task{
		TaskID:      "task_pub",
		Status:      model.TaskStatusSuccess,
		Data:        []byte(`{"status":"completed"}`),
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "task_up"},
	}
	_, err = adaptor.BuildContentRequest(t.Context(), missing, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
	require.ErrorContains(t, err, "artifact_not_found")
}

// The Responses surface shares the video lifecycle: one artifact, the same
// per-call usage fact, and the host's own artifact address in the output.
func TestVimoResponsesProtocol(t *testing.T) {
	testVideoResponsesProtocol(t, videoResponsesTestCase{
		pluginKey:           "vimo",
		model:               "v6k-seadanco2-5-720-2",
		requestBody:         map[string]any{"input": "a cat", "seconds": 8},
		wantAction:          "text_to_video",
		wantRequest:         map[string]any{"seconds": float64(8)},
		wantUsageKeys:       []string{"count", "seconds"},
		wantSubmitUsageKeys: []string{"count"},
		wantVendorName:      "vimo",
	})
}

// The OpenAI Video create path accepts the same request the plugin will send.
func TestVimoOpenAIVideoDecode(t *testing.T) {
	plugin := loadVimoPlugin(t)
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "v6k-seadanco2-5-720-2", "prompt": "p", "seconds": 12}},
		"model":         "v6k-seadanco2-5-720-2",
		"upstreamModel": "v6k-seadanco2-5-720-2",
	})
	require.NoError(t, err)
	intent := decodePluginValue(t, value)
	assert.Equal(t, "submit", intent["kind"])
	assert.Equal(t, "text_to_video", intent["action"])

	value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "v6k-seadanco2-5-720-2", "prompt": "p", "input_reference": "https://cdn.example/a.png"}},
		"model":         "v6k-seadanco2-5-720-2",
		"upstreamModel": "v6k-seadanco2-5-720-2",
	})
	require.NoError(t, err)
	assert.Equal(t, "image_to_video", decodePluginValue(t, value)["action"])

	_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "gway-seedance-2-0-g4", "prompt": "p", "seconds": 30}},
		"model":         "gway-seedance-2-0-g4",
		"upstreamModel": "gway-seedance-2-0-g4",
	})
	require.ErrorContains(t, err, "seconds must be between 5 and 15")
}
