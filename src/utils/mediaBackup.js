import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';
import { uploadRoundMediaBestEffort, hasLocalMediaRefs, deleteRoundMediaFiles } from './roundMedia';

// =============================================================
// 다이어리 미디어 백업 스위퍼 — [[diary-media-backup-plan]] (2026-07-04)
// 아직 로컬(dgphoto:)인 사진·영상을 찾아 Storage에 올리고 문서를 https로 교체.
//  ① 저장 시 업로드 실패(오프라인 등)의 후속 재시도
//  ② 백업 도입 전 기존 나만보기 데이터의 소급 마이그레이션 — 같은 메커니즘 하나로.
// 호출: DiariesContext가 로드 완료 후 지연 호출(이미 로드된 배열 재사용 = 추가 read 0).
// 회당 maxDocs개만 처리(콜드스타트 부하·업로드 폭주 방지) — 남은 건 다음 실행이 이어감.
// =============================================================

let running = false;

// 항목 참조 키 — 객체({uri,...})든 문자열이든 uri 문자열로 비교
const refKey = (p) => (p && typeof p === 'object' ? p.uri : p) || '';
// 두 photos 배열이 같은 참조 구성인지(순서 포함) — 스윕 중 사용자가 수정/삭제했는지 판별
function samePhotoRefs(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((p, i) => refKey(p) === refKey(b[i]));
}

// diaries: 로드된 내 다이어리 배열(각 {id, photos, ...}). 반환: 갱신된 [{id, photos}] (컨텍스트 반영용).
// getLatest: 최신 diaries 배열 getter(DiariesContext의 diariesRef) — save-revert 방지용.
export async function sweepDiaryMediaBackup(diaries, { maxDocs = 5, getLatest } = {}) {
  if (running) return [];
  running = true;
  try {
    const uid = await getUid();
    if (!uid || !Array.isArray(diaries)) return [];
    const targets = diaries.filter((d) => d && d.id && hasLocalMediaRefs(d.photos));
    if (targets.length === 0) return [];
    const updated = [];
    let consecFail = 0;
    for (const d of targets.slice(0, maxDocs)) {
      const { photos, uploaded, failed } = await uploadRoundMediaBestEffort(uid, d.photos);
      if (uploaded > 0) {
        // ★save-revert 방지([[save-revert-bug-pattern]]) — 업로드(수 초~수십 초) 사이 사용자가 이
        //   다이어리를 수정/삭제했으면 로드 시점 스냅샷으로 photos를 통째 덮지 않는다(사진 유실·
        //   깨진 참조 부활). 구성이 그대로일 때만 write, 달라졌으면 skip(다음 스윕이 최신 기준으로 재처리)
        //   + 방금 올린 파일은 고아가 되므로 즉시 정리.
        const latest = getLatest ? (getLatest() || []).find((x) => x && x.id === d.id) : d;
        if (!latest || !samePhotoRefs(latest.photos, d.photos)) {
          const newlyUploaded = photos.filter((p, i) => refKey(p) !== refKey(d.photos[i]));
          deleteRoundMediaFiles(newlyUploaded);
          continue;
        }
        try {
          await updateDoc(doc(db, 'rounds', d.id), { photos, updatedAt: serverTimestamp() });
          updated.push({ id: d.id, photos });
        } catch (e) {
          if (__DEV__) console.warn('[mediaBackup] 문서 갱신 실패', d.id, e?.message);
        }
      }
      // 연속 실패(오프라인 등)에만 이번 스윕 중단 — 전량 실패 문서 1개(파일 유실 등)가 큐 맨 앞에서
      //   매번 break하면 뒤의 정상 문서들이 영원히 백업 안 되던 것 방지(2026-07-11 감사 ④).
      if (failed > 0 && uploaded === 0) {
        consecFail += 1;
        if (consecFail >= 2) break;
      } else {
        consecFail = 0;
      }
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
