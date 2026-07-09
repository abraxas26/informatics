/**
 * 스네이크 게임 순위 서버 (Google Apps Script)
 * -------------------------------------------------
 * - doPost : 게임 결과({name, score, length})를 시트에 저장하고, 최신 TOP 10을 돌려줍니다.
 * - doGet  : 현재 순위 TOP 10을 JSON으로 돌려줍니다.
 *
 * 배포 방법은 같은 폴더의 README-순위서버.md 를 참고하세요.
 */

var SHEET_NAME = 'ranking';   // 순위를 저장할 시트 이름 (없으면 자동 생성)
var TOP_N = 10;               // 순위판에 보여줄 개수

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var name = String(data.name || '익명').trim().slice(0, 12) || '익명';
    var score = Math.max(0, parseInt(data.score, 10) || 0);
    var length = Math.max(0, parseInt(data.length, 10) || 0);

    var sheet = getSheet();
    sheet.appendRow([new Date(), name, score, length]);

    return json({ ok: true, top: topScores() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return json({ ok: true, top: topScores() });
}

/* ---------- 내부 함수 ---------- */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['시간', '이름', '점수', '길이']);
  }
  return sh;
}

function topScores() {
  var sh = getSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, 4).getValues(); // 헤더 제외

  // 같은 이름은 최고 점수만 남김 (TOP_N 자르기 전에 중복 제거)
  var best = {};
  values.forEach(function (r) {
    var name = String(r[1] || '').trim();
    if (!name) return;
    var score = Number(r[2]) || 0;
    var length = Number(r[3]) || 0;
    if (!best[name] || score > best[name].score) {
      best[name] = { name: name, score: score, length: length };
    }
  });

  var list = Object.keys(best).map(function (k) { return best[k]; });
  list.sort(function (a, b) { return b.score - a.score; });
  return list.slice(0, TOP_N);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
