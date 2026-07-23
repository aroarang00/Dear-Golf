import {
  collection, query, where, orderBy, getDocs, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { db, getUid, functions } from './firebase';

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

// 공유 링크 토큰 — 이 문자열을 아는 사람만 웹 정산서를 본다. 보안 규칙으로는 "토큰을 아는 사람만 읽기"를
//   표현할 수 없어(읽기 시 클라이언트 값과 대조할 수단이 없음) Cloud Function이 대신 검증하고 읽어준다.
//   추측이 사실상 불가능해야 하므로 Math.random이 아니라 암호학적 난수를 쓴다. 22자 base62 ≈ 130비트.
const TOKEN_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function newShareToken() {
  const bytes = Crypto.getRandomBytes(22);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  return out;
}
export const SHARE_BASE = 'https://deargolf.app/s/';

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
//
// ★끝자리는 버리지 않고 100원 단위로 올린다(사용자 2026-07-22).
//   총무들 관행은 100원 절사인데, 그러면 버린 만큼을 총무가 조용히 떠안는다(8명이면 매번 몇백 원).
//   본인은 손해인 줄도 모른다. 반올림은 답이 아니다 — 끝자리 134는 반올림해도 100으로 내려가
//   손해가 그대로다. 그래서 기본을 올림으로 둔다.
//   부수 효과가 더 좋다: 전원이 똑같은 금액을 낸다. 예전엔 1원 나머지를 앞사람부터 얹어서
//   같은 자리에 앉았던 사람끼리 1원씩 다른 금액이 찍혔다.
//   ★대신 남는 잔돈은 정산서에 반드시 밝힌다(buildSettlementText) — 말 안 하고 남기면 그게 뒷말이 된다.
export const ROUND_UNIT = 100;

// roundUpTo에 0이나 1을 주면 원 단위로 정확히 나눈다(합계 == 총액). 잔돈을 1원도 남기면 안 되는
//   자리에서 쓰라고 남겨둔 문이고, 기본 경로는 아니다.
export function splitEvenly(members, total, { roundUpTo = ROUND_UNIT } = {}) {
  const list = (members || []).map(normMember);
  const t = won(total);
  const lockedSum = list.filter(m => m.locked).reduce((s, m) => s + m.amount, 0);
  const open = list.filter(m => !m.locked);
  if (open.length === 0) return list;

  const rest = Math.max(0, t - lockedSum);

  if (roundUpTo > 1) {
    const each = Math.ceil(rest / open.length / roundUpTo) * roundUpTo;
    return list.map(m => (m.locked ? m : { ...m, amount: each }));
  }

  // 정확히 나누기 — 나누어떨어지지 않는 원 단위를 앞사람부터 1원씩 얹어 합계를 총액과 맞춘다.
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
    // ★안 낸 사람(pending)과 보냈다고 한 사람(claimed)은 반드시 갈라서 준다.
    //   전에는 둘을 합친 unpaid 하나였는데, 그걸 독촉 대상으로 쓰면 이미 '보냈어요'를 누른 사람에게
    //   독촉이 나간다 — 총무가 제일 겁내는 사고다. 독촉은 pending만, claimed는 확인만 하면 되는 줄.
    pending, claimed,
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

// 실시간 구독 — 참가자가 웹에서 '보냈어요'를 누르면 총무 화면에 바로 떠야 한다(그게 이 기능의 핵심).
//   한 번 읽고 끝이면 앱을 껐다 켜야 보인다. 화면이 떠 있는 동안만 구독하고 닫을 때 해제한다.
export function subscribeMySettlements(uid, onData, onError) {
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', uid),
    orderBy('date', 'desc'),
  );
  return onSnapshot(q,
    (snap) => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (e) => onError && onError(e));
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
    note: String(data.note || '').trim().slice(0, 60),         // 계산 근거 한 줄 — '내역 넣기' 정산서에 붙인다
    // 건별 내역 [{label:"1차 복돌이식당", amount}] — 카드문자 가맹점명을 그대로. 한 건이면 빈 배열.
    items: (Array.isArray(data.items) ? data.items : [])
      .map(i => ({ label: String(i?.label || '').trim().slice(0, 20), amount: won(i?.amount) }))
      .filter(i => i.label && i.amount > 0)
      .slice(0, 12),
    members,
    // 보관 — 끝난 걷기를 목록에서 치우되 데이터는 남긴다. 삭제는 되살릴 수 없어 별도로 둔다
    //   ("작년에 얼마 걷었지"·모임 운영비 정산은 지난 기록이 있어야 한다). 보관/삭제는 총무가 고른다.
    archived: false,
    shareToken: newShareToken(),   // 카톡 정산서에 붙는 웹 링크 — 참가자가 설치 없이 '보냈어요'를 누른다
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

// 보관 / 보관 해제 — 목록 표시만 바꾸고 문서는 그대로 둔다.
//   쿼리로 거르지 않고 클라이언트에서 나누는 이유: archived 필드가 없는 옛 문서가 부등호 쿼리에서
//   통째로 빠진다. 걷기는 사용자당 개수가 적어 전부 읽어도 부담이 없다.
export async function setSettlementArchived(id, archived) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  await updateDoc(doc(db, COLLECTION, id), {
    archived: !!archived, ownerUid: uid, updatedAt: serverTimestamp(),
  });
}

export async function deleteSettlement(id) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  await deleteDoc(doc(db, COLLECTION, id));
}

