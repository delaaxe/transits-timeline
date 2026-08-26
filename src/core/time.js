import { wrap360 } from "./angles.js";

export function addDaysLocal(dateObj, days){
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function parseLocalDateOnly(yyyyMmDd){
  const [y,m,d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m-1, d, 0, 0, 0, 0);
}

export function fmtLocalYYYYMMDD(dateObj){
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth()+1).padStart(2,"0");
  const day = String(dateObj.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export function tzOffsetMinutesAt(utcDate, tzName){
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tzName,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(utcDate).filter(p => p.type !== "literal");
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - utcDate.getTime()) / 60000;
}

export function utcFromLocalPartsInTZ(y, m, d, hh, mm, tzName){
  const localAsUTC = Date.UTC(y, m-1, d, hh, mm, 0, 0);
  let off0 = tzOffsetMinutesAt(new Date(localAsUTC), tzName);
  let utcMillis = localAsUTC - off0 * 60000;
  let off1 = tzOffsetMinutesAt(new Date(utcMillis), tzName);
  if (off1 !== off0){
    utcMillis = localAsUTC - off1 * 60000;
  }
  return new Date(utcMillis);
}

export function parseBirthUTCFor(p){
  if (!p) throw new Error("Pick a chart first.");
  const dateStr = p.birthDate;
  const timeStr = p.birthTime || "00:00";
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);

  if (p.tzName){
    return utcFromLocalPartsInTZ(y, m, d, hh, mm, p.tzName);
  }
  const tz = Number(p.tzOffset || 0);
  const utcMillis = Date.UTC(y, m-1, d, hh - tz, mm, 0, 0);
  return new Date(utcMillis);
}

export function julianDay(dateObj){ return (dateObj.getTime() / 86400000) + 2440587.5; }

export function meanObliquityDeg(t){
  const sec = 21.448 - 46.8150*t - 0.00059*t*t + 0.001813*t*t*t;
  return 23 + (26/60) + (sec/3600);
}

export function gmstDeg(jd){
  const t = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * t*t
    - (t*t*t) / 38710000.0;
  return wrap360(gmst);
}
