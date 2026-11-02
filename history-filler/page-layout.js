// Describes the form on the open page for a bug report: each box's kind, id,
// label and the markup around it. Nothing typed into a box is included, only
// whether it has a value.
// Runs inside the page (and each frame), so it must stand alone.
function describePageLayout() {
  const SEL = 'input,select,textarea,button,[role=combobox],[role=textbox],[contenteditable=true]';
  const all = (root, out = []) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(SEL)) out.push(el);
      if (el.shadowRoot) all(el.shadowRoot, out);
    }
    return out;
  };
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const strip = (el) => {
    const copy = el.cloneNode(false);
    for (const attr of ['value', 'checked', 'style']) copy.removeAttribute(attr);
    return copy.outerHTML.slice(0, 400);
  };
  const chain = (el) => {
    const out = [];
    for (let n = el.parentElement, i = 0; n && i < 4; n = n.parentElement, i++) {
      out.push(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`);
    }
    return out.join(' < ');
  };
  const rows = [];
  for (const el of all(document)) {
    if (el.type === 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const labels = [...(el.labels || [])].map((l) => clip(l.textContent, 80));
    const near = [];
    for (let n = el, d = 0; n && d < 4; n = n.parentElement, d++) {
      for (let s = n.previousElementSibling, k = 0; s && k < 2; s = s.previousElementSibling, k++) {
        const t = clip(s.textContent, 80);
        if (t && !s.querySelector(SEL)) near.push(t);
      }
    }
    rows.push({
      tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id, name: el.name,
      placeholder: el.placeholder || '', aria: el.getAttribute('aria-label') || '', role: el.getAttribute('role') || '',
      labels, near: near.slice(0, 3), readOnly: !!el.readOnly, disabled: !!el.disabled,
      // Whether the box has anything in it, and whether History Filler touched it; never the text itself.
      hasValue: el.type === 'checkbox' ? !!el.checked : !!(el.value || el.textContent && el.tagName !== 'INPUT' && el.textContent.trim()),
      touched: el.dataset.hfMarked ? (el.style.outline.includes('46, 158') || el.style.outline.includes('2e9e5b') ? 'filled' : 'flagged') : '',
      inShadow: el.getRootNode() !== document, html: strip(el), parents: chain(el),
    });
  }
  const sections = [...document.querySelectorAll('h1,h2,h3,legend')].map((h) => clip(h.textContent, 60)).filter(Boolean).slice(0, 25);
  return { frame: location.hostname + location.pathname, sections, boxes: rows };
}
