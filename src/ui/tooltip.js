import { aspectDescription, mythDescription } from "../data/interpretations.js";
import { copyTextToClipboard, escapeHtml, tooltip, tooltipBackdrop } from "./dom.js";
import { isMultiDayLocal } from "./format.js";

export function wireTooltipDismiss(){
  window.addEventListener("scroll", () => {
    if (isCoarsePointer()) hideTooltip();
  }, { passive: true });
}

export let tooltipListenersWired = false;

export function ensureTooltipListeners(){
  if (tooltipListenersWired) return;
  tooltipListenersWired = true;
  window.addEventListener("scroll", hideTooltip, {passive:true});
  window.addEventListener("blur", hideTooltip);
  // Dismiss only. The backdrop must not act on whatever sits beneath it.
  if (tooltipBackdrop) tooltipBackdrop.addEventListener("click", hideTooltip);
  tooltip.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".tooltipClose");
    if (closeBtn){
      hideTooltip();
      return;
    }
    const titleEl = e.target.closest(".tooltipTitle");
    if (titleEl && tooltip.classList.contains("popup")){
      copyTextToClipboard(titleEl.dataset.copyText || titleEl.textContent || "");
      const copiedHint = tooltip.querySelector(".copiedHint");
      if (copiedHint){
        copiedHint.classList.remove("fading");
        copiedHint.classList.add("visible");
        window.setTimeout(() => {
          copiedHint.classList.remove("visible");
          copiedHint.classList.add("fading");
        }, 900);
      }
      return;
    }
    const calendarLink = e.target.closest("a[data-gcal-web]");
    if (calendarLink && isMobileCalendarTarget()){
      const webUrl = calendarLink.getAttribute("data-gcal-web") || "";
      const deepLink = googleCalendarMobileDeepLink(webUrl);
      const isIOS = isIOSLike();
      e.preventDefault();
      let appOpened = false;
      const onVis = () => {
        if (document.visibilityState === "hidden") appOpened = true;
      };
      document.addEventListener("visibilitychange", onVis, { once: true });
      if (deepLink){
        window.location.href = deepLink;
        if (isIOS){
          const iosDeep = googleCalendarIOSDeepLinks(webUrl);
          if (iosDeep.secondary){
            window.setTimeout(() => {
              if (!appOpened) window.location.href = iosDeep.secondary;
            }, 250);
          }
        }
      }
      if (!isIOS){
        window.setTimeout(() => {
          if (!appOpened) window.location.href = webUrl;
        }, 800);
      }
      return;
    }
    const btn = e.target.closest(".mythToggle");
    if (!btn || !tooltip.contains(btn)) return;
    const myth = tooltip.querySelector(".mythHidden");
    if (!myth) return;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", expanded ? "false" : "true");
    btn.textContent = expanded ? "Mythologically →" : "Mythologically ↓";
    myth.hidden = expanded;
  });
  document.addEventListener("pointerdown", (e) => {
    if (tooltip.style.display !== "block") return;
    if (tooltip.contains(e.target)) return;
    // Let the backdrop receive the complete tap gesture. Hiding it here
    // would expose a timeline segment before pointerup, reopening a popup.
    if (e.target === tooltipBackdrop) return;
    hideTooltip();
  }, true);
}

