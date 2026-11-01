// Watches an application the extension filled. When you click its submit
// button, it asks the background worker to add the job to your Google Sheet.
// Injected alongside filler.js. Exposes window.__HFTrack.describe().
(() => {
  const BUILD = '2026-10-31.27';
  if (window.__HFTrack && window.__HFTrack.build === BUILD) return;

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const SUBMIT = /\bsubmit\b|^(send|complete|finish) (my )?application$/i;
  const NOT_SUBMIT = /linkedin|indeed|search|subscribe|newsletter|sign ?up|log ?in|draft|later|feedback/i;

  function controlText(el) {
    return clean(el.getAttribute('aria-label') || (el.tagName === 'INPUT' ? el.value : el.textContent));
  }

  // The submit control a click landed on, if it was one.
  function submitControl(event) {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue;
      if (!node.matches('button, input[type=submit], input[type=button], [role=button], a')) continue;
      const text = controlText(node);
      if (!text || text.length > 40 || NOT_SUBMIT.test(text)) return null;
      if (SUBMIT.test(text)) return node;
      // A plain "Apply" counts only as a form's own submit button.
      if (/^apply$/i.test(text) && node.type === 'submit' && node.closest('form')) return node;
      return null;
    }
    return null;
  }

  const titleCase = (slug) => clean(slug.replace(/[-_]+/g, ' ')).replace(/\b\w/g, (c) => c.toUpperCase());

  // Job title and company, read from the page.
  function describe() {
    const meta = (n) => clean((document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content);
    const text = (sel) => clean((document.querySelector(sel) || {}).textContent);
    const host = location.hostname;
    const path = location.pathname.split('/').filter(Boolean);
    let position = '';
    let company = '';
    // The board's company slug, used only if the page doesn't name the company.
    let slug = '';

    if (/greenhouse\.io$/.test(host)) {
      position = text('.app-title, .job__title h1, h1');
      company = text('.company-name').replace(/^at\s+/i, '');
      slug = new URLSearchParams(location.search).get('for') || (path[0] !== 'embed' && path[0]) || '';
    } else if (/lever\.co$/.test(host)) {
      position = text('.posting-headline h2, .posting-header h2');
      slug = path[0] || '';
    } else if (/ashbyhq\.com$/.test(host)) {
      position = text('h1');
      slug = path[0] || '';
    }

    for (const t of [meta('og:title'), clean(document.title)].filter(Boolean)) {
      const m = /^job application for (.+?) at (.+)$/i.exec(t)
        || /^(.+?) (?:at|@) (.+?)(?: [|–—-] .*)?$/i.exec(t);
      if (m) {
        position = position || m[1];
        company = company || m[2];
        break;
      }
      if (/lever\.co$/.test(host)) {
        const lever = /^(.+?) - (.+)$/.exec(t);
        if (lever) {
          company = company || lever[1];
          position = position || lever[2];
          break;
        }
      }
    }

    company = company || titleCase(slug) || meta('og:site_name')
      || titleCase(host.replace(/^(www|careers|jobs|apply|boards|job-boards)\./, '').split('.')[0]);
    if (!position) {
      const h1 = text('h1');
      if (h1.length < 120) position = h1;
    }
    return { position, company, url: location.href };
  }

  function toast(message, bad) {
    const box = document.createElement('div');
    box.textContent = message;
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:10px 14px;'
      + 'border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);'
      + `background:${bad ? '#7a3d00' : '#1d4ed8'};color:#fff`;
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), 6000);
  }

  let sent = '';
  function report() {
    const job = describe();
    if (sent === job.url) return;
    sent = job.url;
    try {
      chrome.runtime.sendMessage({ action: 'logApplication', job }).then((res) => {
        if (res && res.ok) toast(res.text);
        else if (res && res.error) toast(res.error, true);
      }, () => {});
    } catch (e) { /* the extension was reloaded; the new copy takes over */ }
  }

  document.addEventListener('click', (e) => { if (submitControl(e)) report(); }, true);
  // Pressing Enter clicks the form's button, which the listener above sees. A
  // long form with no button at all is the one case left.
  document.addEventListener('submit', (e) => {
    const fields = e.target.querySelectorAll('input:not([type=hidden]), textarea, select').length;
    if (!e.submitter && fields >= 4) report();
  }, true);

  window.__HFTrack = { describe, build: BUILD };
})();
