// Public video models from the Top Image guide. Per-call models bill one generation.
// The rest bill output seconds. Completion replaces that with billing_seconds when the
// vendor reports it, otherwise output seconds plus reference-video seconds.
const PER_CALL_MODELS = ["sd2-fast", "sd2.0满血版", "sd2-mini", "特价SD2.5-30图版-720p", "特价SD2.5-30图版-1080P"];
const SECOND_MODELS = [
  "官转SD2.0-满血9图版-短剧专用-720P",
  "官转SD2.0-满血9图版-短剧专用-1080P",
  "官转SD2.0-满血9图版-短剧专用-4K",
  "官转SD2.5-30图版-720P",
  "官转SD2.5-30图版-480P",
  "官转SD2.5-30图版-1080P",
  "wan3-720p",
  "wan3-1080p",
  "Minimax-2k",
  "Minimax-768P",
  "kling-4.0",
  "kling-4.0-1080p",
];

export const meta = {
  apiVersion: 1,
  key: "top-image",
  name: "Top Image",
  icon: "text",
  description: {
    en: "Video generation through Top Image",
    zh: "通过 Top Image 生成视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  baseUrl: "https://topimage.top",
  models: PER_CALL_MODELS.concat(SECOND_MODELS),
  fetchMode: "per_task",
  usageSchema: {
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
  },
  usageProfiles: [
    {
      models: PER_CALL_MODELS,
      schema: {
        count: {
          type: "number",
          unit: "count",
          unitLabel: { en: "generation", zh: "次" },
          description: { en: "Video generation unit price", zh: "视频生成单价" },
        },
      },
    },
  ],
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

const RATIO_BY_SIZE = {
  "1280x720": "16:9",
  "1920x1080": "16:9",
  "3840x2160": "16:9",
  "1792x1024": "16:9",
  "720x1280": "9:16",
  "1080x1920": "9:16",
  "2160x3840": "9:16",
  "1024x1792": "9:16",
  "720x720": "1:1",
  "1080x1080": "1:1",
};

function trimmed(value) {
  return String(value || "").trim();
}

function modelName(ctx) {
  return trimmed(ctx && (ctx.upstreamModel || ctx.model));
}

// SD2.0 and MiniMax accept 4-15 seconds. SD2.5, WAN3 and Kling 4.0 accept 4-30.
// Duration -1 means the vendor chooses the length, so the reservation uses this maximum.
function maxSeconds(model) {
  if (model.indexOf("SD2.5") !== -1 || model.indexOf("wan3-") === 0 || model.indexOf("kling-4.0") === 0) return 30;
  return 15;
}

function integerSeconds(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") throw new Error("duration must be an integer");
  const seconds = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(seconds) || Math.trunc(seconds) !== seconds) throw new Error("duration must be an integer");
  return seconds;
}

function durationOf(req, model) {
  const seconds = integerSeconds(req.duration !== undefined && req.duration !== null && req.duration !== "" ? req.duration : req.seconds);
  if (seconds === undefined) return undefined;
  if (seconds === -1) return -1;
  const limit = maxSeconds(model);
  if (seconds < 4 || seconds > limit) throw new Error("duration must be -1 or between 4 and " + limit);
  return seconds;
}

function stringList(value) {
  if (typeof value === "string" && trimmed(value)) return [trimmed(value)];
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item === "string" && trimmed(item) && !out.includes(trimmed(item))) out.push(trimmed(item));
  }
  return out;
}

function firstString(req, names) {
  for (const name of names) {
    const text = trimmed(req[name]);
    if (text) return text;
  }
  return "";
}

function flag(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function videoBody(ctx) {
  const raw = (ctx && ctx.requestBody) || {};
  const meta = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const req = Object.assign({}, meta, raw);
  const model = modelName(ctx);
  if (!model) throw new Error("model is required");
  const prompt = trimmed(req.prompt);
  if (!prompt) throw new Error("field prompt is required");
  const body = { model: model, prompt: prompt };
  const duration = durationOf(req, model);
  if (duration !== undefined) body.duration = duration;
  const ratio =
    firstString(req, ["ratio", "aspect_ratio"]) || RATIO_BY_SIZE[trimmed(req.size)] || (/^\d+:\d+$/.test(trimmed(req.size)) ? trimmed(req.size) : "");
  if (ratio) body.ratio = ratio;
  const images = stringList(req.referenceImages).concat(
    stringList(req.images),
    stringList(req.imageUrls),
    stringList(req.image_urls),
    stringList(req.image),
    stringList(req.image_url)
  );
  const referenceImages = [];
  for (const image of images) {
    if (!referenceImages.includes(image)) referenceImages.push(image);
  }
  if (referenceImages.length) body.referenceImages = referenceImages;
  const videos = stringList(req.referenceVideos).concat(stringList(req.videoUrls), stringList(req.video_urls), stringList(req.video_url));
  if (videos.length) body.referenceVideos = videos;
  const audios = stringList(req.referenceAudios).concat(stringList(req.audioUrls), stringList(req.audio_urls), stringList(req.audio_url));
  if (audios.length) body.referenceAudios = audios;
  const firstImage = firstString(req, ["first_image", "first_frame_url", "first_frame", "start_frame", "start_image_url", "input_reference"]);
  if (firstImage) body.first_image = firstImage;
  const lastImage = firstString(req, ["last_image", "last_frame_url", "last_frame", "end_frame"]);
  if (lastImage) body.last_image = lastImage;
  const mode = trimmed(req.mode || req.omni_reference_task_type);
  if (mode === "edit" || mode === "extend") body.mode = mode;
  const audio = flag(req.generate_audio !== undefined ? req.generate_audio : req.generateAudio);
  if (audio !== undefined) body.generate_audio = audio;
  const watermark = flag(req.watermark);
  if (watermark !== undefined) body.watermark = watermark;
  return body;
}

function positiveSeconds(value) {
  if (typeof value === "boolean" || value === undefined || value === null || value === "") return 0;
  const seconds = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.ceil(seconds), 3600);
}

