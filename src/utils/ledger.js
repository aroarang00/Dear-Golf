import {
  collection, query, where, orderBy, getDocs, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment, writeBatch,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { newShareToken } from './settlement';   // 웹 공유 토큰 — 걷기와 같은 방식 재사용

// =============================================================
// ledgers/{ledgerId} — 모임 '회비 장부'(총무용 지속 회계). 걷기와 별개, 모임 통장 관리.
//
// ★걷기(settlements)와의 차이: 걷기는 '돈을 걷는 1회성 행위', 장부는 '걷은 돈·쓴 돈의 지속 관리'.
//   가계부(golfExpenses)는 '내 개인 지출', 장부는 '모임 공동 통장'.
//
// ★총무는 모임을 여러 개 가질 수 있다 → 장부는 총무당 N개(ownerUid로 목록 쿼리). 모임당 1개.
//   장부를 크루에 종속시키지 않고 독립 문서 + linkedCrewId 연결만 둔다(걷기와 같은 이유:
//   앱 안 깐 모임도 총무 혼자 쓸 수 있어야 한다). 크루 연결 시 회원 열람은 2차에서 연다.
//
// 데이터:
//   ledgers/{id}:  { ownerUid, name, linkedCrewId?, balance, incomeTotal, expenseTotal,
//                    account?, accountName?, shareToken, archived, createdAt, updatedAt }
//   ledgers/{id}/entries/{eid}: { type:'income'|'expense', amount, category, title, date,
//                    memo, who?, linkedSettlementId?, createdByUid, createdAt, updatedAt }
//
// 잔액 캐시(balance/incomeTotal/expenseTotal)는 거래 추가/수정/삭제 때 writeBatch + increment로
//   장부 문서에 함께 갱신한다 — 목록에서 매번 전체 거래를 합산하지 않아도 잔액이 바로 보인다.
//
// 보안 규칙(firestore.rules): 1차는 총무 전용 — ownerUid == uid (settlements와 동일 패턴).
// =============================================================

const COLLECTION = 'ledgers';

// 수입 분류 — 회비가 대부분, 찬조(추가 후원), 이월금(작년 잔액 넘어옴), 기타.
export const LEDGER_INCOME_CATEGORIES = [
  { key: 'dues',      label: '회비' },
  { key: 'sponsor',   label: '찬조' },
  { key: 'carryover', label: '이월금' },
  { key: 'etc',       label: '기타수입' },
];
// 지출 분류 — 모임 운영에서 실제 나가는 돈.
export const LEDGER_EXPENSE_CATEGORIES = [
  { key: 'round',   label: '라운딩' },
  { key: 'meal',    label: '식대' },
  { key: 'event',   label: '경조사' },
  { key: 'supply',  label: '비품' },
  { key: 'etc',     label: '기타' },
];
const INCOME_KEYS = LEDGER_INCOME_CATEGORIES.map(c => c.key);
const EXPENSE_KEYS = LEDGER_EXPENSE_CATEGORIES.map(c => c.key);

// type에 맞는 분류 라벨. type이 income이면 수입 분류에서, 아니면 지출 분류에서 찾는다.
export function ledgerCatLabel(type, key) {
  const list = type === 'income' ? LEDGER_INCOME_CATEGORIES : LEDGER_EXPENSE_CATEGORIES;
  return (list.find(c => c.key === key)?.label) || (type === 'income' ? '기타수입' : '기타');
}

const won = (n) => Math.max(0, Math.round(Number(n) || 0));

// ── 장부(모임) CRUD ─────────────────────────────────────────
// 최근 갱신순 정렬 — updatedAt(serverTimestamp) 기준. 방금 만든 문서는 잠깐 null일 수 있어 0으로 본다.
const byUpdatedDesc = (a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0);

// 내 모임 장부 목록 — 최근 갱신순. ★정렬은 앱에서 한다(where만 걸어 복합 인덱스 불필요).
//   총무당 장부는 몇 개뿐이라 전부 읽어 정렬해도 부담이 없다(걷기 archived와 같은 정신).
export function subscribeMyLedgers(uid, onData, onError) {
  if (!uid) { onData([]); return () => {}; }
  const q = query(collection(db, COLLECTION), where('ownerUid', '==', uid));
  return onSnapshot(q,
    (snap) => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byUpdatedDesc)),
    (e) => { if (__DEV__) console.warn('[ledger] subscribeMyLedgers', e?.message); onError && onError(e); });
}

