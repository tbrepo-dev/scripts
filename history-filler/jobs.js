const PAGE_SIZE = 5;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let allJobs = [];
let shown = 0;
let filling = false;
let myCompanies = [];
let mySheets = [];
let jobsOpened = {};

let feedSettings = { remotive: true, remoteok: true, adzuna: false, adzunaId: '', adzunaKey: '', adzunaCountry: 'us' };

// Feed answers are kept between visits, since some feeds ask not to be read often.
const apiStore = {
  async get(key) {
    const { apiCache = {} } = await chrome.storage.local.get('apiCache');
    const hit = apiCache[key];
    return hit && Date.now() - hit.at < hit.ttl ? hit.jobs : null;
  },
  async set(key, jobs, ttl) {
    const { apiCache = {} } = await chrome.storage.local.get('apiCache');
    const now = Date.now();
    for (const [k, v] of Object.entries(apiCache)) if (now - v.at >= v.ttl) delete apiCache[k];
    apiCache[key] = { at: now, ttl, jobs };
    await chrome.storage.local.set({ apiCache });
  },
};

function activeFeeds() {
  const s = feedSettings;
  const hasKeys = s.adzuna && s.adzunaId.trim() && s.adzunaKey.trim();
  return {
    remotive: s.remotive,
    remoteok: s.remoteok,
    adzuna: hasKeys ? { id: s.adzunaId.trim(), key: s.adzunaKey.trim(), country: s.adzunaCountry } : false,
  };
}

const safeLink = (url) => (/^https:\/\//i.test(url || '') ? url : null);

function setMessage(text) {
  $('message').textContent = text;
}

function companiesFor(group) {
  const built = JobSearch.DEFAULT_COMPANIES.filter((c) => group === 'all' || c.group === group);
  return [...built, ...myCompanies];
}

function selectedBoxes() {
  return [...document.querySelectorAll('#results input[type=checkbox]:checked')];
}

function updateButtons() {
  const n = selectedBoxes().length;
  $('fillBtn').disabled = filling || n === 0;
  $('fillBtn').textContent = n ? `Fill selected (${n})` : 'Fill selected';
  $('moreBtn').disabled = filling || shown >= allJobs.length;
  $('moreBtn').textContent = shown >= allJobs.length ? 'No more jobs' : 'Next 5 jobs';
  $('fillBar').hidden = shown === 0;
}

function jobCard(job) {
  const card = document.createElement('div');
  card.className = 'card job';
  card.dataset.id = job.id;

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('aria-label', `Select ${job.title}`);
  box.addEventListener('change', updateButtons);

  const body = document.createElement('div');
  body.className = 'job-body';

  const link = document.createElement(safeLink(job.url) ? 'a' : 'span');
  link.textContent = job.title;
  if (safeLink(job.url)) {
    link.href = job.url;
    link.target = '_blank';
    link.rel = 'noopener';
  }
  const tag = document.createElement('span');
  const best = job.score >= 0.99;
  tag.className = best ? 'tag best' : 'tag';
  tag.textContent = best ? 'Match' : 'Related';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = [job.company, job.location, job.source && !job.credit && `from ${job.source}`].filter(Boolean).join(' · ');
  if (job.credit && safeLink(job.credit.href)) {
    const via = document.createElement('a');
    via.href = job.credit.href;
    via.target = '_blank';
    via.rel = 'noopener';
    via.textContent = job.credit.label;
    meta.append(' · ', via);
  }

  const status = document.createElement('div');
  status.className = 'status';

  body.append(link, tag, meta, status);
  card.append(box, body);
  return card;
}

// The next batch replaces the last, except jobs you ticked, which stay until
// they're filled or unticked.
function showNext() {
  for (const card of [...document.querySelectorAll('#results .job')]) {
    if (!card.querySelector('input[type=checkbox]').checked) card.remove();
  }
  const next = allJobs.slice(shown, shown + PAGE_SIZE);
  for (const job of next) $('results').append(jobCard(job));
  const first = shown + 1;
  shown += next.length;
  if (next.length) $('position').textContent = `Showing ${first}-${shown} of ${allJobs.length}.`;
  updateButtons();
  $('searchForm').scrollIntoView({ block: 'start' });
}

async function runSearch(e) {
  e.preventDefault();
  const title = $('title').value.trim();
  if (!title) {
    setMessage('Type a job title first.');
    $('title').focus();
    return;
  }
  const group = $('group').value;
  const location = $('location').value.trim();
  chrome.storage.local.set({ jobSearch: { title, group, location } });

  $('searchBtn').disabled = true;
  $('results').textContent = '';
  $('position').textContent = '';
  allJobs = [];
  shown = 0;
  updateButtons();
  const companies = companiesFor(group);
  const sheetWords = mySheets.length ? ` and ${mySheets.length} spreadsheet${mySheets.length === 1 ? '' : 's'}` : '';
  setMessage(`Searching ${companies.length} companies${sheetWords}…`);

  const skip = new Set($('includeOpened').checked ? [] : Object.keys(jobsOpened));
  try {
    const feeds = activeFeeds();
    const adzunaSkipped = feedSettings.adzuna && !feeds.adzuna;
    const { jobs, failed, searched, feeds: feedNames } = await JobSearch.search({
      title, location, companies, sheets: mySheets, skip, feeds, store: apiStore,
    });
    allJobs = jobs;
    showNext();
    const lines = [];
    if (!jobs.length) {
      lines.push(`No jobs found across ${searched} companies${feedNames.length ? ` and ${feedNames.join(', ')}` : ''}. Try fewer words, a different field, or no location.`);
    } else {
      const where = `${searched} companies${feedNames.length ? ` and ${feedNames.join(', ')}` : ''}`;
      lines.push(`Found ${jobs.length} job${jobs.length === 1 ? '' : 's'} across ${where}, best matches first.`);
    }
    if (failed.length) lines.push(`Couldn't check: ${failed.join(', ')}.`);
    if (adzunaSkipped) lines.push('Adzuna is ticked but has no keys yet, so it was skipped.');
    setMessage(lines.join('\n'));
  } catch (err) {
    setMessage(`Search failed: ${err.message}`);
  }
  $('searchBtn').disabled = false;
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const timer = setTimeout(finish, 30000);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') finish();
    }, finish);
  });
}

