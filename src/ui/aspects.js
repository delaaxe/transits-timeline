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
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedKeys.includes(key);
    cb.dataset.aspectKey = key;
    lab.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = label;
    lab.appendChild(span);
    wrap.appendChild(lab);
  }
}

export function getCheckedAspects(){
  return Array.from(el.aspectChecks.querySelectorAll("input[type=checkbox]"))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.aspectKey);
}
