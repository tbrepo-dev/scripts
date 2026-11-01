const SCHEMAS = {
  employers: [
    { key: 'company', label: 'Company' },
    { key: 'title', label: 'Job title' },
    { key: 'address', label: 'Street address', wide: true },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP / postal code' },
    { key: 'country', label: 'Country' },
    { key: 'phone', label: 'Phone' },
    { key: 'current', label: 'I currently work here', type: 'check' },
    { key: 'start', label: 'Start', type: 'month' },
    { key: 'end', label: 'End', type: 'month' },
    { key: 'description', label: 'Description', type: 'area' },
  ],
  education: [
    { key: 'school', label: 'School' },
    { key: 'degree', label: 'Degree' },
    { key: 'field', label: 'Field of study' },
    { key: 'location', label: 'Location (City, State)' },
    { key: 'start', label: 'Start', type: 'month' },
    { key: 'end', label: 'End', type: 'month' },
    { key: 'gpa', label: 'GPA' },
  ],
  tools: [
    { key: 'name', label: 'Skill, software or equipment (e.g. Excel, forklift)' },
    { key: 'years', label: 'Years of professional experience' },
  ],
  customAnswers: [
    { key: 'keywords', label: 'Question contains (comma-separated words, all must appear)', wide: true },
    { key: 'answer', label: 'Answer', type: 'area' },
  ],
  references: [
    { key: 'name', label: 'Name' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'title', label: 'Job title' },
    { key: 'company', label: 'Company' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
  ],
};
const CONTACT_FIELDS = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'preferredName', label: 'Preferred name (blank uses your first name)' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP / postal code' },
  { key: 'country', label: 'Country' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'website', label: 'Website' },
  { key: 'portfolio', label: 'Portfolio (reel, ArtStation...)' },
  { key: 'github', label: 'GitHub' },
  { key: 'salary', label: 'Desired base salary per year (number only)' },
  { key: 'salaryCurrency', label: 'Salary currency (3 letters, e.g. USD)' },
];
const YES_NO = ['Yes', 'No'];
const COMMON_QUESTIONS = [
  { key: 'reside', label: 'Do you live in the US?', choices: YES_NO },
  { key: 'workAuth', label: 'Are you authorized to work in the US?', choices: YES_NO },
  { key: 'sponsorship', label: 'Do you now, or will you ever, need visa sponsorship?', choices: YES_NO },
  { key: 'relocate', label: 'Are you open to relocating?', choices: YES_NO },
  { key: 'relocationSupport', label: 'Will you need relocation support (help paying to move)?', choices: YES_NO },
  { key: 'over18', label: 'Are you at least 18?', choices: YES_NO },
  { key: 'pronouns', label: 'Pronouns', choices: ['He/Him', 'She/Her', 'They/Them', 'Decline to answer'] },
  { key: 'priorEmployment', label: 'Have you worked for this company, now or before?', choices: ['No'], preset: 'No' },
  { key: 'heardAbout', label: 'How did you hear about this job?', choices: ['LinkedIn, then Indeed, then Other'], preset: 'LinkedIn, then Indeed, then Other' },
];
const LISTS = ['employers', 'education', 'references', 'tools', 'customAnswers'];
const blankProfile = () => ({ contact: {}, employers: [], education: [], references: [], tools: [], customAnswers: [], skills: '', selfId: {}, coverLetterText: '' });
const DECLINE = 'Decline to answer';
const SELF_ID = [
  { key: 'gender', label: 'Gender identity', multi: true, choices: ['Man', 'Woman', 'Non-binary', DECLINE] },
  {
    key: 'race', label: 'Race or ethnicity', multi: true,
    choices: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino',
      'Middle Eastern or North African', 'Native Hawaiian or Pacific Islander', 'White', DECLINE],
  },
  {
    key: 'orientation', label: 'Sexual orientation', multi: true,
    choices: ['Heterosexual', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Asexual', 'Queer', DECLINE],
  },
  { key: 'transgender', label: 'Person of transgender experience', choices: ['Yes', 'No', DECLINE] },
  { key: 'veteran', label: 'Veteran status', choices: ['Not a veteran', 'Veteran, protected status', 'Veteran, non-protected status', DECLINE] },
  { key: 'disability', label: 'Disability', choices: ['Yes', 'No', DECLINE] },
];