// Forms usually draw a moment after the page loads.
async function waitForForm(tabId, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      // Counts inside web components too (SmartRecruiters draws its form in them).
      func: () => {
        const count = (root) => [...root.querySelectorAll('input:not([type=hidden]),select,textarea')]
          .filter((el) => el.getClientRects().length).length
          + [...root.querySelectorAll('*')].reduce((n, el) => n + (el.shadowRoot ? count(el.shadowRoot) : 0), 0);
        return count(document);
      },
    });
    if (results.some((r) => r.result >= 2)) return true;
    await sleep(500);
  }
  return false;
}

function setStatus(card, text, kind) {
  const el = card.querySelector('.status');
  el.textContent = text;
  el.className = `status ${kind || ''}`;
}

function addGoToTab(card, tabId) {
  const go = document.createElement('button');
  go.textContent = 'Go to tab';
  go.style.marginTop = '6px';
  go.addEventListener('click', () => chrome.tabs.update(tabId, { active: true }));
  card.querySelector('.job-body').append(go);
}

async function fillOne(job, card) {
  setStatus(card, 'Opening…');
  const url = safeLink(job.applyUrl) || safeLink(job.url);
  if (!url) {
    setStatus(card, 'This job has no usable link.', 'bad');
    return false;
  }
  // Up front, so a tab that later fails still isn't offered again.
  jobsOpened[job.id] = { title: job.title, company: job.company, url: job.url, opened: Date.now() };
  await chrome.storage.local.set({ jobsOpened });

  const tab = await chrome.tabs.create({ url, active: true });
  // So submitting from this tab logs the job's real title and company to the sheet.
  await chrome.storage.session.set({ [`job:${tab.id}`]: { position: job.title, company: job.company, url } });
  addGoToTab(card, tab.id);
  await waitForLoad(tab.id);
  if (!await waitForForm(tab.id, job.intermediate ? 10 : 30)) {
    setStatus(card, job.intermediate
      ? 'Opened. Click Apply on that page, then click the H icon and "Fill everything".'
      : 'The tab is open, but no form appeared. Open the application there and use "Fill everything".', job.intermediate ? '' : 'bad');
    return true;
  }
  setStatus(card, 'Filling…');
  const res = await fillAllInTab(tab.id);
  if (res.error && job.intermediate) setStatus(card, 'Opened. Click Apply on that page, then click the H icon and "Fill everything".');
  else if (res.error) setStatus(card, res.error, 'bad');
  else setStatus(card, `${res.summary.join('\n')}\nNot submitted: check the tab and submit it yourself.`, 'ok');
  return true;
}

async function fillSelected() {
  const { profile } = await chrome.storage.local.get('profile');
  if (!profile) {
    setMessage('Your profile is empty. Click the H icon, then "Edit profile", and load your resume first.');
    return;
  }
  const picks = selectedBoxes().map((box) => box.closest('.job'));
  if (!picks.length) return;

  filling = true;
  updateButtons();
  const self = await chrome.tabs.getCurrent();
  let done = 0;
  let opened = 0;
  // One at a time, in front: sites often stall forms in tabs nobody is looking at.
  for (const card of picks) {
    const job = allJobs.find((j) => j.id === card.dataset.id);
    setMessage(`Working on ${done + 1} of ${picks.length}…`);
    try {
      if (await fillOne(job, card)) opened++;
    } catch (err) {
      setStatus(card, `Couldn't fill this one: ${err.message}`, 'bad');
    }
    card.querySelector('input[type=checkbox]').checked = false;
    done++;
  }
  filling = false;
  updateButtons();
  setMessage(opened
    ? `Done. ${opened} tab${opened === 1 ? '' : 's'} opened. Check each one and submit it yourself.`
    : 'No tabs were opened.');
  if (self) chrome.tabs.update(self.id, { active: true });
}

