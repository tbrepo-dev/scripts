// Runs the filler in every frame of a tab. Popup and hotkeys both come through here.
importScripts('runner.js', 'sheet-log.js', 'draft.js');

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
};

// Job title and company for a tab. Find Jobs records what it opened in each
// tab, which beats reading the page, as long as the tab is still on that site.
async function jobForTab(tab, fromPage) {
  const slot = `job:${tab.id}`;
  const opened = (await chrome.storage.session.get(slot))[slot];
  const page = fromPage || {};
  const sameSite = opened && hostOf(opened.url) === hostOf(tab.url);
  const pick = (k) => (sameSite ? opened[k] || page[k] : page[k] || (opened && opened[k])) || '';
  return { position: pick('position'), company: pick('company'), url: page.url || tab.url };
}

// The job a tab is showing, read from the page and the Find Jobs record.
async function pageJob(tab) {
  let fromPage = null;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['tracker.js'] });
    const found = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.__HFTrack.describe(),
    });
    // Usually the top page knows; an embedded form (Greenhouse) may know better.
    const all = found.map((r) => r.result).filter(Boolean);
    fromPage = all.find((j) => j.position && j.company) || all[0];
  } catch (e) { /* a page the extension can't read; the Find Jobs record may still have it */ }
  const job = await jobForTab(tab, fromPage);
  job.url = tab.url;
  return job;
}

// Puts drafted answers into the boxes they were written for.
async function applyDrafts(tabId, drafts, total) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (answers) => window.__HF.putDrafts(answers),
    args: [drafts],
  });
  const done = results.map((r) => r.result).filter(Boolean);
  const filled = done.reduce((n, r) => n + r.filled, 0);
  const failed = done.reduce((n, r) => n + r.failed, 0);
  await chrome.storage.session.remove(`draftPending:${tabId}`);
  const lines = [`Drafted ${filled} of ${total} answers. They have a blue outline: read and edit each one.`];
  const blank = total - filled - failed;
  if (blank > 0) lines.push(`${blank} left blank, since your profile doesn't cover ${blank === 1 ? 'it' : 'them'}.`);
  if (failed) lines.push(`${failed} couldn't be typed in. Orange outline: paste ${failed === 1 ? 'it' : 'them'} by hand.`);
  return { summary: lines };
}

// Writes answers to the open-ended questions on this page. With an API key
// it asks Claude straight away; without one it keeps the prompt for the popup
// to hand over, since the popup closes when you switch to a chat tab.
async function draftAnswers() {
  const tabId = await activeTabId();
  if (!tabId) return { error: 'No active tab.' };
  const tab = await chrome.tabs.get(tabId);
  const { profile, answers = {}, siteMaps = {}, apiKey = '' } = await chrome.storage.local.get(['profile', 'answers', 'siteMaps', 'apiKey']);
  if (!profile) return { error: 'Your profile is empty. Open "Edit profile" and load your resume.' };

  await injectFiller(tabId);
  const found = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (opts) => window.__HF.findOpenQuestions(opts),
    args: [{ profile, answers, siteMaps }],
  });
  const seen = found.map((r) => r.result).filter(Boolean);
  const questions = seen.flatMap((r) => r.questions);
  if (!questions.length) {
    return { error: 'No open-ended questions found on this page. Fields your profile already answers are skipped.' };
  }

  const job = await pageJob(tab);
  const pageText = seen.map((r) => r.text).sort((a, b) => b.length - a.length)[0] || '';
  job.description = await jobDescription(tab.url, pageText);
  const prompt = buildDraftPrompt({ profile, job, questions });

  if (!apiKey) {
    await chrome.storage.session.set({ [`draftPending:${tabId}`]: { prompt, questions } });
    return { needKey: true, count: questions.length };
  }
  let drafts;
  try {
    drafts = parseDrafts(await askClaude(apiKey, prompt), questions);
  } catch (e) {
    return { error: `Couldn't draft the answers: ${e.message}` };
  }
  return applyDrafts(tabId, drafts, questions.length);
}

// A reply pasted from a Claude chat, for the page the prompt was made on.
async function useDraftReply(reply) {
  const tabId = await activeTabId();
  const key = `draftPending:${tabId}`;
  const pending = (await chrome.storage.session.get(key))[key];
  if (!pending) return { error: 'Nothing waiting on this page. Click "Draft answers" first.' };
  let drafts;
  try {
    drafts = parseDrafts(reply, pending.questions);
  } catch (e) {
    return { error: `Couldn't use that reply: ${e.message}.` };
  }
  return applyDrafts(tabId, drafts, pending.questions.length);
}