function usageFacts(ctx, body) {
  const model = modelName(ctx) || trimmed(body && body.model);
  if (PER_CALL_MODELS.includes(model)) return { count: 1 };
  if (body && typeof body === "object") {
    const billed = positiveSeconds(body.billing_seconds);
    if (billed) return { seconds: billed };
    const output = positiveSeconds(
      body.actualDuration !== undefined && body.actualDuration !== null && body.actualDuration !== "" ? body.actualDuration : body.duration
    );
    const reference = positiveSeconds(body.reference_video_duration);
    if (output || reference) return { seconds: Math.min(output + reference, 3600) };
  }
  // A missing duration or -1 lets the vendor choose the length, so reserve the model maximum.
  const requested = durationOf((ctx && ctx.requestBody) || {}, model);
  if (requested === undefined || requested < 0) return { seconds: maxSeconds(model) };
  return { seconds: requested };
}

function authHeader(ctx) {
  return { Authorization: "Bearer " + ctx.apiKey };
}

export function buildSubmitRequest(ctx) {
  const body = videoBody(ctx);
  const headers = authHeader(ctx);
  const files = ctx.files || [];
  if (files.length) {
    const parts = [
      { name: "model", value: body.model },
      { name: "prompt", value: body.prompt },
    ];
    if (body.duration !== undefined) parts.push({ name: "duration", value: String(body.duration) });
    if (body.ratio) parts.push({ name: "ratio", value: body.ratio });
    if (body.mode) parts.push({ name: "mode", value: body.mode });
    if (body.generate_audio !== undefined) parts.push({ name: "generate_audio", value: String(body.generate_audio) });
    if (body.watermark !== undefined) parts.push({ name: "watermark", value: String(body.watermark) });
    for (const url of body.referenceImages || []) parts.push({ name: "referenceImages", value: url });
    for (const url of body.referenceVideos || []) parts.push({ name: "referenceVideos", value: url });
    for (const url of body.referenceAudios || []) parts.push({ name: "referenceAudios", value: url });
    if (body.first_image) parts.push({ name: "first_image", value: body.first_image });
    if (body.last_image) parts.push({ name: "last_image", value: body.last_image });
    for (const file of files) {
      let name = file.field;
      if (["images", "image", "image_url", "input_reference"].includes(name)) name = name === "input_reference" ? "first_image" : "referenceImages";
      parts.push({ name: name, fileRef: file.ref, filename: file.filename });
    }
    return {
      url: ctx.baseUrl + "/openapi/v1/videos",
      method: "POST",
      headers: headers,
      bodyType: "multipart",
      parts: parts,
      action: body.referenceImages || body.first_image ? "image_to_video" : "text_to_video",
    };
  }
  headers["Content-Type"] = "application/json";
  return {
    url: ctx.baseUrl + "/openapi/v1/videos",
    method: "POST",
    headers: headers,
    body: body,
    action: body.referenceImages || body.first_image ? "image_to_video" : "text_to_video",
  };
}

export function parseSubmitResponse(_ctx, resp) {
  const body = (resp && resp.body) || {};
  const taskId = trimmed(body.id || body.task_id);
  if (!taskId) throw new Error("task_id is empty");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  return usageFacts(ctx, null);
}

export function extractUsageOnComplete(ctx, _taskResult, body) {
  return usageFacts(ctx, body || {});
}

export function buildQueryRequest(ctx) {
  if (!trimmed(ctx.taskId)) throw new Error("task id is required");
  return { url: ctx.baseUrl + "/openapi/v1/videos/" + encodeURIComponent(ctx.taskId), method: "GET", headers: authHeader(ctx) };
}

