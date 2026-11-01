// History Filler sheet connector. Paste this into Apps Script (Extensions >
// Apps Script in your sheet) and deploy it as a web app. The extension sends
// each application here and this adds it to the sheet whose link you saved.

var HEADERS = ['Position', 'Company', 'Date Applied', 'Result'];

function doGet() {
  return reply({ ok: true, connector: 'History Filler' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var data = JSON.parse(e.postData.contents);
    var sheet = sheetFor(data.sheetUrl);
    var cols = headerColumns(sheet);
    var rows = data.rows || [];
    rows.forEach(function (r) { addRow(sheet, cols, r); });
    return reply({ ok: true, connector: 'History Filler', book: sheet.getParent().getName(), tab: sheet.getName(), added: rows.length });
  } catch (err) {
    return reply({ ok: false, connector: 'History Filler', error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// The tab the link points at (its #gid=), or the first tab.
function sheetFor(url) {
  if (!url) throw new Error('No sheet link was sent.');
  var book = SpreadsheetApp.openByUrl(url);
  var gid = /[#&?]gid=(\d+)/.exec(url);
  if (gid) {
    var hit = book.getSheets().filter(function (s) { return String(s.getSheetId()) === gid[1]; })[0];
    if (hit) return hit;
  }
  return book.getSheets()[0];
}

// Finds the header row, or inserts one at the top. A header the sheet already
// has keeps its own order, and any of the four it lacks are added on the right.
function headerColumns(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var first = sheet.getLastRow() ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  var names = first.map(function (v) { return String(v).trim().toLowerCase(); });
  var cols = HEADERS.map(function (h) { return names.indexOf(h.toLowerCase()) + 1; });

  if (cols[0] && cols[1]) {
    var next = width + 1;
    cols = cols.map(function (c, i) {
      if (c) return c;
      sheet.getRange(1, next).setValue(HEADERS[i]).setFontWeight('bold');
      return next++;
    });
    return cols;
  }

  if (sheet.getLastRow()) sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return [1, 2, 3, 4];
}

// Goes under the last row that has anything in it. Result is left blank.
function addRow(sheet, cols, r) {
  var row = sheet.getLastRow() + 1;
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date || '');
  sheet.getRange(row, cols[0]).setValue(r.position || '');
  sheet.getRange(row, cols[1]).setValue(r.company || '');
  var date = sheet.getRange(row, cols[2]);
  date.setValue(d ? new Date(+d[1], +d[2] - 1, +d[3]) : (r.date || ''));
  if (d) date.setNumberFormat('M/d/yyyy');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
