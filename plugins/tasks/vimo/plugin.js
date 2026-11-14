// Vimo AI open API (https://vimo.asia/developers). One key serves every model
// on the site, and a video is a task:
//   POST /videos/generations          create (201)
//   GET  /videos/generations/{id}     queued / in_progress / completed / failed / cancelled
//   GET  /api/tasks/{id}/content      the file behind video_url
// video_url is a Vimo proxy address that downloads only with the same key, so
// the task keeps the gateway's own artifact address and the content is fetched
// with the channel credentials.
//
// Every video tier in the catalog is declared, per-call and per-second
// alike. Durations, ratios, resolutions, modes and reference limits follow
// GET /models; where a tier description disagrees with the catalog range, the
// catalog wins because Vimo validates against it.
//
// A video request carries reference material as public HTTPS URLs, each class
// in its own array: images, videos, audios. First and last frames are the
// two-image form of image mode and use their own fields. Fields Vimo does not
// declare are rejected with 422 rather than ignored, so only documented fields
// are ever sent. Uploaded files are refused here: Vimo reads the link itself.

const ASPECTS_2 = ["16:9", "9:16"];
const ASPECTS_3 = ["16:9", "9:16", "1:1"];
const ASPECTS_6 = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const MODES_ALL = ["text", "image", "reference"];
const MODES_TEXT_REF = ["text", "reference"];