// 한 사람 입금 상태만 바꾸기 — 목록에서 탭 한 번으로 순환(대기 → 확인 → 대기).
//   claimed는 참가자가 웹에서 만드는 상태라 총무 탭 순환에는 넣지 않는다(총무는 '확인'만 찍는다).
//   화면 문구는 '확정'이 아니라 '확인' — 총무가 하는 건 돈이 들어왔는지 확인하는 일이다(사용자 2026-07-22).
export function toggleMemberStatus(members, memberId) {
  return (members || []).map(normMember).map(m => {
    if (m.id !== memberId) return m;
    const next = m.status === PAY_CONFIRMED ? PAY_PENDING : PAY_CONFIRMED;
    return { ...m, status: next };
  });
}

// ── AI 자동 계산 ────────────────────────────────────────────
// extractExpense(가계부)는 읽은 값을 그대로 채우면 끝이지만, 정산은 총무마다 요구가 다르다.
//   그래서 금액뿐 아니라 요구사항 문장(1/n·100원 올림·"누구는 얼마")까지 넘겨 사람별 금액을 받아온다.
//   서버 응답은 신뢰하되 검산한다 — 이름이 명단과 어긋나거나 금액이 비면 우리 splitEvenly로 되돌린다.
function normalizeAiMembers(aiMembers, names) {
  const byName = new Map((aiMembers || []).map(m => [String(m?.name || '').trim(), won(m?.amount)]));
  const list = (names || []).map((n, i) => normMember({ name: n.name || n, amount: byName.get(n.name || n) || 0 }, i));
  const hit = list.filter(m => m.amount > 0).length;
  return { list, hit };
}

// 콜드 스타트로 첫 호출이 떨어질 수 있는 일시적 오류 — 이때만 조용히 한 번 다시 부른다.
//   resource-exhausted(rate limit)·invalid-argument 같은 '진짜' 실패는 재시도해봐야 똑같으니 제외한다.
const TRANSIENT_CODES = new Set([
  'functions/deadline-exceeded', 'functions/unavailable', 'functions/internal', 'functions/cancelled',
  'deadline-exceeded', 'unavailable', 'internal', 'cancelled',
]);

