import {
  collection, query, where, getDocs, getDoc, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// mannerEvaluations/{evalId} — 매너 평가 ([[manner-evaluation-policy]])
//
// Doc ID = `{roundupId}_{evaluatorUid}_{targetUid}` (1인 1대상 1모집 1회)
// rating: 'good' | 'bad' (neutral=무평가는 doc 없음, 자동 보통 처리)
//
// 적용 범위: 전체공개(`scope='all'`) 모집만 (§1-0).
// 윈도우: 라운딩 종료(티오프+5h) ~ +48h (Cloud Functions 트리거).
//
// 집계 + mannerScore 적용은 Cloud Functions가 처리:
//  - 👍 1+ → +1
//  - 👎 1 → 0 (자동 보통, 사적 감정 차단)
//  - 👎 2 → -2
//  - 👎 3+ → -3
// =============================================================

const COLLECTION = 'mannerEvaluations';

const evalDocId = (roundupId, evaluatorUid, targetUid) =>
  `${roundupId}_${evaluatorUid}_${targetUid}`;

// 평가 제출 — deterministic Doc ID로 중복 차단 (멱등). 48h 윈도우 체크는 호출 측에서.
// rating은 'good' 또는 'bad'. 'neutral'은 doc 생성하지 않음 (정책 §3 무평가=자동 보통).
export async function submitEvaluation(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!data.roundupId || !data.targetUid) throw new Error('roundupId/targetUid required');
  if (data.targetUid === uid) throw new Error('Cannot evaluate self');
  if (!['good', 'bad'].includes(data.rating)) throw new Error('rating invalid');
  const id = evalDocId(data.roundupId, uid, data.targetUid);
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return { id, alreadyEvaluated: true };  // 멱등 — 이미 평가된 경우 변경 불가
  }
  const evaluation = {
    evaluatorUid: uid,
    targetUid: data.targetUid,
    roundupId: data.roundupId,
    rating: data.rating,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, evaluation);
  return { id, alreadyEvaluated: false, ...evaluation };
}

// 특정 모집의 특정 대상에 이미 평가했는지 (UI 비활성 표시용)
export async function hasEvaluated(roundupId, targetUid) {
  const uid = await getUid();
  if (!uid || !roundupId || !targetUid) return false;
  try {
    const snap = await getDoc(doc(db, COLLECTION, evalDocId(roundupId, uid, targetUid)));
    return snap.exists();
  } catch {
    return false;
  }
}

// 특정 모집에서 내가 작성한 평가들 — 모달 진입 시 prefill
export async function loadMyEvaluationsForRoundup(roundupId) {
  const uid = await getUid();
  if (!uid || !roundupId) return [];
  const q = query(
    collection(db, COLLECTION),
    where('evaluatorUid', '==', uid),
    where('roundupId', '==', roundupId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
