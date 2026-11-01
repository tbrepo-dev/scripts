// Adds one site to Find jobs. The popup and the Find jobs page both use it.
// A site is added only if it can be read: a Greenhouse, Lever or Ashby careers
// page that has a job list, or a Google Sheet of jobs. Anything else is turned
// down with the reason.

// Resolves to { ok, text }. Saved sites live in chrome.storage as myCompanies
// and mySheets.
async function addSite(input) {
  const url = String(input || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, text: 'Paste a web address, starting with https://' };
  const { myCompanies = [], mySheets = [] } = await chrome.storage.local.get(['myCompanies', 'mySheets']);

  const company = JobSearch.parseCompanyUrl(url);
  if (company) {
    const known = [...JobSearch.DEFAULT_COMPANIES, ...myCompanies];
    if (known.some((c) => c.platform === company.platform && c.slug === company.slug)) {
      return { ok: false, text: 'That company is already on the list.' };
    }
    const entry = { ...company, name: company.slug, group: 'mine' };
    try {
      const count = await JobSearch.checkCompany(entry);
      await chrome.storage.local.set({ myCompanies: [...myCompanies, entry] });
      return { ok: true, text: `Added ${company.slug}, with ${count} open job${count === 1 ? '' : 's'}.` };
    } catch (e) {
      return { ok: false, text: `Couldn't find a job list for "${company.slug}", so it can't be searched.` };
    }
  }

  const csv = JobSearch.sheetSource(url);
  if (csv) {
    if (mySheets.some((s) => s.csv === csv)) return { ok: false, text: 'That spreadsheet is already on the list.' };
    const name = `Spreadsheet ${mySheets.length + 1}`;
    try {
      const count = (await JobSearch.loadSheet({ name, csv })).length;
      if (!count) {
        return { ok: false, text: 'It opened, but no rows had both a job title and a full web address (https://…) for the job. Check its headings and that the links are visible text.' };
      }
      await chrome.storage.local.set({ mySheets: [...mySheets, { name, view: url, csv }] });
      return { ok: true, text: `Added ${name}, with ${count} job${count === 1 ? '' : 's'}.` };
    } catch (e) {
      return { ok: false, text: `Couldn't use that spreadsheet: ${e.message}.` };
    }
  }

  // Any other site can't be read job by job. Say whether it refuses or just isn't supported.
  let opens = false;
  try {
    opens = (await fetch(url, { credentials: 'omit' })).ok;
  } catch (e) { /* refuses to be read */ }
  return {
    ok: false,
    text: opens
      ? 'That site opens, but its jobs can\'t be read automatically. Only Greenhouse, Lever, Ashby and Google Sheets can be searched.'
      : 'That site doesn\'t allow its listings to be read, so it can\'t be searched.',
  };
}