let profile = blankProfile();
let saveTimer = null;

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $('status').textContent = text;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await chrome.storage.local.set({ profile });
    setStatus('Saved.');
  }, 200);
}

function fieldEl(item, f) {
  const label = document.createElement('label');
  if (f.type === 'check') {
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!item[f.key];
    box.addEventListener('change', () => {
      item[f.key] = box.checked;
      save();
      const card = box.closest('.card');
      const end = card.querySelector('[data-key=end]');
      if (end) end.disabled = box.checked;
    });
    label.append(box, f.label);
    return label;
  }
  label.textContent = f.label;
  const input = document.createElement(f.type === 'area' ? 'textarea' : 'input');
  if (f.type !== 'area') input.type = f.type === 'month' ? 'month' : 'text';
  input.dataset.key = f.key;
  input.value = item[f.key] || '';
  if (f.key === 'end' && item.current) input.disabled = true;
  input.addEventListener('input', () => {
    item[f.key] = input.value;
    save();
  });
  label.append(input);
  if (f.type === 'area' || f.wide) label.className = 'wide';
  return label;
}

function render(listName) {
  const root = $(listName);
  root.textContent = '';
  profile[listName].forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const f of SCHEMAS[listName]) grid.append(fieldEl(item, f));

    const bar = document.createElement('div');
    bar.className = 'bar';
    const button = (text, onClick, disabled) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.disabled = !!disabled;
      b.addEventListener('click', () => {
        onClick();
        save();
        render(listName);
      });
      bar.append(b);
    };
    const swap = (a, b) => {
      const list = profile[listName];
      [list[a], list[b]] = [list[b], list[a]];
    };
    button('Move up', () => swap(i, i - 1), i === 0);
    button('Move down', () => swap(i, i + 1), i === profile[listName].length - 1);
    button('Remove', () => profile[listName].splice(i, 1));

    card.append(grid, bar);
    root.append(card);
  });
}

function renderChoices(rootId, questions) {
  const root = $(rootId);
  root.textContent = '';
  profile.selfId = profile.selfId || {};
  for (const q of questions) {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('label');
    title.textContent = q.label;
    card.append(title);
    if (q.multi) {
      const list = document.createElement('div');
      list.className = 'checks';
      for (const choice of q.choices) {
        const label = document.createElement('label');
        label.className = 'check';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = [].concat(profile.selfId[q.key] || []).includes(choice);
        box.addEventListener('change', () => {
          const chosen = new Set([].concat(profile.selfId[q.key] || []));
          if (box.checked) chosen.add(choice);
          else chosen.delete(choice);
          profile.selfId[q.key] = [...chosen];
          save();
        });
        label.append(box, choice);
        list.append(label);
      }
      card.append(list);
    } else {
      const select = document.createElement('select');
      for (const choice of ['', ...q.choices]) {
        const option = document.createElement('option');
        option.value = choice;
        option.textContent = choice || '(leave blank)';
        select.append(option);
      }
      select.value = profile.selfId[q.key] !== undefined ? profile.selfId[q.key] : (q.preset || '');
      select.addEventListener('change', () => {
        profile.selfId[q.key] = select.value;
        save();
      });
      card.append(select);
    }
    root.append(card);
  }
}

// Yes or no answers taught from an application with "Teach a field".
async function renderTaught() {
  const { answers = {} } = await chrome.storage.local.get('answers');
  const root = $('taught');
  root.textContent = '';
  const entries = Object.entries(answers);
  if (!entries.length) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.textContent = 'None yet.';
    root.append(none);
    return;
  }
  for (const [question, answer] of entries) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px';
    const text = document.createElement('span');
    text.textContent = `${answer}: "${question}"`;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      delete answers[question];
      await chrome.storage.local.set({ answers });
      renderTaught();
    });
    card.append(text, remove);
    root.append(card);
  }
}

