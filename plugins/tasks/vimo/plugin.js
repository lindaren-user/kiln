// Vimo AI open API (https://vimo.asia/developers). One key serves every model
// on the site, and a video is a task:
//   POST /videos/generations          create (201)
//   GET  /videos/generations/{id}     queued / in_progress / completed / failed
//   GET  /api/tasks/{id}/content      the file behind video_url
// video_url is a Vimo proxy address that downloads only with the same key, so
// the task keeps the gateway's own artifact address and the content is fetched
// with the channel credentials.
//
// Every Seedance video tier in the catalog is declared, per-call and per-second
// alike. Durations, ratios and resolutions follow GET /models; where a tier
// description disagrees with the catalog range, the catalog wins because Vimo
// validates against it.
//
// Reference material is a single public HTTPS URL in input_reference. Vimo
// accepts no uploaded files, so file placeholders are refused here.

const ASPECTS_3 = ["16:9", "9:16", "1:1"];
const ASPECTS_6 = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

const VIDEO_MODELS = {
  "v6k-seadanco2-5-720-2": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "v6k-seadanco2-5-720-30": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "v6k-kkseadanco2-5": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "gway-seedance-2-5-g5-v2": { min: 5, max: 30, resolutions: ["720P", "1080P"], aspects: ASPECTS_3 },
  "jijiu-full-sd2-5-30-10": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "jijiu-SD2.5特价301010线路一": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "langzhen-SD2.5满参真人脸/4.9-720P": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "langzhen-sd2-5-m": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_3 },
  "image2pro-seedance2-0": { min: 15, max: 15, resolutions: ["480P"], aspects: ["16:9", "9:16"] },
  "blobdraw-Seedance2.5-HH渠道A": { min: 5, max: 30, resolutions: ["720P"], aspects: ASPECTS_6 },
  "langzhen-sd2-0-b-903": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_3 },
  "gway-seedance2-0-g5-v2": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_6 },
  "langzhen-sd2-0-933-f-720p": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_3 },
  "langzhen-sd2-0-933": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_3 },
  "gway-seedance-2-0-g4": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_6, perSecond: true },
  "SD-2.5-M8支持真人满血": { min: 5, max: 30, resolutions: ["480P", "720P", "1080P"], aspects: ASPECTS_3, perSecond: true },
  "gway-seedance-2-5-g2-1": { min: 5, max: 30, resolutions: ["720P", "480P"], aspects: ASPECTS_3, perSecond: true },
  "gway-seedance-2-5-g4": { min: 5, max: 30, resolutions: ["480P", "720P"], aspects: ASPECTS_3, perSecond: true },
  "gway-seedance-2-5-g1": { min: 5, max: 30, resolutions: ["480P", "720P"], aspects: ASPECTS_3, perSecond: true },
  "jijiu-full-seedance-2-5-d": { min: 4, max: 30, resolutions: ["720P"], aspects: ASPECTS_3, perSecond: true },
  "jijiu-SD2.0特价稳定903z": { min: 5, max: 15, resolutions: ["720P"], aspects: ASPECTS_3, perSecond: true },
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

export const meta = {
  apiVersion: 1,
  key: "vimo",
  name: "Vimo",
  icon: "text:V",
  description: {
    en: "Video generation through Vimo AI",
    zh: "通过 Vimo AI 生成视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  website: "https://vimo.asia",
  baseUrl: "https://vimo.asia/api/v1",
  models: VIDEO_MODEL_NAMES,
  fetchMode: "per_task",
  // Union of both profiles, used for an alias that resolves to several models.
  // Examples are per profile; a plugin-level vector would have to cover both
  // billing quantities.
  usageSchema: { count: COUNT_FIELD, seconds: SECONDS_FIELD },
  usageProfiles: [
    {
      models: PER_SECOND_MODELS,
      schema: { seconds: SECONDS_FIELD },
      examples: [{ label: "720P 10s", facts: { seconds: 10 } }],
    },
    {
      models: VIDEO_MODEL_NAMES.filter((name) => !PER_SECOND_MODELS.includes(name)),
      schema: { count: COUNT_FIELD },
      examples: [{ label: "one video 720P", facts: { count: 1 } }],
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

function gcd(a, b) {
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
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

// A WIDTHxHEIGHT size as the ratio Vimo publishes, or "" when it is not one.
function ratioFromSize(size) {
  const pixels = sizePixels(size);
  if (!pixels) return "";
  const divisor = gcd(pixels.width, pixels.height);
  return pixels.width / divisor + ":" + pixels.height / divisor;
}

// The frame ratio a client asked for: a named ratio, or pixels in `size`, which
// Vimo documents as equivalent to aspect_ratio.
function videoAspect(request, spec) {
  const explicit = trimmed(request.aspect_ratio || request.ratio);
  const candidate = explicit || ratioFromSize(request.size);
  if (candidate) {
    if (!spec.aspects.includes(candidate)) throw new Error("aspect_ratio must be one of " + spec.aspects.join(", "));
    return candidate;
  }
  return spec.aspects[0];
}

// Vimo spells resolutions in upper case; a client may send either case.
function videoResolution(request, spec) {
  const explicit = trimmed(request.resolution).toUpperCase();
  if (explicit) {
    if (!spec.resolutions.includes(explicit)) throw new Error("resolution must be one of " + spec.resolutions.join(", "));
    return explicit;
  }
  const pixels = sizePixels(request.size);
  if (pixels) {
    if (pixels.shortSide >= 1080 && spec.resolutions.includes("1080P")) return "1080P";
    if (pixels.shortSide >= 720 && spec.resolutions.includes("720P")) return "720P";
    if (pixels.shortSide >= 480 && spec.resolutions.includes("480P")) return "480P";
  }
  return spec.resolutions[0];
}

// The single reference Vimo accepts, as a public HTTPS URL. Uploaded files are
// refused: Vimo reads the link itself.
function referenceURL(request) {
  for (const name of ["input_reference", "reference_images", "reference_image_urls", "images", "image", "image_url", "image_urls"]) {
    const value = request[name];
    if (value === undefined || value === null || value === "") continue;
    let found = "";
    for (const item of Array.isArray(value) ? value : [value]) {
      const url = absoluteURL(item);
      if (!url) throw new Error("input_reference must be a public http or https URL");
      if (!found) found = url;
      else if (found !== url) throw new Error("Vimo accepts a single input_reference");
    }
    if (found) return found;
  }
  return "";
}

// The request Vimo documents for a video tier. Everything is validated here,
// before the vendor can charge for a request it would refuse.
function videoBody(ctx) {
  const request = flatRequest(ctx);
  const identity = videoModel(ctx);
  const spec = identity.spec;
  const prompt = trimmed(request.prompt);
  if (!prompt) throw new Error("field prompt is required");
  const body = {
    model: identity.name,
    prompt,
    seconds: videoSeconds(request, spec),
    aspect_ratio: videoAspect(request, spec),
    resolution: videoResolution(request, spec),
  };
  const reference = referenceURL(request);
  if (reference) body.input_reference = reference;
  return { body, action: reference ? "image_to_video" : "text_to_video" };
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
  if (!spec.perSecond) return { count: 1 };
  return { seconds: videoSeconds(flatRequest(ctx), spec) };
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
      return { kind: "submit", model: ctx.model, action: images.length ? "image_to_video" : "text_to_video", requestBody };
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
    referenceImages: { max: 1, field: "images", encoding: "dataUrl" },
  };
});
