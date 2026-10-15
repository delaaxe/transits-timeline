// The blank square where the date axis and the aspect axis meet. Three taps on
// it copy today's reading - see services/today.js - to the clipboard. Nothing
// says it is there: it is a shortcut for the one reader who knows, and a square
// nobody else has any reason to tap.

import { el, copyTextToClipboard, setStatus } from "./dom.js";
import { currentChartContext } from "../services/chart-context.js";
import { todaySummary } from "../services/today.js";
import { errorMessage } from "../core/errors.js";

// Taps further apart than this are separate taps, not a sequence. Double-tap
// detection on phones settles at about 300ms; this is looser because the
// third tap of three tends to come later than the second.
const TAP_GAP_MS = 450;

const TAPS = 3;

export function wireCornerTap(){
  const corner = el.axisCorner;
  if (!corner) return;
  let taps = 0;
  let lastAt = 0;

  corner.addEventListener("click", (e) => {
    const now = e.timeStamp || performance.now();
    taps = (now - lastAt <= TAP_GAP_MS) ? taps + 1 : 1;
    lastAt = now;
    if (taps < TAPS) return;
    taps = 0;
    copyToday(corner);
  });
}

/** @param {HTMLElement} corner */
function copyToday(corner){
  try {
    // Synchronous up to the clipboard call: an await in between would put the
    // write outside the gesture, which Safari then refuses.
    const text = todaySummary(currentChartContext(), Number(el.orb?.value || 1));
    copyTextToClipboard(text).then(() => flash(corner), (err) => setStatus(errorMessage(err), true));
  } catch (err){
    console.error(err);
    setStatus(errorMessage(err), true);
  }
}

// The clipboard is silent, so the square lights up for a moment to say the
// copy happened.
/** @param {HTMLElement} corner */
function flash(corner){
  corner.classList.remove("copied");
  // A reflow between the two so a second flash restarts the animation.
  void corner.offsetWidth;
  corner.classList.add("copied");
}
