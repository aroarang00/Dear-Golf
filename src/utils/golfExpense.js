import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as ImageManipulator from 'expo-image-manipulator';
import { db, getUid, functions } from './firebase';

// =============================================================
// golfExpenses/{id} — 라운딩과 무관한 '독립 골프 지출'(모임회비·골프장비·기타).
//   ★라운딩 비용(그린피·카트비 등)은 rounds/{id}.cost에 있음([[round]]). 이건 라운딩 없이 생기는
//    지출(회비·용품)을 담는 별도 그릇 — 가계부에서 직접 "+"로 입력. 가계부가 둘을 합산해 보여준다.
//
// 보안 규칙(firestore.rules): 본인만 CRUD (ownerUid == uid). 목록 쿼리 (ownerUid, date desc).
// =============================================================

const COLLECTION = 'golfExpenses';

// 대분류 3종. 세부(클럽/의류/볼 등)는 memo로 자유 입력(입력 단순화 우선, 2026-07-21 결정).
export const EXPENSE_CATEGORIES = [
  { key: 'membership', label: '모임회비' },
  { key: 'equipment',  label: '골프장비' },
  { key: 'etc',        label: '기타' },
];
const CAT_KEYS = EXPENSE_CATEGORIES.map(c => c.key);
export const expenseCatLabel = (key) =>
  (EXPENSE_CATEGORIES.find(c => c.key === key)?.label) || '기타';

// 내 지출 목록 — date 내림차순. 실패는 throw(가계부가 라운딩만이라도 살리고 재시도 유도, round.js와 동일 정신).
export async function loadMyExpenses() {
  const uid = await getUid();
  if (!uid) throw new Error('auth-uid-unavailable');
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', uid),
    orderBy('date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 지출 생성 — amount는 0 이상 정수, category는 3종 중 하나(아니면 etc), memo 200자 컷.
export async function createExpense(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const exp = {
    ownerUid: uid,
    category: CAT_KEYS.includes(data.category) ? data.category : 'etc',
    amount: Math.max(0, Math.round(Number(data.amount) || 0)),
    date: data.date || '',                                   // 'YYYY.MM.DD' (rounds와 동일 포맷)
    memo: (data.memo || '').toString().trim().slice(0, 200),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), exp);
  return { id: ref.id, ...exp };
}

// 지출 수정 — ownerUid/createdAt은 변경 금지(보안 규칙).
export async function updateExpense(id, patch) {
  if (!id) throw new Error('id required');
  const { ownerUid, id: _id, createdAt, ...up } = patch || {};
  if (up.amount != null) up.amount = Math.max(0, Math.round(Number(up.amount) || 0));
  if (up.category != null && !CAT_KEYS.includes(up.category)) up.category = 'etc';
  if (up.memo != null) up.memo = up.memo.toString().trim().slice(0, 200);
  await updateDoc(doc(db, COLLECTION, id), { ...up, updatedAt: serverTimestamp() });
}

// 지출 삭제 — 본인만(보안 규칙).
export async function deleteExpense(id) {
  if (!id) throw new Error('id required');
  await deleteDoc(doc(db, COLLECTION, id));
}

// AI 자동입력 — 카드결제 문자/한 줄 지출 텍스트 → extractExpense CF → 프리필 필드.
//   반환 { amount, category, date('YYYY.MM.DD'|''), memo } | { error }. 저장은 사용자가 확인 후.
//   ★프리필만(스코어카드·예약과 동일 정책). 영수증 사진은 CF가 image도 받으니 추후 같은 함수 확장.
export async function extractExpenseFromText(text) {
  try {
    const t = (text || '').trim();
    if (!t) return { error: '내용을 입력해주세요' };
    const callable = httpsCallable(functions, 'extractExpense', { timeout: 30000 });
    const res = await callable({ text: t });
    const d = res?.data;
    if (!d?.found) return { error: '골프 지출 정보를 찾지 못했어요 — 금액이 포함됐는지 확인해주세요' };
    return {
      amount: d.amount || 0,
      category: d.category || 'etc',
      date: (d.date || '').trim(),
      memo: (d.memo || '').trim(),
    };
  } catch (e) {
    if (__DEV__) console.warn('[golfExpense] AI', e?.code || '', e?.message);
    return { error: e?.message || '자동입력에 실패했어요. 다시 시도해주세요.', code: e?.code };
  }
}

// AI 자동입력(영수증 사진) — 이미지 URI → 리사이즈·base64 → extractExpense CF(같은 함수, 이미지 경로).
//   반환은 텍스트 버전과 동일 { amount, category, date, memo } | { error }. 영수증도 작은 숫자라 1600px 유지.
export async function extractExpenseFromImage(uri) {
  try {
    if (!uri) return { error: '사진이 필요해요' };
    const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
      compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    const callable = httpsCallable(functions, 'extractExpense', { timeout: 30000 });
    const res = await callable({ imageBase64: img.base64, format: 'jpg' });
    const d = res?.data;
    if (!d?.found) return { error: '영수증에서 지출 정보를 찾지 못했어요 — 더 선명한 사진으로 다시 시도해주세요' };
    return {
      amount: d.amount || 0,
      category: d.category || 'etc',
      date: (d.date || '').trim(),
      memo: (d.memo || '').trim(),
    };
  } catch (e) {
    if (__DEV__) console.warn('[golfExpense] AI image', e?.code || '', e?.message);
    return { error: e?.message || '영수증 인식에 실패했어요. 다시 시도해주세요.', code: e?.code };
  }
}