const KIND = {
  emp: { list: 'employers', word: 'employment' },
  edu: { list: 'education', word: 'education' },
  ref: { list: 'references', word: 'reference' },
};

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id;
}

async function fill(kind) {
  const tabId = await activeTabId();
  if (!tabId) return { error: 'No active tab.' };

  const { profile = {}, overwrite = false, orderSites = {}, siteMaps = {} } = await loadSettings();
  const { list, word } = KIND[kind];
  const items = profile[list] || [];
  if (!items.length) return { error: `Your profile has no ${list} yet. Open "Edit profile" to add them.` };

  await injectFiller(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (opts) => window.__HF.run(opts),
    args: [{ kind, items, overwrite, orderSites, siteMaps }],
  });

  const hits = results.map((r) => r.result).filter((r) => r && r.found);
  if (!hits.length) {
    return { error: `No ${word} fields or "Add" button found on this page. If the fields are there, use "Teach a field".` };
  }
  return hits.reduce((best, r) => (r.filled > best.filled ? r : best));
}

async function fillAll() {
  const tabId = await activeTabId();
  if (!tabId) return { error: 'No active tab.' };
  return fillAllInTab(tabId);
}

async function teach() {
  const tabId = await activeTabId();
  if (!tabId) return { error: 'No active tab.' };
  await injectFiller(tabId);
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => window.__HF.teach(),
  });
  return { ok: true };
}

// Runs inside the page: sets a flatpickr date box, which only the page can reach.
function setDateInPage(year, month) {
  const find = (root) => {
    const hit = root.querySelector('input[data-hf-date]');
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      const inner = el.shadowRoot && find(el.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  const input = find(document);
  if (!input) return { ok: false };
  const root = input.getRootNode();
  const owner = input._flatpickr ? input
    : [...root.querySelectorAll('*')].find((n) => n._flatpickr);
  if (!owner) return { ok: false };
  owner._flatpickr.setDate(new Date(year, month - 1, 1), true);
  return { ok: !!input.value };
}

// Runs inside the page: types into the marked SmartRecruiters search box and
// clicks the suggestion that matches.
async function pickInPage(text) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (root) => {
    const hit = root.querySelector('input[data-hf-pick]');
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      const inner = el.shadowRoot && find(el.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  const input = find(document);
  if (!input) return { ok: false, why: 'no input' };
  let host = null;
  for (let r = input.getRootNode(); r && r.host; r = r.host.getRootNode()) {
    if (r.host.tagName === 'SPL-AUTOCOMPLETE') { host = r.host; break; }
  }
  if (!host) return { ok: false, why: 'no host' };
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  input.focus();
  set.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  let shown = '';
  for (const ch of text) {
    shown += ch;
    set.call(input, shown);
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true, composed: true }));
  }
  const first = (o) => o.textContent.trim().split(String.fromCharCode(10))[0].trim().toLowerCase();
  let pick = null;
  let seen = [];
  for (let i = 0; i < 20 && !pick; i++) {
    await sleep(300);
    const opts = [...host.shadowRoot.querySelectorAll('spl-select-option')];
    seen = opts.map(first);
    pick = opts.find((o) => first(o) === text.toLowerCase()) || (i > 6 ? opts[0] : null);
  }
  if (!pick) return { ok: false, why: 'no options', seen };
  pick.click();
  await sleep(600);
  return { ok: !!host.getAttribute('value'), seen };
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.action === 'draftAnswers' || msg.action === 'useDraftReply') {
    (msg.action === 'draftAnswers' ? draftAnswers() : useDraftReply(msg.reply))
      .then(respond, (e) => respond({ error: e.message }));
    return true;
  }
  if (msg.action === 'logApplication' && sender.tab) {
    jobForTab(sender.tab, msg.job).then((job) => logApplication(job, false))
      .then(respond, (e) => respond({ error: e.message }));
    return true;
  }
  if (msg.action === 'pickInPage') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] },
      world: 'MAIN',
      func: pickInPage,
      args: [msg.text],
    }).then((r) => respond(r[0] && r[0].result), () => respond({ ok: false }));
    return true;
  }
  if (msg.action === 'setDateMain') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] },
      world: 'MAIN',
      func: setDateInPage,
      args: [msg.year, msg.month],
    }).then((r) => respond(r[0] && r[0].result), () => respond({ ok: false }));
    return true;
  }
  const work = msg.action === 'teach' ? teach()
    : msg.action === 'fillAll' ? fillAll()
      : fill(msg.kind);
  work.then(respond, (e) => respond({ error: e.message }));
  return true; // keeps the channel open for the async response
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill-everything') fillAll().catch(() => {});
  if (command === 'fill-employment') fill('emp').catch(() => {});
});
