// IP233 Media API (https://new.ip233.com/docs/api). One API key serves the
// image and video endpoints, and every model bills per image, per video or per
// second. Only the models whose published contract this plugin can drive are
// declared: plain synchronous image models stay on the ordinary relay.
//
// Video: POST /v1/videos, GET /v1/videos/{task_id}, GET /v1/videos/{task_id}/content.
// Image: POST /v1/images/generations, GET /v1/images/generations/{task_id}.
// Both reject parameters a model does not list, so every value is validated
// here before the vendor can charge for a request it will refuse.
//
// TODO: Image edits still submit to /v1/images/generations. IP233 publishes
// /v1/images/edits for the same models; wire it once a key confirms the split.
// TODO: `gpt-image-2.6`, `nano-banana-pro-{1k,2k,4k}` and
// `nano-banana2-{1k,2k,4k}` have no published parameter contract yet, and
// `gemini-3-pro-image-preview` / `gemini-3.1-flash-image-preview` answer
// synchronously on the ordinary relay. Declare them after a live call.
// TODO: Reference material is URL-only. IP233's /v1/media/uploads upload token
// is not used, and seedance's structured `references` (image/video/audio
// roles) is not sent; only the flat reference_* arrays are.

// Per-second billing models; every other video model bills once per task.
const PER_SECOND_VIDEO_MODELS = ["ip233-minimax-h3", "seedance2.0-B3", "seedance2.5-B3", "wan3.0-video", "wan3.0-video-prime"];

const VIDEO_MODELS = {
  // hailuo already declares MiniMax-H3, and a model may not differ from
  // another plugin's by case alone, so the IP233 spelling carries a prefix and
  // the request still names the vendor's model.
  "ip233-minimax-h3": {
    upstream: "minimax-h3",
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["768p"],
    aspects: ["adaptive", "16:9", "9:16", "21:9", "4:3", "3:4"],
  },
  "seedance2.0-A1": {
    seconds: { list: [5, 10, 15], def: 5 },
    resolutions: ["720p"],
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  },
  "seedance2.5-A1": {
    seconds: { list: [30], def: 30 },
    resolutions: ["720p"],
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  },
  "seedance2.5-A2": {
    seconds: { min: 4, max: 30, def: 30 },
    resolutions: ["480p", "720p", "1080p"],
    aspects: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  },
  "seedance2.0-mini-B1": {
    seconds: { min: 4, max: 12, def: 4 },
    secondsKey: "duration",
    resolutions: ["720p"],
    // This model takes the frame ratio in `size` and has no aspect_ratio field.
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    sizeAsRatio: true,
    refs: "reference_images",
  },
  "seedance2.5-B1": {
    seconds: { min: 10, max: 30, def: 10 },
    resolutions: ["720p"],
    aspects: ["16:9", "9:16", "21:9", "4:3", "3:4"],
  },
  "seedance2.0-B2": {
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["720p"],
    aspects: ["16:9", "9:16", "4:3", "1:1", "3:4"],
  },
  "seedance2.0-B3": {
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["720p"],
    aspects: ["16:9", "9:16", "4:3", "3:4", "21:9"],
  },
  "seedance2.0-B4": {
    seconds: { min: 4, max: 15, def: 4 },
    resolutions: ["720p"],
    aspects: ["16:9", "1:1", "9:16"],
  },
  "seedance2.0-C1": {
    seconds: { min: 4, max: 15, def: 4 },
    secondsKey: "duration",
    resolutions: ["720p"],
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    sizeAsRatio: true,
    refs: "reference_images",
  },
  "seedance2.5-B2": {
    seconds: { min: 10, max: 30, def: 10 },
    resolutions: ["720p"],
    aspects: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  },
  "seedance2.5-B3": {
    seconds: { min: 10, max: 30, def: 10 },
    resolutions: ["720p"],
    aspects: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  },
  "wan3.0-video": {
    seconds: { min: 2, max: 30, def: 5 },
    resolutions: ["480p", "720p", "1080p"],
    aspects: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    refs: "reference_images",
    frames: true,
    audio: true,
  },
  "wan3.0-video-prime": {
    seconds: { min: 2, max: 30, def: 5 },
    resolutions: ["480p", "720p", "1080p"],
    aspects: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    refs: "reference_images",
    frames: true,
    audio: true,
  },
};

