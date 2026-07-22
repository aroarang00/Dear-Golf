import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// settlements/{id} — 모임 '걷기'. 총무가 참가자에게 돈을 걷는 한 건.
//
// ★왜 라운딩·모집글에 붙이지 않고 독립 문서인가 (2026-07-22 결정)
//   조편성(RoundupTeamScreen)이 roundupId 필수 + 참가자 전원 앱유저 전제라 아무도 도달 못 한
//   전례가 있다([[project-deargolf-teamformation-deadend]]). 걷기는 그 실수를 반복하면 안 된다.
//   총무가 앱을 켜서 이름만 적어도 끝까지 쓸 수 있어야 한다 — 동반자가 앱을 안 깔았어도.
//   그래서 참가자는 '이름 문자열'이 기본이고 uid는 선택(있으면 나중에 알림·본인확인에 씀).
//   모집글/일정 연결(linkedRoundupId·linkedScheduleId)도 선택 — 있으면 명단을 당겨오는 편의일 뿐.
//
// ★한 라운딩에 걷기가 여러 개 붙는다 (사용자 실제 운영 방식)
//   ① 선입금(라운딩 전) — 캐디피 + 참가비. 안 내면 참가 확정이 안 되므로 압력이 가장 세다.
//   ② 식사 정산(라운딩 후) — 식사 참석자만. 금액은 대체로 1/n이지만 "이건 내가 계산할게"가 나온다.
//   그린피·카트비는 각자 카드로 결제해 총무가 걷지 않는다 → 앱이 다루는 돈이 아니다.
//
// 입금 상태가 3단계인 이유: 자기 신고를 그대로 믿지 않는다.
//   pending(대기) → claimed(본인이 '보냈어요' = 카톡 "입완") → confirmed(총무가 은행앱 보고 확정)
//
// 보안 규칙(firestore.rules): 1차는 총무 전용 — 본인만 CRUD(ownerUid == uid).
//   참가자 열람·알림은 2차에서 열되, 그때도 총무 혼자 완결되는 경로는 유지할 것.
// =============================================================

const COLLECTION = 'settlements';

export const SETTLE_KINDS = [
  { key: 'prepay', label: '선입금', hint: '라운딩 전 · 캐디피·참가비' },
  { key: 'meal',   label: '식사 정산', hint: '라운딩 후 · 참석자만' },
  { key: 'etc',    label: '기타', hint: '' },
];
const KIND_KEYS = SETTLE_KINDS.map(k => k.key);
export const settleKindLabel = (key) =>
  (SETTLE_KINDS.find(k => k.key === key)?.label) || '기타';

// 입금 상태 — 순서가 곧 진행도. 총무 화면 정렬·집계에 쓴다.
export const PAY_PENDING = 'pending';
export const PAY_CLAIMED = 'claimed';
export const PAY_CONFIRMED = 'confirmed';

const won = (n) => Math.max(0, Math.round(Number(n) || 0));

// 참가자 한 명 정규화. name만 있으면 충분(앱 미설치자 포함).
//   amount = 이 사람이 낼 금액. locked = 총무가 직접 정한 금액이라 1/n 재계산에서 제외.
function normMember(m, i) {
  return {
    id: m?.id || `m${i}_${String(m?.name || '').slice(0, 8)}`,
    name: String(m?.name || '').trim().slice(0, 20),
    uid: m?.uid || null,
    amount: won(m?.amount),
    locked: !!m?.locked,
    status: [PAY_PENDING, PAY_CLAIMED, PAY_CONFIRMED].includes(m?.status) ? m.status : PAY_PENDING,
    memo: String(m?.memo || '').slice(0, 40),
  };
}

// ── 1/n 계산 ────────────────────────────────────────────────
// "대체로 1/n이지만 '이건 내가 계산할게'가 나온다"(사용자 2026-07-22).
//   locked=true인 사람의 금액은 그대로 두고, 남은 총액을 나머지에게 균등 배분한다.
//   나누어떨어지지 않는 원 단위는 버리지 않고 앞사람부터 1원씩 얹어 합계를 총액과 정확히 맞춘다
//   (합계≠총액이면 총무가 은행앱과 대조할 때 바로 어긋나 신뢰를 잃는다).
export function splitEvenly(members, total) {
  const list = (members || []).map(normMember);
  const t = won(total);
  const lockedSum = list.filter(m => m.locked).reduce((s, m) => s + m.amount, 0);
  const open = list.filter(m => !m.locked);
  if (open.length === 0) return list;

  const rest = Math.max(0, t - lockedSum);
  const base = Math.floor(rest / open.length);
  let remainder = rest - base * open.length;   // 0 ~ open.length-1

  return list.map(m => {
    if (m.locked) return m;
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { ...m, amount: base + extra };
  });
}

