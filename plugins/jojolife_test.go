package plugins_test

import (
	"fmt"
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

func loadJojoLifePlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("jojolife")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "jojolife"})
	require.NoError(t, err)
	return plugin
}

func callJojoLifeHook(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	return decodePluginValue(t, value)
}

func jojoLifeSubmitContext(modelName string, request map[string]any) map[string]any {
	return map[string]any{
		"requestBody":   request,
		"model":         modelName,
		"upstreamModel": modelName,
		"baseUrl":       "https://jojolife.cc",
		"apiKey":        "sk-jojo",
	}
}

func jojoLifeURLs(prefix string, count int) []any {
	urls := make([]any, 0, count)
	for index := 0; index < count; index++ {
		urls = append(urls, fmt.Sprintf("https://cdn.example/%s-%d.png", prefix, index))
	}
	return urls
}

// The body is the one the gateway documents: seconds, aspect_ratio and
// resolution are normalized from every spelling a client may use, and
// reference media travels in the documented arrays as public URLs.
func TestJojoLifeVideoSubmitRequest(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	for _, testCase := range []struct {
		name       string
		model      string
		request    map[string]any
		wantBody   string
		wantAction string
	}{
		{
			name:       "defaults follow the model's own contract",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p"},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"16:9","resolution":"480p"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "the per-second tier sends the same body",
			model:      "seedance2.5-MNW",
			request:    map[string]any{"prompt": "p", "duration": 8, "resolution": "720P"},
			wantBody:   `{"model":"seedance2.5-MNW","prompt":"p","seconds":"8","aspect_ratio":"16:9","resolution":"720p"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "metadata controls are read and normalized",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p", "duration": 12, "metadata": map[string]any{"aspect_ratio": "9:16", "resolution": "720P"}},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"12","aspect_ratio":"9:16","resolution":"720p"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a pixel size becomes the matching ratio and tier",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p", "duration": 10, "size": "1280x720"},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"10","aspect_ratio":"16:9","resolution":"720p"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "a size may be the published ratio itself",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p", "size": "9:16"},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"9:16","resolution":"480p"}`,
			wantAction: "text_to_video",
		},
		{
			name:       "reference images are an images array",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p", "images": []any{"https://cdn.example/a.png", "https://cdn.example/b.png"}},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"16:9","resolution":"480p","images":["https://cdn.example/a.png","https://cdn.example/b.png"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:       "input_reference is the single-image spelling",
			model:      "seedance2.5-MNW-TJ",
			request:    map[string]any{"prompt": "p", "input_reference": "https://cdn.example/a.png"},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"16:9","resolution":"480p","images":["https://cdn.example/a.png"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:  "documented video and audio references keep their names",
			model: "seedance2.5-MNW-TJ",
			request: map[string]any{
				"prompt":           "p",
				"reference_videos": []any{"https://cdn.example/motion.mp4"},
				"reference_audios": []any{"https://cdn.example/sound.wav"},
			},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"16:9","resolution":"480p","reference_videos":["https://cdn.example/motion.mp4"],"reference_audios":["https://cdn.example/sound.wav"]}`,
			wantAction: "reference_to_video",
		},
		{
			name:  "console aliases are normalized to the documented names",
			model: "seedance2.5-MNW-TJ",
			request: map[string]any{
				"prompt": "p",
				"videos": []any{"https://cdn.example/motion.mp4"},
				"audios": []any{"https://cdn.example/sound.wav"},
			},
			wantBody:   `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":"4","aspect_ratio":"16:9","resolution":"480p","reference_videos":["https://cdn.example/motion.mp4"],"reference_audios":["https://cdn.example/sound.wav"]}`,
			wantAction: "reference_to_video",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			descriptor := callJojoLifeHook(t, plugin, "buildSubmitRequest", jojoLifeSubmitContext(testCase.model, testCase.request))
			assert.Equal(t, "https://jojolife.cc/v1/videos", descriptor["url"])
			assert.Equal(t, "POST", descriptor["method"])
			assert.Equal(t, testCase.wantAction, descriptor["action"])
			body, err := common.Marshal(descriptor["body"])
			require.NoError(t, err)
			assert.JSONEq(t, testCase.wantBody, string(body))
		})
	}

	t.Run("a channel mapping names the upstream model", func(t *testing.T) {
		ctx := jojoLifeSubmitContext("jojo-seedance", map[string]any{"prompt": "p"})
		ctx["upstreamModel"] = "seedance2.5-MNW-TJ"
		descriptor := callJojoLifeHook(t, plugin, "buildSubmitRequest", ctx)
		body, err := common.Marshal(descriptor["body"])
		require.NoError(t, err)
		assert.Contains(t, string(body), `"model":"seedance2.5-MNW-TJ"`)
	})
}