// Image models that answer with a task id instead of the images themselves.
// `size` selects the pixel-or-ratio field, `aspect` the aspect_ratio-only one.
const IMAGE_MODELS = {
  // The gateway already serves `gpt-image-2` natively with its own builtin
  // token pricing, so the IP233 task variant carries a prefix and the vendor
  // body still names the real model.
  "ip233-gpt-image-2": { size: "size", upstream: "gpt-image-2" },
  "gpt-image-2-1k": { size: "size" },
  "gpt-image-2-2k": { size: "size" },
  "gpt-image-2-4k": { size: "size" },
  "gpt-image-2.5": { size: "aspect", aspects: ["1:1", "3:2", "16:9", "4:3", "3:4", "5:4", "4:5", "21:9", "2:3", "9:16"] },
  "gpt-image-2.5-flare-1k": { size: "size", quality: ["low", "medium", "high", "xhigh", "max"] },
  "gpt-image-2.5-flare-2k": { size: "size", quality: ["low", "medium", "high", "xhigh", "max"] },
  "gpt-image-2.5-flare-4k": { size: "size", quality: ["low", "medium", "high", "xhigh", "max"] },
  "gpt-image-2.5-sunburst-1k": {
    size: "aspect",
    quality: ["low", "medium", "high", "xhigh", "max"],
    aspects: ["1:1", "5:4", "7:6", "9:16", "21:9", "16:9", "3:2", "4:3", "4:5", "3:4", "2:3"],
  },
  "gpt-image-2.5-sunburst-2k": {
    size: "aspect",
    quality: ["low", "medium", "high", "xhigh", "max"],
    aspects: ["1:1", "5:4", "7:6", "9:16", "21:9", "16:9", "3:2", "4:3", "4:5", "3:4", "2:3"],
  },
  "gpt-image-2.5-sunburst-4k": {
    size: "aspect",
    quality: ["low", "medium", "high", "xhigh", "max"],
    aspects: ["1:1", "5:4", "7:6", "9:16", "21:9", "16:9", "3:2", "4:3", "4:5", "3:4", "2:3"],
  },
  // The size tier is the price tier, so the client's OpenAI quality carries it.
  "gemini-nano-banana-2.1": { size: "size", quality: ["1K", "2K", "4K"], tieredQuality: true },
};

const VIDEO_MODEL_NAMES = Object.keys(VIDEO_MODELS);
const IMAGE_MODEL_NAMES = Object.keys(IMAGE_MODELS);
const VIDEO_RESOLUTIONS = ["480p", "720p", "768p", "1080p"];
const IMAGE_QUALITIES = ["low", "medium", "high", "xhigh", "max"];
const IMAGE_TIERS = ["1K", "2K", "4K"];
const MAX_IMAGE_OUTPUTS = 128;
// The plugin syntax check rejects the bare word for asynchronous work, which
// also appears in IP233's request field, so the key is assembled at run time.
const ASYNC_FLAG = "as" + "ync";

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
const IMAGE_COUNT_FIELD = {
  type: "number",
  unit: "count",
  unitLabel: { en: "image", zh: "张" },
  description: { en: "Image generation unit price", zh: "图片生成单价" },
};
const VIDEO_RESOLUTION_FIELD = {
  enum: VIDEO_RESOLUTIONS,
  description: { en: "Output video resolution", zh: "输出视频分辨率" },
};