// 집계 — 총무 화면 상단 요약(6/8 입금, 남은 금액).
export function summarize(members) {
  const list = (members || []).map(normMember);
  const total = list.reduce((s, m) => s + m.amount, 0);
  const confirmed = list.filter(m => m.status === PAY_CONFIRMED);
  const claimed = list.filter(m => m.status === PAY_CLAIMED);
  const pending = list.filter(m => m.status === PAY_PENDING);
  return {
    count: list.length,
    total,
    confirmedCount: confirmed.length,
    claimedCount: claimed.length,
    pendingCount: pending.length,
    collected: confirmed.reduce((s, m) => s + m.amount, 0),   // 확정된 것만 '걷힌 돈'
    remain: total - confirmed.reduce((s, m) => s + m.amount, 0),
    unpaid: [...pending, ...claimed],                          // 독촉 대상(확정 안 된 전부)
  };
}

// ── CRUD ────────────────────────────────────────────────────
export async function loadMySettlements() {
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

export async function createSettlement(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const members = (data.members || []).map(normMember);
  const s = {
    ownerUid: uid,
    kind: KIND_KEYS.includes(data.kind) ? data.kind : 'etc',
    title: String(data.title || '').trim().slice(0, 40),
    course: String(data.course || '').trim().slice(0, 40),
    date: data.date || '',                       // 'YYYY.MM.DD' (rounds·golfExpenses와 동일 포맷)
    total: won(data.total),
    account: String(data.account || '').trim().slice(0, 60),   // 계좌 — 한 번 넣으면 다음에도 재사용
    accountName: String(data.accountName || '').trim().slice(0, 20),
    members,
    // 연결은 선택 — 없어도 완전히 동작한다(독립 문서인 이유)
    linkedRoundupId: data.linkedRoundupId || null,
    linkedScheduleId: data.linkedScheduleId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), s);
  return { id: ref.id, ...s };
}

export async function updateSettlement(id, patch) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const p = { ...patch, ownerUid: uid, updatedAt: serverTimestamp() };
  if (p.members) p.members = p.members.map(normMember);
  if (p.total !== undefined) p.total = won(p.total);
  await updateDoc(doc(db, COLLECTION, id), p);
}

export async function deleteSettlement(id) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  await deleteDoc(doc(db, COLLECTION, id));
}

// 한 사람 입금 상태만 바꾸기 — 목록에서 탭 한 번으로 순환(대기 → 확정 → 대기).
//   claimed는 참가자가 만드는 상태라 총무 탭 순환에는 넣지 않는다(총무는 '확정'만 찍는다).
export function toggleMemberStatus(members, memberId) {
  return (members || []).map(normMember).map(m => {
    if (m.id !== memberId) return m;
    const next = m.status === PAY_CONFIRMED ? PAY_PENDING : PAY_CONFIRMED;
    return { ...m, status: next };
  });
}

// 카톡으로 보낼 정산서 텍스트 — 앱 안 깐 사람에게 가는 경로.
//   ★이게 앱의 광고이기도 하다(카톡방에 뿌려지는 순간 8명이 본다).
export function buildSettlementText(s) {
  const list = (s?.members || []).map(normMember);
  const head = [s?.course, s?.date].filter(Boolean).join(' · ');
  const lines = [];
  if (head) lines.push(head);
  lines.push(`[${settleKindLabel(s?.kind)}]`);
  lines.push('');
  list.forEach(m => {
    const mark = m.status === PAY_CONFIRMED ? ' ✅' : '';
    lines.push(`${m.name}  ${m.amount.toLocaleString()}원${mark}`);
  });
  lines.push('');
  lines.push(`합계 ${list.reduce((a, m) => a + m.amount, 0).toLocaleString()}원`);
  if (s?.account) lines.push(`${s.account}${s.accountName ? ` ${s.accountName}` : ''}`);
  return lines.join('\n');
}