function renderAll() {
  renderTaught();
  $('coverText').value = profile.coverLetterText || '';
  renderChoices('selfId', SELF_ID);
  renderChoices('commonQuestions', COMMON_QUESTIONS);
  const contact = $('contact');
  contact.textContent = '';
  for (const f of CONTACT_FIELDS) contact.append(fieldEl(profile.contact, f));
  LISTS.forEach(render);
  $('skills').value = profile.skills || '';
}

// Employers used to have one Location box. "12 Main St, Boston, MA 02116" splits
// from the right: state and ZIP last, then the city, and the rest is the street.
function splitLocation(job) {
  if (!job.location) return job;
  const { location, ...rest } = job;
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  const out = { ...rest };
  const last = parts.length > 1 ? parts.pop() : null;
  if (last) {
    const m = /^(.*?)\s*(\d{5}(?:-\d{4})?)$/.exec(last);
    if (m) out.zip = out.zip || m[2];
    const state = m ? m[1] : last;
    if (state) out.state = out.state || state;
  }
  if (parts.length) out.city = out.city || parts.pop();
  if (parts.length) out.address = out.address || parts.join(', ');
  return out;
}

// Resumes rarely give an employer's address, so reloading one shouldn't wipe
// what was typed by hand.
function keepTypedDetails(job, previous) {
  const name = (job.company || '').trim().toLowerCase();
  const old = name && previous.find((p) => (p.company || '').trim().toLowerCase() === name);
  if (!old) return job;
  const out = { ...job };
  for (const key of ['address', 'city', 'state', 'zip', 'phone']) {
    if (!out[key] && old[key]) out[key] = old[key];
  }
  return out;
}

// A reply replaces what the resume covers. Blank sections keep what's there,
// so a resume without references doesn't wipe the ones already entered.
function applyParsed(parsed) {
  const next = { ...profile };
  next.contact = { ...profile.contact, ...(parsed.contact || {}) };
  for (const list of LISTS) {
    if (Array.isArray(parsed[list]) && parsed[list].length) next[list] = parsed[list];
  }
  next.employers = next.employers.map(splitLocation).map((job) => keepTypedDetails(job, profile.employers));
  if (parsed.skills) next.skills = parsed.skills;
  profile = next;
  renderAll();
  return chrome.storage.local.set({ profile });
}

function describeParsed(parsed) {
  const n = (list) => (parsed[list] || []).length;
  const lines = [`Read ${n('employers')} employers, ${n('education')} schools and ${n('references')} references. Please check them below.`];
  for (const note of parsed.notes || []) lines.push(`• ${note}`);
  return lines.join('\n');
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

// A .docx is a zip holding word/document.xml. This reads that one entry using
// the browser's own inflate, then keeps the paragraph text.
// A cover letter's paragraphs: a blank line between them, except short lines
// like a greeting or a signature, which stay on consecutive lines.
function paragraphsToLetter(paragraphs) {
  const kept = paragraphs.map((p) => p.trim()).filter(Boolean);
  let out = '';
  kept.forEach((p, i) => {
    if (i) out += kept[i - 1].length < 60 && p.length < 60 ? '\n' : '\n\n';
    out += p;
  });
  return out;
}

async function docxText(buffer, letter) {
  const view = new DataView(buffer);
  let eocd = buffer.byteLength - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('this .docx file looks damaged');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, at + 46, nameLen));
    if (name === 'word/document.xml') {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = new Blob([new Uint8Array(buffer, start, compressed)]);
      const stream = method === 8 ? raw.stream().pipeThrough(new DecompressionStream('deflate-raw')) : raw.stream();
      const xml = await new Response(stream).text();
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const paragraphs = [...doc.getElementsByTagName('w:p')]
        .map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent).join(''));
      return letter ? paragraphsToLetter(paragraphs) : paragraphs.filter(Boolean).join('\n');
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('no document text found in this .docx file');
}