// Every bound is checked before the gateway is charged for a request it would
// refuse, and the checks are the ones the same body builder enforces.
func TestJojoLifeRejectsOutOfContractRequests(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		wantErr string
	}{
		{"seconds below the range", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "duration": 3}, "seconds must be between 4 and 30"},
		{"seconds above the range", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "duration": 31}, "seconds must be between 4 and 30"},
		{"fractional seconds", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "seconds": "4.5"}, "seconds must be an integer"},
		{"unlisted resolution", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "resolution": "1080p"}, "resolution must be one of 480p, 720p"},
		{"unlisted aspect ratio", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "aspect_ratio": "2:1"}, "aspect_ratio must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9"},
		{"a size no published ratio matches", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "size": "2000x1000"}, "size must match one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9"},
		{"a size that is neither a ratio nor pixels", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "size": "auto"}, "size must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9 or WIDTHxHEIGHT"},
		{"size and aspect ratio disagree", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "size": "1280x720", "aspect_ratio": "9:16"}, "size and aspect_ratio disagree"},
		{"size and resolution disagree", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "size": "854x480", "resolution": "720p"}, "size and resolution disagree"},
		{"uploaded files are not accepted", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "images": []any{"data:image/png;base64,AAA"}}, "images must contain public http or https URLs"},
		{"too many reference images", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "images": jojoLifeURLs("image", 31)}, "images accepts at most 30 entries"},
		{"too many reference videos", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "reference_videos": jojoLifeURLs("video", 11)}, "videos accepts at most 10 entries"},
		{"too many reference audios", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "reference_audios": jojoLifeURLs("audio", 11)}, "audios accepts at most 10 entries"},
		{"frames are not part of this surface", "seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "first_frame": "https://cdn.example/first.png"}, "first_frame and last_frame are not supported"},
		{"prompt is required", "seedance2.5-MNW-TJ", map[string]any{"duration": 8}, "field prompt is required"},
		{"an undeclared model", "not-a-jojo-model", map[string]any{"prompt": "p"}, "is not a JojoLife video model"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", jojoLifeSubmitContext(testCase.model, testCase.request))
			require.ErrorContains(t, err, testCase.wantErr)
		})
	}

	t.Run("multipart uploads are refused", func(t *testing.T) {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model":         "seedance2.5-MNW-TJ",
			"upstreamModel": "seedance2.5-MNW-TJ",
			"body": map[string]any{
				"kind":   "multipart",
				"fields": map[string]any{"prompt": []any{"p"}},
				"files":  []any{map[string]any{"ref": "request_file:input_reference", "field": "input_reference"}},
			},
		})
		require.ErrorContains(t, err, "JojoLife accepts reference material as a public URL, not an uploaded file")
	})
}

// The facts are the normalized body's own values, so the charge cannot drift
// from the request that was sent.
func TestJojoLifeUsageFacts(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	for _, testCase := range []struct {
		name    string
		model   string
		request map[string]any
		want    map[string]any
	}{
		{
			name:    "the requested seconds and tier are reported",
			model:   "seedance2.5-MNW-TJ",
			request: map[string]any{"prompt": "p", "duration": 12, "metadata": map[string]any{"resolution": "720P"}},
			want:    map[string]any{"count": float64(1), "seconds": float64(12), "resolution": "720p"},
		},
		{
			name:    "the per-second tier reports its own seconds",
			model:   "seedance2.5-MNW",
			request: map[string]any{"prompt": "p", "duration": 12, "metadata": map[string]any{"resolution": "720P"}},
			want:    map[string]any{"count": float64(1), "seconds": float64(12), "resolution": "720p"},
		},
		{
			name:    "defaults are reported when the client omits the controls",
			model:   "seedance2.5-MNW-TJ",
			request: map[string]any{"prompt": "p"},
			want:    map[string]any{"count": float64(1), "seconds": float64(4), "resolution": "480p"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, callJojoLifeHook(t, plugin, "extractUsage", jojoLifeSubmitContext(testCase.model, testCase.request)))
		})
	}

	t.Run("an out-of-contract request reserves nothing", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "extractUsage", jojoLifeSubmitContext("seedance2.5-MNW-TJ", map[string]any{"prompt": "p", "duration": 3}))
		require.ErrorContains(t, err, "seconds must be between 4 and 30")
	})
}

