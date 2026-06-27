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
      uid, // users 규칙(request.resource.data.uid == uid) 충족 — 문서 미존재 시 생성도 통과
      pushToken: token,
      pushPlatform: Platform.OS,
      pushUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[pushTokens] save fail', e?.message);
  }
}

// 알림 종류별 푸시 토글 저장 — users/{uid}.settings.notifyPrefs.{key}. CF 발송 게이팅이 이 값을 읽음.
//   기존엔 마이페이지 토글이 로컬에만 저장돼(OFF가 서버에 안 닿아) 꺼도 푸시가 계속 갔음(2026-06-27 수정).
//   merge:true는 맵을 깊은 병합 → 다른 notifyPrefs 키·settings 필드 보존. uid 포함=users 규칙 충족.
export async function saveNotifyPref(key, value) {
  if (!key) return;
  const uid = await getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      settings: { notifyPrefs: { [key]: !!value } },
    }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[pushTokens] saveNotifyPref fail', e?.message);
  }
}

// 토큰 로테이션 리스너 — Expo/FCM이 토큰을 갱신하면 새 토큰을 즉시 재저장(stale 토큰으로 조용히 미수신 방지).
//   앱 수명 동안 1회만 등록(중복 방지). 구독 해제 불필요(전역 1개).
let _tokenListener = null;

// 마운트 1회 호출 — 권한 + 발급 + 저장 일괄 + 로테이션 리스너 등록
export async function setupPushNotifications() {
  const token = await registerPushToken();
  if (token) await saveMyPushToken(token);
  if (!_tokenListener) {
    try {
      _tokenListener = Notifications.addPushTokenListener((t) => { if (t?.data) saveMyPushToken(t.data); });
    } catch (e) { if (__DEV__) console.warn('[pushTokens] token listener', e?.message); }
  }
  return token;
}
