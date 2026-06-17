#!/usr/bin/env node
/*
 * 네이티브 설정 무결성 가드 — 빌드 전/EAS post-install에서 자동 실행.
 *
 * ★왜 존재하나 (2026-06-17 iOS 카카오 로그인 무한 스핀 사고):
 *   @react-native-kakao/core expo plugin은 expo-config-plugin/build/index.js에서
 *   `if (ios) withIos(...)` — 즉 플러그인 값에 'ios' 키가 있을 때만 iOS 설정을 적용한다.
 *   SDK 교체 당시 친구동의 콜백 때문에 android 키만 넣고 ios 키를 빠뜨려,
 *   iOS는 콜백 URL 스킴(CFBundleURLTypes kakao{key})·AppDelegate handleOpenUrl이
 *   통째로 누락됐다. 카톡 로그인 후 kakao{key}://oauth 복귀가 앱에 도달하지 못해
 *   login()이 영영 안 끝나 '무한 스핀'. 안드로이드는 authCodeHandlerActivity가 있어 정상이라
 *   비대칭이 가려졌고, 빌드 에러도 없어 iOS 빌드를 깔아보기 전엔 발견 불가했다.
 *
 *   → 같은 부류(한 플랫폼 네이티브 콜백 설정이 조용히 빠지는 사고)의 재발을 막기 위해,
 *     소스 설정 수준에서 양 플랫폼 콜백 키 존재를 '결정적으로' 강제한다(맥 없이도 검증 가능).
 *
 * 사용:
 *   node scripts/check-native-config.js            # 실제 app.config 검사 (실패 시 exit 1)
 *   node scripts/check-native-config.js --self-test # 검증 로직 자체 테스트(양/음성)
 */
const path = require('path');

// ── 순수 검증기: 카카오 플러그인 props를 받아 문제 목록을 반환 ──────────────
//   소스 키 존재만 본다(네이티브 산출물 X) → 윈도우/리눅스/맥 어디서나 동일 결과.
function validateKakao(kakao) {
  const errors = [];
  if (!kakao) {
    errors.push('@react-native-kakao/core 플러그인이 app.config plugins에 없음');
    return errors;
  }
  if (!kakao.nativeAppKey) {
    errors.push('kakao: nativeAppKey 누락 (EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 미주입)');
  }
  // iOS — 'ios' 키가 있어야 플러그인 withIos가 실행돼 ①콜백 스킴 ②AppDelegate handleOpenUrl 등록.
  //   없으면 iOS 카톡 로그인이 앱으로 복귀 못 해 무한 스핀(2026-06-17 사고).
  if (!kakao.ios || kakao.ios.handleKakaoOpenUrl !== true) {
    errors.push("kakao.ios.handleKakaoOpenUrl !== true → iOS 카카오 로그인 콜백 미등록 = 무한 스핀 재발 [2026-06-17 사고]");
  }
  // Android — authCodeHandlerActivity가 있어야 redirect(kakao{key}://oauth) 콜백 수신.
  if (!kakao.android || kakao.android.authCodeHandlerActivity !== true) {
    errors.push('kakao.android.authCodeHandlerActivity !== true → 안드 카카오 콜백 유실');
  }
  return errors;
}

// plugins 배열에서 ['name', props] 또는 'name' 형태를 찾아 props 반환(없으면 null).
function findPluginProps(plugins, name) {
  for (const p of plugins || []) {
    if (Array.isArray(p) && p[0] === name) return p[1] || {};
    if (p === name) return {};
  }
  return null;
}

// ── self-test: 검증 로직이 '실제로' 누락을 잡는지 증명 ──────────────────────
function selfTest() {
  const good = { nativeAppKey: 'k', ios: { handleKakaoOpenUrl: true }, android: { authCodeHandlerActivity: true } };
  const missingIos = { nativeAppKey: 'k', android: { authCodeHandlerActivity: true } }; // ← 2026-06-17 사고 형상
  const missingAndroid = { nativeAppKey: 'k', ios: { handleKakaoOpenUrl: true } };
  const cases = [
    ['정상 설정 → 통과', validateKakao(good).length === 0],
    ['ios 키 누락 → 잡아냄(사고 재현)', validateKakao(missingIos).some(e => e.includes('handleKakaoOpenUrl'))],
    ['android 키 누락 → 잡아냄', validateKakao(missingAndroid).some(e => e.includes('authCodeHandlerActivity'))],
    ['플러그인 자체 누락 → 잡아냄', validateKakao(null).length > 0],
  ];
  let ok = true;
  for (const [label, pass] of cases) {
    console.log(`${pass ? '✓' : '✗'} ${label}`);
    if (!pass) ok = false;
  }
  console.log(ok ? '\n✅ self-test 통과 — 가드 로직이 누락을 정확히 탐지함' : '\n❌ self-test 실패 — 가드 로직 결함');
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--self-test')) selfTest();

// ── 실제 검사 ───────────────────────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..');
let exp;
try {
  // getConfig는 app.config.js를 평가(내부 dotenv 로드 포함)해 plugins 배열을 그대로 돌려준다.
  // 네이티브 mod를 돌리지 않으므로 맥이 아니어도 동작.
  // skipPlugins는 쓰지 않는다 — 그 옵션은 exp.plugins 배열 자체를 제거해 검사 대상이 사라진다.
  //   getConfig는 plugin '값'만 정적으로 돌려주고 네이티브 mod는 실행하지 않으므로 맥 없이도 안전.
  ({ exp } = require('@expo/config').getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
  }));
} catch (e) {
  console.error('❌ app.config 평가 실패:', e.message);
  process.exit(1);
}

const errors = validateKakao(findPluginProps(exp.plugins, '@react-native-kakao/core'));

if (errors.length) {
  console.error('\n❌ 네이티브 설정 점검 실패 — 빌드를 중단합니다:\n' +
    errors.map(e => '  • ' + e).join('\n') +
    '\n\n수정: app.config.js의 @react-native-kakao/core 플러그인 설정 확인.\n');
  process.exit(1);
}
console.log('✅ 네이티브 설정 점검 통과 — 카카오 iOS/Android 로그인 콜백 모두 등록됨');
