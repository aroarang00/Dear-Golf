import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';
import { uploadRoundMediaBestEffort, hasLocalMediaRefs } from './roundMedia';

// =============================================================
// 다이어리 미디어 백업 스위퍼 — [[diary-media-backup-plan]] (2026-07-04)
// 아직 로컬(dgphoto:)인 사진·영상을 찾아 Storage에 올리고 문서를 https로 교체.
//  ① 저장 시 업로드 실패(오프라인 등)의 후속 재시도
//  ② 백업 도입 전 기존 나만보기 데이터의 소급 마이그레이션 — 같은 메커니즘 하나로.
// 호출: DiariesContext가 로드 완료 후 지연 호출(이미 로드된 배열 재사용 = 추가 read 0).
// 회당 maxDocs개만 처리(콜드스타트 부하·업로드 폭주 방지) — 남은 건 다음 실행이 이어감.
// =============================================================

let running = false;

// diaries: 로드된 내 다이어리 배열(각 {id, photos, ...}). 반환: 갱신된 [{id, photos}] (컨텍스트 반영용).
export async function sweepDiaryMediaBackup(diaries, { maxDocs = 5 } = {}) {
  if (running) return [];
  running = true;
  try {
    const uid = await getUid();
    if (!uid || !Array.isArray(diaries)) return [];
    const targets = diaries.filter((d) => d && d.id && hasLocalMediaRefs(d.photos));
    if (targets.length === 0) return [];
    const updated = [];
    for (const d of targets.slice(0, maxDocs)) {
      const { photos, uploaded, failed } = await uploadRoundMediaBestEffort(uid, d.photos);
      if (uploaded > 0) {
        try {
          await updateDoc(doc(db, 'rounds', d.id), { photos, updatedAt: serverTimestamp() });
          updated.push({ id: d.id, photos });
        } catch (e) {
          if (__DEV__) console.warn('[mediaBackup] 문서 갱신 실패', d.id, e?.message);
        }
      }
      // 연속 실패(오프라인 등) — 이번 스윕 중단, 다음 기회에 이어감(불필요한 재시도 폭주 방지)
      if (failed > 0 && uploaded === 0) break;
    }
    if (__DEV__ && updated.length) console.log(`[mediaBackup] ${updated.length}건 백업 완료(잔여 ${targets.length - updated.length})`);
    return updated;
  } catch (e) {
    if (__DEV__) console.warn('[mediaBackup] sweep 실패', e?.message);
    return [];
  } finally {
    running = false;
  }
}

// 백업 미완료 기록 수 — 로그아웃 가드용(로드된 배열 기준, 서버 read 0)
export function countPendingBackup(diaries) {
  if (!Array.isArray(diaries)) return 0;
  return diaries.filter((d) => d && hasLocalMediaRefs(d.photos)).length;
}