export async function loadMyLedgers(uid) {
  const u = uid || await getUid();
  if (!u) return [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where('ownerUid', '==', u)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byUpdatedDesc);
  } catch (e) { if (__DEV__) console.warn('[ledger] loadMyLedgers', e?.message); return []; }
}

// 크루에 연결된 내 장부 1개 찾기 — 크루 화면 진입 시 있으면 열고, 없으면 만들게 한다.
//   where(ownerUid)만 걸고 linkedCrewId는 앱에서 거른다(복합 인덱스 불필요, 장부 수 적음).
export async function findLedgerByCrew(crewId, uid) {
  const u = uid || await getUid();
  if (!u || !crewId) return null;
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where('ownerUid', '==', u)));
    const hit = snap.docs.find(d => d.data().linkedCrewId === crewId);
    return hit ? { id: hit.id, ...hit.data() } : null;
  } catch (e) { if (__DEV__) console.warn('[ledger] findLedgerByCrew', e?.message); return null; }
}

export async function createLedger(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const l = {
    ownerUid: uid,
    name: String(data.name || '').trim().slice(0, 30) || '우리 모임',
    linkedCrewId: data.linkedCrewId || null,
    balance: 0,
    incomeTotal: 0,
    expenseTotal: 0,
    account: String(data.account || '').trim().slice(0, 60),          // 회비 입금 계좌
    accountName: String(data.accountName || '').trim().slice(0, 20),
    shareToken: newShareToken(),   // 회원에게 웹으로 잔액·내역 공유(2차에서 활용)
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), l);
  return { id: ref.id, ...l };
}

export async function updateLedger(id, patch) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const { ownerUid, id: _id, createdAt, balance, incomeTotal, expenseTotal, ...up } = patch || {};
  // 잔액 3필드는 거래로만 바뀌게 — 직접 수정 차단(캐시 무결성).
  if (up.name != null) up.name = up.name.toString().trim().slice(0, 30);
  if (up.account != null) up.account = up.account.toString().trim().slice(0, 60);
  if (up.accountName != null) up.accountName = up.accountName.toString().trim().slice(0, 20);
  await updateDoc(doc(db, COLLECTION, id), { ...up, ownerUid: uid, updatedAt: serverTimestamp() });
}

export async function setLedgerArchived(id, archived) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  await updateDoc(doc(db, COLLECTION, id), {
    archived: !!archived, ownerUid: uid, updatedAt: serverTimestamp(),
  });
}

// 장부 삭제 — 하위 거래(entries)까지 배치로 함께 지운다. 거래가 많아도 모임 장부는 수백 건 수준이라
//   배치 한도(500) 안이 대부분. 넘으면 나눠 지운다(방어). 삭제는 되살릴 수 없어 호출부에서 경고할 것.
export async function deleteLedger(id) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const entriesSnap = await getDocs(collection(db, COLLECTION, id, 'entries'));
  const docs = entriesSnap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

// ── 거래(entries) CRUD ──────────────────────────────────────
// 거래 목록 — 날짜 내림차순(최근이 위). 장부 상세가 열려 있는 동안 실시간 구독.
export function subscribeLedgerEntries(ledgerId, onData, onError) {
  if (!ledgerId) { onData([]); return () => {}; }
  const q = query(
    collection(db, COLLECTION, ledgerId, 'entries'),
    orderBy('date', 'desc'),
  );
  return onSnapshot(q,
    (snap) => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (e) => { if (__DEV__) console.warn('[ledger] subscribeLedgerEntries', e?.message); onError && onError(e); });
}

// 거래 값 정규화 — type/amount/category를 안전하게.
function normEntry(data) {
  const type = data.type === 'income' ? 'income' : 'expense';
  const keys = type === 'income' ? INCOME_KEYS : EXPENSE_KEYS;
  return {
    type,
    amount: won(data.amount),
    category: keys.includes(data.category) ? data.category : 'etc',
    title: String(data.title || '').trim().slice(0, 40),
    date: data.date || '',                                   // 'YYYY.MM.DD'
    memo: String(data.memo || '').trim().slice(0, 200),
    who: String(data.who || '').trim().slice(0, 40),         // 수입이면 낸 사람(선택)
    linkedSettlementId: data.linkedSettlementId || null,     // 걷기 연결(2차)
  };
}

