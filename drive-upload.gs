// Dad Olympics photo drop — Google Apps Script
//
// This lets the website upload photos straight into the Beer Olympics
// Google Drive folder, so the boys never see a Google page.
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
//      PHOTO_UPLOAD_ENDPOINT in index.html.
//
// Photos land in the folder below, named with a timestamp prefix so
// they're easy to sort into year folders later.

const FOLDER_ID = '1RiC3LKhENH6OAUgA1mdYMcgsI_W6mAEM'; // Beer Olympics folder

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const bytes = Utilities.base64Decode(body.data);
    const stamp = Utilities.formatDate(new Date(), 'Pacific/Auckland', 'yyyy-MM-dd HHmm');
    const name = stamp + ' ' + (body.name || 'photo.jpg');
    const blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', name);
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, id: file.getId(), name: name }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you sanity-check the deployment by opening the /exec URL in a browser.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: 'Dad Olympics photo drop is live. POST photos here.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
