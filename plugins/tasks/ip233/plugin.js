// IP233 Media API (https://new.ip233.com/docs/api). One API key serves the
// video endpoints, and every model bills per video or per second. Only the six
// models this gateway sells are declared; anything else stays on the ordinary
// relay until its published contract is driven here.
//
// Video: POST /v1/videos, GET /v1/videos/{task_id}, GET /v1/videos/{task_id}/content.
// The vendor rejects parameters a model does not list, so every value is
// validated here before the vendor can charge for a request it will refuse.
//
// Reference material is URL-only. Uploaded files arrive as signed read URLs the
// host publishes to its object storage; IP233's own /v1/media/uploads token is
// not used. Seedance's structured `references` (image/video/audio roles) is not
// sent; only the flat reference_* arrays are.

// Per-second billing models; every other video model bills once per task.
const PER_SECOND_VIDEO_MODELS = [
  "ip233-minimax-h3",
  "seedance2.0-B5",
  "seedance2.5-B5",
];

// Each model's published reference allowance. The counts only size the console
// picker: the lists themselves are forwarded as sent, and an over-count request
// is left for the vendor to refuse.
const VIDEO_MODELS = {
  // hailuo already declares MiniMax-H3, and a model may not differ from
  // another plugin's by case alone, so the IP233 spelling carries a prefix and
  // the request still names the vendor's model.
  "ip233-minimax-h3": {
    upstream: "minimax-h3",
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["768p"],
    aspects: ["16:9", "9:16"],
    images: 9,
    videos: 3,
    audios: 3,
  },
  "seedance2.0-A1": {
    seconds: { list: [5, 10, 15], def: 5 },
    resolutions: ["720p"],
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    images: 9,
    videos: 0,
    audios: 0,
  },
  "seedance2.0-B4": {
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["720p"],
    aspects: ["16:9", "9:16", "1:1"],
    images: 9,
    videos: 3,
    audios: 3,
  },
  "seedance2.0-B5": {
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["480p", "720p"],
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    images: 9,
    videos: 3,
    audios: 3,
  },
  "seedance2.5-B2": {
    seconds: { min: 10, max: 30, def: 10 },
    resolutions: ["720p"],
    aspects: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    images: 30,
    videos: 10,
    audios: 10,
  },
  "seedance2.5-B5": {
    seconds: { min: 4, max: 30, def: 4 },
    resolutions: ["480p", "720p"],
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    images: 30,
    videos: 10,
    audios: 10,
  },
};

const VIDEO_MODEL_NAMES = Object.keys(VIDEO_MODELS);
const VIDEO_RESOLUTIONS = ["480p", "720p", "768p"];

const SECONDS_FIELD = {
  type: "number",
  unit: "second",
  description: { en: "Video generation unit price", zh: "视频生成单价" },
};
const VIDEO_COUNT_FIELD = {
  type: "number",
  unit: "count",
  unitLabel: { en: "video", zh: "条" },
  description: { en: "Video generation unit price", zh: "视频生成单价" },
};
const VIDEO_RESOLUTION_FIELD = {
  enum: VIDEO_RESOLUTIONS,
  description: { en: "Output video resolution", zh: "输出视频分辨率" },
};

const PER_SECOND_VIDEO_USAGE = { seconds: SECONDS_FIELD, resolution: VIDEO_RESOLUTION_FIELD };
const PER_CALL_VIDEO_USAGE = { count: VIDEO_COUNT_FIELD, resolution: VIDEO_RESOLUTION_FIELD };

