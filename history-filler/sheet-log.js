// Adds applications to the user's Google Sheet through the Apps Script
// connector they deployed (sheet-connector.gs). The background worker and the
// profile page both use this.

const SHEET_KEYS = ['sheetUrl', 'sheetScriptUrl'];

// YYYY-MM-DD in this computer's time zone.
const todayLocal = () => new Date().toLocaleDateString('en-CA');

function sheetLinkProblem(sheetUrl, sheetScriptUrl) {
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(sheetUrl)) return 'The sheet link should start with https://docs.google.com/spreadsheets/d/';
  if (!/^https:\/\/script\.google\.com\/.+\/exec\b/.test(sheetScriptUrl)) return 'The connector link should start with https://script.google.com/ and end in /exec';
  return '';
}

// Sends rows (empty to only check the link and add the header row).
async function sendToSheet(rows) {
  const { sheetUrl = '', sheetScriptUrl = '' } = await chrome.storage.local.get(SHEET_KEYS);
  const problem = sheetLinkProblem(sheetUrl, sheetScriptUrl);
  if (problem) throw new Error(problem);
  let res;
  try {
    // text/plain keeps this a simple request, which Apps Script accepts.
    res = await fetch(sheetScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ sheetUrl, rows }) });
  } catch (e) {
    throw new Error('Couldn\'t reach the connector. Check your connection.');
  }
  let data = null;
  try {
    data = JSON.parse(await res.text());
  } catch (e) { /* a Google sign-in or error page */ }
  if (!data || data.connector !== 'History Filler') {
    throw new Error('The connector link didn\'t answer. Check that it ends in /exec and that "Who has access" is set to Anyone.');
  }
  if (!data.ok) throw new Error(`The sheet said: ${data.error}`);
  return data;
}

const loggingNow = new Set();

// Logs one application. Automatic logs happen once per page, so clicking
// submit again after a form error doesn't add a second row.
async function logApplication(job, force) {
  const stored = await chrome.storage.local.get([...SHEET_KEYS, 'sheetLogged', 'sheetPending']);
  if (!stored.sheetUrl || !stored.sheetScriptUrl) return { off: true };

  const key = (job.url || '').split('#')[0];
  const logged = stored.sheetLogged || {};
  if (!force && key && (logged[key] || loggingNow.has(key))) return { skipped: true };
  loggingNow.add(key);
  try {
    const row = { position: job.position || '', company: job.company || '', date: todayLocal() };
    // Forget pages after 60 days.
    const cutoff = new Date(Date.now() - 60 * 864e5).toLocaleDateString('en-CA');
    for (const [k, day] of Object.entries(logged)) if (day < cutoff) delete logged[k];
    if (key) logged[key] = row.date;
    await chrome.storage.local.set({ sheetLogged: logged });

    // Rows that failed earlier go along with this one.
    const rows = [...(stored.sheetPending || []), row];
    const what = `${row.position || 'Untitled job'}${row.company ? ` at ${row.company}` : ''}`;
    try {
      const data = await sendToSheet(rows);
      const extra = rows.length > 1 ? ` (and ${rows.length - 1} saved from before)` : '';
      const text = `Added ${what} to "${data.book}"${extra}.`;
      await chrome.storage.local.set({ sheetPending: [], sheetLast: { ok: true, text, when: Date.now() } });
      return { ok: true, text };
    } catch (e) {
      const text = `Couldn't add ${what} to your sheet: ${e.message} It's saved and goes in with the next one.`;
      await chrome.storage.local.set({ sheetPending: rows, sheetLast: { ok: false, text, when: Date.now() } });
      return { error: text };
    }
  } finally {
    loggingNow.delete(key);
  }
}