export function toGoogleCalUtcStamp(dateObj){
  if (!(dateObj instanceof Date) || !Number.isFinite(dateObj.getTime())) return "";
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  const hh = String(dateObj.getUTCHours()).padStart(2, "0");
  const mm = String(dateObj.getUTCMinutes()).padStart(2, "0");
  const ss = String(dateObj.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

export function toGoogleCalDateStampLocal(dateObj){
  if (!(dateObj instanceof Date) || !Number.isFinite(dateObj.getTime())) return "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function googleCalendarUrl({ title, details, start, end, allDay=false }){
  const startStamp = allDay ? toGoogleCalDateStampLocal(start) : toGoogleCalUtcStamp(start);
  const endStamp = allDay ? toGoogleCalDateStampLocal(end) : toGoogleCalUtcStamp(end);
  if (!startStamp || !endStamp) return "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "Transit",
    details: details || "",
    dates: `${startStamp}/${endStamp}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function isIOSLike(){
  const ua = navigator.userAgent || "";
  const isIPadOSDesktopUA = (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return /iPhone|iPad|iPod/i.test(ua) || isIPadOSDesktopUA;
}

export function googleCalendarMobileDeepLink(webUrl){
  if (!webUrl) return "";
  const qIndex = webUrl.indexOf("?");
  const query = qIndex >= 0 ? webUrl.slice(qIndex + 1) : "";
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  if (isAndroid){
    return `intent://calendar.google.com/calendar/render?${query}#Intent;scheme=https;package=com.google.android.calendar;end`;
  }
  if (isIOSLike()){
    return `googlecalendar://calendar/render?${query}`;
  }
  return "";
}

export function googleCalendarIOSDeepLinks(webUrl){
  if (!webUrl) return { primary: "", secondary: "" };
  const qIndex = webUrl.indexOf("?");
  const query = qIndex >= 0 ? webUrl.slice(qIndex + 1) : "";
  return {
    primary: googleCalendarMobileDeepLink(webUrl),
    secondary: `comgooglecalendar://calendar/render?${query}`
  };
}

export function isMobileCalendarTarget(){
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) || isIOSLike();
}

// What is on screen, so it can be drawn again when the prose lands. The
// interpretations are fetched after the first render, and a popup opened in
// that window would otherwise keep the empty text it was built with.
/** @type {any[]|null} */
let shownArgs = null;

export function refreshTooltipContent(){
  if (tooltip.style.display !== "block" || !shownArgs) return;
  setTooltipContent(...(/** @type {[string,string,string,string,boolean,string,any]} */ (shownArgs)));
}

/**
 * `descKey` and `mythKey` are looked up here rather than passed as text, so a
 * redraw picks up prose that was not loaded when the bar was drawn.
 */