export const meta = {
  apiVersion: 1,
  key: "ip233",
  name: "IP233",
  icon: "text:IP",
  description: {
    en: "Video generation through the IP233 Media API",
    zh: "通过 IP233 Media API 生成视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  website: "https://new.ip233.com",
  baseUrl: "https://api-new.ip233.com",
  models: VIDEO_MODEL_NAMES,
  // The console compares a channel's model list with the vendor's /models
  // reply, so a declared name that the plugin sends under a different id has
  // to say which id that is.
  modelUpstreamNames: Object.fromEntries(
    Object.entries(VIDEO_MODELS)
      .filter(([, spec]) => spec.upstream)
      .map(([name, spec]) => [name, spec.upstream])
  ),
  fetchMode: "per_task",
  // Union of both profiles, used for an alias that resolves to several models.
  // Examples are per-profile below; a plugin-level vector would have to cover
  // both billing quantities.
  usageSchema: Object.assign({}, PER_SECOND_VIDEO_USAGE, PER_CALL_VIDEO_USAGE),
  usageProfiles: [
    {
      models: PER_SECOND_VIDEO_MODELS,
      schema: PER_SECOND_VIDEO_USAGE,
      examples: [
        { label: "768p 5s", facts: { seconds: 5, resolution: "768p" } },
        { label: "720p 5s", facts: { seconds: 5, resolution: "720p" } },
      ],
    },
    {
      models: VIDEO_MODEL_NAMES.filter((name) => !PER_SECOND_VIDEO_MODELS.includes(name)),
      schema: PER_CALL_VIDEO_USAGE,
      examples: [
        { label: "one video 720p", facts: { count: 1, resolution: "720p" } },
        { label: "one video 480p", facts: { count: 1, resolution: "480p" } },
      ],
    },
  ],
  protocols: [
    { name: "openai_responses", supports: ["stream", "sync", "background"] },
    { name: "openai_video", models: VIDEO_MODEL_NAMES },
  ],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// A request body as a flat object: the JSON body itself, or the form fields of
// a multipart body. IP233 takes reference material as http or https URLs only,
// so an uploaded file counts only once the host has published it and attached
// its read URL.
function flatBody(ctx) {
  const body = (ctx && ctx.body) || {};
  if (body.kind === "json") {
    const value = plainObject(body.value);
    if (!value) throw new Error("JSON object required");
    return value;
  }
  if (body.kind !== "multipart" && body.kind !== "form") throw new Error("JSON or multipart body required");
  const fields = {};
  for (const name of Object.keys(body.fields || {})) {
    const values = body.fields[name] || [];
    if (values.length > 1) throw new Error(name + " must be provided once");
    fields[name] = values[0];
  }
  // `image[]` and `image` name the same reference list upstream.
  for (const file of body.files || []) {
    const name = trimmed(file && file.field).replace(/\[\]$/, "");
    const url = trimmed(file && file.url);
    if (!name) throw new Error("reference media field is missing");
    if (!/^https?:\/\//i.test(url)) throw new Error("IP233 accepts reference media as http or https URLs, not uploaded files");
    if (fields[name] === undefined) fields[name] = [];
    else if (!Array.isArray(fields[name])) fields[name] = [fields[name]];
    fields[name].push(url);
  }
  // A multipart client sends metadata as a JSON string; the video driver reads
  // the members of that object, so parse it once here.
  if (typeof fields.metadata === "string") {
    let parsed;
    try {
      parsed = JSON.parse(fields.metadata);
    } catch (e) {
      throw new Error("metadata must be a JSON object string");
    }
    if (!plainObject(parsed)) throw new Error("metadata must be a JSON object string");
    fields.metadata = parsed;
  }
  for (const key of ["n", "seconds", "duration"]) {
    if (typeof fields[key] === "string") fields[key] = Number(fields[key]);
  }
  return fields;
}

function gcd(a, b) {
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

// A WIDTHxHEIGHT pair. `x` and `*` both appear in client sizes.
function sizePixels(size) {
  const match = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(trimmed(size));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height, shortSide: Math.min(width, height) };
}

function ratioFromSize(size) {
  const pixels = sizePixels(size);
  if (!pixels) return "";
  const divisor = gcd(pixels.width, pixels.height);
  return pixels.width / divisor + ":" + pixels.height / divisor;
}

// Frame ratios are snapped to the nearest one the model publishes, so an
// ordinary WIDTHxHEIGHT request still reaches a model that only takes ratios.
function nearestAspect(value, allowed) {
  const candidate = trimmed(value);
  if (!candidate) return "";
  if (allowed.includes(candidate)) return candidate;
  const parsed = /^(\d+):(\d+)$/.exec(candidate);
  if (!parsed) return "";
  const target = Number(parsed[1]) / Number(parsed[2]);
  let best = "";
  let bestDiff = Infinity;
  for (const option of allowed) {
    if (option === "adaptive") continue;
    const parts = /^(\d+):(\d+)$/.exec(option);
    if (!parts) continue;
    const diff = Math.abs(Number(parts[1]) / Number(parts[2]) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = option;
    }
  }
  return best;
}

// The frame ratio a client asked for: a named ratio, a ratio in `size`, or
// pixels in `size`.
function requestedAspect(request) {
  const size = trimmed(request.size);
  const fromSize = /^\d+:\d+$/.test(size) ? size : ratioFromSize(size);
  return trimmed(request.aspect_ratio) || trimmed(request.ratio) || fromSize;
}

function resolutionFromSize(size) {
  const pixels = sizePixels(size);
  if (!pixels) return "";
  if (pixels.shortSide >= 1080) return "1080p";
  if (pixels.shortSide >= 768) return "768p";
  if (pixels.shortSide >= 720) return "720p";
  if (pixels.shortSide >= 480) return "480p";
  return "";
}

function integerValue(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") throw new Error(label + " must be an integer");
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(number) || Math.trunc(number) !== number) throw new Error(label + " must be an integer");
  return number;
}

function urlList(value, label) {
  if (value === undefined || value === null || value === "") return [];
  const items = Array.isArray(value) ? value : [value];
  const urls = [];
  for (const item of items) {
    const url = trimmed(item);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) throw new Error(label + " must be an http or https URL; IP233 does not accept uploaded files");
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

function firstURL(request, names, label) {
  for (const name of names) {
    if (request[name] === undefined) continue;
    const urls = urlList(request[name], label);
    if (urls.length) return urls;
  }
  return [];
}

function flatRequest(ctx) {
  const raw = (ctx && ctx.requestBody) || {};
  const meta = plainObject(raw.metadata);
  return Object.assign({}, meta || {}, raw);
}

function videoModel(ctx) {
  const name = trimmed(ctx && (ctx.upstreamModel || ctx.model));
  const spec = VIDEO_MODELS[name];
  if (!spec) throw new Error((name || "model") + " is not an IP233 video model");
  return { name: spec.upstream || name, spec };
}

function videoSeconds(request, spec) {
  const given = integerValue(
    request.seconds !== undefined && request.seconds !== null && request.seconds !== "" ? request.seconds : request.duration,
    "duration"
  );
  const seconds = given === undefined ? spec.seconds.def : given;
  if (spec.seconds.list && !spec.seconds.list.includes(seconds)) {
    throw new Error("duration must be one of " + spec.seconds.list.join(", "));
  }
  if (!spec.seconds.list && (seconds < spec.seconds.min || seconds > spec.seconds.max)) {
    throw new Error("duration must be between " + spec.seconds.min + " and " + spec.seconds.max);
  }
  return seconds;
}

function videoResolution(request, spec) {
  const explicit = trimmed(request.resolution).toLowerCase();
  if (explicit) {
    if (!spec.resolutions.includes(explicit)) throw new Error("resolution must be one of " + spec.resolutions.join(", "));
    return explicit;
  }
  if (spec.resolutions.length === 1) return spec.resolutions[0];
  const derived = resolutionFromSize(request.size);
  return derived && spec.resolutions.includes(derived) ? derived : spec.resolutions[spec.resolutions.length - 1];
}

function videoAspect(request, spec) {
  const explicit = requestedAspect(request);
  if (trimmed(request.aspect_ratio) || trimmed(request.ratio)) {
    const aspect = nearestAspect(explicit, spec.aspects);
    if (!aspect) throw new Error("aspect_ratio must be one of " + spec.aspects.join(", "));
    return aspect;
  }
  const fromSize = nearestAspect(explicit, spec.aspects);
  if (fromSize) return fromSize;
  // A landscape frame is the vendor default for every model, and 16:9 is the
  // first published orientation that says so.
  return spec.aspects.includes("16:9") ? "16:9" : spec.aspects.find((option) => option !== "adaptive");
}

// The request IP233 documents for one video model. Everything a model does not
// publish is dropped instead of forwarded, because an unlisted field is
// rejected upstream.
function videoBody(ctx) {
  const request = flatRequest(ctx);
  const identity = videoModel(ctx);
  const spec = identity.spec;
  const prompt = trimmed(request.prompt);
  if (!prompt) throw new Error("field prompt is required");
  const body = { model: identity.name, prompt };
  body[spec.secondsKey || "seconds"] = videoSeconds(request, spec);
  const resolution = videoResolution(request, spec);
  if (spec.sizeAsRatio) body.size = videoAspect(request, spec);
  else body.aspect_ratio = videoAspect(request, spec);
  if (!spec.sizeAsRatio) body.resolution = resolution;

  // Every model names its reference material the same way upstream: the image
  // list as reference_image_urls, then reference_videos and reference_audios.
  // Clients spell images differently, so all of those spellings are read.
  const images = firstURL(request, ["reference_images", "reference_image_urls", "images", "image", "image_urls", "input_reference"], "reference images");
  const videos = firstURL(request, ["reference_videos", "videos", "video_urls"], "reference videos");
  const audios = firstURL(request, ["reference_audios", "audios", "audio_urls"], "reference audios");
  if (images.length) body.reference_image_urls = images;
  if (videos.length) body.reference_videos = videos;
  if (audios.length) body.reference_audios = audios;
  if (spec.frames) {
    const first = firstURL(request, ["first_frame"], "first frame");
    const last = firstURL(request, ["last_frame"], "last frame");
    if (first.length && last.length && (videos.length || images.length)) throw new Error("first_frame and last_frame cannot be combined with reference media");
    if (first.length !== last.length) throw new Error("first_frame and last_frame must be provided together");
    if (first.length) body.first_frame = first[0];
    if (last.length) body.last_frame = last[0];
  }
  if (spec.audio && request.audio !== undefined) body.audio = request.audio === true || request.audio === "true";
  return { body, resolution, declared: trimmed(ctx && (ctx.upstreamModel || ctx.model)) };
}

// Video facts come from the request this plugin sends, so a value merged from
// metadata is bounded exactly like a top-level one.
function videoFacts(declared, body, resolution) {
  if (PER_SECOND_VIDEO_MODELS.includes(declared)) return { seconds: body.seconds !== undefined ? body.seconds : body.duration, resolution };
  return { count: 1, resolution };
}

function absoluteURL(value) {
  const url = trimmed(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

function authHeaders(ctx) {
  return { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" };
}

export function buildSubmitRequest(ctx) {
  const { body } = videoBody(ctx);
  return {
    url: ctx.baseUrl + "/v1/videos",
    method: "POST",
    headers: authHeaders(ctx),
    body,
    action: body.reference_image_urls || body.reference_images || body.first_frame ? "image_to_video" : "text_to_video",
  };
}

export function parseSubmitResponse(ctx, resp) {
  const body = (resp && resp.body) || {};
  if (body.error) throw new Error(trimmed(body.error.message) || "task submission failed");
  const taskId = trimmed(body.task_id || body.id);
  if (!taskId) throw new Error("task_id is empty");
  return { taskId, taskData: body };
}

export function extractUsage(ctx) {
  const { body, resolution, declared } = videoBody(ctx);
  return videoFacts(declared, body, resolution);
}

// A video task settles on the facts reserved at submit; its terminal reply adds
// no billed quantity of its own.
export function extractUsageOnComplete() {
  return {};
}

export function buildQueryRequest(ctx) {
  const taskId = trimmed(ctx.taskId);
  if (!taskId) throw new Error("task id is required");
  return { url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(taskId), method: "GET", headers: authHeaders(ctx) };
}

export function parseTaskResult(_ctx, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "UNKNOWN", reason: "unrecognized status" };
  const status = trimmed(body.status).toLowerCase();
  const result = {};
  const progress = Number(body.progress);
  if (Number.isFinite(progress) && progress >= 0 && progress <= 100) result.progress = Math.round(progress) + "%";
  if (status === "queued" || status === "pending") return Object.assign(result, { status: "QUEUED" });
  if (status === "in_progress" || status === "processing" || status === "running") return Object.assign(result, { status: "IN_PROGRESS" });
  // A completed video can still be waiting for the vendor's billing figure;
  // the task is only settled once that clears.
  if (status === "completed" && body.billing_pending === true) return Object.assign(result, { status: "IN_PROGRESS" });
  if (status === "completed" || status === "succeeded") {
    result.status = "SUCCESS";
    const url = absoluteURL(body.result_url) || (body.result_urls && body.result_urls.length ? absoluteURL(body.result_urls[0]) : "");
    if (url) result.url = url;
    return result;
  }
  if (status === "failed" || status === "cancelled" || status === "canceled" || status === "error") {
    const error = body.error;
    const reason = typeof error === "string" ? trimmed(error) : trimmed(error && error.message);
    result.status = "FAILURE";
    result.reason = reason || trimmed(body.message) || "task failed";
    return result;
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(body.status) };
}

export function buildProbeRequest(ctx) {
  return { url: ctx.baseUrl + "/v1/models", method: "GET", headers: authHeaders(ctx) };
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  const method = (ctx.clientRequest && ctx.clientRequest.method) || "GET";
  const data = ctx.data && typeof ctx.data === "object" ? ctx.data : {};
  // IP233 hands out a signed result URL with the task; a task without one
  // (some seedance tiers) is downloaded from the content endpoint.
  const url = absoluteURL(data.result_url);
  if (url) return { url, method, credentialless: true };
  if (!trimmed(ctx.upstreamTaskId)) throw new Error("artifact_not_found");
  return {
    url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.upstreamTaskId) + "/content",
    method,
    headers: authHeaders(ctx),
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
      if (!plainObject(item)) continue;
      const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
      for (const part of content) {
        if (typeof part === "string") {
          texts.push(part);
          continue;
        }
        if (!plainObject(part)) continue;
        if (["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
        if (["input_image", "image_url"].includes(part.type)) {
          let image = part.image_url;
          if (plainObject(image)) image = image.url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return { prompt: texts.filter((text) => trimmed(text)).join("\n"), images };
}

function responsesOutputText(ctx, task) {
  const artifact = (ctx.artifacts || {}).video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  return '<video controls src="' + url.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"></video>';
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = plainObject(ctx.body.value);
      if (!req) throw new Error("request body must be an object");
      if (req.input !== undefined && typeof req.input !== "string" && !Array.isArray(req.input)) throw new Error("input must be a string or array");
      const input = responsesInput(req);
      const prompt = input.prompt || trimmed(req.prompt);
      if (!prompt) throw new Error("input is required");
      const requestBody = { model: ctx.model, prompt };
      const images = [];
      for (const image of input.images) if (!images.includes(image)) images.push(image);
      if (images.length) requestBody.images = images;
      for (const key of ["seconds", "duration", "size", "resolution", "aspect_ratio", "ratio"]) {
        if (Object.prototype.hasOwnProperty.call(req, key)) requestBody[key] = req[key];
      }
      return { kind: "submit", model: ctx.model, action: images.length ? "image_to_video" : "text_to_video", requestBody };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status, progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: responsesOutputText(ctx, task) }];
        return { events, state, done: true };
      }
      if (status === "FAILURE") return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state, done: false };
    },
    renderFinal: function (ctx, task) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesOutputText(ctx, task), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "ip233" },
      };
    },
  },

  openai_video: {
    decodeRequest: function (ctx) {
      const body = Object.assign({}, flatBody(ctx), { model: ctx.model });
      // Validate before the vendor is charged for a request it will reject.
      videoBody({ requestBody: body, model: ctx.model, upstreamModel: ctx.upstreamModel });
      const media = body.reference_images || body.reference_image_urls || body.images || body.image || body.first_frame;
      return { kind: "submit", model: ctx.model, action: media ? "image_to_video" : "text_to_video", requestBody: body };
    },
    render: function (_ctx, task) {
      const data = task.data && typeof task.data === "object" ? task.data : {};
      const statuses = {
        QUEUED: "queued",
        NOT_START: "queued",
        SUBMITTED: "queued",
        IN_PROGRESS: "in_progress",
        SUCCESS: "completed",
        FAILURE: "failed",
      };
      const output = {
        id: task.task_id,
        object: "video",
        model: (task.properties || {}).origin_model_name || "",
        status: statuses[task.status] || "unknown",
        progress: Number(String(task.progress || "0").replace("%", "")),
        created_at: task.created_at,
      };
      const finished = Number(task.finished_at || task.updated_at || 0);
      if (finished > 0) output.completed_at = finished;
      if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: task.fail_reason || "the video generation task failed" };
      return Object.assign({}, data, output, { object: "video" });
    },
  },
};

