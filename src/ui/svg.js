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

// Three tiers by how much room there is, and touch sizing by what is pointing
// at the screen. Those are separate questions: an iPad mini in landscape is
// 1133px wide and still held in two hands, so width alone would hand it
// mouse-sized rows. Sizes live here rather than in the renderers so a tier is
// one table to read, not a dozen ternaries spread over three functions.
const tiers = {
  phone:   { labelWMax: 130, labelWMin: 78, rowH: 24, rowGap:  8, bottomPad: 14, marginT: 10, axisGap:  8, axisBottomPad: 6, axisLabelSize: 15, axisTitleSize: 16, labelFontSize: 17, rowsY0: 6 },
  tablet:  { labelWMax: 140, labelWMin: 90, rowH: 24, rowGap:  9, bottomPad: 16, marginT: 10, axisGap: 10, axisBottomPad: 6, axisLabelSize: 16, axisTitleSize: 18, labelFontSize: 18, rowsY0: 8 },
  desktop: { labelWMax: 150, labelWMin: 96, rowH: 20, rowGap: 10, bottomPad: 18, marginT: 12, axisGap: 10, axisBottomPad: 6, axisLabelSize: 18, axisTitleSize: 20, labelFontSize: 20, rowsY0: 8 }
};

// The same test the stylesheet uses for tap targets, written the same way on
// purpose: if these two disagree, a device gets 44px arrows above 20px rows.
// marginT is what keeps the month and year titles inside the SVG: they are
// drawn at axisY - 6, so this has to clear the title's ascender at that tier's
// font size. Trimming it too far clips the top of "2027" by half a pixel.
// A phone in landscape is short, not narrow: it gets the tier its width earns,
// with the phone tier's vertical spacing, so the axis and the gaps between
// rows stop eating the little height there is.
function isShortViewport(){
  return typeof window !== "undefined" && window.innerHeight <= 520;
}

function isCoarsePointer(){
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function tierFor(containerW){
  if (containerW < 520) return "phone";
  if (containerW < 1024) return "tablet";
  return "desktop";
}

export function computeTimelineLayout(svg){
  const parent = svg ? svg.parentElement : null;
  // The scroller's padding is 8px at desktop and 0 on a phone, so measuring it
  // beats assuming: the old fixed 16 threw away 16px of a 390px screen.
  const pad = (() => {
    if (!parent || typeof getComputedStyle !== "function") return 16;
    const cs = getComputedStyle(parent);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  })();
  const containerW = parent ? Math.max(320, parent.clientWidth - pad) : 1200;

  const tier = tierFor(containerW);
  const t = { ...tiers[tier] };
  if (isShortViewport()){
    const { rowGap, bottomPad, marginT, axisGap, axisBottomPad } = tiers.phone;
    Object.assign(t, { rowGap, bottomPad, marginT, axisGap, axisBottomPad });
  }
  // A wide touch screen keeps the roomy rows; it only gains the wide layout.
  const rowH = (tier === "desktop" && isCoarsePointer()) ? tiers.tablet.rowH : t.rowH;

  const labelW = t.labelWMax;
  const marginL = 0;
  const marginR = 12;
  const axisY = t.marginT + t.axisGap;
  const totalW = Math.max(600, Math.floor(containerW));
  const timelineW = Math.max(360, totalW - marginL - labelW - marginR);

  return {
    containerW,
    tier,
    labelW,
    labelWMax: t.labelWMax,
    labelWMin: t.labelWMin,
    marginL,
    marginR,
    marginT: t.marginT,
    rowH,
    rowGap: t.rowGap,
    bottomPad: t.bottomPad,
    rowsY0: t.rowsY0,
    axisY,
    axisBottomPad: t.axisBottomPad,
    axisLabelSize: t.axisLabelSize,
    axisTitleSize: t.axisTitleSize,
    labelFontSize: t.labelFontSize,
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