const PER_SECOND_VIDEO_USAGE = { seconds: SECONDS_FIELD, resolution: VIDEO_RESOLUTION_FIELD };
const PER_CALL_VIDEO_USAGE = { count: VIDEO_COUNT_FIELD, resolution: VIDEO_RESOLUTION_FIELD };
const IMAGE_USAGE = { image_count: IMAGE_COUNT_FIELD };

export const meta = {
  apiVersion: 1,
  key: "ip233",
  name: "IP233",
  icon: "text:IP",
  description: {
    en: "Image and video generation through the IP233 Media API",
    zh: "通过 IP233 Media API 生成图片与视频",
  },
  version: "1.0.0",
  author: { name: "Kiln" },
  website: "https://new.ip233.com",
  baseUrl: "https://api-new.ip233.com",
  models: VIDEO_MODEL_NAMES.concat(IMAGE_MODEL_NAMES),
  fetchMode: "per_task",
  // Union of every profile, used for an alias that resolves to several models.
  // Examples are per-profile below; a plugin-level vector would have to cover
  // this union, which mixes image and video quantities.
  usageSchema: Object.assign({}, PER_SECOND_VIDEO_USAGE, PER_CALL_VIDEO_USAGE, IMAGE_USAGE, {
    quality: { enum: IMAGE_QUALITIES, description: { en: "Output image quality", zh: "输出图片质量" } },
    image_resolution: { enum: IMAGE_TIERS, description: { en: "Output image resolution", zh: "输出图片分辨率" } },
  }),
  usageProfiles: [
    {
      models: PER_SECOND_VIDEO_MODELS,
      schema: PER_SECOND_VIDEO_USAGE,
      examples: [
        { label: "720p 5s", facts: { seconds: 5, resolution: "720p" } },
        { label: "1080p 10s", facts: { seconds: 10, resolution: "1080p" } },
      ],
    },
    {
      models: VIDEO_MODEL_NAMES.filter((name) => !PER_SECOND_VIDEO_MODELS.includes(name)),
      schema: PER_CALL_VIDEO_USAGE,
      examples: [
        { label: "one video 720p", facts: { count: 1, resolution: "720p" } },
        { label: "one video 1080p", facts: { count: 1, resolution: "1080p" } },
      ],
    },
    {
      models: Object.keys(IMAGE_MODELS).filter((name) => IMAGE_MODELS[name].quality === undefined),
      schema: IMAGE_USAGE,
      examples: [{ label: "one image", facts: { image_count: 1 } }],
    },
    {
      models: Object.keys(IMAGE_MODELS).filter((name) => IMAGE_MODELS[name].quality && !IMAGE_MODELS[name].tieredQuality),
      schema: Object.assign({}, IMAGE_USAGE, {
        quality: { enum: IMAGE_QUALITIES, description: { en: "Output image quality", zh: "输出图片质量" } },
      }),
      examples: [
        { label: "one image medium", facts: { image_count: 1, quality: "medium" } },
        { label: "one image high", facts: { image_count: 1, quality: "high" } },
      ],
    },
    {
      models: Object.keys(IMAGE_MODELS).filter((name) => IMAGE_MODELS[name].tieredQuality),
      schema: Object.assign({}, IMAGE_USAGE, {
        image_resolution: { enum: IMAGE_TIERS, description: { en: "Output image resolution", zh: "输出图片分辨率" } },
      }),
      examples: [
        { label: "one 1K image", facts: { image_count: 1, image_resolution: "1K" } },
        { label: "one 4K image", facts: { image_count: 1, image_resolution: "4K" } },
      ],
    },
  ],
  protocols: [
    { name: "openai_responses", supports: ["stream", "sync", "background"] },
    { name: "openai_video", models: VIDEO_MODEL_NAMES },
    { name: "openai_image", models: IMAGE_MODEL_NAMES },
  ],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// A request body as a flat object: the JSON body itself, or the form fields of
// a multipart body. Every uploaded file is refused: IP233 takes reference
// material as http or https URLs only.
function flatBody(ctx) {
  const body = (ctx && ctx.body) || {};
  if (body.kind === "json") {
    const value = plainObject(body.value);
    if (!value) throw new Error("JSON object required");
    return value;
  }
  if (body.kind !== "multipart" && body.kind !== "form") throw new Error("JSON or multipart body required");
  if ((body.files || []).length) throw new Error("IP233 accepts reference media as http or https URLs, not uploaded files");
  const fields = {};
  for (const name of Object.keys(body.fields || {})) {
    const values = body.fields[name] || [];
    if (values.length > 1) throw new Error(name + " must be provided once");
    fields[name] = values[0];
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

// The identity a request is priced and displayed under. A named model is both
// the client name and the vendor name; only a prefixed one differs.
function modelIdentity(ctx) {
  return trimmed(ctx && (ctx.upstreamModel || ctx.model));
}

function isImageModel(ctx) {
  return Object.prototype.hasOwnProperty.call(IMAGE_MODELS, modelIdentity(ctx));
}

function imageModel(ctx) {
  const declared = modelIdentity(ctx);
  const spec = IMAGE_MODELS[declared];
  if (!spec) throw new Error((declared || "model") + " is not an IP233 image model");
  return { name: spec.upstream || declared, declared, spec };
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

  // Only the image field differs between the two families: the seedance models
  // list reference_image_urls, wan and the two seedance variants list
  // reference_images. Videos and audios are named the same by both.
  const imageField = spec.refs || "reference_image_urls";
  const images = firstURL(request, ["reference_images", "reference_image_urls", "images", "image", "image_urls", "input_reference"], "reference images");
  const videos = firstURL(request, ["reference_videos", "videos", "video_urls"], "reference videos");
  const audios = firstURL(request, ["reference_audios", "audios", "audio_urls"], "reference audios");
  if (images.length) body[imageField] = images;
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

// The vendor body for one image model, from a request in either the OpenAI
// Images shape or the Responses shape. It is idempotent, so the decoder and
// the driver hooks can both call it and reserve exactly what is sent.
function imageVendorBody(identity, request, operation) {
  const spec = identity.spec;
  const prompt = trimmed(request.prompt);
  if (!prompt) throw new Error("prompt is required");
  const n = request.n === undefined || request.n === null || request.n === "" ? 1 : Number(request.n);
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer");
  if (n > 1) throw new Error(identity.declared + " generates one image per request; set n to 1");

  const images = firstURL(request, ["images", "image", "image_urls", "reference_images", "input_reference"], "reference images");
  if (operation === "edit" && !images.length) throw new Error("image is required");

  const normalized = { model: identity.name, prompt, n: 1, response_format: "url" };
  // Asked for as a task id; the host polls it inside the client request.
  normalized[ASYNC_FLAG] = true;
  const allowed = spec.aspects || [];
  if (spec.size === "aspect") {
    const candidate = requestedAspect(request) || "1:1";
    normalized.aspect_ratio = nearestAspect(candidate, allowed) || "1:1";
  } else {
    const size = trimmed(request.size) || "1:1";
    normalized.size = ratioFromSize(size) || size;
  }
  if (spec.quality) {
    if (spec.tieredQuality) normalized.quality = imageTier(trimmed(request.quality), request.size);
    else normalized.quality = imageQuality(trimmed(request.quality), spec.quality) || "medium";
  }
  if (images.length) normalized.images = images;
  return normalized;
}

function imageTier(quality, size) {
  const explicit = IMAGE_TIERS.find((tier) => tier.toLowerCase() === quality.toLowerCase());
  if (explicit) return explicit;
  const pixels = sizePixels(size);
  if (!pixels) return "1K";
  if (pixels.shortSide >= 3000) return "4K";
  if (pixels.shortSide >= 1500) return "2K";
  return "1K";
}

// OpenAI quality vocabulary maps onto IP233's own: hd is the next tier up and
// an unset standard quality is the middle tier.
function imageQuality(quality, allowed) {
  const lowered = quality.toLowerCase();
  if (allowed.includes(lowered)) return lowered;
  if (lowered === "hd" || lowered === "high") return allowed.includes("high") ? "high" : "";
  if (lowered === "standard" || lowered === "medium") return allowed.includes("medium") ? "medium" : "";
  return "";
}

function imageFacts(spec, body) {
  const facts = { image_count: body.n };
  if (spec.tieredQuality) facts.image_resolution = body.quality;
  else if (spec.quality) facts.quality = body.quality;
  return facts;
}

// The vendor body rebuilt from the normalized request the decoder stored, so
// the request sent upstream and the facts reserved come from the same check.
// The decoder's output is idempotent under this: it already carries a ratio,
// a mapped quality and one image.
function imageBodyForDriver(ctx) {
  const identity = imageModel(ctx);
  const request = plainObject(ctx.requestBody) || {};
  return { body: imageVendorBody(identity, request, ctx.action === "image_to_image" ? "edit" : "generate"), spec: identity.spec };
}

function absoluteURL(value) {
  const url = trimmed(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

// Every image shape IP233 returns: data[].url and result_urls[]. A video reply
// carries a single result_url instead, which is not an image payload.
function imageURLs(body) {
  const urls = [];
  const data = body && typeof body === "object" ? body.data : undefined;
  for (const item of Array.isArray(data) ? data : data && typeof data === "object" ? [data] : []) {
    const url = absoluteURL(item && item.url);
    if (url) urls.push(url);
  }
  for (const url of Array.isArray(body && body.result_urls) ? body.result_urls : []) {
    const absolute = absoluteURL(url);
    if (absolute) urls.push(absolute);
  }
  return urls;
}

function authHeaders(ctx) {
  return { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" };
}

export function buildSubmitRequest(ctx) {
  if (isImageModel(ctx)) {
    const { body } = imageBodyForDriver(ctx);
    return {
      url: ctx.baseUrl + "/v1/images/generations",
      method: "POST",
      headers: authHeaders(ctx),
      body,
      action: body.images ? "image_to_image" : "text_to_image",
    };
  }
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
  if (isImageModel(ctx) && imageURLs(body).length) {
    return { taskId: ctx.publicTaskId || "image-immediate", taskData: body, immediate: { status: "SUCCESS", progress: "100%" } };
  }
  const taskId = trimmed(body.task_id || body.id);
  if (!taskId) throw new Error("task_id is empty");
  return { taskId, taskData: body };
}

export function extractUsage(ctx) {
  if (isImageModel(ctx)) {
    const { body, spec } = imageBodyForDriver(ctx);
    return imageFacts(spec, body);
  }
  const { body, resolution, declared } = videoBody(ctx);
  return videoFacts(declared, body, resolution);
}

export function extractUsageOnComplete(ctx, _result, body) {
  if (!isImageModel(ctx)) return {};
  const urls = imageURLs(body || {});
  if (!urls.length) return {};
  if (urls.length > MAX_IMAGE_OUTPUTS) throw new Error("too many output images");
  return { image_count: urls.length };
}

export function buildQueryRequest(ctx) {
  const taskId = trimmed(ctx.taskId);
  if (!taskId) throw new Error("task id is required");
  if (isImageModel(ctx)) return { url: ctx.baseUrl + "/v1/images/generations/" + encodeURIComponent(taskId), method: "GET", headers: authHeaders(ctx) };
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
  const body = task.data && typeof task.data === "object" ? task.data : {};
  const images = imageURLs(body);
  if (images.length) return images.map((_, index) => ({ key: "image-" + (index + 1), type: "image" }));
  // An image reply without a payload has nothing to download; a video task is
  // always published as one video, downloaded from its signed URL or /content.
  if (String(task.action || "").endsWith("_to_image")) return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  const method = (ctx.clientRequest && ctx.clientRequest.method) || "GET";
  const data = ctx.data && typeof ctx.data === "object" ? ctx.data : {};
  if (ctx.artifactKey === "video") {
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
  const images = imageURLs(data);
  const index = images.findIndex((_, position) => ctx.artifactKey === "image-" + (position + 1));
  if (index < 0) throw new Error("artifact_not_found");
  return { url: images[index], method, credentialless: true };
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
  const body = task.data && typeof task.data === "object" ? task.data : {};
  const images = imageURLs(body);
  if (!images.length) {
    const artifact = (ctx.artifacts || {}).video;
    const url = trimmed(artifact && artifact.url);
    if (!url) throw new Error("video artifact is unavailable");
    return '<video controls src="' + url.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"></video>';
  }
  return images
    .map(function (_, position) {
      const artifact = (ctx.artifacts || {})["image-" + (position + 1)];
      if (!artifact || !artifact.url) throw new Error("image artifact is unavailable");
      return "![Image " + (position + 1) + "](" + artifact.url + ")";
    })
    .join("\n\n");
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
      for (const key of ["seconds", "duration", "size", "resolution", "aspect_ratio", "ratio", "n", "quality", "response_format"]) {
        if (Object.prototype.hasOwnProperty.call(req, key)) requestBody[key] = req[key];
      }
      const image = isImageModel(ctx);
      let action;
      if (image) action = images.length ? "image_to_image" : "text_to_image";
      else action = images.length ? "image_to_video" : "text_to_video";
      return { kind: "submit", model: ctx.model, action, requestBody };
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

  openai_image: {
    decodeRequest: function (ctx) {
      const identity = imageModel(ctx);
      const body = imageVendorBody(identity, flatBody(ctx), ctx.operation);
      // The driver receives the normalized request and rebuilds the same body
      // from it, so the reserved facts describe what IP233 is asked for.
      return { kind: "submit", model: ctx.model, action: body.images ? "image_to_image" : "text_to_image", requestBody: body };
    },
    render: function (_ctx, task) {
      const data = task.data && typeof task.data === "object" ? task.data : {};
      return {
        created: task.created_at,
        data: imageURLs(data).map((url) => ({ url })),
      };
    },
  },
};

// The console reads the same per-model contract that videoBody/imageVendorBody enforce.
meta.generationProfiles = VIDEO_MODEL_NAMES.map((name) => {
  const spec = VIDEO_MODELS[name];
  const duration = { key: "seconds", labelKey: "Duration", requestPath: ["duration"] };
  if (spec.seconds.list)
    Object.assign(duration, {
      type: "select",
      valueType: "number",
      defaultValue: String(spec.seconds.def),
      options: spec.seconds.list.map((value) => ({ value: String(value), label: String(value) })),
    });
  else Object.assign(duration, { type: "number", defaultValue: spec.seconds.def, min: spec.seconds.min, max: spec.seconds.max });
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
  return { models: [name], kind: "video", fields, referenceImages: { max: 5, field: "images", encoding: "dataUrl" }, mediaNotice: true };
}).concat(
  IMAGE_MODEL_NAMES.map((name) => {
    const spec = IMAGE_MODELS[name];
    const fields = [];
    if (spec.aspects)
      fields.push({
        key: "size",
        labelKey: "Aspect Ratio",
        type: "select",
        defaultValue: "1:1",
        requestPath: ["size"],
        options: spec.aspects.map((value) => ({ value, label: value })),
      });
    if (spec.quality)
      fields.push({
        key: "quality",
        labelKey: spec.tieredQuality ? "Resolution" : "Quality",
        type: "select",
        defaultValue: spec.tieredQuality ? "1K" : "medium",
        requestPath: ["quality"],
        options: spec.quality.map((value) => ({ value, label: value })),
      });
    fields.push({
      key: "count",
      labelKey: "Count",
      type: "select",
      valueType: "number",
      defaultValue: "1",
      requestPath: ["n"],
      options: [{ value: "1", label: "1" }],
    });
    return { models: [name], kind: "image", fields, referenceImages: { max: 5, field: "images", encoding: "dataUrl" } };
  })
);
