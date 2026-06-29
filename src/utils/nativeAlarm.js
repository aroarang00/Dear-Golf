import { Platform } from 'react-native';
// expo-intent-launcher는 함수 안에서 lazy require — 네이티브 모듈 없는 옛 dev 클라이언트가
//   JS 리로드 시 import만으로 크래시하지 않도록(새 EAS 빌드 후부터 실제 동작).

// 휴대폰 '시계앱'에 진짜 알람을 등록한다(우리 자체 알림과 별개).
//   ★자체 알림(expo-notifications)은 무음/방해금지면 소리가 안 날 수 있어 새벽 기상엔 약함.
//     시계앱 알람은 무음을 뚫고 울리므로 '확실히 깨우기'엔 이게 필요 — 단 안드로이드만 가능.
//   ★iOS: 애플이 외부 앱의 시계 알람 생성 API를 막아 불가(우회 없음) → 호출부는 시각만 안내(반자동).
//
//   ACTION_SET_ALARM 인텐트로 등록. SKIP_UI=false → 시계앱이 열리며 시·분이 미리 채워진 상태로
//   사용자가 저장만 누르면 됨(생성됐는지 눈으로 확인 = 신뢰). 한 번에 한 알람만(시계앱이 열려서).
//   ※ HOUR/MINUTES extra는 정수로 전달돼야 시계앱이 읽음 — 실기기 빌드에서 미리 채워지는지 검증할 것.
export const SYSTEM_ALARM_SUPPORTED = Platform.OS === 'android';

export async function setSystemAlarm({ hour, minute, message }) {
  if (Platform.OS !== 'android') return false;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
      extra: {
        'android.intent.extra.alarm.HOUR': Math.trunc(hour),
        'android.intent.extra.alarm.MINUTES': Math.trunc(minute),
        'android.intent.extra.alarm.MESSAGE': message || '디어골프 라운딩',
        'android.intent.extra.alarm.SKIP_UI': false, // 시계앱에 미리 채워 보여주고 저장 확인
      },
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[nativeAlarm] setSystemAlarm', e?.message);
    return false;
  }
}
