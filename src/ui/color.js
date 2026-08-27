// Mixing for the bar gradients and their outlines. Hex only, and deliberately
// so: the aspect palette is hex, and a colour that arrives as var(--something)
// cannot be mixed here - callers check isHexColor and fall back to a flat fill.

/** @param {string} c */
export function isHexColor(c){
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

/** @param {string} hex @param {[number,number,number]} target @param {number} amount */
function mix(hex, target, amount){
  const t = Math.min(1, Math.max(0, amount));
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = channels.map((c, i) => Math.round(c + (target[i] - c) * t));
  return `#${out.map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

/** @param {string} hex @param {number} amount */
export const lighten = (hex, amount) => mix(hex, [255, 255, 255], amount);

/** @param {string} hex @param {number} amount */
export const darken = (hex, amount) => mix(hex, [0, 0, 0], amount);