async function loadResume(file) {
  const out = $('resumeStatus');
  const key = $('apiKey').value.trim();
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop().toLowerCase();
  const type = file.type || 'application/octet-stream';

  await chrome.storage.local.set({ resumeFile: { name: file.name, type, base64: toBase64(buffer) } });
  $('resumeName').textContent = file.name;

  if (!key) {
    out.textContent = 'File saved for uploading to sites. To fill in your profile from it, add an API key and load it again, or use a Claude chat below.';
    return;
  }

  $('pickResume').disabled = true;
  out.textContent = 'Reading your resume…';
  try {
    const resume = ext === 'pdf' ? { pdfBase64: toBase64(buffer) }
      : ext === 'docx' ? { text: await docxText(buffer) }
        : { text: new TextDecoder().decode(buffer) };
    const parsed = await window.ResumeParser.parse({ apiKey: key, resume });
    await applyParsed(parsed);
    out.textContent = describeParsed(parsed);
  } catch (err) {
    out.textContent = `Couldn't read it: ${err.message}`;
  } finally {
    $('pickResume').disabled = false;
  }
}

async function loadCoverLetter(file) {
  const buffer = await file.arrayBuffer();
  const base64 = toBase64(buffer);
  await chrome.storage.local.set({ coverLetterFile: { name: file.name, type: file.type || 'application/octet-stream', base64 } });
  showCoverLetter(file.name);

  // Some forms have a text box instead of an upload, so keep the words too.
  const say = (text) => { $('coverStatus').textContent = text; };
  const ext = file.name.split('.').pop().toLowerCase();
  let text = '';
  try {
    if (ext === 'txt' || ext === 'md') {
      text = new TextDecoder().decode(buffer);
    } else if (ext === 'docx') {
      text = await docxText(buffer, true);
    } else if (ext === 'pdf') {
      const key = $('apiKey').value.trim();
      if (!key) {
        say('Saved the file. To also save its text for forms with a text box, add an API key above and load it again, or paste the text below.');
        return;
      }
      say('Reading the text…');
      text = await window.ResumeParser.extractText({ apiKey: key, pdfBase64: base64 });
    }
  } catch (err) {
    say(`Saved the file, but couldn't read its text: ${err.message}. You can paste the text below.`);
    return;
  }
  if (!text.trim()) {
    say('Saved the file. Paste its text below for forms with a text box.');
    return;
  }
  profile.coverLetterText = text.trim();
  $('coverText').value = profile.coverLetterText;
  save();
  say('Saved the letter\'s text too. Read it over below, since line breaks may need a touch-up.');
}

function showCoverLetter(name) {
  $('coverName').textContent = name || '';
  $('removeCover').hidden = !name;
}

$('pickCover').addEventListener('click', () => $('coverFile').click());
$('coverFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadCoverLetter(file);
  e.target.value = '';
});
$('coverText').addEventListener('input', (e) => {
  profile.coverLetterText = e.target.value;
  save();
});
$('removeCover').addEventListener('click', async () => {
  await chrome.storage.local.remove('coverLetterFile');
  showCoverLetter('');
});

$('pickResume').addEventListener('click', () => $('resumeFile').click());
$('resumeFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadResume(file);
  e.target.value = '';
});
$('apiKey').addEventListener('input', (e) => chrome.storage.local.set({ apiKey: e.target.value.trim() }));

// A chat turns "example.com" into a markdown link; a form wants the bare text.
function unlink(value) {
  if (typeof value === 'string') return value.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  if (Array.isArray(value)) return value.map(unlink);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unlink(v)]));
  }
  return value;
}

$('copyPrompt').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(window.ResumeParser.manualPrompt());
  e.target.textContent = 'Copied';
});
$('usePaste').addEventListener('click', async () => {
  const raw = $('pasteJson').value.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed = unlink(window.ResumeParser.stripNulls(JSON.parse(raw)));
    await applyParsed(parsed);
    $('resumeStatus').textContent = describeParsed(parsed);
    $('pasteJson').value = '';
  } catch (err) {
    $('resumeStatus').textContent = `That reply isn't valid JSON: ${err.message}`;
  }
});

