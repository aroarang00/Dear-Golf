import {
  collection, query, where, orderBy, getDocs, getDoc, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// content_reports/{reportId} — 게시물 신고 ([[content-report-policy]])
//
// Doc ID = `{targetType}_{targetId}_{reporterUid}` (deterministic, 1인 1회 제한)
// targetType: 'courseComment' | 'roundup' | 'roundupComment' | 'friendDiary'
// reason: 'ad_spam' | 'inappropriate'
// status: 'pending' | 'confirmed' | 'rejected'
//
// 사용자 신고(reports)와 완전 분리 — 한도 X, 양방향 차단 X, 부담 없는 신고.
// 자동 임시 가림(골퍼코멘트 3건 누적)·작성자 누적 제재는 Phase 5 Cloud Functions.
// =============================================================

const COLLECTION = 'content_reports';

const reportDocId = (targetType, targetId, reporterUid) =>
  `${targetType}_${targetId}_${reporterUid}`;

// 이미 신고했는지 확인 (1인 1회 제한 UI 표시용)
export async function hasReportedContent(targetType, targetId) {
  const uid = await getUid();
  if (!uid || !targetType || !targetId) return false;
  try {
    const snap = await getDoc(doc(db, COLLECTION, reportDocId(targetType, targetId, uid)));
    return snap.exists();
  } catch {
    return false;
  }
}

// 게시물 신고 — deterministic Doc ID로 중복 차단.
// data: { targetType, targetId, targetAuthorUid?, reason, postRef? }
export async function createContentReport(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!data.targetType || !data.targetId) throw new Error('targetType/targetId required');
  if (!['courseComment', 'roundup', 'roundupComment', 'friendDiary'].includes(data.targetType)) {
    throw new Error('invalid targetType');
  }
  if (!['ad_spam', 'inappropriate'].includes(data.reason)) {
    throw new Error('invalid reason');
  }
  const id = reportDocId(data.targetType, data.targetId, uid);
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // 1인 1회 — 이미 신고된 경우 idempotent 처리 (멱등)
    return { id, alreadyReported: true };
  }
  const report = {
    reporterUid: uid,
    targetType: data.targetType,
    targetId: data.targetId,
    targetAuthorUid: data.targetAuthorUid || null,
    reason: data.reason,
    note: (data.note || '').slice(0, 200),
    status: 'pending',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, report);
  return { id, alreadyReported: false, ...report };
}

// 내가 작성한 콘텐츠 신고 — 최신순. (마이페이지엔 노출 X 정책이지만 디버그·운영용)
export async function loadMyContentReports() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('reporterUid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
