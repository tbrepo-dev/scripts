// Fills one tab from the saved profile. The background worker and the Find Jobs
// page both use this, so it needs nothing from either.

async function injectFiller(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['filler.js', 'tracker.js'] });
}

const loadSettings = () => chrome.storage.local.get(['profile', 'overwrite', 'orderSites', 'siteMaps', 'resumeFile', 'coverLetterFile', 'answers']);

// Runs in the page's own world, so the site's upload code sees an ordinary file.
function putFileInPage(role, file) {
  // The field may sit inside a web component's shadow root.
  const find = (root) => {
    const hit = root.querySelector(`input[type=file][data-hf-upload="${role}"]`);
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      const inner = el.shadowRoot && find(el.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  const input = find(document);
  if (!input) return null;
  delete input.dataset.hfUpload;
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], file.name, { type: file.type }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return file.name;
}

async function attachToTab(tabId, role, file) {
  if (!file || !file.base64) return null;
  const marks = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (r) => window.__HF.markUpload(r),
    args: [role],
  });
  const hit = marks.find((m) => m.result);
  if (!hit) return null;
  const [put] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [hit.frameId] },
    world: 'MAIN',
    func: putFileInPage,
    args: [role, file],
  });
  return put && put.result;
}

async function fillAllInTab(tabId) {
  const { profile, overwrite = false, orderSites = {}, siteMaps = {}, resumeFile = null, coverLetterFile = null, answers = {} } = await loadSettings();
  if (!profile) return { error: 'Your profile is empty. Open "Edit profile" and load your resume.' };

  await injectFiller(tabId);
  const attachedNames = [
    await attachToTab(tabId, 'resume', resumeFile),
    await attachToTab(tabId, 'cover', coverLetterFile),
  ].filter(Boolean);

  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (opts) => window.__HF.runAll(opts),
    args: [{ profile, overwrite, orderSites, siteMaps, answers, uploaded: attachedNames.length > 0 }],
  });
  const hits = results.map((x) => x.result).filter((x) => x && x.found);
  if (!hits.length && !attachedNames.length) {
    return { error: 'Nothing on this page matched your profile. If the fields are there, use "Teach a field".' };
  }
  const summary = attachedNames.map((name) => `Attached ${name}.`);
  return { summary: [...summary, ...hits.flatMap((x) => x.summary)] };
}