export function parseTaskResult(_ctx, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "UNKNOWN", reason: "unrecognized status" };
  const status = String(body.status || "").toLowerCase();
  const continuing = { submitting: "QUEUED", queued: "QUEUED", processing: "IN_PROGRESS", in_progress: "IN_PROGRESS", unknown: "IN_PROGRESS" };
  if (continuing[status]) return { status: continuing[status] };
  if (status === "failed" || status === "error") {
    const error = body.error;
    const reason = typeof error === "string" ? trimmed(error) : error && trimmed(error.message);
    return { status: "FAILURE", reason: reason || "task failed" };
  }
  if (status === "completed") {
    const url = trimmed(body.video_url) || trimmed(body.result_url);
    if (!url) return { status: "IN_PROGRESS" };
    return { status: "SUCCESS", url: url };
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(body.status || "") };
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" ? [{ key: "video", type: "video" }] : [];
}

// Channel tests call this instead of creating a video. Listing models checks the key and does not bill.
export function buildProbeRequest(ctx) {
  return {
    url: ctx.baseUrl + "/openapi/v1/models",
    method: "GET",
    headers: { Authorization: "Bearer " + ctx.apiKey },
  };
}

function storedVideoURL(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  return trimmed(data.video_url) || trimmed(data.result_url);
}

export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  const method = (ctx.clientRequest && ctx.clientRequest.method) || "GET";
  // The completed task stores a signed media URL on another host. Fetching the
  // authenticated content API redirects there, and the gateway refuses to
  // follow a credentialed cross-origin redirect.
  const url = storedVideoURL(ctx.data);
  if (url) return { url: url, method: method, credentialless: true };
  if (!trimmed(ctx.upstreamTaskId)) throw new Error("artifact_not_found");
  return {
    url: ctx.baseUrl + "/openapi/v1/videos/" + encodeURIComponent(ctx.upstreamTaskId) + "/content",
    method: method,
    headers: authHeader(ctx),
  };
}

function responsesInput(req) {
  const texts = [];
  const images = [];
  const input = req.input;
  if (typeof input === "string") texts.push(input);
  else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        texts.push(item);
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
      for (const part of content) {
        if (typeof part === "string") {
          texts.push(part);
          continue;
        }
        if (!part || typeof part !== "object" || Array.isArray(part)) continue;
        if (["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
        if (["input_image", "image_url"].includes(part.type)) {
          let image = part.image_url;
          if (image && typeof image === "object") image = image.url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return { prompt: texts.filter(trimmed).join("\n"), images: images };
}

function responsesVideoText(ctx) {
  const artifact = ctx && ctx.artifacts && ctx.artifacts.video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<video controls src="' + escaped + '"></video>';
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      const input = responsesInput(req);
      const prompt = input.prompt || trimmed(req.prompt);
      if (!prompt) throw new Error("input is required");
      const requestBody = { prompt: prompt };
      if (input.images.length) requestBody.images = input.images;
      if (req.seconds !== undefined) requestBody.seconds = req.seconds;
      else if (req.duration !== undefined) requestBody.duration = req.duration;
      if (req.size !== undefined) requestBody.size = req.size;
      if (req.ratio !== undefined) requestBody.ratio = req.ratio;
      return { kind: "submit", model: ctx.model, action: input.images.length ? "image_to_video" : "text_to_video", requestBody: requestBody };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: responsesVideoText(ctx) }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE")
        return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx, _task) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesVideoText(ctx), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "top-image" },
      };
    },
  },
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || (ctx.body.kind !== "json" && ctx.body.kind !== "multipart")) throw new Error("JSON or multipart body required");
      let req = ctx.body.value;
      if (ctx.body.kind === "multipart") {
        req = {};
        const fields = ctx.body.fields || {};
        for (const name of Object.keys(fields)) {
          const values = fields[name] || [];
          req[name] = values.length > 1 ? values : values[0];
        }
      }
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      return { kind: "submit", model: ctx.model, requestBody: req };
    },
    render: function (_ctx, task) {
      if (task.data && typeof task.data === "object" && !Array.isArray(task.data)) return task.data;
      return { id: task.task_id, object: "video", status: "unknown" };
    },
  },
};

meta.generationProfiles = meta.models.map((name) => ({
  models: [name],
  kind: "video",
  fields: [
    { key: "seconds", labelKey: "Duration", type: "number", defaultValue: 5, min: 4, max: maxSeconds(name), requestPath: ["duration"] },
    {
      key: "ratio",
      labelKey: "Aspect Ratio",
      type: "select",
      defaultValue: "16:9",
      requestPath: ["metadata", "ratio"],
      options: ["16:9", "9:16", "1:1"].map((value) => ({ value, label: value })),
    },
  ],
  referenceImages: { max: name.includes("SD2.5") ? 30 : 9, field: "images", encoding: "dataUrl" },
  mediaNotice: true,
}));
