// Dragging the chart chips to reorder them.
//
// Pointer events rather than HTML5 drag-and-drop: the picker is used as much on
// a phone as on a laptop, and native dragging never fires there. The dragged
// chip is moved among its siblings as the pointer passes them, so the row shows
// the order it will save while the finger is still down.

import { chartsState, saveCharts, reorderChartsByIds } from "../storage/charts.js";

// Far enough that a tap on a chip stays a tap. Below it nothing has moved, and
// the click that follows still switches charts.
const DRAG_THRESHOLD_PX = 6;

const ADD_ID = "__add__";

function chipsOf(wrap){
  return /** @type {HTMLElement[]} */ (
    Array.from(wrap.children).filter(
      (n) => n instanceof HTMLElement && n.dataset.chartId && n.dataset.chartId !== ADD_ID
    )
  );
}

// The chips wrap onto several lines on a narrow screen, so "which chip is the
// pointer over" is a two-dimensional question: nearest centre wins, and which
// side of that centre the pointer is on says whether the dragged chip goes
// before or after it.
function dropTargetFor(wrap, dragged, x, y){
  let best = null;
  let bestDist = Infinity;
  for (const chip of chipsOf(wrap)){
    if (chip === dragged) continue;
    const r = chip.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestDist){
      bestDist = d;
      best = { chip, after: (Math.abs(y - cy) > r.height / 2) ? y > cy : x > cx };
    }
  }
  return best;
}

export function wireChartReorder(wrap, onReordered){
  if (!wrap) return;

  let dragged = /** @type {HTMLElement|null} */ (null);
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let suppressClick = false;
  // Where inside the chip the pointer grabbed it, so the chip follows the
  // pointer from that same spot rather than jumping its centre under it.
  let grabX = 0;
  let grabY = 0;

  // The chip itself is the drag preview: it is lifted out of the row and moved
  // to follow the pointer, while the gap it leaves behind is the drop it will
  // make. Recomputed from its live position each move, because the row keeps
  // relaying out underneath it as it passes its neighbours.
  function followPointer(x, y){
    if (!dragged) return;
    dragged.style.transform = "";
    const r = dragged.getBoundingClientRect();
    dragged.style.transform = `translate(${x - (r.left + grabX)}px, ${y - (r.top + grabY)}px)`;
  }

  // A drag that starts on a chip must not also start a text selection: the
  // chips themselves are unselectable, but a gesture crossing them would still
  // sweep up the labels around them.
  const blockSelect = (e) => e.preventDefault();

  function reset(){
    if (dragged){
      dragged.classList.remove("dragging");
      dragged.style.transform = "";
    }
    wrap.classList.remove("reordering");
    document.removeEventListener("selectstart", blockSelect);
    if (pointerId >= 0 && wrap.hasPointerCapture?.(pointerId)) wrap.releasePointerCapture(pointerId);
    dragged = null;
    pointerId = -1;
    moved = false;
  }

  wrap.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const chip = /** @type {HTMLElement|null} */ (
      /** @type {HTMLElement} */ (e.target).closest("button[data-chart-id]")
    );
    if (!chip || !wrap.contains(chip)) return;
    if (chip.dataset.chartId === ADD_ID) return;
    if (/** @type {HTMLButtonElement} */ (chip).disabled) return;
    if (chipsOf(wrap).length < 2) return;
    dragged = chip;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    const r = chip.getBoundingClientRect();
    grabX = e.clientX - r.left;
    grabY = e.clientY - r.top;
    moved = false;
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!dragged || e.pointerId !== pointerId) return;
    if (!moved){
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
      moved = true;
      wrap.setPointerCapture?.(pointerId);
      dragged.classList.add("dragging");
      wrap.classList.add("reordering");
      document.addEventListener("selectstart", blockSelect);
      // Whatever the press already selected before it became a drag.
      document.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    const target = dropTargetFor(wrap, dragged, e.clientX, e.clientY);
    if (target){
      if (target.after) target.chip.after(dragged);
      else target.chip.before(dragged);
    }
    followPointer(e.clientX, e.clientY);
  });

  function finish(e){
    if (!dragged || e.pointerId !== pointerId) return;
    const didMove = moved;
    reset();
    if (!didMove) return;
    // The chip is still under the finger, so the browser sends a click next.
    // That click means "drop here", not "switch to this chart".
    suppressClick = true;
    const ids = chipsOf(wrap).map(c => c.dataset.chartId);
    chartsState.list = reorderChartsByIds(chartsState.list, ids);
    saveCharts(chartsState.list);
    onReordered?.();
  }

  wrap.addEventListener("pointerup", finish);
  wrap.addEventListener("pointercancel", (e) => {
    if (!dragged || e.pointerId !== pointerId) return;
    const didMove = moved;
    reset();
    // A cancelled drag leaves the chips wherever they were dropped mid-gesture;
    // re-rendering puts them back in the saved order.
    if (didMove) onReordered?.();
  });

  wrap.addEventListener("click", (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