// These sites don't let tools read their job listings, so this just opens the
// same search there. "Fill everything" works on any application you reach.
const SEARCH_SITES = {
  yandex: (q, l) => `https://yandex.com/search/?text=${q}${l ? `+jobs+${l}` : '+jobs'}`,
  // Google's own job listings: LinkedIn, Indeed, company pages and more in one list.
  google: (q, l) => `https://www.google.com/search?q=${q}${l ? `+jobs+${l}` : '+jobs'}&udm=8`,
  linkedin: (q, l) => `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}`,
  indeed: (q, l) => `https://www.indeed.com/jobs?q=${q}&l=${l}`,
  artstation: () => 'https://www.artstation.com/jobs',
  indies: () => 'https://www.workwithindies.com/',
};

function openSearchSite(site) {
  const q = encodeURIComponent($('title').value.trim()).replace(/%20/g, '+');
  const l = encodeURIComponent($('location').value.split(',')[0].trim()).replace(/%20/g, '+');
  chrome.tabs.create({ url: SEARCH_SITES[site](q, l) });
}

function renderCompanies() {
  const total = JobSearch.DEFAULT_COMPANIES.length + myCompanies.length;
  $('companyCount').textContent = `${total} companies`;
  const root = $('companyList');
  root.textContent = '';
  for (const c of myCompanies) {
    const row = document.createElement('div');
    row.className = 'company';
    const name = document.createElement('span');
    name.textContent = `${c.name} (added by you)`;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      myCompanies = myCompanies.filter((m) => m !== c);
      chrome.storage.local.set({ myCompanies });
      renderCompanies();
    });
    row.append(name, remove);
    root.append(row);
  }
  for (const sheet of mySheets) {
    const row = document.createElement('div');
    row.className = 'company';
    const link = document.createElement('a');
    link.href = sheet.view;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = sheet.name;
    const label = document.createElement('span');
    label.append('Spreadsheet: ', link, ' (added by you)');
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      mySheets = mySheets.filter((m) => m !== sheet);
      chrome.storage.local.set({ mySheets });
      renderCompanies();
    });
    row.append(label, remove);
    root.append(row);
  }
  const built = document.createElement('p');
  built.className = 'meta';
  built.textContent = `Built in: ${JobSearch.DEFAULT_COMPANIES.map((c) => c.name).join(', ')}.`;
  root.append(built);
}

// One site at a time, checked first by addSite and turned down if it can't be read.
async function addOneSite() {
  const say = (text) => { $('addMessage').textContent = text; };
  if (!$('addUrl').value.trim()) return say('Paste a link first.');
  $('addBtn').disabled = true;
  say('Checking…');
  const res = await addSite($('addUrl').value);
  $('addBtn').disabled = false;
  say(res.text);
  if (res.ok) $('addUrl').value = '';
}

// The popup adds sites too, so pick up its changes.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.myCompanies) myCompanies = changes.myCompanies.newValue || [];
  if (changes.mySheets) mySheets = changes.mySheets.newValue || [];
  if (changes.myCompanies || changes.mySheets) renderCompanies();
});

$('searchForm').addEventListener('submit', runSearch);
$('moreBtn').addEventListener('click', showNext);
$('fillBtn').addEventListener('click', fillSelected);
$('addBtn').addEventListener('click', addOneSite);
$('addUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') addOneSite(); });
for (const button of document.querySelectorAll('[data-site]')) {
  button.addEventListener('click', () => openSearchSite(button.dataset.site));
}

function saveFeedSettings() {
  feedSettings = {
    remotive: $('feedRemotive').checked,
    remoteok: $('feedRemoteok').checked,
    adzuna: $('feedAdzuna').checked,
    adzunaId: $('adzunaId').value,
    adzunaKey: $('adzunaKey').value,
    adzunaCountry: $('adzunaCountry').value,
  };
  chrome.storage.local.set({ feedSettings });
}

for (const id of ['feedRemotive', 'feedRemoteok', 'feedAdzuna', 'adzunaId', 'adzunaKey', 'adzunaCountry']) {
  $(id).addEventListener('change', saveFeedSettings);
  $(id).addEventListener('input', saveFeedSettings);
}
$('adzunaSignup').addEventListener('click', () => chrome.tabs.create({ url: 'https://developer.adzuna.com/signup' }));

chrome.storage.local.get(['jobSearch', 'myCompanies', 'mySheets', 'jobsOpened', 'feedSettings']).then((stored) => {
  feedSettings = { ...feedSettings, ...(stored.feedSettings || {}) };
  $('feedRemotive').checked = feedSettings.remotive;
  $('feedRemoteok').checked = feedSettings.remoteok;
  $('feedAdzuna').checked = feedSettings.adzuna;
  $('adzunaId').value = feedSettings.adzunaId;
  $('adzunaKey').value = feedSettings.adzunaKey;
  $('adzunaCountry').value = feedSettings.adzunaCountry;
  myCompanies = stored.myCompanies || [];
  mySheets = stored.mySheets || [];
  jobsOpened = stored.jobsOpened || {};
  if (stored.jobSearch) {
    $('title').value = stored.jobSearch.title || '';
    $('group').value = stored.jobSearch.group || 'art';
    $('location').value = stored.jobSearch.location || '';
  }
  renderCompanies();
});
