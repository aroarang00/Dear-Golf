import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// noshowReports/{reportId} — 노쇼 신고 ([[noshow-report-system]])
//
// 흐름: 신고 접수 (T+0)
//   → 7일 유예 (pending_grace_period, 신고자 자율 취소 가능)
//   → 7일 경과 자동 (explanation_required, 피신고자 48h 소명)
//   → 소명 제출 (explained, 디어골프 48h 검토)
//   → confirmed_noshow | confirmed_false_report | inconclusive
//
// 클라이언트 처리:
//   - 신고 생성 (status='pending_grace_period')
//   - 신고자 자율 취소 (→ cancelled_by_reporter)
//   - 피신고자 소명 제출 (→ explained)
//
// Cloud Functions 처리 (Phase 5):
//   - 7일 grace 타이머 → explanation_required
//   - 48h 소명 타이머 → confirmed_noshow (소명 X)
//   - 48h 검토 타이머 → inconclusive (운영 미처리)
//   - finalDecision → 매너 -20 + 60일/90일 정지 적용
//   - 12개월 카운트 자동 -1
// =============================================================

const COLLECTION = 'noshowReports';

// 노쇼 신고 생성. roundupId는 라운딩 종료 후 7일 이내 모집만 (UI 측 필터).
// reason은 한 줄, evidence는 선택 (소명 자료는 Cloud Functions가 별도 처리).
export async function createNoshowReport(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!data.reportedUid) throw new Error('reportedUid required');
  if (data.reportedUid === uid) throw new Error('Cannot report self');
  if (!data.roundupId) throw new Error('roundupId required');
  if (!data.reason || data.reason.length < 5) throw new Error('reason too short');
  const report = {
    reporterUid: uid,
    reporterName: data.reporterName || '',
    reportedUid: data.reportedUid,
    reportedName: data.reportedName || '',
    roundupId: data.roundupId,
    roundupCourse: data.roundupCourse || '',
    roundupDate: data.roundupDate || '',
    reason: data.reason,
    evidence: data.evidence || '',
    status: 'pending_grace_period',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), report);
  return { id: ref.id, ...report };
}

// 신고자 자율 취소 — pending_grace_period → cancelled_by_reporter
// 약관: 동일 사실 재신고 불가 ([[noshow-report-system]] §5)
export async function cancelMyNoshowReport(reportId) {
  if (!reportId) throw new Error('reportId required');
  await updateDoc(doc(db, COLLECTION, reportId), {
    status: 'cancelled_by_reporter',
    updatedAt: serverTimestamp(),
  });
}

// 피신고자 소명 제출 — explanation_required → explained
// explanation 텍스트만. 자료 업로드는 Phase 5 Storage 연동.
export async function submitNoshowExplanation(reportId, explanationText) {
  if (!reportId) throw new Error('reportId required');
  if (!explanationText || explanationText.length < 10) throw new Error('explanation too short');
  await updateDoc(doc(db, COLLECTION, reportId), {
    status: 'explained',
    explanation: explanationText.slice(0, 2000),
    updatedAt: serverTimestamp(),
  });
}

// 내가 작성한 신고 — 진행 상태 확인용 (마이페이지 '내 라운지 활동' 진입점)
export async function loadMyNoshowReports() {
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

// 본인 대상 신고 — 피신고자 입장에서 소명 진입점
export async function loadNoshowReportsAgainstMe() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('reportedUid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
