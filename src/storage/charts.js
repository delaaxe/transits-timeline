export const chartsState = {
  list: [],
  activeIdA: "",
  activeIdB: "",
  mode: "single",
  addMode: false
};

export function getActiveChartA(){
  return chartsState.list.find(p => p.id === chartsState.activeIdA) || null;
}

export function getActiveChartB(){
  return chartsState.list.find(p => p.id === chartsState.activeIdB) || null;
}

export function getActiveChart(){
  return getActiveChartA();
}

export const locale = "en-US";

export const chartsKey = "tt_charts";

export const lastChartKey = "tt_last_chart";

export function safeJSONParse(s, fallback){
  try { return JSON.parse(s); } catch { return fallback; }
}

export function newId(){
  return "c_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now().toString(36);
}

export const defaultChartData = {
  name: "Elon Musk",
  birthDate: "1971-06-28",
  birthTime: "07:30",
  placeLabel: "Pretoria, South Africa",
  lon: 28.2293,
  lat: -25.7479,
  tzName: "Africa/Johannesburg",
  isDefault: true
};

export function isDefaultChart(p){
  return !!p?.isDefault;
}

export function normalizeChart(p){
  // Accept both old and new shapes
  return {
    id: p.id || newId(),
    name: p.name || "(unnamed)",
    birthDate: p.birthDate || p.date || "1990-09-01",
    birthTime: p.birthTime || p.time || "18:11",
    placeLabel: p.placeLabel || p.place || "",
    placeId: p.placeId || "",
    lon: Number.isFinite(+p.lon) ? +p.lon : (Number.isFinite(+p.longitude) ? +p.longitude : 0),
    lat: Number.isFinite(+p.lat) ? +p.lat : (Number.isFinite(+p.latitude) ? +p.latitude : 0),
    tzName: p.tzName || p.timeZoneName || "",
    tzOffset: Number.isFinite(+p.tzOffset) ? +p.tzOffset : (Number.isFinite(+p.tz) ? +p.tz : 0),
    isDefault: !!p.isDefault
  };
}

export function loadCharts(){
  const raw = localStorage.getItem(chartsKey);
  const arr = raw ? safeJSONParse(raw, []) : [];
  if (Array.isArray(arr) && arr.length > 0){
    const normalized = arr.map(normalizeChart);
    const filtered = normalized.filter((p) => !isDefaultChart(p));
    if (filtered.length !== normalized.length){
      localStorage.setItem(chartsKey, JSON.stringify(filtered));
    }
    const last = localStorage.getItem(lastChartKey);
    if (last && normalized.some((p) => p.id === last && isDefaultChart(p))){
      localStorage.removeItem(lastChartKey);
    }
    if (filtered.length === 0) localStorage.removeItem(lastChartKey);
    return filtered;
  }

  const legacyChartsKey = "tt_people_v2";
  const legacyLastKey = "tt_last_person_v2";
  const legacyRaw = localStorage.getItem(legacyChartsKey);
  const legacyArr = legacyRaw ? safeJSONParse(legacyRaw, []) : [];
  if (Array.isArray(legacyArr) && legacyArr.length > 0){
    localStorage.setItem(chartsKey, JSON.stringify(legacyArr));
    const legacyLast = localStorage.getItem(legacyLastKey);
    if (legacyLast) localStorage.setItem(lastChartKey, legacyLast);
    localStorage.removeItem(legacyChartsKey);
    localStorage.removeItem(legacyLastKey);
    return legacyArr.map(normalizeChart).filter((p) => !isDefaultChart(p));
  }

  return [];
}

export function saveCharts(charts){
  localStorage.setItem(chartsKey, JSON.stringify(charts));
}
