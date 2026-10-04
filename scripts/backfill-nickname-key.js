// users.nicknameKey 백필 — 닉네임 검색을 대소문자·공백 무시로 바꾸면서(2026-10-05) 기존 사용자 문서에
//   검색 키를 채운다. 앱은 켤 때마다 write-through로 자기 키를 쓰므로(App.js) 이 스크립트는 '앱을 안 켠 사람'까지
//   한 번에 맞추는 용도. 검색 코드는 키가 없으면 nickname 정확일치로 폴백하니 안 돌려도 동작은 한다.
//
// 실행:  node scripts/backfill-nickname-key.js            (실제 쓰기)
//        node scripts/backfill-nickname-key.js --dry      (대상만 출력, 쓰기 없음)
// 인증:  firebase CLI 로그인 토큰 재사용(~/.config/configstore/firebase-tools.json). 401이면
//        `npx firebase projects:list` 한 번 돌려 토큰 갱신 후 재실행. ([[cf-deploy-verify]] 방식)
// 쓰기:  각 문서 PATCH + updateMask=nicknameKey — 그 필드만 바뀌고 updatedAt 등 나머지는 건드리지 않는다.
const https = require('https');
const os = require('os');
const path = require('path');

const DRY = process.argv.includes('--dry');
const cfg = require(path.join(os.homedir(), '.config/configstore/firebase-tools.json'));
const TOKEN = cfg?.tokens?.access_token;
if (!TOKEN) { console.error('firebase CLI 토큰 없음 — npx firebase login 먼저'); process.exit(1); }
const USERS = 'https://firestore.googleapis.com/v1/projects/dear-golf/databases/(default)/documents/users';

// src/utils/nickname.js의 nicknameKey와 동일해야 한다(앱이 쓰는 키와 어긋나면 검색이 깨짐).
function nicknameKey(nick) {
  let s = String(nick || '');
  if (typeof s.normalize === 'function') s = s.normalize('NFC');
  return s.toLowerCase().replace(/\s+/g, '');
}

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(`${res.statusCode} ${d.slice(0, 200)}`))));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const all = [];
  let pageToken = null;
  do {
    const url = `${USERS}?pageSize=300&mask.fieldPaths=nickname&mask.fieldPaths=nicknameKey${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await req('GET', url);
    for (const d of r.documents || []) {
      const f = d.fields || {};
      all.push({ name: d.name, nickname: f.nickname?.stringValue, nicknameKey: f.nicknameKey?.stringValue });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);

  const todo = all.filter((u) => u.nickname && nicknameKey(u.nickname) !== u.nicknameKey);
  console.log(`users ${all.length}명 | 닉네임 있음 ${all.filter((u) => u.nickname).length} | 백필 대상 ${todo.length}${DRY ? ' (dry-run)' : ''}`);
  for (const u of todo) console.log(`  ${u.name.split('/').pop().slice(0, 8)}  "${u.nickname}" → "${nicknameKey(u.nickname)}"`);
  if (DRY) return;

  let ok = 0, fail = 0;
  for (const u of todo) {
    try {
      await req('PATCH', `${u.name}?updateMask.fieldPaths=nicknameKey`, { fields: { nicknameKey: { stringValue: nicknameKey(u.nickname) } } });
      ok++;
    } catch (e) { fail++; console.log('  실패', u.name.split('/').pop(), e.message); }
  }
  console.log(`완료 ${ok}건, 실패 ${fail}건`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