// 잔액 캐시 증분값 — 수입이면 +amount, 지출이면 -amount.
const signedDelta = (type, amount) => (type === 'income' ? 1 : -1) * won(amount);

// 거래 추가 — entries에 넣고 같은 배치로 장부 잔액 캐시를 갱신한다.
export async function addEntry(ledgerId, data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const e = normEntry(data);
  const batch = writeBatch(db);
  const entryRef = doc(collection(db, COLLECTION, ledgerId, 'entries'));
  batch.set(entryRef, { ...e, createdByUid: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.update(doc(db, COLLECTION, ledgerId), {
    balance: increment(signedDelta(e.type, e.amount)),
    incomeTotal: increment(e.type === 'income' ? e.amount : 0),
    expenseTotal: increment(e.type === 'expense' ? e.amount : 0),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return { id: entryRef.id, ...e };
}

// 거래 수정 — 이전 값과의 '차액'만 잔액 캐시에 반영한다(prev 필요: 화면이 들고 있는 원래 거래).
//   type/amount가 바뀌면 이전 기여분을 빼고 새 기여분을 더한다.
export async function updateEntry(ledgerId, entryId, patch, prev) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const next = normEntry({ ...prev, ...patch });
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, ledgerId, 'entries', entryId), { ...next, updatedAt: serverTimestamp() });
  if (prev) {
    const balDelta = signedDelta(next.type, next.amount) - signedDelta(prev.type, won(prev.amount));
    const incDelta = (next.type === 'income' ? next.amount : 0) - (prev.type === 'income' ? won(prev.amount) : 0);
    const expDelta = (next.type === 'expense' ? next.amount : 0) - (prev.type === 'expense' ? won(prev.amount) : 0);
    batch.update(doc(db, COLLECTION, ledgerId), {
      balance: increment(balDelta),
      incomeTotal: increment(incDelta),
      expenseTotal: increment(expDelta),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// 거래 삭제 — 잔액 캐시에서 그 거래 기여분을 되돌린다(entry 필요).
export async function deleteEntry(ledgerId, entryId, entry) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const batch = writeBatch(db);
  batch.delete(doc(db, COLLECTION, ledgerId, 'entries', entryId));
  if (entry) {
    batch.update(doc(db, COLLECTION, ledgerId), {
      balance: increment(-signedDelta(entry.type, won(entry.amount))),
      incomeTotal: increment(entry.type === 'income' ? -won(entry.amount) : 0),
      expenseTotal: increment(entry.type === 'expense' ? -won(entry.amount) : 0),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// ── 회원 회비(정기 회비) — 회비 걷는 모임만. 회원은 '이름'만(아바타·크루연동 없음, 걷기와 같은 가벼운 방식) ──
//   ★월 회비와 연회비는 서로 배타가 아니다 — 모임에 따라 월만, 연만, 둘 다 걷는다.
//     그래서 주기를 '고르는' 게 아니라 각각 켠다: monthly:{on,amount} / yearly:{on,amount}.
//     화면은 켠 것만 보여준다(하나만 켜면 탭 없이 그 화면, 둘 다면 월별 정산↔연회비 관리 탭).
//   회원 명단(members)은 주기와 무관하게 하나로 공유되고, 납부 여부는 '기간(period)'별로 쌓인다.
//     periods = { '2026.07': { paid:[회원id…], amount: 그때의 1인 회비 } }   // 연회비는 키가 '2026'
//     → 키 모양이 달라 월·연 기록이 한 맵에서 섞이지 않고 공존한다.
//   → 지난 달을 다시 열어 볼 수 있고, 새 달로 넘기면 자동으로 전원 미납에서 시작한다(수동 초기화 불필요).
//   amount 스냅샷을 기간에 같이 남기는 이유: 회비를 올려도 지난 기간 걷힌 금액이 소급 변조되지 않게.
//   찬조·이월은 회비가 아니라 '수입 항목'(카테고리 sponsor/carryover)으로 넣는다 — 여긴 정기 회비만 다룬다.
//   장부 문서의 dues 필드에 통째로 저장(회원 수 적어 배열로 충분, settlement.members와 같은 정신).
export const DUES_CYCLES = [
  { key: 'monthly', label: '월 회비', title: '월별 정산' },
  { key: 'yearly',  label: '연회비',  title: '연회비 관리' },
];
export const duesCycleTitle = (cycle) => (cycle === 'yearly' ? '연회비 관리' : '월별 정산');
export const duesCycleLabel = (cycle) => (cycle === 'yearly' ? '연회비' : '월 회비');
export const duesAmountLabel = (cycle) => (cycle === 'yearly' ? '1인 연회비' : '1인 월 회비');

const p2 = (n) => String(n).padStart(2, '0');

// 기간 키 — 월별 'YYYY.MM' / 연 'YYYY'. 화면·저장 양쪽에서 이 함수만 쓴다.
export function duesPeriodKey(cycle, date) {
  const d = date instanceof Date ? date : new Date();
  return cycle === 'yearly' ? String(d.getFullYear()) : `${d.getFullYear()}.${p2(d.getMonth() + 1)}`;
}

// 기간 이동 — delta만큼 앞뒤로(월별이면 달, 연이면 해). 잘못된 키면 현재 기간으로 되돌린다.
export function shiftDuesPeriod(cycle, key, delta) {
  const [y, m] = String(key || '').split('.').map(Number);
  if (!y) return duesPeriodKey(cycle);
  if (cycle === 'yearly') return String(y + delta);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}`;
}

// 표시용 — '2026년 7월' / '2026년'
export function duesPeriodLabel(cycle, key) {
  const [y, m] = String(key || '').split('.').map(Number);
  if (!y) return '';
  return cycle === 'yearly' ? `${y}년` : `${y}년 ${m || 1}월`;
}

// 회원 명단 정규화 — id는 한번 붙으면 끝까지 유지(납부 기록이 id로 매달린다).
//   ★id는 반드시 서로 달라야 한다: 중간 회원을 지우면 뒤 회원의 인덱스가 밀려,
//     같은 이름을 다시 넣을 때 예전 id와 겹칠 수 있다(동명이인 한 명 체크 → 둘 다 체크됨).
//   ★재적 기간 — since(입회한 달) / until(마지막으로 걷은 달), 둘 다 'YYYY.MM'.
//     · 새로 들어온 회원은 since부터만 대상이다. 지난 달 미납자로 잡히면 안 된다.
//     · 나간 회원은 until까지만 대상이고 명단에는 남는다. 지난 달에 실제로 낸 돈은
//       그 사람이 나갔다고 없던 일이 되지 않는다(장부가 틀어진다). 이름도 남아야 과거 기록을 읽는다.
//     · 옛 데이터엔 둘 다 없다 → 없으면 '늘 재적'으로 본다(하위호환).
const ym = (s) => /^\d{4}\.\d{2}$/.test(String(s || '')) ? String(s) : null;
function normMembers(raw) {
  const used = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 100).map((m, i) => {
    const name = String(m?.name || '').trim().slice(0, 20);
    let id = m?.id || `dm${i}_${name.slice(0, 8)}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    const out = { id, name };
    if (ym(m?.since)) out.since = ym(m.since);
    if (ym(m?.until)) out.until = ym(m.until);
    return out;
  });
}

// 그 기간에 재적 중이었나 — 월이면 달끼리, 연이면 연도끼리 견준다(키 모양이 달라 그냥 비교하면 어긋난다).
export function isMemberIn(m, cycle, periodKey) {
  const key = String(periodKey || '');
  if (cycle === 'yearly') {
    const y = key.slice(0, 4);
    if (m?.since && m.since.slice(0, 4) > y) return false;
    if (m?.until && m.until.slice(0, 4) < y) return false;
    return true;
  }
  if (m?.since && m.since > key) return false;
  if (m?.until && m.until < key) return false;
  return true;
}

// 기간 맵 정규화 — 최근 키부터 60개까지만 남긴다(문서 비대 방지. 월별 5년치).
//   ★paid는 현재 명단으로 거르지 않는다: 탈퇴자가 그때 낸 기록을 지우면 과거 잔액이 바뀐다.
//     명단에서 아주 지우고 싶을 때만 호출부가 paid에서도 함께 뺀다(잘못 넣은 이름 정리용).
function normPeriods(periods) {
  const out = {};
  const keys = Object.keys(periods || {}).filter(k => /^\d{4}(\.\d{2})?$/.test(k)).sort().reverse().slice(0, 60);
  for (const k of keys) {
    const p = periods[k] || {};
    const paid = (Array.isArray(p.paid) ? p.paid : []).slice(0, 100);
    out[k] = { paid, amount: won(p.amount) };
  }
  return out;
}

const normPlan = (p) => ({ on: !!p?.on, amount: won(p?.amount) });

// dues = { enabled, monthly:{on,amount}, yearly:{on,amount}, members:[{id,name}], periods }
export function normDues(dues) {
  const raw = Array.isArray(dues?.members) ? dues.members : [];
  const members = normMembers(raw);
  const periods = normPeriods(dues?.periods);

  let monthly = normPlan(dues?.monthly);
  let yearly = normPlan(dues?.yearly);
  // 구버전 호환 — 주기 하나(cycle+amount)만 있던 데이터는 그 주기를 켠 것으로 본다.
  if (!dues?.monthly && !dues?.yearly && (dues?.enabled || dues?.amount || dues?.cycle)) {
    const legacy = { on: true, amount: won(dues?.amount) };
    if (dues?.cycle === 'yearly') yearly = legacy; else monthly = legacy;
  }
  // 구버전 호환 — 기간 없이 members[].status만 있던 데이터는 '이번 기간'의 납부로 흡수한다.
  const legacyPaid = members.filter((_, i) => raw[i]?.status === 'paid').map(m => m.id);
  if (legacyPaid.length && !Object.keys(periods).length) {
    const c = yearly.on && !monthly.on ? 'yearly' : 'monthly';
    periods[duesPeriodKey(c)] = { paid: legacyPaid, amount: (c === 'yearly' ? yearly : monthly).amount };
  }
  return { enabled: !!dues?.enabled || monthly.on || yearly.on, monthly, yearly, members, periods };
}

export async function updateLedgerDues(ledgerId, dues) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  await updateDoc(doc(db, COLLECTION, ledgerId), {
    dues: normDues(dues), ownerUid: uid, updatedAt: serverTimestamp(),
  });
}

// 한 기간의 요약 — 완료/미납 인원, 걷힌 금액(완료수 × 그 기간 1인 회비), 남은 금액, 미납자 목록.
//   cycle은 필수(월·연 기록이 한 맵에 공존하므로 어느 쪽인지 알아야 한다).
//   periodKey를 안 주면 그 주기의 '이번 기간'. 기간에 amount 스냅샷이 없으면 현재 설정 금액으로 본다.
export function summarizeDues(dues, cycle, periodKey) {
  const d = normDues(dues);
  const c = cycle === 'yearly' ? 'yearly' : 'monthly';
  const key = periodKey || duesPeriodKey(c);
  const p = d.periods[key] || { paid: [], amount: 0 };
  const paidSet = new Set(p.paid);
  const amount = p.amount || d[c].amount;
  // 그 기간의 대상자 = 그때 재적 중이던 회원 + 그때 실제로 낸 사람.
  //   낸 사람을 늘 포함하는 이유: 그 뒤에 탈퇴했어도 이미 받은 돈은 그 달 수입으로 남아야 한다.
  const roster = d.members.filter(m => paidSet.has(m.id) || isMemberIn(m, c, key));
  const unpaid = roster.filter(m => !paidSet.has(m.id));
  const paidCount = roster.length - unpaid.length;
  return {
    periodKey: key,
    amount,
    total: roster.length,
    roster,
    paidCount,
    unpaidCount: unpaid.length,
    collected: paidCount * amount,
    remain: unpaid.length * amount,
    unpaid,
    paidSet,
  };
}

// 어느 기간에 걷은 회비 — prefix가 '2026.07'이면 그 달, '2026'이면 그 해(월회비 12달 + 연회비).
//   장부 화면의 '이 달/이 해' 요약이 회비까지 포함하도록 쓴다.
export function duesCollectedIn(dues, prefix) {
  const d = normDues(dues);
  const p = String(prefix || '');
  if (!p) return 0;
  return Object.keys(d.periods)
    .filter(k => k === p || k.startsWith(`${p}.`))
    .reduce((sum, k) => sum + summarizeDues(d, k.includes('.') ? 'monthly' : 'yearly', k).collected, 0);
}

// 걷은 회비 총액 — 모든 기간(월·연 전부)의 '완료 인원 × 그 기간 회비' 합.
//   ★잔액에 회비를 반영하는 방법으로 '거래(entry) 자동 생성'을 쓰지 않는다: 회원을 지우거나 기간 기록을
//     지우면 과거 여러 기간의 걷힌 금액이 한꺼번에 바뀌어, 만들어 둔 거래들과 어긋나기 시작한다.
//     회비는 명단 체크가 원본이므로 그때그때 합산해서 보여주는 편이 늘 정확하고 손이 덜 간다.
export function totalDuesCollected(dues) {
  const d = normDues(dues);
  return DUES_CYCLES.reduce((sum, c) =>
    sum + listDuesPeriods(d, c.key).reduce((s, p) => s + p.collected, 0), 0);
}

// 기록이 있는 기간 목록(최근순) — '지난 기간' 리스트용. 그 주기의 키만 고른다(월='YYYY.MM' / 연='YYYY').
//   각 기간의 걷힌 금액·인원까지 계산해 돌려준다.
export function listDuesPeriods(dues, cycle) {
  const d = normDues(dues);
  const c = cycle === 'yearly' ? 'yearly' : 'monthly';
  const mine = (k) => (c === 'yearly' ? !k.includes('.') : k.includes('.'));
  return Object.keys(d.periods).filter(mine).sort().reverse().map((k) => {
    const s = summarizeDues(d, c, k);
    return { key: k, label: duesPeriodLabel(c, k), paidCount: s.paidCount, total: s.total, collected: s.collected };
  });
}

// ── 카톡 내역서 ─────────────────────────────────────────────
// 총무가 회원들에게 "이 달 이렇게 썼습니다"를 보내는 글. 걷기(buildSettlementText)와 같은 정신 —
//   앱 없는 회원도 읽을 수 있게 순수 텍스트, 이모지 없이. 무엇을 넣을지는 화면에서 고른 것만 넘어온다.
//   entries는 이미 선택·정렬된 거래 배열, dues는 그 기간 회비 요약(없으면 생략).
//   months를 주면(연말정산) 거래를 한 줄씩 늘어놓지 않고 달별 요약으로 접어서 쓴다 —
//   한 해치를 낱개로 붙이면 카톡 글이 수십 줄이 되어 아무도 안 읽는다.
export function buildLedgerText({ name, periodLabel, entries = [], dues = null, months = null }) {
  const lines = [];
  lines.push(`${name || '모임 장부'} · ${periodLabel}`);
  lines.push('');

  const money = (n) => `${won(n).toLocaleString()}원`;
  const dayOf = (d) => {                       // '2026.07.03' → '7/3' (한 줄에 여러 항목이 들어가게 짧게)
    const [, m, dd] = String(d || '').split('.');
    return (m && dd) ? `${Number(m)}/${Number(dd)}` : '';
  };

  const income = entries.filter(e => e.type === 'income');
  const expense = entries.filter(e => e.type === 'expense');
  let sumIn = 0, sumOut = 0;

  if (dues && dues.collected > 0) {
    lines.push('[회비]');
    lines.push(`${dues.label}  ${money(dues.collected)} (${dues.paidCount}/${dues.total}명)`);
    lines.push('');
    sumIn += dues.collected;
  }

  // 연말정산 — 달별 요약 한 줄씩. 개별 거래는 생략하고 합계만 낸다.
  if (months) {
    lines.push('[월별]');
    months.forEach(m => {
      lines.push(`${m.label}  수입 ${money(m.income)}  지출 ${money(m.expense)}`);
      sumIn += won(m.income); sumOut += won(m.expense);
    });
    lines.push('');
    lines.push(`수입 합계  ${money(sumIn)}`);
    lines.push(`지출 합계  ${money(sumOut)}`);
    lines.push(`남은 돈  ${money(sumIn - sumOut)}`);
    return lines.join('\n');
  }

  if (income.length) {
    lines.push('[수입]');
    income.forEach(e => {
      sumIn += won(e.amount);
      lines.push([dayOf(e.date), e.title || ledgerCatLabel(e.type, e.category), money(e.amount)].filter(Boolean).join('  '));
    });
    lines.push('');
  }
  if (expense.length) {
    lines.push('[지출]');
    expense.forEach(e => {
      sumOut += won(e.amount);
      lines.push([dayOf(e.date), e.title || ledgerCatLabel(e.type, e.category), money(e.amount)].filter(Boolean).join('  '));
    });
    lines.push('');
  }

  lines.push(`수입 합계  ${money(sumIn)}`);
  lines.push(`지출 합계  ${money(sumOut)}`);
  lines.push(`남은 돈  ${money(sumIn - sumOut)}`);
  return lines.join('\n');
}