// GET /models on 2026-11-10: the duration range, ratios, resolutions, modes
// and reference limits each video tier publishes. Vimo validates all of them,
// so the request is checked against this table before it is sent. The catalog
// is the only source of these ids; re-read it when a tier starts failing.
const VIDEO_MODELS = {
  "V-特价满血SD2.5-720": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_2, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "V-稳定seadanco2.5-720【主打】": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "V-稳定极速seadanco2.5-720-30图": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "V-seedance2.5-301010": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "JT-seedance-2.5【官转】": { min: 5, max: 30, resolutions: ["480P", "720P"], aspects: ASPECTS_2, modes: MODES_ALL, images: 30, audios: 10, videos: 10, perSecond: true },
  "V-极速seadnco2.5-720-301010": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_2, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "JT-seedance-2.5-v2": { min: 5, max: 30, resolutions: ["720P", "1080P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "I-Seedance2.0": { min: 15, max: 15, resolutions: ["480P"], aspects: ASPECTS_2, modes: MODES_ALL, images: 9, audios: 3, videos: 0 },
  "BB-Seedance2.5  301010": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_6, modes: MODES_ALL, images: 30, audios: 10, videos: 10 },
  "JT-seedance-2.5【稳定】": { min: 5, max: 30, resolutions: ["720P", "480P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 0, perSecond: true },
  "JT-seedance-2.5": { min: 5, max: 30, resolutions: ["480P", "720P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 10, perSecond: true },
  "JT-wan3-Prime": { min: 2, max: 30, resolutions: ["720P", "1080P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 10, audios: 5, videos: 5, perSecond: true },
  "JT-wan3-特惠": { min: 2, max: 30, resolutions: ["1080P"], aspects: ASPECTS_2, modes: MODES_ALL, images: 10, audios: 5, videos: 5 },
  "JT-wan3.0-超限": { min: 5, max: 30, resolutions: ["480P", "720P", "1080P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 10, audios: 5, videos: 0, perSecond: true },
  "JT-seedance-2.0-g4【满血】": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_6, modes: MODES_ALL, images: 9, audios: 3, videos: 3, perSecond: true },
  "JT-seedance2.0【官】": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_6, modes: MODES_ALL, images: 9, audios: 3, videos: 3 },
  "V-SD2.0": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_3, modes: MODES_TEXT_REF, images: 9, audios: 3, videos: 0 },
  "V-SD2.0【满血】": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_2, modes: MODES_TEXT_REF, images: 9, audios: 3, videos: 3 },
  "V-SD2.5【官方】【自家号池】": { min: 5, max: 30, resolutions: ["480P", "720P", "1080P"], aspects: ASPECTS_3, modes: MODES_ALL, images: 30, audios: 10, videos: 0, perSecond: true },
  "JT-seedance-2.5【总数不超30】": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_2, modes: MODES_TEXT_REF, images: 30, audios: 10, videos: 10 },
  "SD2.5-【超级特价】-JTv4": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_2, modes: MODES_TEXT_REF, images: 9, audios: 3, videos: 0 },
};

const VIDEO_MODEL_NAMES = Object.keys(VIDEO_MODELS);
const PER_SECOND_MODELS = VIDEO_MODEL_NAMES.filter((name) => VIDEO_MODELS[name].perSecond);

// Host task statuses as the OpenAI video object spells them.
const TASK_STATUS_NAMES = {
  QUEUED: "queued",
  SUBMITTED: "queued",
  IN_PROGRESS: "in_progress",
  SUCCESS: "completed",
  FAILURE: "failed",
};

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
// Every tier publishes its resolutions from this set, so one enum covers the
// whole catalog; the expression prices a resolution by comparing the fact.
const RESOLUTION_FIELD = {
  enum: ["480P", "720P", "1080P"],
  description: { en: "Output video resolution", zh: "输出视频分辨率" },
};

const PER_SECOND_VIDEO_USAGE = { seconds: SECONDS_FIELD, resolution: RESOLUTION_FIELD };
const PER_CALL_VIDEO_USAGE = { count: COUNT_FIELD, resolution: RESOLUTION_FIELD };

export const meta = {
  apiVersion: 1,
  key: "vimo",
  name: "Vimo",
  icon: "text:V",
  description: {
    en: "Video generation through Vimo AI",
    zh: "通过 Vimo AI 生成视频",
  },
  version: "1.3.0",
  author: { name: "Kiln" },
  website: "https://vimo.asia",
  baseUrl: "https://vimo.asia/api/v1",
  models: VIDEO_MODEL_NAMES,
  fetchMode: "per_task",
  // Union of both profiles, used for an alias that resolves to several models.
  // Examples are per profile; a plugin-level vector would have to cover both
  // billing quantities.
  usageSchema: Object.assign({}, PER_SECOND_VIDEO_USAGE, PER_CALL_VIDEO_USAGE),
  usageProfiles: [
    {
      models: PER_SECOND_MODELS,
      schema: PER_SECOND_VIDEO_USAGE,
      examples: [
        { label: "480P 10s", facts: { seconds: 10, resolution: "480P" } },
        { label: "720P 10s", facts: { seconds: 10, resolution: "720P" } },
      ],
    },
    {
      models: VIDEO_MODEL_NAMES.filter((name) => !PER_SECOND_MODELS.includes(name)),
      schema: PER_CALL_VIDEO_USAGE,
      examples: [{ label: "one video 720P", facts: { count: 1, resolution: "720P" } }],
    },
  ],
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function authHeaders(ctx) {
  return { "Content-Type": "application/json", Authorization: "Bearer " + ctx.apiKey };
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
  return Object.assign({}, metadata || {}, raw);
}

function videoModel(ctx) {
  const name = trimmed(ctx && (ctx.upstreamModel || ctx.model));
  const spec = VIDEO_MODELS[name];
  if (!spec) throw new Error((name || "model") + " is not a Vimo video model");
  return { name, spec };
}

function integerValue(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") throw new Error(label + " must be an integer");
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(number) || Math.trunc(number) !== number) throw new Error(label + " must be an integer");
  return number;
}

function videoSeconds(request, spec) {
  const given = integerValue(
    request.seconds !== undefined && request.seconds !== null && request.seconds !== "" ? request.seconds : request.duration,
    "seconds"
  );
  const seconds = given === undefined ? spec.min : given;
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

// The published ratio a pixel size stands for, or "" when none matches. Vimo
// matches size against its catalog by frame shape, not by an exact pixel pair,
// so 1680x720 is its "21:9".
function aspectFromSize(pixels, aspects) {
  const target = pixels.width / pixels.height;
  for (const aspect of aspects) if (Math.abs(ratioValue(aspect) - target) < 0.01) return aspect;
  return "";
}

// The frame ratio a client asked for: a named ratio, or pixels in `size`, which
// Vimo documents as equivalent to aspect_ratio. Sending both must agree.
function videoAspect(request, spec) {
  const explicit = trimmed(request.aspect_ratio || request.ratio);
  const pixels = sizePixels(request.size);
  const derived = pixels ? aspectFromSize(pixels, spec.aspects) : "";
  if (pixels && !derived) throw new Error("size must match one of " + spec.aspects.join(", "));
  if (explicit) {
    if (!spec.aspects.includes(explicit)) throw new Error("aspect_ratio must be one of " + spec.aspects.join(", "));
    if (derived && derived !== explicit) throw new Error("size and aspect_ratio disagree");
    return explicit;
  }
  return derived || spec.aspects[0];
}

// The resolution tier a pixel size falls in, or "" when the model publishes no
// tier at or below it.
function resolutionFromSize(pixels, spec) {
  for (const [name, shortSide] of [["1080P", 1080], ["720P", 720], ["480P", 480]]) {
    if (pixels.shortSide >= shortSide && spec.resolutions.includes(name)) return name;
  }
  return "";
}

// Vimo spells resolutions in upper case; a client may send either case. Size,
// ratio and resolution travel together and Vimo refuses a set that disagrees.
function videoResolution(request, spec) {
  const explicit = trimmed(request.resolution).toUpperCase();
  if (explicit && !spec.resolutions.includes(explicit)) throw new Error("resolution must be one of " + spec.resolutions.join(", "));
  const pixels = sizePixels(request.size);
  const derived = pixels ? resolutionFromSize(pixels, spec) : "";
  if (explicit && derived && derived !== explicit) throw new Error("size and resolution disagree");
  return explicit || derived || spec.resolutions[0];
}

// The fields each material class may arrive under, in the order a host request
// names them. The gateway mirrors one array under several aliases, so the first
// alias present wins and the same file is never counted twice.
const MATERIAL_FIELDS = {
  images: ["images", "image_urls", "reference_images", "reference_image_urls", "image", "image_url", "input_reference"],
  videos: ["videos", "video_urls", "reference_videos", "reference_video", "video", "video_url"],
  audios: ["audios", "audio_urls", "reference_audios", "reference_audio", "audio", "audio_url"],
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

// A first or last frame, as a public HTTPS URL.
function frameURL(request, name) {
  const value = request[name];
  if (value === undefined || value === null || value === "") return "";
  const url = absoluteURL(value);
  if (!url) throw new Error(name + " must be a public http or https URL");
  return url;
}

function limitMaterial(field, count, limit) {
  if (count <= limit) return;
  throw new Error(limit === 0 ? "this tier accepts no reference " + field : field + " accepts at most " + limit + " entries");
}

// One mode per request, checked against the modes the tier publishes: text with
// no material, image for first/last frames, reference for material arrays.
function videoMode(request, spec, hasMaterial, hasFrame) {
  const explicit = trimmed(request.mode).toLowerCase();
  if (explicit) {
    if (!spec.modes.includes(explicit)) throw new Error("mode must be one of " + spec.modes.join(", "));
    return explicit;
  }
  const mode = hasFrame ? "image" : hasMaterial ? "reference" : "text";
  if (!spec.modes.includes(mode)) throw new Error("this tier does not accept " + mode + " requests");
  return mode;
}

// The request Vimo documents for a video tier. Everything is validated here,
// before the vendor can charge for a request it would refuse.
function videoBody(ctx) {
  const request = flatRequest(ctx);
  const identity = videoModel(ctx);
  const spec = identity.spec;
  const prompt = trimmed(request.prompt);
  if (!prompt) throw new Error("field prompt is required");
  const images = materialURLs(request, "images");
  const videos = materialURLs(request, "videos");
  const audios = materialURLs(request, "audios");
  const firstFrame = frameURL(request, "first_frame");
  const lastFrame = frameURL(request, "last_frame");
  if (lastFrame && !firstFrame) throw new Error("last_frame requires first_frame");
  if ((firstFrame || lastFrame) && images.length + videos.length + audios.length > 0) {
    throw new Error("first_frame and last_frame cannot be combined with images, videos or audios");
  }
  const mode = videoMode(request, spec, images.length + videos.length + audios.length > 0, Boolean(firstFrame));
  if (mode === "text" && (images.length || videos.length || audios.length || firstFrame)) {
    throw new Error("text mode accepts no reference material");
  }
  if (mode === "image") {
    if (videos.length || audios.length) throw new Error("image mode accepts images only");
    limitMaterial("images", images.length, 2);
    if (!images.length && !firstFrame) throw new Error("image mode requires a first frame or two images");
  }
  if (mode === "reference") {
    if (!images.length && !videos.length && !audios.length) throw new Error("reference mode requires reference material");
    limitMaterial("images", images.length, spec.images);
    limitMaterial("videos", videos.length, spec.videos);
    limitMaterial("audios", audios.length, spec.audios);
  }
  const body = {
    model: identity.name,
    prompt,
    seconds: videoSeconds(request, spec),
    aspect_ratio: videoAspect(request, spec),
    resolution: videoResolution(request, spec),
    mode,
  };
  if (images.length) body.images = images;
  if (videos.length) body.videos = videos;
  if (audios.length) body.audios = audios;
  if (firstFrame) body.first_frame = firstFrame;
  if (lastFrame) body.last_frame = lastFrame;
  const action = mode === "text" ? "text_to_video" : mode === "image" ? "image_to_video" : "reference_to_video";
  return { body, action };
}

export function buildSubmitRequest(ctx) {
  const { body, action } = videoBody(ctx);
  // Replaying a submission with the same id returns the original task instead
  // of charging twice; Vimo limits the id to 64 characters.
  const requestId = trimmed(ctx.publicTaskId);
  if (requestId && requestId.length <= 64) body.client_request_id = requestId;
  return {
    url: ctx.baseUrl + "/videos/generations",
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

// Video facts come from the request this plugin sends, so a value merged from
// metadata is bounded exactly like a top-level one.
export function extractUsage(ctx) {
  const { spec } = videoModel(ctx);
  const request = flatRequest(ctx);
  // The resolution travels with the request, so the fact is the one the order
  // is sent with, defaults included.
  const resolution = videoResolution(request, spec);
  if (!spec.perSecond) return { count: 1, resolution };
  return { seconds: videoSeconds(request, spec), resolution };
}

// The terminal reply reports credits, not seconds, so the task settles on the
// facts reserved at submit.
export function extractUsageOnComplete() {
  return {};
}

export function buildQueryRequest(ctx) {
  const taskId = trimmed(ctx.taskId);
  if (!taskId) throw new Error("task id is required");
  return {
    url: ctx.baseUrl + "/videos/generations/" + encodeURIComponent(taskId),
    method: "GET",
    headers: authHeaders(ctx),
  };
}

export function parseTaskResult(_ctx, body) {
  if (!plainObject(body)) return { status: "UNKNOWN", reason: "unrecognized status" };
  const status = trimmed(body.status).toLowerCase();
  if (status === "queued") return { status: "QUEUED" };
  if (status === "in_progress") return { status: "IN_PROGRESS" };
  // No url: video_url is a credentialed Vimo address, so the host keeps its
  // own artifact address and buildContentRequest supplies the key.
  if (status === "completed") return { status: "SUCCESS" };
  if (status === "failed") {
    const error = body.error;
    const reason = typeof error === "string" ? trimmed(error) : trimmed(error && error.message);
    return { status: "FAILURE", reason: reason || "task failed" };
  }
  // completed, failed and cancelled are the terminal states; nothing cancels a
  // task without asking, so a cancelled one is reported as a failure.
  if (status === "cancelled") return { status: "FAILURE", reason: "task cancelled" };
  return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(body.status) };
}

export function buildProbeRequest(ctx) {
  return { url: ctx.baseUrl + "/models", method: "GET", headers: authHeaders(ctx) };
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  const method = (ctx.clientRequest && ctx.clientRequest.method) || "GET";
  const data = plainObject(ctx.data) || {};
  const url = absoluteURL(data.video_url);
  if (!url) throw new Error("artifact_not_found");
  // The proxy address is served only to the key that created the task.
  return { url, method, headers: { Authorization: "Bearer " + ctx.apiKey } };
}

// A multipart body as a flat field object. Every uploaded file is refused:
// Vimo takes reference material as a public URL only.
function flatBody(ctx) {
  const body = (ctx && ctx.body) || {};
  if (body.kind === "json") {
    const value = plainObject(body.value);
    if (!value) throw new Error("JSON object required");
    return value;
  }
  if (body.kind !== "multipart" && body.kind !== "form") throw new Error("JSON or multipart body required");
  if ((body.files || []).length) throw new Error("Vimo accepts reference material as a public URL, not an uploaded file");
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
      for (const image of input.images) if (!images.includes(image)) images.push(image);
      if (images.length) requestBody.images = images;
      for (const key of ["seconds", "duration", "size", "resolution", "aspect_ratio", "ratio"]) {
        if (Object.prototype.hasOwnProperty.call(req, key)) requestBody[key] = req[key];
      }
      return { kind: "submit", model: ctx.model, action: images.length ? "reference_to_video" : "text_to_video", requestBody };
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
        metadata: { vendor: "vimo" },
      };
    },
  },

  openai_video: {
    decodeRequest: function (ctx) {
      const body = Object.assign({}, flatBody(ctx), { model: ctx.model });
      // Validate before the vendor is charged for a request it will reject.
      const { action } = videoBody({ requestBody: body, model: ctx.model, upstreamModel: ctx.upstreamModel });
      return { kind: "submit", model: ctx.model, action, requestBody: body };
    },
    render: function (_ctx, task) {
      const data = plainObject(task.data) || {};
      const output = {
        id: task.task_id,
        object: "video",
        model: (task.properties || {}).origin_model_name || "",
        status: TASK_STATUS_NAMES[task.status] || "unknown",
        progress: Number(String(task.progress || "0").replace("%", "")),
        created_at: task.created_at,
      };
      const finished = Number(task.finished_at || task.updated_at || 0);
      if (finished > 0) output.completed_at = finished;
      if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: task.fail_reason || "the video generation task failed" };
      // video_url needs this channel's key, so it is not handed to callers.
      const body = Object.assign({}, data);
      delete body.video_url;
      return Object.assign(body, output);
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
