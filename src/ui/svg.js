import { el } from "./dom.js";

export const svgNs = "http://www.w3.org/2000/svg";

export function svgEl(name, attrs={}){
  const el = document.createElementNS(svgNs, name);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function clearSvg(svg){
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

export function computeTimelineLayout(svg, useSymbols=false){
  const containerW = svg.parentElement
    ? Math.max(320, svg.parentElement.clientWidth - 16)
    : 1200;
  const isCompact = containerW < 520;
  const labelWMax = isCompact ? 130 : 150;
  const labelWMin = isCompact ? 78 : 96;
  const labelW = labelWMax;
  const marginL = 0;
  const marginR = 12;
  const marginT = isCompact ? 8 : 14;
  const rowH = isCompact ? 22 : 20;
  const rowGap = isCompact ? 8 : 10;
  const bottomPad = isCompact ? 14 : 18;
  const axisY = marginT + (isCompact ? 8 : 12);
  const totalW = Math.max(600, Math.floor(containerW));
  const timelineW = Math.max(360, totalW - marginL - labelW - marginR);

  return {
    containerW,
    isCompact,
    labelW,
    labelWMax,
    labelWMin,
    marginL,
    marginR,
    marginT,
    rowH,
    rowGap,
    bottomPad,
    axisY,
    totalW,
    timelineW
  };
}

export function pickStep(totalUnits, timelineW, minBoxPx, niceSteps){
  const idealCount = Math.max(1, Math.floor(timelineW / minBoxPx));
  const rawStep = Math.max(1, Math.ceil(totalUnits / idealCount));
  for (const s of niceSteps){
    if (s >= rawStep) return s;
  }
  return niceSteps[niceSteps.length - 1];
}

export function getMonthStartsLocal(start, endExclusive, stepMonths=1){
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
  if (d < start) d.setMonth(d.getMonth() + 1);
  while (d < endExclusive){
    out.push(new Date(d.getTime()));
    d.setMonth(d.getMonth() + stepMonths);
  }
  return out;
}

export function getDayStartsLocal(start, endExclusive, stepDays=1){
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  if (d < start) d.setDate(d.getDate() + 1);
  while (d < endExclusive){
    out.push(new Date(d.getTime()));
    d.setDate(d.getDate() + stepDays);
  }
  return out;
}

export function getHourStartsLocal(start, endExclusive, stepHours=1){
  const out = [];
  const d = new Date(start.getTime());
  d.setMinutes(0,0,0);
  if (d <= start) d.setHours(d.getHours() + 1);
  while (d < endExclusive){
    out.push(new Date(d.getTime()));
    d.setHours(d.getHours() + stepHours);
  }
  return out;
}
