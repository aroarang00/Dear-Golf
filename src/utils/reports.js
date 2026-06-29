import {
  collection, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// reports/{reportId} — 사용자 신고 ([[report-block-policy]] E안)
//
// 보안 규칙 (firestore.rules):
//  - read   : reporterUid == me (본인 신고만)
//  - create : reporterUid == me + targetUid 자기 자신 X + status='pending'
//  - update : false (관리자·Cloud Functions만)
//  - delete : false
//
// 흐름: 사용자 작성 → pending → 디어골프 팀 검토 (Phase 5 Cloud Functions)
//   → confirmed → 양방향 영구 차단 적용
//   → rejected → 신고자 매너 -10·60일 정지 (허위 신고)
//
// reason 종류:
//   misbehavior(비매너) / fake_profile(허위 프로필) / harassment(성희롱·욕설) / fraud(사기)
// =============================================================

const COLLECTION = 'reports';

export async function createReport(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!data.targetUid) throw new Error('targetUid required');
  if (data.targetUid === uid) throw new Error('Cannot report self');
  if (!data.reason) throw new Error('reason required');
  if (!data.evidence || data.evidence.length < 10) throw new Error('evidence too short');
  const report = {
    reporterUid: uid,
    reporterName: data.reporterName || '',
    targetUid: data.targetUid,
    targetName: data.targetName || '',
    reason: data.reason,
    evidence: data.evidence,
    postId: data.postId || null,
    status: 'pending',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), report);
  return { id: ref.id, ...report };
}
