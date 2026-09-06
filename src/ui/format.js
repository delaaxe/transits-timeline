import { locale } from "../storage/charts.js";

export function fmtCoord(lat, lon){
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

// toLocaleDateString and toLocaleTimeString construct an Intl.DateTimeFormat
// on every single call, and these run per bar, again per exact hit on that bar,
// and again for every tooltip that opens. A month view built several hundred
// formatters per render, which put these two functions at the top of the main
// thread in a CPU profile - above every piece of SVG work they were formatting
// labels for. The locale is fixed, so three formatters cover every call.
const dateFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
const dateYearFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtDatePretty(d, includeYear){
  return (includeYear ? dateYearFmt : dateFmt).format(d);
}

export function fmtTimePretty(d){
  return timeFmt.format(d);
}

export function formatRangePretty(a, b, showTime, showYear){
  const sameYear = a.getFullYear() === b.getFullYear();
  const includeYear = showYear || !sameYear;

  const sameDay = sameYear && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const aDT = `${fmtDatePretty(a, includeYear)}, ${fmtTimePretty(a)}`;
  const bDT = `${fmtDatePretty(b, includeYear)}, ${fmtTimePretty(b)}`;

  if (showTime){
    if (sameDay){
      return `${fmtDatePretty(a, includeYear)}, ${fmtTimePretty(a)} – ${fmtTimePretty(b)}`;
    }
    return `${aDT} – ${bDT}`;
  } else {
    if (a.getTime() === b.getTime()) return fmtDatePretty(a, includeYear);
    return `${fmtDatePretty(a, includeYear)} – ${fmtDatePretty(b, includeYear)}`;
  }
}

export function formatExactPretty(exact, rangeStart, rangeEnd, showYear){
  if (!exact) return "";
  const sameYear = rangeStart.getFullYear() === rangeEnd.getFullYear();
  const includeYear = showYear || !sameYear;
  const sameDay = sameYear
    && rangeStart.getMonth() === rangeEnd.getMonth()
    && rangeStart.getDate() === rangeEnd.getDate();
  if (sameDay) return fmtTimePretty(exact);
  return `${fmtDatePretty(exact, includeYear)}, ${fmtTimePretty(exact)}`;
}

export function isMultiDayLocal(start, end){
  if (!(start instanceof Date) || !(end instanceof Date)) return false;
  return start.getFullYear() !== end.getFullYear()
    || start.getMonth() !== end.getMonth()
    || start.getDate() !== end.getDate();
}
