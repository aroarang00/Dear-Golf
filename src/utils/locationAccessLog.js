import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// locationAccessLogs/{logId} — 위치정보 이용·제공사실 확인자료 자동 기록.
// 위치정보법 제16조 제2항: "위치정보 이용·제공사실 확인자료를 자동으로 기록·보존"
// 보존기간 6개월 (업계 관행). 자동 삭제는 Cloud Functions 스케줄러.
//
// providerName: 'kakao_local' | 'kakao_mobility' | 'tmap' | 'kma' | 'openweather' | 'firestore'
// purpose: 짧은 한글 설명
// method: 'send' (좌표 전송) | 'use' (앱 내 사용)
// =============================================================

const COLLECTION = 'locationAccessLogs';

// 모든 위치정보 사용 시점에 호출. fire-and-forget. 실패해도 사용자 흐름 영향 X.
export function recordLocationAccess({ providerName, purpose, method = 'send' }) {
  if (!providerName || !purpose) return;
  // 비동기 백그라운드 처리
  (async () => {
    try {
      const uid = await getUid();
      if (!uid) return;
      await addDoc(collection(db, COLLECTION), {
        ownerUid: uid,
        providerName,
        purpose,
        method,
        accessedAt: serverTimestamp(),
      });
    } catch (e) {
      if (__DEV__) console.warn('[locationLog] record fail', e?.message);
    }
  })();
}
