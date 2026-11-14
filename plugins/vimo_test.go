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
// carries ratio and resolution in metadata, both are read from either level,
// and reference material is sent per class in its own array.
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
			model:      "V-稳定seadanco2.5-720【主打】",
			request:    map[string]any{"prompt": "p", "duration": 12, "metadata": map[string]any{"aspect_ratio": "9:16", "resolution": "720P"}},
			wantBody:   `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","seconds":12,"aspect_ratio":"9:16","resolution":"720P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "defaults come from the catalog",
			model:      "V-稳定seadanco2.5-720【主打】",
			request:    map[string]any{"prompt": "p"},
			wantBody:   `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a size becomes the published ratio",
			model:      "V-稳定seadanco2.5-720【主打】",
			request:    map[string]any{"prompt": "p", "duration": 10, "size": "1920x1080"},
			wantBody:   `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","seconds":10,"aspect_ratio":"16:9","resolution":"720P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a size is matched to a ratio by frame shape",
			model:      "BB-Seedance2.5  301010",
			request:    map[string]any{"prompt": "p", "duration": 8, "size": "1680x720"},
			wantBody:   `{"model":"BB-Seedance2.5  301010","prompt":"p","seconds":8,"aspect_ratio":"21:9","resolution":"720P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "reference images are sent as an images array",
			model:      "V-稳定seadanco2.5-720【主打】",
			request:    map[string]any{"prompt": "p", "duration": 5, "images": []any{"https://cdn.example/a.png", "https://cdn.example/b.png"}},
			wantBody:   `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720P","mode":"reference","images":["https://cdn.example/a.png","https://cdn.example/b.png"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:  "images, videos and audios travel together",
			model: "JT-seedance-2.5",
			request: map[string]any{
				"prompt":   "p",
				"duration": 10,
				"images":   []any{"https://cdn.example/a.png"},
				"videos":   []any{"https://cdn.example/motion.mp4"},
				"audios":   []any{"https://cdn.example/sound.wav"},
			},
			wantBody:   `{"model":"JT-seedance-2.5","prompt":"p","seconds":10,"aspect_ratio":"16:9","resolution":"480P","mode":"reference","images":["https://cdn.example/a.png"],"videos":["https://cdn.example/motion.mp4"],"audios":["https://cdn.example/sound.wav"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:       "a tier without image mode still takes reference images",
			model:      "V-SD2.0",
			request:    map[string]any{"prompt": "p", "duration": 8, "images": []any{"https://cdn.example/a.png"}},
			wantBody:   `{"model":"V-SD2.0","prompt":"p","seconds":8,"aspect_ratio":"16:9","resolution":"720P","mode":"reference","images":["https://cdn.example/a.png"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:       "first and last frames are the image-mode fields",
			model:      "V-稳定seadanco2.5-720【主打】",
			request:    map[string]any{"prompt": "p", "duration": 5, "first_frame": "https://cdn.example/first.png", "last_frame": "https://cdn.example/last.png"},
			wantBody:   `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","seconds":5,"aspect_ratio":"16:9","resolution":"720P","mode":"image","first_frame":"https://cdn.example/first.png","last_frame":"https://cdn.example/last.png"}`,
			wantAction: "image_to_video",
		},
		{
			name:  "a wan tier takes images and audios but no videos",
			model: "JT-wan3.0-超限",
			request: map[string]any{
				"prompt":       "p",
				"duration":     6,
				"aspect_ratio": "1:1",
				"resolution":   "1080P",
				"images":       []any{"https://cdn.example/a.png"},
				"audios":       []any{"https://cdn.example/sound.wav"},
			},
			wantBody:   `{"model":"JT-wan3.0-超限","prompt":"p","seconds":6,"aspect_ratio":"1:1","resolution":"1080P","mode":"reference","images":["https://cdn.example/a.png"],"audios":["https://cdn.example/sound.wav"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:       "the fixed-length tier keeps its single duration",
			model:      "I-Seedance2.0",
			request:    map[string]any{"prompt": "p", "duration": 15, "metadata": map[string]any{"aspect_ratio": "9:16", "resolution": "480P"}},
			wantBody:   `{"model":"I-Seedance2.0","prompt":"p","seconds":15,"aspect_ratio":"9:16","resolution":"480P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "the per-second tier accepts its own range",
			model:      "JT-seedance-2.5",
			request:    map[string]any{"prompt": "p", "duration": 10},
			wantBody:   `{"model":"JT-seedance-2.5","prompt":"p","seconds":10,"aspect_ratio":"16:9","resolution":"480P","mode":"text"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "the SD2.5 official tier offers all three resolutions",
			model:      "V-SD2.5【官方】【自家号池】",
			request:    map[string]any{"prompt": "p", "duration": 10, "metadata": map[string]any{"aspect_ratio": "1:1", "resolution": "1080P"}},
			wantBody:   `{"model":"V-SD2.5【官方】【自家号池】","prompt":"p","seconds":10,"aspect_ratio":"1:1","resolution":"1080P","mode":"text"}`,
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
		ctx := vimoSubmitContext("V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p"})
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
		{"seconds below the range", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "duration": 4}, "seconds must be between 5 and 30"},
		{"seconds above the range", "JT-seedance-2.0-g4【满血】", map[string]any{"prompt": "p", "duration": 30}, "seconds must be between 5 and 15"},
		{"fractional seconds", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "seconds": "5.5"}, "seconds must be an integer"},
		{"unlisted resolution", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "resolution": "4K"}, "resolution must be one of 720P"},
		{"unlisted aspect ratio", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "aspect_ratio": "2:1"}, "aspect_ratio must be one of 16:9, 9:16, 1:1"},
		{"a size no published ratio matches", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "size": "2000x1000"}, "size must match one of 16:9, 9:16, 1:1"},
		{"size and aspect ratio disagree", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "size": "1920x1080", "aspect_ratio": "9:16"}, "size and aspect_ratio disagree"},
		{"size and resolution disagree", "JT-wan3.0-超限", map[string]any{"prompt": "p", "size": "854x480", "resolution": "720P"}, "size and resolution disagree"},
		{"uploaded files are not accepted", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "images": []any{"data:image/png;base64,AAA"}}, "images must contain public http or https URLs"},
		{"too many reference audios", "SD2.5-【超级特价】-JTv4", map[string]any{"prompt": "p", "audios": []any{"https://cdn.example/1.wav", "https://cdn.example/2.wav", "https://cdn.example/3.wav", "https://cdn.example/4.wav"}}, "audios accepts at most 3 entries"},
		{"reference videos on a tier without them", "SD2.5-【超级特价】-JTv4", map[string]any{"prompt": "p", "videos": []any{"https://cdn.example/a.mp4"}}, "this tier accepts no reference videos"},
		{"reference videos on the wan tier", "JT-wan3.0-超限", map[string]any{"prompt": "p", "videos": []any{"https://cdn.example/a.mp4"}}, "this tier accepts no reference videos"},
		{"a last frame needs a first frame", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "last_frame": "https://cdn.example/last.png"}, "last_frame requires first_frame"},
		{"frames cannot be mixed with arrays", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "first_frame": "https://cdn.example/first.png", "images": []any{"https://cdn.example/a.png"}}, "cannot be combined with images, videos or audios"},
		{"frames on a tier without image mode", "V-SD2.0", map[string]any{"prompt": "p", "first_frame": "https://cdn.example/first.png"}, "this tier does not accept image requests"},
		{"image mode takes images only", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "mode": "image", "images": []any{"https://cdn.example/a.png"}, "videos": []any{"https://cdn.example/a.mp4"}}, "image mode accepts images only"},
		{"image mode takes at most two images", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "mode": "image", "images": []any{"https://cdn.example/a.png", "https://cdn.example/b.png", "https://cdn.example/c.png"}}, "images accepts at most 2 entries"},
		{"text mode takes no material", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "mode": "text", "images": []any{"https://cdn.example/a.png"}}, "text mode accepts no reference material"},
		{"an undeclared mode", "V-稳定seadanco2.5-720【主打】", map[string]any{"prompt": "p", "mode": "frame"}, "mode must be one of text, image, reference"},
		{"prompt is required", "V-稳定seadanco2.5-720【主打】", map[string]any{"duration": 5}, "field prompt is required"},
		{"an undeclared model", "not-a-vimo-model", map[string]any{"prompt": "p"}, "is not a Vimo video model"},
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
			model:   "JT-seedance-2.5",
			request: map[string]any{"prompt": "p", "duration": 12},
			want:    map[string]any{"seconds": float64(12), "resolution": "480P"},
		},
		{
			name:    "per-call video reserves one generation",
			model:   "V-稳定seadanco2.5-720【主打】",
			request: map[string]any{"prompt": "p", "duration": 20},
			want:    map[string]any{"count": float64(1), "resolution": "720P"},
		},
		{
			name:    "the requested resolution is the billed fact",
			model:   "V-SD2.5【官方】【自家号池】",
			request: map[string]any{"prompt": "p", "duration": 10, "resolution": "1080P"},
			want:    map[string]any{"seconds": float64(10), "resolution": "1080P"},
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
		{"cancelled", `{"status":"cancelled"}`, "FAILURE", "task cancelled"},
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
		parsed := callVimoHook(t, plugin, "parseSubmitResponse", map[string]any{"model": "V-稳定seadanco2.5-720【主打】"},
			map[string]any{"body": map[string]any{"id": "task_1", "status": "queued"}})
		assert.Equal(t, "task_1", parsed["taskId"])
	})
	t.Run("a vendor error names its message", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{"model": "V-稳定seadanco2.5-720【主打】"},
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
		model:               "V-稳定seadanco2.5-720【主打】",
		requestBody:         map[string]any{"input": "a cat", "seconds": 8},
		wantAction:          "text_to_video",
		wantRequest:         map[string]any{"seconds": float64(8)},
		wantUsageKeys:       []string{"count", "resolution", "seconds"},
		wantSubmitUsageKeys: []string{"count", "resolution"},
		wantVendorName:      "vimo",
	})
}

// The OpenAI Video create path accepts the same request the plugin will send.
func TestVimoOpenAIVideoDecode(t *testing.T) {
	plugin := loadVimoPlugin(t)
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "V-稳定seadanco2.5-720【主打】", "prompt": "p", "seconds": 12}},
		"model":         "V-稳定seadanco2.5-720【主打】",
		"upstreamModel": "V-稳定seadanco2.5-720【主打】",
	})
	require.NoError(t, err)
	intent := decodePluginValue(t, value)
	assert.Equal(t, "submit", intent["kind"])
	assert.Equal(t, "text_to_video", intent["action"])

	// input_reference is the legacy single-image field; it becomes an images
	// array and an explicit mode, so an older client still reaches the new
	// contract.
	value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "V-稳定seadanco2.5-720【主打】", "prompt": "p", "input_reference": "https://cdn.example/a.png"}},
		"model":         "V-稳定seadanco2.5-720【主打】",
		"upstreamModel": "V-稳定seadanco2.5-720【主打】",
	})
	require.NoError(t, err)
	intent = decodePluginValue(t, value)
	assert.Equal(t, "reference_to_video", intent["action"])
	requestBody, err := common.Marshal(intent["requestBody"])
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"V-稳定seadanco2.5-720【主打】","prompt":"p","input_reference":"https://cdn.example/a.png"}`, string(requestBody))

	_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "JT-seedance-2.0-g4【满血】", "prompt": "p", "seconds": 30}},
		"model":         "JT-seedance-2.0-g4【满血】",
		"upstreamModel": "JT-seedance-2.0-g4【满血】",
	})
	require.ErrorContains(t, err, "seconds must be between 5 and 15")
}
