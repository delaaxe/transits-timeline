export function wrap360(deg){ let x = deg % 360; if (x < 0) x += 360; return x; }

export function midpointAngle(a, b){
  const diff = wrap360(b - a);
  const adj = diff > 180 ? diff - 360 : diff;
  return wrap360(a + adj / 2);
}

export function angDist(a,b){ const d = Math.abs(wrap360(a - b)); return d > 180 ? 360 - d : d; }

export function degToRad(d){ return d * Math.PI / 180; }

export function radToDeg(r){ return r * 180 / Math.PI; }
