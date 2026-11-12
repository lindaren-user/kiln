// JojoLife (https://jojolife.cc) is itself a New API gateway, so its video
// surface is the OpenAI-compatible task protocol rather than a vendor's:
//
//   POST /v1/videos              create, returns the video object with an id
//   GET  /v1/videos/{id}         queued / in_progress / completed / failed
//   GET  /v1/videos/{id}/content the finished MP4; needs the same key
//
// The create body is the one the gateway documents: model, prompt, seconds,
// size (or the equivalent aspect_ratio and resolution), and reference media as
// public URLs in images, reference_videos and reference_audios. Uploaded files
// are refused here because the gateway reads the links itself.
//
// The pricing page lists two Seedance 2.5 tiers, and they differ only in how
// they bill: seedance2.5-MNW charges by output second while seedance2.5-MNW-TJ
// charges once per video. Both publish 480P/720P output, multi-reference
// 30/10/10 and a 30-second ceiling, so they share one capability row and each
// gets the usage profile its billing mode reads. Add a row when another video
// model is bought; an unknown id is refused instead of being sent with guessed
// controls.

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

// Both tiers are the same vendor model behind two billing modes, so they share
// one capability row; only `perSecond` differs.
const SEEDANCE_25 = {
  min: 4,
  max: 30,
  resolutions: ["480p", "720p"],
  aspects: ASPECT_RATIOS,
  images: 30,
  videos: 10,
  audios: 10,
};

const VIDEO_MODELS = {
  "seedance2.5-MNW": { ...SEEDANCE_25, perSecond: true },
  "seedance2.5-MNW-TJ": { ...SEEDANCE_25 },
};

const VIDEO_MODEL_NAMES = Object.keys(VIDEO_MODELS);

const COUNT_FIELD = {
  type: "number",
  unit: "count",
  unitLabel: { en: "video", zh: "条" },
  description: { en: "Video generation unit price", zh: "视频生成单价" },
};
const SECONDS_FIELD = {
  type: "number",
  unit: "second",
  description: { en: "Video generation unit price", zh: "视频生成单价" },
};

function resolutionField(values) {
  const labels = {};
  for (const value of values) labels[value] = { en: value, zh: value };
  return {
    enum: values,
    enumLabels: labels,
    description: { en: "Output video resolution", zh: "输出视频分辨率" },
  };
}

// Every model in the catalogue prices by output resolution and publishes the
// same tiers, so one list serves the plugin-level schema.
const RESOLUTIONS = SEEDANCE_25.resolutions;

// The price editor offers only the quantities a model's billing mode reads: a
// per-second tier reads output seconds, a per-video tier reads the count. Both
// price by resolution. The runtime facts still carry all three, so an operator
// can opt into another quantity when a model is repriced.
const USAGE_PROFILES = VIDEO_MODEL_NAMES.map((name) => {
  const spec = VIDEO_MODELS[name];
  const schema = { resolution: resolutionField(spec.resolutions) };
  if (spec.perSecond) schema.seconds = SECONDS_FIELD;
  else schema.count = COUNT_FIELD;
  return {
    models: [name],
    schema,
    examples: [
      {
        label: spec.perSecond ? spec.resolutions[0] + " " + spec.min + "s" : "one " + spec.resolutions[0] + " video",
        facts: spec.perSecond ? { seconds: spec.min, resolution: spec.resolutions[0] } : { count: 1, resolution: spec.resolutions[0] },
      },
    ],
  };
});

