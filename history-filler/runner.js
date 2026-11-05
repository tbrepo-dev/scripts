// Fills one tab from the saved profile. The background worker and the Find Jobs
// page both use this, so it needs nothing from either.

async function injectFiller(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['filler.js', 'tracker.js'] });
}

const loadSettings = () => chrome.storage.local.get(['profile', 'overwrite', 'orderSites', 'siteMaps', 'resumeFile', 'coverLetterFile', 'answers']);

// Runs in the page's own world, so the site's upload code sees an ordinary file.
async function putFileInPage(role, file) {
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
  const attach = () => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], file.name, { type: file.type }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // A page that has only just loaded may not be ready for a file yet: Greenhouse
  // then shows "Cannot read properties of undefined (reading 'uploadFile')", or
  // quietly does nothing. A page that took the file changes around the box (the
  // file name shows, or the box is swapped out), so when nothing changes, wait a
  // moment and hand the file over again.
  const around = () => {
    let node = input.parentElement;
    for (let level = 0; level < 4 && node && node.parentElement && node.parentElement !== document.body; level++) node = node.parentElement;
    return node ? (node.textContent || '') : '';
  };
  const before = around();
  const refused = () => {
    let node = input.parentElement;
    for (let level = 0; level < 6 && node && node !== document.body; level++, node = node.parentElement) {
      const text = node.textContent || '';
      if (text.length < 600 && /cannot read propert|uploadfile|upload failed|something went wrong/i.test(text)) return true;
    }
    return false;
  };
  // Greenhouse can't take a file until its page has set up the uploader for that
  // box (about a second after load); a file handed over earlier is refused with
  // "Cannot read properties of undefined (reading 'uploadFile')". Wait until the
  // page's own uploader list has this box in it.
  const uploaderReady = () => {
    const key = Object.keys(input).find((k) => k.startsWith('__reactFiber'));
    for (let fiber = key && input[key], depth = 0; fiber && depth < 80; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && props.uploadManager) {
        return !!(props.uploadManager.uploaders && props.uploadManager.uploaders[props.id || input.id]);
      }
    }
    return true; // not a page that works this way
  };
  for (let wait = 0; wait < 24 && !uploaderReady(); wait++) await new Promise((resolve) => setTimeout(resolve, 500));
  attach();
  // Some pages take ten seconds or more to be ready, so keep trying for a while.
  for (let tries = 0; tries < 8; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!input.isConnected) break;
    if (around() !== before && !refused()) break;
    attach();
  }
  // Still showing an error after all the tries: the page won't take it.
  if (input.isConnected && refused()) return `refused:${file.name}`;
  return file.name;
}

const uploadNotes = [];

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
  const result = put && put.result;
  if (typeof result === 'string' && result.startsWith('refused:')) {
    uploadNotes.push(`The page would not take the ${role === 'cover' ? 'cover letter' : 'resume'} (it showed an error). Reload the page, wait a few seconds, and click Fill everything again.`);
    return null;
  }
  return result;
}

async function fillAllInTab(tabId) {
  const { profile, overwrite = false, orderSites = {}, siteMaps = {}, resumeFile = null, coverLetterFile = null, answers = {} } = await loadSettings();
  if (!profile) return { error: 'Your profile is empty. Open "Edit profile" and load your resume.' };

  uploadNotes.length = 0;
  await injectFiller(tabId);
  const attachedNames = [
    await attachToTab(tabId, 'resume', resumeFile),
    await attachToTab(tabId, 'cover', coverLetterFile),
  ].filter(Boolean);

  // Say so when the page has an upload this profile has no file for, instead of leaving the box blank.
  const noFile = [];
  for (const [role, file, word] of [['resume', resumeFile, 'resume'], ['cover', coverLetterFile, 'cover letter']]) {
    if (file && file.base64) continue;
    const seen = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: (r) => window.__HF.hasUpload(r), args: [role] });
    if (seen.some((m) => m.result)) noFile.push(`This page has a ${word} upload, but this profile has no ${word} file saved. Add one under Edit profile.`);
  }

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
  return { summary: [...summary, ...hits.flatMap((x) => x.summary), ...noFile, ...uploadNotes] };
}
