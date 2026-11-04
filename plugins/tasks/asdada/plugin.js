// Asdada bills every published video model once per request. Duration, aspect
// ratio, resolution and reference counts are validated here so an out-of-range
// value is rejected before the vendor charges. The live catalog is
// GET /v1/models on https://asdada.site.
const MODELS = {
  minimaxh3: { min: 4, max: 30, durations: [], resolutions: [], aspects: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], images: 0, videos: 0, audios: 0 },
  "sd2-933-720p-9:16": { min: 5, max: 15, durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutions: ["720p"], aspects: ["9:16"], images: 9, videos: 3, audios: 3 },
  "sd2.5-y": { min: 4, max: 30, durations: [], resolutions: ["720p"], aspects: ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], images: 30, videos: 10, audios: 10 },
  "seedance_v2.5": { min: 4, max: 30, durations: [], resolutions: [], aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"], images: 30, videos: 0, audios: 0 },
};

const ASPECT_BY_SIZE = {
  "1280x720": "16:9",
  "1920x1080": "16:9",
  "3840x2160": "16:9",
  "720x1280": "9:16",
  "1080x1920": "9:16",
  "2160x3840": "9:16",
  "720x720": "1:1",
  "1080x1080": "1:1",
  "1024x1024": "1:1",
};

