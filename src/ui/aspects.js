// The aspect checkboxes. A file of their own because two things fill them now -
// the view presets, and "Only this" on a row - and neither should have to reach
// through the other to do it.

import { aspects } from "../data/bodies.js";
import { el } from "./dom.js";

export function renderAspectChecks(selectedKeys){
  const wrap = el.aspectChecks;
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const [key, label] of aspects){
    const row = document.createElement("div");
    row.className = "aspectRow";

    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedKeys.includes(key);
    cb.dataset.aspectKey = key;
    lab.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = label;
    lab.appendChild(span);
    row.appendChild(lab);

    // Five aspects, and the common move is to want one of them. Ticking one
    // means five taps - four off and one on - unless "only" is there to say it
    // in a word.
    const only = document.createElement("button");
    only.type = "button";
    only.className = "aspectOnly";
    only.dataset.aspectOnly = key;
    only.textContent = "only";
    row.appendChild(only);

    wrap.appendChild(row);
  }
}

export function setCheckedAspects(keys){
  const wanted = new Set(keys);
  for (const cb of el.aspectChecks.querySelectorAll("input[type=checkbox]")){
    cb.checked = wanted.has(cb.dataset.aspectKey);
  }
}

/**
 * The three shortcuts over the list. They are wired here rather than by the
 * panel, because what they do is entirely about these checkboxes; the change
 * event they raise is the same one a tick raises, so whoever is listening for
 * a recompute needs to know nothing about them.
 */
export function wireAspectShortcuts(){
  const wrap = el.aspectChecks;
  if (!wrap) return;
  const announce = () => wrap.dispatchEvent(new Event("change", { bubbles: true }));

  wrap.addEventListener("click", (e) => {
    const btn = /** @type {any} */ (/** @type {any} */ (e.target).closest("button[data-aspect-only]"));
    if (!btn) return;
    setCheckedAspects([btn.dataset.aspectOnly]);
    announce();
  });

  if (el.aspectsAllBtn){
    el.aspectsAllBtn.addEventListener("click", () => {
      setCheckedAspects(aspects.map(a => a[0]));
      announce();
    });
  }
  if (el.aspectsNoneBtn){
    el.aspectsNoneBtn.addEventListener("click", () => {
      setCheckedAspects([]);
      announce();
    });
  }
}

export function getCheckedAspects(){
  return Array.from(el.aspectChecks.querySelectorAll("input[type=checkbox]"))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.aspectKey);
}
