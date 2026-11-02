const $ = (id) => document.getElementById(id);

const WORDS = { emp: 'employers', edu: 'schools', ref: 'references' };

function show(text, isError) {
  $('result').textContent = text;
  $('result').className = isError ? 'err' : '';
}

function summarize(res) {
  const lines = [`Filled ${res.blocks} of ${res.total} ${WORDS[res.kind]} (${res.filled} fields).`];
  if (res.skipped) lines.push(`${res.skipped} fields already had a value and were left alone.`);
  if (res.flagged.length) lines.push(`Check the orange ones: ${res.flagged.join(', ')}.`);
  if (res.stoppedBecause) lines.push(`Stopped: ${res.stoppedBecause}.`);
  return lines.join('\n');
}

async function runFill(message, button) {
  button.disabled = true;
  show('Filling…');
  const res = await chrome.runtime.sendMessage(message);
  button.disabled = false;
  if (res.error) show(res.error, true);
  else if (res.summary) show(res.summary.join('\n'));
  else show(summarize(res), !!(res.flagged.length || res.stoppedBecause));
}

let host = '';

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab.url).hostname;
  } catch (e) {
    return '';
  }
}

async function init() {
  const { profile = {}, overwrite = false, orderSites = {} } = await chrome.storage.local.get(['profile', 'overwrite', 'orderSites']);
  host = await activeHost();
  const chosen = orderSites[host];
  $('oldestFirst').checked = chosen === undefined ? /(^|\.)smartrecruiters\.com$/.test(host) : chosen;
  $('oldestFirst').disabled = !host;
  const count = (list, word) => {
    const n = (profile[list] || []).length;
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  };
  const first = (profile.employers || [])[0];
  $('counts').textContent = `${count('employers', 'employer')}, ${count('education', 'school')}, ${count('references', 'reference')}`
    + (first ? `
First job it fills: ${[first.title, first.company].filter(Boolean).join(', ')}` : '');
  $('overwrite').checked = overwrite;
  fillProfilePick($('profilePick'), await getProfileSlots());
}

$('profilePick').addEventListener('change', async (e) => {
  try {
    await switchProfile(Number(e.target.value));
    show('');
    await init();
  } catch (err) {
    show(`Couldn't switch profiles: ${err.message}`, true);
  }
});

$('fillAll').addEventListener('click', (e) => runFill({ action: 'fillAll' }, e.currentTarget));
$('fillEmp').addEventListener('click', (e) => runFill({ action: 'fill', kind: 'emp' }, e.currentTarget));
$('fillEdu').addEventListener('click', (e) => runFill({ action: 'fill', kind: 'edu' }, e.currentTarget));
$('fillRef').addEventListener('click', (e) => runFill({ action: 'fill', kind: 'ref' }, e.currentTarget));
$('overwrite').addEventListener('change', (e) => chrome.storage.local.set({ overwrite: e.target.checked }));
// Remembered per site: some list new entries on top, others at the bottom.
async function saveOrder(oldestFirst) {
  const { orderSites = {} } = await chrome.storage.local.get('orderSites');
  orderSites[host] = oldestFirst;
  await chrome.storage.local.set({ orderSites });
}
$('oldestFirst').addEventListener('change', (e) => saveOrder(e.target.checked));

// Entries already on the page are skipped, so they have to be deleted first.
$('flip').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  $('oldestFirst').checked = !$('oldestFirst').checked;
  await saveOrder($('oldestFirst').checked);
  button.disabled = true;
  show('Order flipped. Filling employers…');
  const emp = await chrome.runtime.sendMessage({ action: 'fill', kind: 'emp' });
  show('Filling education…');
  const edu = await chrome.runtime.sendMessage({ action: 'fill', kind: 'edu' });
  button.disabled = false;
  const lines = [emp, edu].map((r) => (r.error ? r.error : summarize(r)));
  if ([emp, edu].some((r) => r.alreadyThere)) {
    lines.push('Entries already on the page were skipped. Delete them with the trash icons, then press Employers and Education: the flipped order is kept for this site.');
  }
  show(lines.join('\n'), [emp, edu].some((r) => r.error || r.stoppedBecause));
});
$('edit').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('findJobs').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('jobs.html') }));
// Drafts for the open-ended questions. Without an API key the request is kept
// for this page and shown here again if the popup was closed meanwhile.
let draftTab = null;

async function showManual() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  draftTab = tab && tab.id;
  const key = `draftPending:${draftTab}`;
  const pending = draftTab && (await chrome.storage.session.get(key))[key];
  $('manual').hidden = !pending;
  return pending;
}

$('draft').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  button.disabled = true;
  show('Reading the page and writing drafts…');
  const res = await chrome.runtime.sendMessage({ action: 'draftAnswers' });
  button.disabled = false;
  if (res.needKey) {
    await showManual();
    show(`Found ${res.count} open question${res.count === 1 ? '' : 's'}.`);
  } else if (res.error) show(res.error, true);
  else show(res.summary.join('\n'));
});
$('copyDraftPrompt').addEventListener('click', async (e) => {
  const pending = await showManual();
  if (!pending) return;
  await navigator.clipboard.writeText(pending.prompt);
  e.target.textContent = 'Copied';
});
$('useDraftReply').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ action: 'useDraftReply', reply: $('draftReply').value });
  if (res.error) return show(res.error, true);
  $('draftReply').value = '';
  $('manual').hidden = true;
  show(res.summary.join('\n'));
});

// Adds one site to Find jobs. It's checked first and turned down if it can't be
// read; after an add the box stays open for the next one.
$('includeSite').addEventListener('click', () => {
  $('siteForm').hidden = !$('siteForm').hidden;
  if (!$('siteForm').hidden) $('siteUrl').focus();
});
async function addOneSite() {
  const button = $('siteAdd');
  const say = (text, bad) => {
    $('siteMsg').textContent = text;
    $('siteMsg').style.color = bad ? 'var(--warn)' : '';
  };
  if (!$('siteUrl').value.trim()) return say('Paste a link first.', true);
  button.disabled = true;
  say('Checking…');
  const res = await addSite($('siteUrl').value);
  button.disabled = false;
  if (res.ok) {
    $('siteUrl').value = '';
    say(`${res.text} Paste another to add more.`);
  } else {
    say(res.text, true);
  }
}
$('siteAdd').addEventListener('click', addOneSite);
$('siteUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') addOneSite(); });
$('teach').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ action: 'teach' });
  if (res.error) show(res.error, true);
  else window.close();
});

// Copies what the open page's form is made of, to paste into a bug report. It
// holds each box's label, id and markup, but never what was typed into one.
$('copyLayout').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: describePageLayout });
    const layout = frames.map((f) => f.result).filter((r) => r && r.boxes.length);
    await navigator.clipboard.writeText(JSON.stringify({ page: new URL(tab.url).origin + new URL(tab.url).pathname, layout }, null, 1));
    show(`Copied ${layout.reduce((n, r) => n + r.boxes.length, 0)} boxes. Paste them into the chat.`);
  } catch (err) {
    show(`Couldn't read this page: ${err.message}`, true);
  }
  e.target.disabled = false;
});

// F5 only reloads the page, so a page keeps the old copy of the extension. This
// reloads the page first, then the extension, which closes this window.
$('reloadAll').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:/.test(tab.url || '')) await chrome.tabs.reload(tab.id);
  } catch (err) { /* the extension still reloads */ }
  setTimeout(() => chrome.runtime.reload(), 150);
});

init();
showManual();