export function setTooltipContent(title, descKey, range, mythKey, popupMode, exactLabel, calendarData){
  shownArgs = [title, descKey, range, mythKey, popupMode, exactLabel, calendarData];
  const desc = aspectDescription(descKey);
  const myth = mythDescription(mythKey);
  const safeMyth = myth ? escapeHtml(myth) : "";
  const useToggle = !!safeMyth;
  const mythHtml = useToggle
    ? `<button type="button" class="mythToggle" aria-expanded="false">Mythologically →</button><div class="myth mythHidden" hidden><em>${safeMyth}</em></div>`
    : "";
  const exactHtml = exactLabel ? ` <span class="sub">(${escapeHtml("exact: " + exactLabel)})</span>` : "";
  const closeBtn = popupMode ? `<button type="button" class="tooltipClose" aria-label="Close">✕</button>` : "";
  let calendarHtml = "";
  if (popupMode && calendarData){
    const titleText = String(calendarData.title || title || "Transit");
    const firstLine = `${range || ""}${exactLabel ? ` (exact: ${exactLabel})` : ""}`.trim();
    const mythLine = safeMyth ? `Mythologically: ${myth}` : "";
    const detailsText = [firstLine, desc || "", mythLine].filter(Boolean).join("\n\n");
    const segmentAllDay = isMultiDayLocal(calendarData.segmentStart, calendarData.segmentEnd);
    const segmentEndForCalendar = segmentAllDay
      ? new Date(calendarData.segmentEnd.getFullYear(), calendarData.segmentEnd.getMonth(), calendarData.segmentEnd.getDate() + 1)
      : calendarData.segmentEnd;
    const segmentUrl = googleCalendarUrl({
      title: titleText,
      details: detailsText,
      start: calendarData.segmentStart,
      end: segmentEndForCalendar,
      allDay: segmentAllDay
    });
    const exactDate = calendarData.exactTime instanceof Date ? calendarData.exactTime : null;
    const exactUrl = exactDate ? googleCalendarUrl({
      title: titleText,
      details: detailsText,
      start: exactDate,
      end: exactDate,
      allDay: false
    }) : "";
    if (segmentUrl || exactUrl){
      const desktopLinkAttrs = isMobileCalendarTarget() ? "" : ` target="_blank" rel="noopener noreferrer"`;
      const exactDeep = googleCalendarMobileDeepLink(exactUrl);
      const segmentDeep = googleCalendarMobileDeepLink(segmentUrl);
      const exactLink = exactUrl
        ? `<a class="tooltipAction" href="${escapeHtml(exactDeep || exactUrl)}" data-gcal-web="${escapeHtml(exactUrl)}"${desktopLinkAttrs}>Exact</a>`
        : "Exact";
      const segmentLink = segmentUrl
        ? `<a class="tooltipAction" href="${escapeHtml(segmentDeep || segmentUrl)}" data-gcal-web="${escapeHtml(segmentUrl)}"${desktopLinkAttrs}>Period</a>`
        : "Period";
      let appLinksHtml = "";
      const exactIOS = exactUrl ? googleCalendarIOSDeepLinks(exactUrl).primary : "";
      const segmentIOS = segmentUrl ? googleCalendarIOSDeepLinks(segmentUrl).primary : "";
      if (exactIOS || segmentIOS){
        const exactAppLink = exactIOS
          ? `<a class="tooltipAction" href="${escapeHtml(exactIOS)}">Exact</a>`
          : "Exact";
        const segmentAppLink = segmentIOS
          ? `<a class="tooltipAction" href="${escapeHtml(segmentIOS)}">Period</a>`
          : "Period";
        appLinksHtml = `/ native: ${exactAppLink}<span class="tooltipActionsSep">•</span>${segmentAppLink}`;
      }
      calendarHtml = `<div class="tooltipCalendarBlock"><div class="tooltipActions"><span class="tooltipActionsLabel">Google Calendar:</span>${exactLink}<span class="tooltipActionsSep">•</span>${segmentLink}${appLinksHtml}</div></div>`;
    }
  }
  tooltip.innerHTML = `${closeBtn}<div class="tooltipTitle" data-copy-text="${escapeHtml(title)}">${escapeHtml(title)}<span class="copiedHint">(copied)</span></div>`
    + `<div class="sub">${escapeHtml(range)}${exactHtml}</div>`
    + (desc ? `<div class="desc">${escapeHtml(desc)}</div>` : "")
    + mythHtml
    + calendarHtml;
}

export function moveTooltip(clientX, clientY, popupMode){
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const baseX = (Number.isFinite(clientX) ? clientX : (vw / 2));
  const baseY = (Number.isFinite(clientY) ? clientY : (vh / 2));
  if (popupMode){
    tooltip.style.left = "50%";
    tooltip.style.top = "50%";
    return;
  }
  let x = baseX + 12;
  let y = baseY + 12;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width + pad > vw) x = baseX - r.width - 12;
  if (y + r.height + pad > vh) y = baseY - r.height - 12;
  x = Math.max(pad, Math.min(x, vw - r.width - pad));
  y = Math.max(pad, Math.min(y, vh - r.height - pad));
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

export function isCoarsePointer(){
  return window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function showTooltip(e, title, descKey, range, popupMode, mythKey, exactLabel, calendarData=null){
  setTooltipContent(title, descKey, range, mythKey, popupMode, exactLabel, calendarData);
  tooltip.style.display = "block";
  tooltip.style.visibility = "hidden";
  tooltip.classList.toggle("popup", !!popupMode);
  if (tooltipBackdrop) tooltipBackdrop.style.display = popupMode ? "block" : "none";
  requestAnimationFrame(() => {
    moveTooltip(e?.clientX, e?.clientY, popupMode);
    tooltip.style.visibility = "visible";
  });
}

export function hideTooltip(){
  shownArgs = null;
  tooltip.style.display = "none";
  tooltip.style.visibility = "hidden";
  tooltip.classList.remove("popup");
  if (tooltipBackdrop) tooltipBackdrop.style.display = "none";
}
