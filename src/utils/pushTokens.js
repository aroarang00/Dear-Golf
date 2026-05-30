import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// users/{uid}.pushToken — Expo Push 토큰 (Cloud Functions에서 발송 시 사용)
//
// Expo Push 서비스(https://exp.host/--/api/v2/push/send) 통해 FCM/APNs로 전달.
// 멀티기기 지원은 후속 작업 — 현재는 마지막 등록 기기 1개만 보관.
//
// 정책 ([[notification-policy]]):
//   - 중요 알림(신고·패널티·등급 강등): 항상 발송, 사용자 토글 불가
//   - 일반 알림(댓글·신청·확정 등): 사용자 토글로 OFF 가능
//   - 발송 분기는 Cloud Functions에서 priority 필드 + users.settings.roundupNotifyPrefs 체크
// =============================================================

// app.config.js의 extra.eas.projectId. EAS Build에서는 자동 주입되지만 명시도 안전.
const EAS_PROJECT_ID = '17a8133b-1b3e-4832-a435-4489015e3493';

// 권한 요청 + Expo Push 토큰 발급. 거부 시 null.
export async function registerPushToken() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return token?.data || null;
  } catch (e) {
    if (__DEV__) console.warn('[pushTokens] register fail', e?.message);
    return null;
  }
}

// Firestore에 토큰 저장 — users/{uid}.pushToken / pushPlatform / pushUpdatedAt
export async function saveMyPushToken(token) {
  if (!token) return;
  const uid = await getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      pushToken: token,
      pushPlatform: Platform.OS,
      pushUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[pushTokens] save fail', e?.message);
  }
}

// 마운트 1회 호출 — 권한 + 발급 + 저장 일괄
export async function setupPushNotifications() {
  const token = await registerPushToken();
  if (token) await saveMyPushToken(token);
  return token;
}
