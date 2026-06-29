import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// 휴대폰 '시계앱'에 진짜 알람을 등록한다(우리 자체 알림과 별개).
//   ★자체 알림(expo-notifications)은 무음/방해금지면 소리가 안 날 수 있어 새벽 기상엔 약함.
//     시계앱 알람은 무음을 뚫고 울리므로 '확실히 깨우기'엔 이게 필요 — 단 안드로이드만 가능.
//   ★iOS: 애플이 외부 앱의 시계 알람 생성 API를 막아 불가(우회 없음) → 호출부는 시각만 안내(반자동).
//
//   ★네이티브 모듈(ExpoIntentLauncher)이 빌드에 포함돼야 작동 — 미포함(옛 dev 빌드)이면
//     SYSTEM_ALARM_SUPPORTED=false로 기능을 아예 숨겨, 'Cannot find native module' 에러를 피한다.
//     (requireOptionalNativeModule = 없으면 조용히 null 반환, requireNativeModule처럼 에러 안 냄)
const _intentNative = Platform.OS === 'android'
  ? requireOptionalNativeModule('ExpoIntentLauncher')
  : null;
export const SYSTEM_ALARM_SUPPORTED = !!_intentNative;

//   skipUi=false → 시계앱이 열려 시·분 미리 채워진 채 사용자가 저장(단건, 투명). true → 시계앱 안 열고 바로 등록
//   (여러 개 연속 등록용 — 못 들을까 봐 10분 간격으로 2~3개 거는 경우). true면 사용자에게 우리 토스트로 알림.
export async function setSystemAlarm({ hour, minute, message, skipUi = false }) {
  if (!SYSTEM_ALARM_SUPPORTED) return false; // 네이티브 모듈 없으면 호출 자체를 안 함(에러 방지)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
      extra: {
        'android.intent.extra.alarm.HOUR': Math.trunc(hour),
        'android.intent.extra.alarm.MINUTES': Math.trunc(minute),
        'android.intent.extra.alarm.MESSAGE': message || '디어골프 라운딩',
        'android.intent.extra.alarm.SKIP_UI': !!skipUi,
      },
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[nativeAlarm] setSystemAlarm', e?.message);
    return false;
  }
}
