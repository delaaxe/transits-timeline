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

// How far the pointer has to travel after one rearrangement before it can cause
// the next.
const SWAP_TRAVEL_PX = 8;

const ADD_ID = "__add__";

function chipsOf(wrap){
  return /** @type {HTMLElement[]} */ (
    Array.from(wrap.children).filter(
      (n) => n instanceof HTMLElement && n.dataset.chartId && n.dataset.chartId !== ADD_ID
    )
  );
}

// The chip the pointer is actually over, and which half of it, or null when it
// is over none of them.
//
// Nearest centre would be the obvious rule and it is the wrong one here: the
// chips wrap, so a chip crossing to the row below reflows the row it left, the
// chip it just passed lands back under the pointer, and the two swap places
// again on the next move - a flicker that never settles. Containment cannot do
// that, because a swap carries the chip it swapped with away from the pointer.
function dropTargetFor(wrap, dragged, x, y){
  for (const chip of chipsOf(wrap)){
    if (chip === dragged) continue;
    const r = chip.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    return { chip, after: x > r.left + r.width / 2 };
  }
  return null;
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
  // Where the pointer was when the row last rearranged. Containment settles the
  // flicker on its own; this is the belt to its braces, so that a reflow landing
  // a chip back under a stationary finger cannot swap again on its own.
  let lastSwapX = 0;
  let lastSwapY = 0;

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
    document.body.classList.remove("reorderingCharts");
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
    lastSwapX = e.clientX;
    lastSwapY = e.clientY;
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
      // selectstart is not dispatched for touch selection on iOS, so the drag
      // also turns selection off in CSS for as long as it lasts.
      document.body.classList.add("reorderingCharts");
      // Whatever the press already selected before it became a drag.
      document.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    if (Math.hypot(e.clientX - lastSwapX, e.clientY - lastSwapY) >= SWAP_TRAVEL_PX){
      const target = dropTargetFor(wrap, dragged, e.clientX, e.clientY);
      // An insertion where the chip already sits moves nothing, and taking it
      // as a rearrangement would hold the next real one back.
      const already = target && (target.after
        ? dragged.previousElementSibling === target.chip
        : dragged.nextElementSibling === target.chip);
      if (target && !already){
        if (target.after) target.chip.after(dragged);
        else target.chip.before(dragged);
        lastSwapX = e.clientX;
        lastSwapY = e.clientY;
      }
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
