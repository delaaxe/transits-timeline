// Opening and closing with the height actually moving.
//
// The hidden attribute is a cut: a panel is either there or it is not, and the
// rest of the page jumps the moment it changes. Both switches in the view bar
// open something directly under themselves, so the jump lands right where the
// eye already is. Sliding says where the panel came from and which button it
// belongs to, which is the whole of what it is for.
//
// Written against the Web Animations API rather than a CSS transition. A
// transition needs the height to be a number on both sides, which means writing
// one onto the element and owning it from then on; an animation borrows the
// property for its duration and hands it back, so nothing here has to remember
// what the stylesheet wanted.

const DURATION_MS = 190;

// Out of the panel's own edge rather than symmetric: the slide is quick and
// this is what keeps the end of it from looking like a bounce.
const EASING = "cubic-bezier(0.2, 0, 0.2, 1)";

/** @type {WeakMap<Element, Animation>} */
const running = new WeakMap();

function reducedMotion(){
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Opens or closes a panel, moving its height to get there.
 *
 * Safe to call again mid-slide: the one in flight is measured where it has got
 * to, cancelled, and the new one starts from there, so a double tap reverses
 * rather than snapping to an end it never reached.
 *
 * @param {HTMLElement|null} node
 * @param {boolean} open
 * @returns {Promise<void>} resolves when the panel has settled
 */
export function slide(node, open){
  if (!node) return Promise.resolve();

  // Read before cancelling: mid-flight this is the animated height, and it is
  // the only chance to catch it.
  const inFlight = running.get(node);
  const caught = inFlight ? node.getBoundingClientRect().height : null;
  if (inFlight){
    inFlight.cancel();
    running.delete(node);
    clearInlineStyles(node);
  }

  if (reducedMotion()){
    node.hidden = !open;
    return Promise.resolve();
  }

  if (open){
    node.hidden = false;
    // Its natural height, read while it is laid out and before anything of ours
    // is on it. Border-box, which is why the animation switches the element to
    // border-box too - otherwise a height of zero would still be as tall as the
    // panel's own padding.
    const target = node.getBoundingClientRect().height;
    const from = caught ?? 0;
    if (target <= 0 || Math.abs(target - from) < 1) return Promise.resolve();
    return run(node, from, target, true);
  }

  if (node.hidden) return Promise.resolve();
  const from = caught ?? node.getBoundingClientRect().height;
  if (from <= 0){
    node.hidden = true;
    return Promise.resolve();
  }
  return run(node, from, 0, false);
}

/**
 * @param {HTMLElement} node @param {number} from @param {number} to
 * @param {boolean} open
 */
function run(node, from, to, open){
  // Clipped only while the box is the wrong size. The aspect menu inside the
  // options drawer is a popup that hangs outside it, so leaving overflow hidden
  // once the panel is open would cut the menu off at the drawer's edge.
  node.style.overflow = "hidden";
  node.style.boxSizing = "border-box";
  // The arrows row carries a min-height for its tap targets, and min-height
  // beats height: without this the row would slide to its minimum and stop
  // there, still a full row tall.
  node.style.minHeight = "0";

  const animation = node.animate(
    [
      { height: `${from}px`, opacity: open ? 0 : 1 },
      { height: `${to}px`, opacity: open ? 1 : 0 }
    ],
    { duration: DURATION_MS, easing: EASING }
  );
  running.set(node, animation);

  return animation.finished.then(() => {
    // A later call may already have taken the element over.
    if (running.get(node) !== animation) return;
    running.delete(node);
    clearInlineStyles(node);
    if (!open) node.hidden = true;
  }, () => {
    // Cancelled, which only happens from slide() above - and it has already
    // tidied up and taken ownership.
  });
}

/** @param {HTMLElement} node */
function clearInlineStyles(node){
  node.style.removeProperty("overflow");
  node.style.removeProperty("box-sizing");
  node.style.removeProperty("min-height");
}
