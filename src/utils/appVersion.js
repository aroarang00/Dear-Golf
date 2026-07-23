import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { doc, getDoc } from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// 버전 게이트 — Firestore `config/app` 문서로 구버전 사용자를 막거나 권장한다.
//
// ★왜 Remote Config가 아닌가
//   메모의 원래 계획은 Firebase Remote Config였는데, 이 앱은 Firebase '웹 JS SDK'를 쓴다.
//   JS SDK의 Remote Config는 웹 전용이라 React Native에서 동작하지 않는다. 쓰려면
//   @react-native-firebase를 새로 붙여 SDK가 이중이 되는데 배보다 배꼽이 크다.
//   config/storeAds가 이미 같은 방식으로 돌고 있어(규칙 `config/{docId}` 읽기 허용) 새로 만들 게 없다.
//
// ★기준이 두 개인 이유 (사용자 2026-07-22)
//   minVersion    미만 → 차단(넘길 수 없음). 데이터가 깨질 수준일 때만 쓰는 비상 스위치.
//   latestVersion 미만 → 권장(넘길 수 있음). 평소엔 이것만 올린다.
//   업계도 이렇게 쓴다 — 은행앱조차 하드 차단은 1년에 몇 번이고 평소엔 조용히 넘어간다.
//   차단을 남발하면 업데이트를 강제하는 게 아니라 이탈을 강제하게 된다(현재 WAU가 두 자리다).
//
// ★값을 코드에 박지 않는 게 핵심이다. 콘솔에서 문서만 고치면 즉시 반영되고, 잘못 올려서
//   전체 사용자를 잠갔더라도 되돌리는 데 1초다. 코드에 박으면 그 복구에 스토어 심사가 걸린다.
//
// ★OTA(expo-updates)가 본체고 이건 안전장치다. JS 변경은 OTA로 알아서 내려가므로
//   여기서 막아야 하는 건 '네이티브가 바뀐 버전'뿐이다. 그래서 비교 대상도 JS 번들 버전이 아니라
//   실제 설치된 바이너리 버전(Application.nativeApplicationVersion)이다.
//
// config/app 문서 (전부 선택 — 없으면 아무 일도 안 일어난다)
//   { minVersion: "1.1.0", latestVersion: "1.2.0",
//     message: "정산 기능이 추가됐어요", iosUrl: "https://apps.apple.com/...", androidUrl: "https://..." }
// =============================================================

// 스토어 주소는 패키지명·앱 ID로 정해져 바뀔 일이 없으니 기본값을 둔다(문서로 덮어쓸 수 있다).
//   앱 ID 6770383793 = eas.json submit.production.ios.ascAppId.
const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=app.deargolf';
const IOS_STORE = 'https://apps.apple.com/kr/app/id6770383793';

// "1.2.3" → [1,2,3]. 콘솔에서 손으로 넣는 값이라 "v1.2", "1.2.3-beta" 같은 게 언제든 온다.
//   숫자로 안 읽히는 자리는 0으로 본다.
function parts(v) {
  return String(v || '').trim().replace(/^v/i, '').split('.')
    .slice(0, 3)
    .map(n => { const x = parseInt(n, 10); return Number.isFinite(x) && x >= 0 ? x : 0; });
}

// a < b 인가. 자리수가 달라도(1.2 vs 1.2.0) 같게 본다.
export function isOlder(a, b) {
  const x = parts(a); const y = parts(b);
  for (let i = 0; i < 3; i += 1) {
    const l = x[i] || 0; const r = y[i] || 0;
    if (l !== r) return l < r;
  }
  return false;
}

// 설치된 바이너리 버전. OTA로 JS만 갈아끼워도 이 값은 그대로다 — 스토어 업데이트 게이트엔 그게 맞다.
export function currentVersion() {
  return Application.nativeApplicationVersion || '';
}

const httpsUrl = (v) => (typeof v === 'string' && /^https:\/\//i.test(v.trim()) ? v.trim() : '');
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// 지금 버전이 어떤 상태인지. 'block' | 'suggest' | 'ok'
//   ★어떤 이유로든 판단이 안 서면 'ok'다. 설정을 못 읽었다고 앱을 잠그면, 서버가 잠깐 흔들릴 때
//     전 사용자가 앱을 못 쓰게 된다. 게이트는 '확실할 때만' 막아야 한다.
export async function checkAppVersion() {
  const none = { state: 'ok', storeUrl: '', message: '' };
  try {
    const cur = currentVersion();
    if (!cur) return none;                       // 버전을 못 읽으면(웹/시뮬 등) 판단하지 않는다

    // config 규칙이 isSignedIn()이라 익명 로그인이 붙은 뒤에 읽어야 한다.
    const uid = await getUid();
    if (!uid) return none;

    const snap = await getDoc(doc(db, 'config', 'app'));
    if (!snap.exists()) return none;
    const d = snap.data() || {};

    const storeUrl = Platform.OS === 'ios'
      ? (httpsUrl(d.iosUrl) || IOS_STORE)
      : (httpsUrl(d.androidUrl) || ANDROID_STORE);
    const message = str(d.message);

    if (d.minVersion && isOlder(cur, d.minVersion)) return { state: 'block', storeUrl, message };
    if (d.latestVersion && isOlder(cur, d.latestVersion)) return { state: 'suggest', storeUrl, message };
    return none;
  } catch (e) {
    if (__DEV__) console.warn('[appVersion] check fail', e?.code, e?.message);
    return none;
  }
}