// Each model's profile exposes the quantity its published billing mode reads,
// while the plugin-level schema keeps both quantities available.
func TestJojoLifeUsageProfiles(t *testing.T) {
	plugin := loadJojoLifePlugin(t)

	perSecond, _ := plugin.Meta.UsageForModel("seedance2.5-MNW")
	assert.Contains(t, perSecond, "seconds")
	assert.Contains(t, perSecond, "resolution")
	assert.NotContains(t, perSecond, "count")

	perCall, _ := plugin.Meta.UsageForModel("seedance2.5-MNW-TJ")
	assert.Contains(t, perCall, "count")
	assert.Contains(t, perCall, "resolution")
	assert.NotContains(t, perCall, "seconds")
}

func TestJojoLifeParseTaskResult(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	for _, testCase := range []struct {
		name       string
		body       string
		wantStatus string
		wantReason string
	}{
		{"queued", `{"status":"queued"}`, "QUEUED", ""},
		{"pending", `{"status":"pending"}`, "QUEUED", ""},
		{"running", `{"status":"in_progress","progress":42}`, "IN_PROGRESS", ""},
		{"processing", `{"status":"processing"}`, "IN_PROGRESS", ""},
		{"completed", `{"status":"completed"}`, "SUCCESS", ""},
		{"failed", `{"status":"failed","error":{"code":"UPSTREAM_FAILED","message":"生成失败"}}`, "FAILURE", "生成失败"},
		{"failed with a string error", `{"status":"error","error":"blocked"}`, "FAILURE", "blocked"},
		{"cancelled", `{"status":"cancelled"}`, "FAILURE", "task cancelled"},
		{"unrecognised", `{"status":"weird"}`, "UNKNOWN", "unrecognized status: weird"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var body any
			require.NoError(t, common.UnmarshalJsonStr(testCase.body, &body))
			result := callJojoLifeHook(t, plugin, "parseTaskResult", map[string]any{}, body)
			assert.Equal(t, testCase.wantStatus, result["status"])
			assert.Equal(t, testCase.wantReason, common.Interface2String(result["reason"]))
			// The file lives behind the gateway's credentialed content route,
			// so no upstream URL is passed to the host.
			assert.NotContains(t, result, "url")
		})
	}

	t.Run("progress is carried as a percentage", func(t *testing.T) {
		var body any
		require.NoError(t, common.UnmarshalJsonStr(`{"status":"in_progress","progress":42}`, &body))
		result := callJojoLifeHook(t, plugin, "parseTaskResult", map[string]any{}, body)
		assert.Equal(t, "42%", result["progress"])
	})
}

func TestJojoLifeParseSubmitResponse(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	t.Run("video create", func(t *testing.T) {
		parsed := callJojoLifeHook(t, plugin, "parseSubmitResponse", map[string]any{},
			map[string]any{"body": map[string]any{"id": "video_1", "status": "queued"}})
		assert.Equal(t, "video_1", parsed["taskId"])
	})
	t.Run("a legacy task_id is accepted", func(t *testing.T) {
		parsed := callJojoLifeHook(t, plugin, "parseSubmitResponse", map[string]any{},
			map[string]any{"body": map[string]any{"task_id": "video_2"}})
		assert.Equal(t, "video_2", parsed["taskId"])
	})
	t.Run("a gateway error names its message", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{},
			map[string]any{"body": map[string]any{"error": map[string]any{"code": "INSUFFICIENT_CREDITS", "message": "余额不足"}}})
		require.ErrorContains(t, err, "余额不足")
	})
	t.Run("an empty id is refused", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{},
			map[string]any{"body": map[string]any{"status": "queued"}})
		require.ErrorContains(t, err, "task id is empty")
	})
}

