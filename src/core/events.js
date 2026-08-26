// Transits as events rather than sampled booleans.
//
// Every aspect is one angle arriving at one value. Write the moving angle as
// base(t) - the transiting body's longitude when the other end of the aspect is
// a fixed natal point, or the separation between two bodies when both move -
// and every aspect that body can make is a root of
//
//   f(t) = wrap180(base(t) - offset)
//
// for some offset: the natal longitude plus 0 for a conjunction, plus or minus
// 60 for a sextile, plus 180 for an opposition, and so on. Its orb window is
// the interval around that root where |f| <= orb. Roots are found by bracketing
// a sign change and handing the bracket to Brent, which gives the ingress, the
// exact hit and the egress as times rather than as whichever sample happened to
// be closest.
//
// Writing it this way means one scan serves every aspect a body can make to
// every point in a chart: the offsets differ, base(t) does not, so a single
// ephemeris read at each step feeds all of them.
//
// The scan that finds the brackets is adaptive, not fixed-step. Every body has
// a known ceiling on its daily motion, so from a sample at t the boundary
// |f| = orb cannot be reached for another (|f| - orb) / maxSpeed days. Stepping
// by exactly that much can never step over a window, and crosses most of a
// range in a handful of evaluations when nothing is near.

export const DAY_MS = 86400000;

/** Signed angle in (-180, 180]. */
export function wrap180(deg){
  const x = ((deg + 180) % 360 + 360) % 360;
  return x === 0 ? 180 : x - 180;
}

// A sextile is exact at +60 and at -60, and they are separate events. A
// conjunction and an opposition each have only one target: wrap180(sep - 180)
// and wrap180(sep + 180) are the same function.
export function aspectTargets(angleDeg){
  if (angleDeg === 0 || angleDeg === 180) return [angleDeg];
  return [angleDeg, -angleDeg];
}

/**
 * Brent's method on a bracketed root. `fa` and `fb` are f(a) and f(b), which
 * the caller already has; each evaluation is an ephemeris call, so none are
 * spent re-deriving them. Returns null when [a,b] is not a bracket.
 *
 * @param {(x:number)=>number} f
 * @param {number} a @param {number} b @param {number} fa @param {number} fb
 * @param {number} tol absolute tolerance on x
 * @returns {number|null}
 */
export function brentRoot(f, a, b, fa, fb, tol, maxIter = 60){
  if (fa === 0) return a;
  if (fb === 0) return b;
  if ((fa < 0) === (fb < 0)) return null;

  let c = a, fc = fa, d = b - a, e = d;
  for (let iter = 0; iter < maxIter; iter++){
    if ((fb < 0) === (fc < 0)){ c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)){
      a = b; b = c; c = a;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)){
      // Inverse quadratic interpolation where it is in range, secant otherwise.
      const s = fb / fa;
      let p, q;
      if (a === c){
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)){ e = d; d = p / q; }
      else { d = xm; e = d; }
    } else {
      d = xm; e = d;
    }

    a = b; fa = fb;
    b += (Math.abs(d) > tol1) ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

/**
 * @typedef {Object} AspectEvent
 * @property {number} start  ms when the orb window opens, clipped to the range
 * @property {number} end    ms when it closes, clipped to the range
 * @property {number[]} exacts ms of every exact hit inside the window
 * @property {boolean} startClipped the window was already open at the range start
 * @property {boolean} endClipped   the window was still open at the range end
 * @property {number} peakOrb smallest separation from exact reached, in degrees
 */

/**
 * Every orb window across a range, one list per offset.
 *
 * @param {Object} opts
 * @param {number[]} opts.offsets angles `base` is heading for, one per aspect end
 * @param {number} opts.orbDeg
 * @param {number} opts.startMs
 * @param {number} opts.endMs  exclusive
 * @param {(ms:number)=>number} opts.baseAt the moving angle, in degrees
 * @param {number} opts.maxSpeedDegPerDay ceiling on |d base / dt|
 * @param {number} [opts.rootTolMs]
 * @returns {AspectEvent[][]}
 */
