// Moving charts between devices as a link. The payload is the same chart
// records the app already stores, compressed and packed into the fragment, so
// nothing leaves the device: a #fragment is never sent to the server.
import { isDefaultChart, newId, normalizeChart, safeJSONParse } from "./charts.js";

export const transferFormat = "transits-timeline/charts";
export const transferVersion = 1;
export const transferParam = "charts";

/** @param {any[]} charts */
export function buildPayload(charts){
  return {
    format: transferFormat,
    version: transferVersion,
    charts: charts.map((p) => {
      const c = normalizeChart(p);
      // isDefault marks the seeded sample, which is a local fact, not a chart.
      delete c.isDefault;
      return c;
    })
  };
}

// base64url: the fragment is a URL, and + / = do not survive being pasted
// into a message and clicked back out of one.
/** @param {Uint8Array} bytes */
function toBase64Url(bytes){
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} text @returns {Uint8Array} */
function fromBase64Url(text){
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {ReadableStream} stream */
async function drain(stream){
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Gzip where the browser has it, plain JSON where it does not. The result says
// which it is - gzip's two magic bytes - so a link built on one device always
// opens on the other.
/** @param {any[]} charts @returns {Promise<string>} */
export async function encodeCharts(charts){
  const json = JSON.stringify(buildPayload(charts));
  const bytes = new TextEncoder().encode(json);
  const Compression = /** @type {any} */ (globalThis).CompressionStream;
  if (typeof Compression !== "function") return toBase64Url(bytes);
  const packed = await drain(new Blob([bytes]).stream().pipeThrough(new Compression("gzip")));
  // Below a few hundred bytes gzip's header costs more than it saves.
  return toBase64Url(packed.length < bytes.length ? packed : bytes);
}

/** @param {string} encoded @returns {Promise<string>} */
async function decodeToText(encoded){
  const bytes = fromBase64Url(encoded);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const Decompression = /** @type {any} */ (globalThis).DecompressionStream;
  if (typeof Decompression !== "function") throw new Error("This browser can't unpack that link.");
  const raw = await drain(new Blob([bytes]).stream().pipeThrough(new Decompression("gzip")));
  return new TextDecoder().decode(raw);
}

/** @param {string} text @returns {any[]} */
export function parseCharts(text){
  const data = safeJSONParse(text, null);
  if (!data) throw new Error("That link is damaged.");
  const raw = Array.isArray(data) ? data : data.charts;
  if (!Array.isArray(raw)) throw new Error("That link has no charts in it.");
  if (!Array.isArray(data) && data.format && data.format !== transferFormat){
    throw new Error("That link came from a different app.");
  }
  const charts = raw
    .filter((p) => p && typeof p === "object" && (p.birthDate || p.date))
    .map((p) => {
      const c = normalizeChart(p);
      delete c.isDefault;
      return c;
    });
  if (charts.length === 0) throw new Error("That link has no charts in it.");
  return charts;
}

/** @param {string} encoded @returns {Promise<any[]>} */
export async function decodeCharts(encoded){
  let text;
  try {
    text = await decodeToText(encoded);
  } catch (err){
    throw new Error(err instanceof Error && /unpack/.test(err.message) ? err.message : "That link is damaged.");
  }
  return parseCharts(text);
}

/** @param {any[]} charts @param {string} base @returns {Promise<string>} */
export async function buildShareURL(charts, base){
  const url = new URL(base);
  url.hash = `${transferParam}=${await encodeCharts(charts)}`;
  return url.toString();
}

// What a link carries, or "" when it carries nothing of ours.
/** @param {string} hash */
export function readShareHash(hash){
  const raw = (hash || "").replace(/^#/, "");
  if (!raw.startsWith(`${transferParam}=`)) return "";
  return raw.slice(transferParam.length + 1);
}

// Pasted by hand on a phone: a whole URL, or just the fragment, with whatever
// whitespace came along for the ride.
/** @param {string} text */
export function readShareText(text){
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  const hash = trimmed.slice(trimmed.lastIndexOf("#") + 1);
  return readShareHash(`#${hash}`);
}

// What makes two records the same chart to a human: same person, same moment,
// same place. Ids don't survive a round trip through two devices.
function identityOf(p){
  return [
    (p.name || "").trim().toLowerCase(),
    p.birthDate, p.birthTime,
    (+p.lon).toFixed(4), (+p.lat).toFixed(4)
  ].join("|");
}

// Merge is additive and never edits an existing chart: a chart already here
// wins, and anything genuinely new arrives with an id that can't collide.
/**
 * @param {any[]} existing @param {any[]} incoming
 * @returns {{ list: any[], added: any[], duplicates: any[] }}
 */
export function mergeCharts(existing, incoming){
  // The seeded sample is a placeholder; a real import replaces it.
  const base = (existing.length === 1 && isDefaultChart(existing[0])) ? [] : existing.slice();
  const seen = new Set(base.map(identityOf));
  const ids = new Set(base.map((p) => p.id));
  const added = [];
  const duplicates = [];
  for (const chart of incoming){
    const key = identityOf(chart);
    if (seen.has(key)){
      duplicates.push(chart);
      continue;
    }
    seen.add(key);
    const c = { ...chart, id: ids.has(chart.id) ? newId() : chart.id };
    ids.add(c.id);
    base.push(c);
    added.push(c);
  }
  return { list: base, added, duplicates };
}