export const meta = {
  apiVersion: 1,
  key: "asdada",
  name: "Asdada",
  icon: "text",
  description: {
    en: "Video generation through Asdada",
    zh: "通过 Asdada 生成视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  website: "https://asdada.site",
  baseUrl: "https://asdada.site",
  models: Object.keys(MODELS),
  fetchMode: "per_task",
  usageSchema: {
    count: {
      type: "number",
      unit: "count",
      unitLabel: { en: "generation", zh: "次" },
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
  },
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

function trimmed(value) {
  return String(value || "").trim();
}

function modelSpec(ctx) {
  const name = trimmed(ctx && (ctx.upstreamModel || ctx.model));
  const spec = MODELS[name];
  if (!spec) throw new Error((name || "model") + " is not a supported Asdada video model");
  return { name: name, spec: spec };
}

function integerSeconds(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") throw new Error("duration must be an integer");
  const seconds = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(seconds) || Math.trunc(seconds) !== seconds) throw new Error("duration must be an integer");
  return seconds;
}

function durationOf(req, spec) {
  const seconds = integerSeconds(req.duration !== undefined && req.duration !== null && req.duration !== "" ? req.duration : req.seconds);
  if (seconds === undefined) return undefined;
  if (spec.durations.length && !spec.durations.includes(seconds)) {
    throw new Error("duration must be one of " + spec.durations.join(", "));
  }
  if (seconds < spec.min || seconds > spec.max) throw new Error("duration must be between " + spec.min + " and " + spec.max);
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

function references(req, names, limit, label) {
  const values = [];
  for (const name of names) {
    for (const item of stringList(req[name])) {
      if (item.startsWith("data:")) throw new Error(label + " must be an asset id or an https URL");
      if (!values.includes(item)) values.push(item);
    }
  }
  if (values.length > limit) throw new Error(label + " accepts at most " + limit);
  return values;
}

function aspectOf(req, spec) {
  const explicit = trimmed(req.aspect_ratio || req.ratio);
  if (explicit) {
    if (!spec.aspects.includes(explicit)) throw new Error("aspect_ratio must be one of " + spec.aspects.join(", "));
    return explicit;
  }
  const size = trimmed(req.size);
  const fromSize = ASPECT_BY_SIZE[size] || (/^\d+:\d+$/.test(size) ? size : "");
  if (fromSize && spec.aspects.includes(fromSize)) return fromSize;
  if (spec.aspects.length === 1) return spec.aspects[0];
  return "";
}

function resolutionOf(req, spec) {
  if (!spec.resolutions.length) return "";
  const explicit = trimmed(req.resolution).toLowerCase();
  if (explicit) {
    if (!spec.resolutions.includes(explicit)) throw new Error("resolution must be one of " + spec.resolutions.join(", "));
    return explicit;
  }
  const size = trimmed(req.size);
  let derived = "";
  if (/x720$/.test(size) || /^720x/.test(size)) derived = "720p";
  else if (/x1080$/.test(size) || /^1080x/.test(size)) derived = "1080p";
  if (derived && spec.resolutions.includes(derived)) return derived;
  if (spec.resolutions.length === 1) return spec.resolutions[0];
  return "";
}

function videoBody(ctx) {
  const raw = (ctx && ctx.requestBody) || {};
  const meta = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const req = Object.assign({}, meta, raw);
  const identity = modelSpec(ctx);
  const prompt = trimmed(req.prompt);
  if (!prompt) throw new Error("field prompt is required");
  const body = { model: identity.name, prompt: prompt };
  const duration = durationOf(req, identity.spec);
  if (duration !== undefined) body.duration = duration;
  const aspect = aspectOf(req, identity.spec);
  if (aspect) body.aspect_ratio = aspect;
  const resolution = resolutionOf(req, identity.spec);
  if (resolution) body.resolution = resolution;
  const images = references(req, ["images", "image", "image_url", "image_urls"], identity.spec.images, "reference images");
  const videos = references(req, ["videos", "video_url", "video_urls"], identity.spec.videos, "reference videos");
  const audios = references(req, ["audios", "audio_url", "audio_urls"], identity.spec.audios, "reference audios");
  if (images.length) body.images = images;
  if (videos.length) body.videos = videos;
  if (audios.length) body.audios = audios;
  const negative = trimmed(req.negative_prompt);
  if (negative) body.negative_prompt = negative;
  return body;
}

function authHeader(ctx) {
  return { Authorization: "Bearer " + ctx.apiKey };
}

function absoluteURL(value) {
  const url = trimmed(value);
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

export function buildSubmitRequest(ctx) {
  if ((ctx.files || []).length) throw new Error("reference files must be asset ids or https URLs");
  const body = videoBody(ctx);
  const headers = authHeader(ctx);
  headers["Content-Type"] = "application/json";
  const taskId = trimmed(ctx.publicTaskId);
  if (taskId) headers["Idempotency-Key"] = taskId;
  return {
    url: ctx.baseUrl + "/v1/videos/generations",
    method: "POST",
    headers: headers,
    body: body,
    action: body.images || body.videos || body.audios ? "image_to_video" : "text_to_video",
  };
}

export function parseSubmitResponse(_ctx, resp) {
  const body = (resp && resp.body) || {};
  const taskId = trimmed(body.id || body.task_id);
  if (!taskId) throw new Error("task_id is empty");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  videoBody(ctx);
  return { count: 1 };
}

export function extractUsageOnComplete(ctx) {
  modelSpec(ctx);
  return { count: 1 };
}

export function buildProbeRequest(ctx) {
  return { url: ctx.baseUrl + "/v1/models", method: "GET", headers: authHeader(ctx) };
}

export function buildQueryRequest(ctx) {
  if (!trimmed(ctx.taskId)) throw new Error("task id is required");
  return { url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.taskId), method: "GET", headers: authHeader(ctx) };
}

export function parseTaskResult(_ctx, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "UNKNOWN", reason: "unrecognized status" };
  const status = String(body.status || "").toLowerCase();
  const progress = Number(body.progress);
  const result = {};
  if (Number.isFinite(progress) && progress >= 0 && progress <= 100) result.progress = Math.round(progress) + "%";
  if (status === "queued") return Object.assign(result, { status: "QUEUED" });
  if (status === "in_progress") return Object.assign(result, { status: "IN_PROGRESS" });
  if (status === "cancelled") return { status: "FAILURE", reason: "task cancelled" };
  if (status === "failed") {
    const error = body.error;
    const reason = typeof error === "string" ? trimmed(error) : error && trimmed(error.message);
    return { status: "FAILURE", reason: reason || "task failed" };
  }
  if (status === "completed") {
    result.status = "SUCCESS";
    const url = absoluteURL(body.video_url) || absoluteURL(body.download_url);
    if (url) result.url = url;
    return result;
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(body.status || "") };
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" ? [{ key: "video", type: "video" }] : [];
}

export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  const method = (ctx.clientRequest && ctx.clientRequest.method) || "GET";
  const data = ctx.data && typeof ctx.data === "object" && !Array.isArray(ctx.data) ? ctx.data : {};
  const url = absoluteURL(data.video_url) || absoluteURL(data.download_url);
  if (url) return { url: url, method: method, credentialless: true };
  if (!trimmed(ctx.upstreamTaskId)) throw new Error("artifact_not_found");
  return {
    url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.upstreamTaskId) + "/content",
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
      if (status === "FAILURE") return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx, _task) {
      return {
        output: [{ type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: responsesVideoText(ctx), annotations: [], logprobs: [] }] }],
        metadata: { vendor: "asdada" },
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