export function scanAspectWindows({ offsets, orbDeg, startMs, endMs, baseAt, maxSpeedDegPerDay, rootTolMs = 1000 }){
  /** @type {AspectEvent[][]} */
  const out = offsets.map(() => []);
  if (!offsets.length || !(endMs > startMs)) return out;

  const orb = Math.max(0, Number(orbDeg) || 0);
  const speed = Math.max(1e-9, maxSpeedDegPerDay);

  // Half the width of the band, in time, at the body's top speed. A step this
  // long moves at most `orb`, so it can neither cross the whole band nor jump
  // from outside it to past its far edge: every window gets at least one sample
  // inside, and the exact hit always falls between two consecutive samples.
  const bandStepMs = Math.max(1000, (orb / speed) * DAY_MS);

  const fAt = (base, i) => wrap180(base - offsets[i]);

  let prevT = startMs;
  const prevF = offsets.map((_, i) => fAt(baseAt(prevT), i));

  /** @type {(AspectEvent|null)[]} */
  const open = offsets.map((_, i) => Math.abs(prevF[i]) <= orb
    ? { start: startMs, end: startMs, exacts: [], startClipped: true, endClipped: false, peakOrb: Math.abs(prevF[i]) }
    : null);

  // The scan is guaranteed to advance, but a bad speed bound should surface as
  // an error rather than as a worker that never answers.
  const maxSteps = 5_000_000;
  let steps = 0;

  while (prevT < endMs){
    if (++steps > maxSteps) throw new Error("Transit scan did not converge");

    let step = Infinity;
    for (let i = 0; i < offsets.length; i++){
      const gap = Math.abs(prevF[i]) - orb;
      const safe = gap > 0 ? Math.max(bandStepMs, (gap / speed) * DAY_MS) : bandStepMs;
      if (safe < step) step = safe;
    }
    if (!(step > 0)) step = bandStepMs;

    const t = Math.min(prevT + step, endMs);
    const base = baseAt(t);

    for (let i = 0; i < offsets.length; i++){
      const f = fAt(base, i);
      const before = prevF[i];
      const offset = offsets[i];
      const fOfT = (x) => wrap180(baseAt(x) - offset);
      const gOfT = (x) => Math.abs(wrap180(baseAt(x) - offset)) - orb;
      const inside = Math.abs(f) <= orb;
      const win = open[i];

      if (!win && inside){
        const at = brentRoot(gOfT, prevT, t, Math.abs(before) - orb, Math.abs(f) - orb, rootTolMs);
        open[i] = {
          start: at ?? prevT,
          end: t,
          exacts: [],
          startClipped: false,
          endClipped: false,
          peakOrb: Math.abs(f)
        };
      }

      // A wrap from +180 to -180 is not a crossing; a real one moves f barely
      // at all, so the jump size separates them.
      if ((before < 0) !== (f < 0) && Math.abs(f - before) <= 180){
        const at = brentRoot(fOfT, prevT, t, before, f, rootTolMs);
        const cur = open[i];
        if (at !== null && cur){
          cur.exacts.push(at);
          cur.peakOrb = 0;
        }
      }

      const cur = open[i];
      if (cur){
        if (Math.abs(f) < cur.peakOrb) cur.peakOrb = Math.abs(f);
        if (!inside){
          const at = brentRoot(gOfT, prevT, t, Math.abs(before) - orb, Math.abs(f) - orb, rootTolMs);
          cur.end = at ?? t;
          out[i].push(cur);
          open[i] = null;
        }
      }

      prevF[i] = f;
    }

    prevT = t;
  }

  for (let i = 0; i < offsets.length; i++){
    const cur = open[i];
    if (!cur) continue;
    cur.end = endMs;
    cur.endClipped = true;
    out[i].push(cur);
  }

  return out;
}
