// Degrees in, degrees out, everywhere except the two converters at the bottom.

/** @param {number} deg @returns {number} the same angle in [0, 360) */
export function wrap360(deg){ let x = deg % 360; if (x < 0) x += 360; return x; }

/** @param {number} a @param {number} b @returns {number} the midpoint on the short arc */
export function midpointAngle(a, b){
  const diff = wrap360(b - a);
  const adj = diff > 180 ? diff - 360 : diff;
  return wrap360(a + adj / 2);
}

/** @param {number} a @param {number} b @returns {number} smallest separation, 0 to 180 */
export function angDist(a,b){ const d = Math.abs(wrap360(a - b)); return d > 180 ? 360 - d : d; }

/** @param {number} d */
export function degToRad(d){ return d * Math.PI / 180; }

/** @param {number} r */
export function radToDeg(r){ return r * 180 / Math.PI; }