async function callSettlementAI(payload, names) {
  // ★한동안 안 쓰면 함수가 콜드 스타트로 뜨는데, 그 부팅이 클라 타임아웃을 넘겨 첫 '걷기 시작'이
  //   실패로 떴다(사용자 2026-07-23: "첫 번째 실패, 두 번째 성공"). 서버 로그는 전부 성공 — 앱이 먼저
  //   포기한 것. 타임아웃을 넉넉히(60s) 주고, 그래도 일시 오류면 한 번만 다시 부른다(그새 인스턴스가
  //   데워져 성공). 사용자가 두 번 누를 필요 없이 첫 시도에 끝나게.
  const callable = httpsCallable(functions, 'extractSettlement', { timeout: 60000 });
  let res;
  try {
    res = await callable(payload);
  } catch (e) {
    if (!TRANSIENT_CODES.has(e?.code)) throw e;
    res = await callable(payload);   // 재시도 1회 — 여기서도 실패하면 그대로 던져 상위 catch가 처리
  }
  const d = res?.data;
  if (!d?.found) return { error: '금액을 찾지 못했어요' };
  const total = won(d.total);
  const { list, hit } = normalizeAiMembers(d.members, names);
  // AI가 사람별 금액을 제대로 못 채웠으면(이름 불일치 등) 총액만 살리고 우리 로직으로 나눈다.
  const members = hit >= 1 && hit === (names || []).length ? list : splitEvenly(names || [], total);
  return {
    total, members, note: d.note || '',
    items: Array.isArray(d.items) ? d.items : [],   // 품목별 내역 — 정산서 '내역 넣기'에 쓴다
    account: d.account || '', accountName: d.accountName || '',
    fallback: !(hit >= 1 && hit === (names || []).length),
  };
}

// 영수증 여러 장 — 1차·2차처럼 결제가 나뉘는 경우가 흔하다. 3장까지(그 이상은 오합산 위험).
export const RECEIPT_MAX = 3;

// ★붙여넣은 문자와 영수증 사진을 한 번에 보낸다(사용자 2026-07-22).
//   전에는 텍스트용·사진용 호출이 따로여서 매번 결제 1건씩만 보였고, 그래서 건별 내역이 안 나왔다.
//   1차는 카드문자·2차는 영수증처럼 출처가 섞이는 게 실제 모습이라 한 번에 읽혀야 합산도 맞다.
export async function computeSettlement({ text, uris, names, instruction, kind }) {
  try {
    const list = (uris || []).slice(0, RECEIPT_MAX);
    const images = [];
    for (const uri of list) {
      const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
        compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true,
      });
      images.push(img.base64);
    }
    return await callSettlementAI({
      text: (text || '').trim(),
      images, format: 'jpg',
      names: (names || []).map(n => n.name || n),
      instruction, kind,
    }, names);
  } catch (e) {
    if (e?.code === 'functions/resource-exhausted') return { error: '요청이 많아요. 잠시 후 다시 시도해주세요' };
    return { error: '자동 계산에 실패했어요' };
  }
}


// 카톡으로 보낼 정산서 텍스트 — 앱 안 깐 사람에게 가는 경로.
//   ★이게 앱의 광고이기도 하다(카톡방에 뿌려지는 순간 8명이 본다).
//
//   ★내역을 넣을지는 선택이다(사용자 2026-07-22): 영수증·내역까지 다 붙이는 모임이 있고,
//   금액만 딱 올리는 모임이 있다. 어느 쪽이 옳다고 정하지 않고 총무가 고르게 한다.
//     detail=false — 1인 얼마·합계·계좌만. 금액이 전원 같을 때만 쓸 수 있다.
//     detail=true  — 품목별 내역(무엇에 얼마) + 사람별 금액 + 계산 근거 + 입금 표시.
export function buildSettlementText(s, { detail = true } = {}) {
  const list = (s?.members || []).map(normMember);
  const items = Array.isArray(s?.items) ? s.items.filter(i => i?.label && i?.amount > 0) : [];
  const total = list.reduce((a, m) => a + m.amount, 0);
  const uniform = list.length > 0 && list.every(m => m.amount === list[0].amount);
  const lines = [];

  const head = [s?.course, s?.date].filter(Boolean).join(' · ');
  if (head) lines.push(head);
  lines.push(settleKindLabel(s?.kind));
  lines.push('');

  // 건별 내역 — 영수증을 첨부하는 대신 어디서 얼마 썼는지를 상호명 그대로 남긴다
  if (detail && items.length > 0) {
    items.forEach(i => lines.push(`${i.label}  ${won(i.amount).toLocaleString()}원`));
    lines.push('');
  }

  // 금액이 사람마다 다르면 '간단히'라도 사람별로 적어야 한다 — 1인 얼마가 하나로 안 나온다.
  if (!detail && uniform) {
    lines.push(`1인 ${list[0].amount.toLocaleString()}원 (${list.length}명)`);
  } else {
    list.forEach(m => {
      const mark = detail && m.status === PAY_CONFIRMED ? '  입금완료' : '';
      lines.push(`${m.name}  ${m.amount.toLocaleString()}원${mark}`);
    });
  }

  lines.push('');
  lines.push(`합계 ${total.toLocaleString()}원`);
  if (detail && s?.note) lines.push(`(${s.note})`);

  // ★올림으로 걷는 돈이 실제 쓴 돈보다 많아지면 그 차액을 반드시 밝힌다(사용자 2026-07-22).
  //   금액이 문제가 아니라 '말 안 했다'가 문제가 된다 — 밝히면 규칙이 되고, 안 밝히면 나중에 뒷말이 된다.
  //   실비는 건별 내역의 합으로만 알 수 있어(문서의 total은 사람별 합으로 덮인다) 내역을 넣을 때만 붙는다.
  const spent = items.reduce((a, i) => a + won(i.amount), 0);
  if (detail && spent > 0 && total > spent) {
    lines.push(`(실비 ${spent.toLocaleString()}원 · 올림으로 ${(total - spent).toLocaleString()}원 남음)`);
  }

  pushAccountAndLink(lines, s, '입금하셨으면 여기서 눌러주세요');
  return lines.join('\n');
}