export const meta = {
  apiVersion: 1,
  key: "jojolife",
  name: "JojoLife",
  icon: "text:JJ",
  description: {
    en: "Video generation through the JojoLife gateway",
    zh: "通过 JojoLife 网关生成视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  website: "https://jojolife.cc",
  baseUrl: "https://jojolife.cc",
  models: VIDEO_MODEL_NAMES,
  fetchMode: "per_task",
  // The gateway is another New API deployment, so both a task-plugin channel
  // and a type-60 channel can bind this driver.
  upstreams: ["vendor", "new_api"],
  // The gateway bills some models per task and others per second, and its
  // prices differ by resolution, so every fact the expression may use is
  // reported. count is always 1: one request creates one video.
  usageSchema: {
    count: COUNT_FIELD,
    seconds: SECONDS_FIELD,
    resolution: resolutionField(RESOLUTIONS),
  },
  usageProfiles: USAGE_PROFILES,
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function bearerHeader(ctx) {
  const authHeader = trimmed(ctx && ctx.authHeader);
  if (/^Bearer\s+/i.test(authHeader)) return authHeader;
  return "Bearer " + ctx.apiKey;
}

function authHeaders(ctx) {
  return {
    "Content-Type": "application/json",
    Authorization: bearerHeader(ctx),
  };
}

// Another New API gateway serves this plugin's OpenAI video paths under the
// plugin key. JojoLife itself serves the same paths without that prefix.
function apiRoot(ctx) {
  if (ctx && ctx.upstream && ctx.upstream.kind === "new_api") return ctx.baseUrl + "/jojolife";
  return ctx.baseUrl;
}

function absoluteURL(value) {
  const url = trimmed(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

// A request body as a flat object. The generic task endpoint delivers a
// normalized task request whose extra controls (ratio, resolution) travel in
// metadata; an OpenAI video client sends them at the top level.
function flatRequest(ctx) {
  const raw = (ctx && ctx.requestBody) || {};
  const metadata = plainObject(raw.metadata);
  return metadata ? Object.assign({}, metadata, raw) : raw;
}

// A channel mapping names the upstream model explicitly; otherwise the public
// model is the gateway's own id.
function videoModel(ctx) {
  const name = trimmed(ctx && (ctx.upstreamModel || ctx.model));
  const spec = VIDEO_MODELS[name];
  if (!spec) throw new Error((name || "model") + " is not a JojoLife video model");
  return { name, spec };
}

function videoSeconds(request, spec) {
  const raw = request.seconds !== undefined && request.seconds !== null && request.seconds !== "" ? request.seconds : request.duration;
  let seconds = spec.min;
  if (raw !== undefined && raw !== null && raw !== "") {
    if (typeof raw === "boolean") throw new Error("seconds must be an integer");
    const number = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
    if (!Number.isFinite(number) || Math.trunc(number) !== number) throw new Error("seconds must be an integer");
    seconds = number;
  }
  if (seconds < spec.min || seconds > spec.max) throw new Error("seconds must be between " + spec.min + " and " + spec.max);
  return seconds;
}

// A WIDTHxHEIGHT size, or null when it is not one.
function sizePixels(size) {
  const match = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(trimmed(size));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height, shortSide: Math.min(width, height) };
}

// A published ratio such as "16:9" as a number, or NaN.
function ratioValue(ratio) {
  const parts = trimmed(ratio).split(":");
  if (parts.length !== 2) return NaN;
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  return width > 0 && height > 0 ? width / height : NaN;
}

// The published ratio a pixel size stands for, or "" when none matches. The
// gateway matches a size by frame shape, not by an exact pixel pair, so
// 1280x720 and 1920x1080 both mean its "16:9".
function aspectFromSize(pixels, aspects) {
  const target = pixels.width / pixels.height;
  for (const aspect of aspects) if (Math.abs(ratioValue(aspect) - target) < 0.01) return aspect;
  return "";
}

// The frame ratio a client asked for: a named ratio, or a published ratio (or
// pixels) in `size`, which the gateway documents as equivalent. Sending both
// must agree.
function videoAspect(request, spec, pixels) {
  const explicit = trimmed(request.aspect_ratio || request.ratio);
  const size = trimmed(request.size);
  const named = spec.aspects.includes(size) ? size : "";
  if (size && !named && !pixels) throw new Error("size must be one of " + spec.aspects.join(", ") + " or WIDTHxHEIGHT");
  const derived = named || (pixels ? aspectFromSize(pixels, spec.aspects) : "");
  if (pixels && !derived) throw new Error("size must match one of " + spec.aspects.join(", "));
  if (explicit) {
    if (!spec.aspects.includes(explicit)) throw new Error("aspect_ratio must be one of " + spec.aspects.join(", "));
    if (derived && derived !== explicit) throw new Error("size and aspect_ratio disagree");
    return explicit;
  }
  return derived || spec.aspects[0];
}

// The resolution tier a pixel size falls in: the largest published tier whose
// short side the frame reaches, or "" when it reaches none. The threshold is
// the number in the tier's name ("720p" -> 720), so the model row is the only
// place a tier is declared.
function resolutionFromSize(pixels, spec) {
  let best = "";
  let bestShortSide = 0;
  for (const name of spec.resolutions) {
    const shortSide = Number(name.replace(/\D/g, ""));
    if (shortSide > bestShortSide && pixels.shortSide >= shortSide) {
      best = name;
      bestShortSide = shortSide;
    }
  }
  return best;
}

// The gateway spells resolutions in lower case; a client may send either case.
// Size, ratio and resolution travel together and the gateway refuses a set
// that disagrees.
function videoResolution(request, spec, pixels) {
  const explicit = trimmed(request.resolution).toLowerCase();
  if (explicit && !spec.resolutions.includes(explicit)) throw new Error("resolution must be one of " + spec.resolutions.join(", "));
  const derived = pixels ? resolutionFromSize(pixels, spec) : "";
  if (explicit && derived && derived !== explicit) throw new Error("size and resolution disagree");
  return explicit || derived || spec.resolutions[0];
}

// The fields each material class may arrive under, in the order this gateway
// documents them. A host request may carry the same array under an alias, so
// the first alias present wins and the same file is never counted twice.
const MATERIAL_FIELDS = {
  images: ["images", "image", "input_reference", "image_urls", "reference_images", "reference_image_urls", "image_url"],
  videos: ["reference_videos", "videos", "video_urls", "reference_video", "video", "video_url"],
  audios: ["reference_audios", "audios", "audio_urls", "reference_audio", "audio", "audio_url"],
};

// The public URLs a material class carries in one request.
function materialURLs(request, field) {
  for (const name of MATERIAL_FIELDS[field]) {
    const value = request[name];
    if (value === undefined || value === null || value === "") continue;
    const urls = [];
    for (const item of Array.isArray(value) ? value : [value]) {
      const url = absoluteURL(item);
      if (!url) throw new Error(field + " must contain public http or https URLs");
      urls.push(url);
    }
    if (urls.length) return urls;
  }
  return [];
}

function limitMaterial(field, count, limit) {
  if (count > limit) throw new Error(field + " accepts at most " + limit + " entries");
}

// The request the gateway documents for a video. Everything is validated here,
// before the upstream can charge for a request it would refuse, and the body
// builder is the single source of both the wire body and the billing facts.
function videoBody(ctx) {
  const request = flatRequest(ctx);
  const identity = videoModel(ctx);
  const spec = identity.spec;
  const prompt = trimmed(request.prompt);
  if (!prompt) throw new Error("field prompt is required");
  // Frames are a vendor API concept; this gateway's video body carries plain
  // reference images, so a frame sent here is a mistake rather than material.
  if (trimmed(request.first_frame) || trimmed(request.last_frame)) {
    throw new Error("first_frame and last_frame are not supported; send the frames in images");
  }
  const images = materialURLs(request, "images");
  const videos = materialURLs(request, "videos");
  const audios = materialURLs(request, "audios");
  limitMaterial("images", images.length, spec.images);
  limitMaterial("videos", videos.length, spec.videos);
  limitMaterial("audios", audios.length, spec.audios);
  const seconds = videoSeconds(request, spec);
  const pixels = sizePixels(request.size);
  const resolution = videoResolution(request, spec, pixels);
  const body = {
    model: identity.name,
    prompt,
    // The gateway parses this body into a task request whose seconds field is
    // a string; a JSON number is refused as invalid_json.
    seconds: String(seconds),
    aspect_ratio: videoAspect(request, spec, pixels),
    resolution,
  };
  if (images.length) body.images = images;
  if (videos.length) body.reference_videos = videos;
  if (audios.length) body.reference_audios = audios;
  const action = images.length || videos.length || audios.length ? "reference_to_video" : "text_to_video";
  return { body, action, seconds, resolution };
}

export function buildSubmitRequest(ctx) {
  const { body, action } = videoBody(ctx);
  return {
    url: apiRoot(ctx) + "/v1/videos",
    method: "POST",
    headers: authHeaders(ctx),
    body,
    action,
  };
}

export function parseSubmitResponse(_ctx, resp) {
  const body = plainObject(resp && resp.body) || {};
  if (body.error) {
    const message = typeof body.error === "string" ? trimmed(body.error) : trimmed(body.error.message);
    throw new Error(message || "task submission failed");
  }
  const taskId = trimmed(body.id || body.task_id);
  if (!taskId) throw new Error("task id is empty");
  return { taskId, taskData: body };
}

// The facts come from the request this plugin sends, so a value merged from
// metadata is bounded exactly like a top-level one. The wire body spells
// seconds as a string; the fact is the number it denotes.
export function extractUsage(ctx) {
  const { seconds, resolution } = videoBody(ctx);
  return { count: 1, seconds, resolution };
}

// The terminal reply is the OpenAI video object, which reports progress rather
// than a billed quantity, so the task settles on the facts reserved at submit.
export function extractUsageOnComplete() {
  return {};
}

export function buildQueryRequest(ctx) {
  const taskId = trimmed(ctx && ctx.taskId);
  if (!taskId) throw new Error("task id is required");
  return {
    url: apiRoot(ctx) + "/v1/videos/" + encodeURIComponent(taskId),
    method: "GET",
    headers: authHeaders(ctx),
  };
}

export function buildProbeRequest(ctx) {
  return { url: apiRoot(ctx) + "/v1/models", method: "GET", headers: authHeaders(ctx) };
}

// Create and query answer the same video object; only the terminal reply adds
// the failure message. No url is reported: content is served by the gateway's
// credentialed /v1/videos/{id}/content endpoint, so the host keeps its own
// artifact address.
export function parseTaskResult(_ctx, body) {
  if (!plainObject(body)) return { status: "UNKNOWN", reason: "unrecognized status" };
  const status = trimmed(body.status).toLowerCase();
  const result = {};
  const progress = Number(body.progress);
  if (Number.isFinite(progress) && progress >= 0 && progress <= 100) result.progress = Math.round(progress) + "%";
  if (status === "queued" || status === "pending" || status === "submitted" || status === "not_start") {
    result.status = "QUEUED";
    return result;
  }
  if (status === "in_progress" || status === "processing" || status === "running") {
    result.status = "IN_PROGRESS";
    return result;
  }
  if (status === "completed" || status === "succeeded") {
    result.status = "SUCCESS";
    return result;
  }
  if (status === "failed" || status === "cancelled" || status === "canceled" || status === "error") {
    const error = body.error;
    result.status = "FAILURE";
    result.reason =
      trimmed(typeof error === "string" ? error : error && error.message) ||
      trimmed(body.message) ||
      (status === "cancelled" || status === "canceled" ? "task cancelled" : "task failed");
    return result;
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(body.status) };
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  const taskId = trimmed(ctx.upstreamTaskId);
  if (!taskId) throw new Error("artifact_not_found");
  return {
    url: apiRoot(ctx) + "/v1/videos/" + encodeURIComponent(taskId) + "/content",
    method: (ctx.clientRequest && ctx.clientRequest.method) || "GET",
    // The gateway serves the file only to the key that created the task.
    headers: { Authorization: bearerHeader(ctx) },
  };
}

// A multipart body as a flat field object. Every uploaded file is refused:
// the gateway takes reference material as a public URL only.
function flatBody(ctx) {
  const body = (ctx && ctx.body) || {};
  if (body.kind === "json") {
    const value = plainObject(body.value);
    if (!value) throw new Error("JSON object required");
    return value;
  }
  if (body.kind !== "multipart" && body.kind !== "form") throw new Error("JSON or multipart body required");
  if ((body.files || []).length) throw new Error("JojoLife accepts reference material as a public URL, not an uploaded file");
  const fields = {};
  for (const name of Object.keys(body.fields || {})) {
    const values = body.fields[name] || [];
    if (values.length > 1) throw new Error(name + " must be provided once");
    fields[name] = values[0];
  }
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
  return fields;
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
        if ((part.type === "input_text" || part.type === "text") && typeof part.text === "string") texts.push(part.text);
        if (part.type === "input_image" || part.type === "image_url") {
          let image = part.image_url;
          if (plainObject(image)) image = image.url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return { prompt: texts.filter((text) => trimmed(text)).join("\n"), images };
}

function responsesOutputText(ctx) {
  const artifact = (ctx.artifacts || {}).video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  return '<video controls src="' + url.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"></video>';
}

// The controls both surfaces forward unchanged. Only documented names are
// sent, so an extra key in the request is inert.
const VIDEO_CONTROLS = ["seconds", "duration", "size", "resolution", "aspect_ratio", "ratio", "reference_videos", "videos", "reference_audios", "audios"];

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
      const requestBody = { model: ctx.model, prompt: prompt };
      const images = [];
      for (const image of [req.image, req.input_reference].concat(req.images || [], input.images)) {
        const url = trimmed(image);
        if (url && !images.includes(url)) images.push(url);
      }
      if (images.length) requestBody.images = images;
      for (const key of VIDEO_CONTROLS) {
        if (Object.prototype.hasOwnProperty.call(req, key)) requestBody[key] = req[key];
      }
      // The builder owns validation and the action rule for both surfaces.
      const { action } = videoBody({ requestBody: requestBody, model: ctx.model, upstreamModel: ctx.upstreamModel });
      return { kind: "submit", model: ctx.model, action, requestBody };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status, progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: responsesOutputText(ctx) }];
        return { events, state, done: true };
      }
      if (status === "FAILURE") return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state, done: false };
    },
    renderFinal: function (ctx) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesOutputText(ctx), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "jojolife" },
      };
    },
  },

  openai_video: {
    decodeRequest: function (ctx) {
      const body = Object.assign({}, flatBody(ctx), { model: ctx.model });
      // Validate before the gateway is charged for a request it will reject.
      const { action } = videoBody({ requestBody: body, model: ctx.model, upstreamModel: ctx.upstreamModel });
      return { kind: "submit", model: ctx.model, action, requestBody: body };
    },
    // The host owns the public video object's identity, lifecycle and
    // timestamps; this hook only keeps the vendor's extensions and adds a
    // failure. A vendor URL would need this channel's key, so it is dropped.
    render: function (_ctx, task) {
      const data = plainObject(task.data) || {};
      const body = Object.assign({}, data);
      delete body.url;
      delete body.video_url;
      if (task.status === "FAILURE" && !body.error) {
        body.error = { code: "video_generation_failed", message: task.fail_reason || "The video generation task failed." };
      }
      return body;
    },
  },
};

// The console reads the same per-model contract that videoBody enforces.
meta.generationProfiles = VIDEO_MODEL_NAMES.map((name) => {
  const spec = VIDEO_MODELS[name];
  return {
    models: [name],
    kind: "video",
    fields: [
      {
        key: "seconds",
        labelKey: "Duration",
        type: "number",
        valueType: "number",
        defaultValue: spec.min,
        min: spec.min,
        max: spec.max,
        requestPath: ["duration"],
      },
      {
        key: "ratio",
        labelKey: "Aspect Ratio",
        type: "select",
        defaultValue: spec.aspects[0],
        requestPath: ["metadata", "aspect_ratio"],
        options: spec.aspects.map((value) => ({ value, label: value })),
      },
      {
        key: "resolution",
        labelKey: "Resolution",
        type: "select",
        defaultValue: spec.resolutions[0],
        requestPath: ["metadata", "resolution"],
        options: spec.resolutions.map((value) => ({ value, label: value })),
      },
    ],
    referenceImages: { max: spec.images, field: "images", encoding: "dataUrl" },
    mediaNotice: spec.videos > 0 || spec.audios > 0,
  };
});