// The console reads the same per-model contract that videoBody enforces.
meta.generationProfiles = VIDEO_MODEL_NAMES.map((name) => {
  const spec = VIDEO_MODELS[name];
  // Every model takes a fixed set of lengths, so the console offers them as a
  // dropdown; a min/max range is spelled out second by second rather than left
  // to a number input the caller could push past what the vendor accepts.
  const lengths = [...(spec.seconds.list || [])];
  if (!lengths.length) for (let value = spec.seconds.min; value <= spec.seconds.max; value++) lengths.push(value);
  const duration = {
    key: "seconds",
    labelKey: "Duration",
    type: "select",
    valueType: "number",
    defaultValue: String(spec.seconds.def),
    requestPath: ["duration"],
    options: lengths.map((value) => ({ value: String(value), label: String(value) })),
  };
  const fields = [duration].concat(
    [
      ["ratio", "Aspect Ratio", spec.aspects, ["metadata", "aspect_ratio"], spec.aspects.includes("16:9") ? "16:9" : spec.aspects[0]],
      ["resolution", "Resolution", spec.resolutions, ["metadata", "resolution"], spec.resolutions[spec.resolutions.length - 1]],
    ].map(([key, labelKey, values, requestPath, defaultValue]) => ({
      key,
      labelKey,
      type: "select",
      defaultValue,
      requestPath,
      options: values.map((value) => ({ value, label: value })),
    }))
  );
  // The console caps the picker at the vendor's per-kind allowance, so a request
  // it lets through is one the plugin will not have to refuse. A model that
  // takes no videos or audios hides the media picker entirely rather than
  // offering a list the vendor would reject.
  return {
    models: [name],
    kind: "video",
    fields,
    referenceImages: { max: spec.images, field: "images", encoding: "dataUrl" },
    mediaNotice: spec.videos > 0 || spec.audios > 0,
  };
});