// The finished file is served by the gateway's content route with the channel
// key, so the client never receives a credential-bearing address.
func TestJojoLifeArtifactsAndContent(t *testing.T) {
	plugin := loadJojoLifePlugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ApiKey: "sk-jojo", ChannelBaseUrl: "https://jojolife.cc"}})

	task := &model.Task{
		TaskID:      "task_pub",
		Status:      model.TaskStatusSuccess,
		Data:        []byte(`{"status":"completed"}`),
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "video_1"},
	}
	artifacts, err := adaptor.ListArtifacts(task)
	require.NoError(t, err)
	assert.Equal(t, []channel.TaskArtifact{{Key: "video", Type: "video", MimeType: "video/mp4"}}, artifacts)

	descriptor, err := adaptor.BuildContentRequest(t.Context(), task, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
	require.NoError(t, err)
	assert.Equal(t, "https://jojolife.cc/v1/videos/video_1/content", descriptor.URL)
	assert.Equal(t, http.MethodGet, descriptor.Method)
	assert.False(t, descriptor.Credentialless)
	assert.Equal(t, "Bearer sk-jojo", descriptor.Headers["Authorization"])

	head, err := adaptor.BuildContentRequest(t.Context(), task, "video", channel.TaskArtifactClientRequest{Method: http.MethodHead})
	require.NoError(t, err)
	assert.Equal(t, http.MethodHead, head.Method)

	_, err = adaptor.BuildContentRequest(t.Context(), task, "image", channel.TaskArtifactClientRequest{Method: http.MethodGet})
	require.ErrorContains(t, err, "artifact_not_found")

	// Without a stored upstream id the host falls back to the public task id,
	// which this driver also received as the upstream id at submission.
	missing := &model.Task{TaskID: "task_pub", Status: model.TaskStatusSuccess, Data: []byte(`{"status":"completed"}`)}
	fallback, err := adaptor.BuildContentRequest(t.Context(), missing, "video", channel.TaskArtifactClientRequest{Method: http.MethodGet})
	require.NoError(t, err)
	assert.Equal(t, "https://jojolife.cc/v1/videos/task_pub/content", fallback.URL)
}

// The Responses surface shares the video lifecycle: one artifact, the same
// usage facts, and the host's own artifact address in the output.
func TestJojoLifeResponsesProtocol(t *testing.T) {
	testVideoResponsesProtocol(t, videoResponsesTestCase{
		pluginKey:           "jojolife",
		model:               "seedance2.5-MNW-TJ",
		requestBody:         map[string]any{"input": "a cat", "seconds": 8},
		wantAction:          "text_to_video",
		wantRequest:         map[string]any{"seconds": float64(8)},
		wantUsageKeys:       []string{"count", "seconds", "resolution"},
		wantVendorName:      "jojolife",
	})
}

// The OpenAI Video create path accepts the same request the plugin will send,
// validates it before submission, and renders only vendor extensions plus the
// host-owned identity.
func TestJojoLifeOpenAIVideoDecode(t *testing.T) {
	plugin := loadJojoLifePlugin(t)

	decode := func(t *testing.T, request map[string]any) map[string]any {
		t.Helper()
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"body":          map[string]any{"kind": "json", "value": request},
			"model":         "seedance2.5-MNW-TJ",
			"upstreamModel": "seedance2.5-MNW-TJ",
		})
		require.NoError(t, err)
		return decodePluginValue(t, value)
	}

	t.Run("text to video", func(t *testing.T) {
		intent := decode(t, map[string]any{"model": "seedance2.5-MNW-TJ", "prompt": "p", "seconds": 12})
		assert.Equal(t, "submit", intent["kind"])
		assert.Equal(t, "seedance2.5-MNW-TJ", intent["model"])
		assert.Equal(t, "text_to_video", intent["action"])
		body, err := common.Marshal(intent["requestBody"])
		require.NoError(t, err)
		assert.JSONEq(t, `{"model":"seedance2.5-MNW-TJ","prompt":"p","seconds":12}`, string(body))
	})

	t.Run("reference images", func(t *testing.T) {
		intent := decode(t, map[string]any{"model": "seedance2.5-MNW-TJ", "prompt": "p", "images": []any{"https://cdn.example/a.png"}})
		assert.Equal(t, "reference_to_video", intent["action"])
	})

	t.Run("out-of-contract requests are refused before submission", func(t *testing.T) {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"body":          map[string]any{"kind": "json", "value": map[string]any{"model": "seedance2.5-MNW-TJ", "prompt": "p", "seconds": 3}},
			"model":         "seedance2.5-MNW-TJ",
			"upstreamModel": "seedance2.5-MNW-TJ",
		})
		require.ErrorContains(t, err, "seconds must be between 4 and 30")
	})

	t.Run("render keeps extensions and drops the vendor address", func(t *testing.T) {
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "render"}, map[string]any{}, map[string]any{
			"task_id":     "task_public",
			"status":      "FAILURE",
			"fail_reason": "blocked",
			"data": map[string]any{
				"url":          "https://upstream.example/keyed.mp4",
				"video_url":    "https://upstream.example/keyed-2.mp4",
				"vendor_field": "kept",
			},
		})
		require.NoError(t, err)
		rendered := decodePluginValue(t, value)
		assert.Equal(t, "kept", rendered["vendor_field"])
		assert.NotContains(t, rendered, "url")
		assert.NotContains(t, rendered, "video_url")
		errorValue, ok := rendered["error"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "blocked", errorValue["message"])
	})
}