const addTo = (list) => () => {
  profile[list].push({});
  save();
  render(list);
};
$('addEmployer').addEventListener('click', addTo('employers'));
$('addSchool').addEventListener('click', addTo('education'));
$('addReference').addEventListener('click', addTo('references'));
$('addTool').addEventListener('click', addTo('tools'));
$('addAnswer').addEventListener('click', addTo('customAnswers'));
$('skills').addEventListener('input', (e) => {
  profile.skills = e.target.value;
  save();
});

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'history-filler-profile.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== 'object' || !LISTS.some((l) => Array.isArray(data[l]))) throw new Error('no profile lists in it');
    profile = { ...blankProfile(), ...data };
    await chrome.storage.local.set({ profile });
    renderAll();
    setStatus('Imported.');
  } catch (err) {
    setStatus(`Couldn't import that file: ${err.message}`);
  }
  e.target.value = '';
});

// Job tracking sheet. The links live beside the profile, like the API key, so
// they aren't in the exported profile file.
async function showSheetStatus() {
  const { sheetLast, sheetPending = [] } = await chrome.storage.local.get(['sheetLast', 'sheetPending']);
  const lines = [];
  if (sheetLast) lines.push(`Last: ${sheetLast.text}`);
  if (sheetPending.length) lines.push(`${sheetPending.length} waiting to be added. Click Check sheet to send them now.`);
  $('sheetStatus').textContent = lines.join('\n');
}

for (const id of SHEET_KEYS) {
  $(id).addEventListener('input', (e) => chrome.storage.local.set({ [id]: e.target.value.trim() }));
}
$('copyConnector').addEventListener('click', async (e) => {
  const script = await (await fetch(chrome.runtime.getURL('sheet-connector.gs'))).text();
  await navigator.clipboard.writeText(script);
  e.target.textContent = 'Copied';
});
// Adds the header row if it's missing, and sends any rows that failed before.
$('checkSheet').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  await chrome.storage.local.set({ sheetUrl: $('sheetUrl').value.trim(), sheetScriptUrl: $('sheetScriptUrl').value.trim() });
  button.disabled = true;
  $('sheetStatus').textContent = 'Checking…';
  const { sheetPending = [] } = await chrome.storage.local.get('sheetPending');
  try {
    const data = await sendToSheet(sheetPending);
    const sent = sheetPending.length ? ` Added the ${sheetPending.length} waiting.` : '';
    const text = `Connected to "${data.book}", tab "${data.tab}". The header row is in place.${sent}`;
    await chrome.storage.local.set({ sheetPending: [], sheetLast: { ok: true, text, when: Date.now() } });
  } catch (err) {
    await chrome.storage.local.set({ sheetLast: { ok: false, text: err.message, when: Date.now() } });
  }
  button.disabled = false;
  showSheetStatus();
});

if (chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.answers) renderTaught();
    if (changes.sheetLast || changes.sheetPending) showSheetStatus();
  });
}

chrome.storage.local.get(SHEET_KEYS).then((stored) => {
  for (const id of SHEET_KEYS) $(id).value = stored[id] || '';
  showSheetStatus();
});

chrome.storage.local.get(['profile', 'apiKey', 'resumeFile', 'coverLetterFile']).then((stored) => {
  if (stored.profile) {
    profile = { ...blankProfile(), ...stored.profile };
    if (profile.employers.some((job) => job.location)) {
      profile.employers = profile.employers.map(splitLocation);
      chrome.storage.local.set({ profile });
    }
  }
  if (stored.apiKey) $('apiKey').value = stored.apiKey;
  if (stored.resumeFile) $('resumeName').textContent = stored.resumeFile.name;
  showCoverLetter(stored.coverLetterFile && stored.coverLetterFile.name);
  renderAll();
});