// 계좌 + 웹 링크 — 정산서와 독촉이 똑같이 쓰는 꼬리. 한쪽만 고치면 두 문구가 어긋나므로 함께 둔다.
function pushAccountAndLink(lines, s, linkLabel) {
  if (s?.account) {
    lines.push('');
    lines.push(s.account);
    // 예금주는 줄을 바꿔 적는다 — 계좌번호 뒤에 붙이면 카톡에서 줄이 넘쳐 이름이 잘린다(사용자 2026-07-22).
    if (s.accountName) lines.push(s.accountName);
  }
  // ★웹 링크 — 카톡에서 "입완"이라 쓰고 방을 나가던 걸 대신한다. 참가자는 앱을 안 깔아도
  //   링크를 눌러 자기 이름 옆 '보냈어요'를 탭하면 총무 화면에 바로 뜬다(설치 전제 금지).
  if (s?.shareToken) {
    lines.push('');
    lines.push(linkLabel);
    lines.push(SHARE_BASE + s.shareToken);
  }
}

// 독촉 문구 — 안 낸 사람에게만, 총무 대신 앱이 이름을 부른다.
//
// ★총무가 제일 싫어하는 일이 독촉이다(사용자 2026-07-22). 싫은 건 금액을 알리는 게 아니라
//   "○○님, 아직인데요"를 자기 입으로 쓰는 것 — 그래서 앱이 문구를 만들어주고 총무는 보내기만 누른다.
//   앱이 이름을 부르면 총무가 부른 게 아니게 된다. 그게 이 함수가 존재하는 이유다.
//
// ★'이미 보내셨으면 여기서 눌러주세요'가 핵심 한 줄이다. 이 줄이 없으면 "나 냈는데?"가 단톡방
//   다툼으로 가지만, 있으면 링크 한 번 탭으로 끝난다. 총무가 못 봤을 수도 있다는 여지를 남기는
//   말이기도 해서 지목의 날이 선다.
//
// 대상은 pending만 — claimed(본인이 '보냈어요'를 누른 사람)에게 독촉이 가면 안 된다.
// 안 낸 사람이 없으면 빈 문자열을 준다(호출부에서 버튼을 감추는 신호로 쓴다).
export function buildReminderText(s) {
  const { pending } = summarize(s?.members);
  if (pending.length === 0) return '';

  const lines = [];
  const head = [s?.course, s?.date].filter(Boolean).join(' · ');
  if (head) lines.push(head);
  lines.push(settleKindLabel(s?.kind));
  lines.push('');

  lines.push('입금 확인이 아직 안 된 분이에요');
  pending.forEach(m => lines.push(`${m.name}  ${m.amount.toLocaleString()}원`));

  pushAccountAndLink(lines, s, '이미 보내셨으면 여기서 눌러주세요');
  return lines.join('\n');
}
