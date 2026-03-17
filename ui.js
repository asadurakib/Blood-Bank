export function qs(sel, el = document) {
  return el.querySelector(sel);
}

export function qsa(sel, el = document) {
  return Array.from(el.querySelectorAll(sel));
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function mountToasts() {
  let root = document.getElementById("toasts");
  if (!root) {
    root = document.createElement("div");
    root.id = "toasts";
    root.className = "toasts";
    document.body.appendChild(root);
  }
  return root;
}

const toastRoot = mountToasts();

export function toast(type, title, message, { timeoutMs = 2800 } = {}) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="t">${escapeHtml(title)}</div>
    <div>${escapeHtml(message)}</div>
  `;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms ease";
    setTimeout(() => el.remove(), 220);
  }, timeoutMs);
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function promptForm(title, fields, initial = {}) {
  // Minimal "form" using successive prompts to keep the demo dependency-free.
  // fields: [{ key, label, type: 'text'|'number'|'date'|'select', options? }]
  const out = { ...initial };
  for (const f of fields) {
    const current = out[f.key] ?? "";
    let val;
    if (f.type === "select") {
      val = window.prompt(`${title}\n${f.label} (${f.options.join(", ")})`, String(current));
    } else {
      val = window.prompt(`${title}\n${f.label}`, String(current));
    }
    if (val === null) return null; // user cancelled
    if (f.type === "number") {
      const n = Number(val);
      if (!Number.isFinite(n)) return null;
      out[f.key] = n;
    } else {
      out[f.key] = val.trim();
    }
  }
  return out;
}

