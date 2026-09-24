// Dad Olympics — Google Apps Script
//
// Two jobs, one web app:
//   1. Photo drop: the app uploads photos straight into the Beer Olympics
//      Google Drive folder, so the boys never see a Google page.
//   2. Scores: the app reads and writes the MMXXVI scoreboard, kept in a
//      Google Sheet the script creates in the same folder on first use.
//
// ONE-TIME SETUP (about 5 minutes):
//   1. Go to https://script.google.com and click "New project"
//   2. Delete the sample code and paste this whole file in
//   3. Click Deploy -> New deployment -> gear icon -> "Web app"
//      - Execute as:      Me
//      - Who has access:  Anyone
//   4. Click Deploy. Google will ask you to authorise it — it's your
//      own script writing to your own Drive. It may warn the app is
//      "unverified"; click Advanced -> Go to <project name>.
//   5. Copy the Web app URL (ends in /exec) and paste it into
//      ENDPOINT in upload/index.html and SCORES_ENDPOINT in index.html.
//
// UPDATING AN EXISTING DEPLOYMENT (keeps the same URL):
//   Paste the new code, save, then Deploy -> Manage deployments -> pencil
//   icon -> Version: "New version" -> Deploy. Authorise again if asked.
//
// Photos land in the folder below, named with a timestamp prefix so
// they're easy to sort into year folders later.

const FOLDER_ID = '1RiC3LKhENH6OAUgA1mdYMcgsI_W6mAEM'; // Beer Olympics folder

const SCORE_TAB = 'MMXXVI';
const FIXED_COLS = ['ID', 'Event', 'Note', 'Entered by', 'Updated'];
const STARTING_DADS = ['Brownie', 'Fingers', 'Tinling', 'Rhys'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'saveEvent') return json_(withLock_(() => saveEvent_(body)));
    if (body.action === 'deleteEvent') return json_(withLock_(() => deleteEvent_(body.id)));
    if (body.action === 'addDad') return json_(withLock_(() => addDad_(body.name)));
    return json_(savePhoto_(body));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'scores') return json_(readScores_());
    return json_({ ok: true, msg: 'Dad Olympics photo drop + scores are live.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- photos ----------

function savePhoto_(body) {
  const bytes = Utilities.base64Decode(body.data);
  const stamp = Utilities.formatDate(new Date(), 'Pacific/Auckland', 'yyyy-MM-dd HHmm');
  const name = stamp + ' ' + (body.name || 'photo.jpg');
  const blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', name);
  const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
  return { ok: true, id: file.getId(), name: name };
}

// ---------- scores ----------
// One row per event, one column per dad. Blank cell = didn't take part.

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function scoreSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SCORES_SHEET_ID');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Dad Olympics MMXXVI · Scores');
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
    const sh = ss.getSheets()[0];
    sh.setName(SCORE_TAB);
    const header = FIXED_COLS.concat(STARTING_DADS);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    props.setProperty('SCORES_SHEET_ID', ss.getId());
  }
  return ss.getSheetByName(SCORE_TAB) || ss.getSheets()[0];
}

function header_(sh) {
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), FIXED_COLS.length)).getValues()[0].map(String);
  while (header.length > FIXED_COLS.length && !header[header.length - 1].trim()) header.pop();
  return header;
}

function readScores_() {
  const sh = scoreSheet_();
  const header = header_(sh);
  const dads = header.slice(FIXED_COLS.length);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, header.length).getValues() : [];
  const events = rows
    .filter((r) => String(r[0]).trim() && String(r[1]).trim())
    .map((r) => ({
      id: String(r[0]),
      name: String(r[1]),
      note: String(r[2] || ''),
      by: String(r[3] || ''),
      scores: dads.map((_, i) => {
        const v = r[FIXED_COLS.length + i];
        return v === '' || v === null || isNaN(Number(v)) ? null : Number(v);
      }),
    }));
  return { ok: true, competitors: dads, events: events };
}

function addDad_(name) {
  name = String(name || '').trim().slice(0, 24);
  if (!name) throw new Error('No name');
  const sh = scoreSheet_();
  const header = header_(sh);
  if (header.map((h) => h.toLowerCase()).indexOf(name.toLowerCase()) === -1) {
    sh.getRange(1, header.length + 1).setValue(name).setFontWeight('bold');
  }
  return readScores_();
}

// The app sends its own event id, so a retry after a dropped connection
// updates the same row instead of adding a duplicate.
function saveEvent_(b) {
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Event needs a name');
  const id = String(b.id || ('ev_' + Utilities.getUuid().slice(0, 8)));
  const sh = scoreSheet_();
  const header = header_(sh);
  const scores = b.scores || {};

  const row = [id, name, String(b.note || '').slice(0, 80), String(b.by || '').slice(0, 24), new Date()];
  for (let c = FIXED_COLS.length; c < header.length; c++) {
    const v = scores[header[c]];
    row.push(v === undefined || v === null || v === '' || isNaN(Number(v)) ? '' : Number(v));
  }

  const found = findRow_(sh, id);
  if (found) sh.getRange(found, 1, 1, row.length).setValues([row]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return readScores_();
}

function deleteEvent_(id) {
  const sh = scoreSheet_();
  const found = findRow_(sh, String(id));
  if (found) sh.deleteRow(found);
  return readScores_();
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}
