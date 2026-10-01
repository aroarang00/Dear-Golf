import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, Share, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import AppTextInput from './common/AppTextInput';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { showAppAlert } from './AppAlert';
import { Icon } from './common/Icon';
import { C, F, fs } from '../constants/colors';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { UserContext } from '../contexts/UserContext';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { roundsOnly } from '../utils/diaryKind';
import { buildCompanionNames } from '../utils/scheduleCompanions';
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadFriendData } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { loadMyLedgers, syncDuesPaidFromSettlement, duesPeriodKey } from '../utils/ledger';   // 회비 걷기 ↔ 회비 장부
import {
  settleKindLabel, settleTitle, PAY_PENDING, PAY_CONFIRMED,
  splitEvenly, buildSettlementText, createSettlement, computeSettlement, RECEIPT_MAX, newShareToken,
} from '../utils/settlement';

// 걷기 만들기 — 한 화면에 질문 하나씩 묻는 위저드(2026-10-01 전면 개편).
//
// ★왜 위저드인가 (사용자 2026-10-01: "정산 기능이 몹시 불편, 심플하게 전체적으로 뜯어고쳐야")
//   전 화면은 라운딩을 고르면 종류·명단·금액·계좌가 한 페이지에 줄줄이 펼쳐지는 긴 폼이었다.
//   접기 3종으로 줄여봤지만(09-22) 여전히 "뭘 어디에 적어야 하는지"가 한눈에 안 들어왔다.
//   순서를 사용자가 제안한 대로 바꾼다: 종류 → 어느 모임 → 누구 → 얼마 → (나누기) → (계좌) → 보내기.
//
// ★종류가 뒤 질문을 정한다 — 그래서 종류를 맨 처음 묻는다.
//   선입금 = 예정 일정만 보여주고, 1인당 금액 한 칸, 나누기 없음(전원 동일).
//   정산   = 다녀온 일정 + '골프 아닌 모임(회식)', 총액·영수증, 1/n 채워놓고 고치는 나누기 단계.
//   회비   = 일정 없음(제목 '10월 회비' 자동), 지난번 명단·금액 그대로, 1인당 한 칸.
//   물어볼 필요 없는 질문(촬영/직접, 1/n/개별, 예정/다녀온)은 화면으로 두지 않는다.
//
// ★계좌는 기억해둔 게 있으면 묻지 않는다 — 확인 화면 한 줄(바꾸기)로만. 없을 때만 계좌 단계가 끼어든다.
// ★마지막 화면이 곧 '카톡으로 보내기' — 만들고 상세로 가서 또 보내기를 찾던 두 동작을 하나로.
//   보내기 전에 실제 카톡 문구를 그대로 보여준다(미리보기를 따로 열 필요 없음).
//
// 데이터 구조(settlements)는 그대로. 종류에 'dues'(회비)만 늘었다. 상세·웹 링크·독촉은 안 건드렸다.

const GOLD = '#C9A84C';
const GOLD_DEEP = '#8A6A33';
const BURGUNDY = '#6B1E2A';
const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const today = () => ymd(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

const box = { backgroundColor: C.bgSecondary, borderRadius: 12 };
const input = [box, { paddingHorizontal: 14, paddingVertical: 13, fontFamily: F.sys, fontSize: fs(15), color: C.charcoal }];
const hint = { fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, marginBottom: 7 };
const question = { fontFamily: F.sysB, fontSize: fs(21), color: C.charcoal, letterSpacing: -0.3, lineHeight: fs(29) };
const sub = { fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary, marginTop: 6, lineHeight: fs(20) };

// 계좌 동일성 — 숫자만 비교(표기가 매번 달라 문자열 비교로는 중복이 쌓였다, 2026-07-22)
const accKey = (s) => {
  const digits = String(s || '').replace(/\D/g, '');
  return digits || String(s || '').replace(/\s+/g, ' ').trim();
};
const dedupeAccounts = (list) => {
  const seen = new Set();
  const out = [];
  for (const a of (list || [])) {
    const acc = (a?.account || '').trim();
    if (!acc) continue;
    const k = accKey(acc);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ account: acc, accountName: (a?.accountName || '').trim() });
    if (out.length >= 4) break;
  }
  return out;
};

// 명단 텍스트 → 참가자 배열. 줄바꿈·쉼표·가운뎃점 구분, 숫자만 있는 줄은 버린다.
function parseNames(text) {
  return String(text || '')
    .split(/[\n,·]/)
    .map(s => s.replace(/^\s*[-•\d]+[.)]?\s*/, '').trim())
    .filter(s => s && !/^\d+$/.test(s))
    .slice(0, 40)
    .map((name, i) => ({ id: `m${i}_${name.slice(0, 8)}`, name: name.slice(0, 20), amount: 0, status: PAY_PENDING }));
}

// 종류별 단계 — 질문이 필요 없는 단계는 애초에 목록에 없다.
function stepsFor(kind, hasAccount) {
  const s = ['kind'];
  if (kind && kind !== 'dues') s.push('source');
  s.push('who', 'amount');
  if (kind === 'meal') s.push('split');
  if (!hasAccount) s.push('account');
  s.push('confirm');
  return s;
}

// 화면에 보여줄 종류 3개 — 'etc'는 옛 문서 호환용이라 고르게 하지 않는다.
const KIND_CARDS = [
  { key: 'prepay', title: '선입금', desc: '라운딩 전에 미리 걷기\n캐디피·참가비 — 전원 같은 금액' },
  { key: 'meal',   title: '정산',   desc: '쓴 돈을 나눠 걷기\n식사·회식 — 영수증이나 총액으로' },
  { key: 'dues',   title: '회비',   desc: '매달 똑같이 걷기\n지난번 명단·금액 그대로' },
];

const monthDuesTitle = () => `${new Date().getMonth() + 1}월 회비`;

// recent — 부모가 가진 걷기 목록(최신순). '지난번 그대로' 기본값(회비 명단·선입금 단가)에 쓴다.
// backRef — 부모 헤더 ‹ / 안드 뒤로가기가 먼저 부른다. 한 단계 뒤로 갔으면 true, 첫 화면이면 false(부모가 닫는다).
// preset — 다른 데서 열 때 시작값(2026-10-01). { kind, scheduleId?, course?, date?, day? } = 일정 시트에서('선입금 걷기'·'정산하기')
//   / { kind:'dues', fromId } = 목록 '이번 달 회비'. 있으면 종류·모임 질문을 건너뛰고 '누구에게'부터 연다.
export function SettlementCompose({ onCreated, dirtyRef, backRef, recent, preset = null }) {
  const { schedules } = useContext(SchedulesContext);
  const { diaries } = useContext(DiariesContext);
  const { userProfile } = useContext(UserContext);
  const myUid = useCurrentUid();
  const myName = ((userProfile?.nickname || '').trim() || '나').slice(0, 20);

  const [step, setStep] = useState(() => (preset?.kind ? 'who' : 'kind'));
  const [kind, setKind] = useState(() => preset?.kind || null);
  const [memo, setMemo] = useState('');            // 정산서에 덧붙일 한 줄("입금은 금요일까지")
  const [showMemo, setShowMemo] = useState(false);
  const namesTouched = useRef(false);              // 명단을 손댔으면 일정 명단 자동 갱신으로 덮지 않는다
  const [src, setSrc] = useState(null);          // 고른 일정/기록 { key, type, id, course, date, day, names }
  const [free, setFree] = useState(false);       // 골프 아닌 모임(회식) — 제목·날짜 직접
  const [freeTitle, setFreeTitle] = useState('');
  const [freeDate, setFreeDate] = useState(today());
  const [duesTitle, setDuesTitle] = useState(monthDuesTitle());
  // 회비 장부 연결(2026-10-01) — 회비 걷기에서 입금 확인한 사람이 장부의 이번 달 납부로 체크된다.
  //   장부가 하나면 자동, 여럿이면 고르고, 없으면 연결 없이 걷기만 한다(장부를 만들라고 막지 않는다).
  const [ledgers, setLedgers] = useState([]);
  const [ledgerId, setLedgerId] = useState(null);
  const [ledgerPickOpen, setLedgerPickOpen] = useState(false);
  useEffect(() => {
    if (!myUid) return undefined;
    let alive = true;
    loadMyLedgers(myUid).then(list => {
      if (!alive) return;
      const live = (list || []).filter(l => !l.archived);
      setLedgers(live);
      setLedgerId(prev => prev || live[0]?.id || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [myUid]);
  const ledger = ledgers.find(l => l.id === ledgerId) || null;
  const duesPeriod = duesPeriodKey('monthly');   // 'YYYY.MM' — 제목 'N월 회비'와 같은 달
  const [namesText, setNamesText] = useState('');
  const [includeSelf, setIncludeSelf] = useState(false);
  const [newName, setNewName] = useState('');
  const [perHead, setPerHead] = useState('');
  const [total, setTotal] = useState('');
  const [photos, setPhotos] = useState([]);
  const [paste, setPaste] = useState('');
  const [instr, setInstr] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [showInstr, setShowInstr] = useState(false);
  const [aiMembers, setAiMembers] = useState(null);
  const [aiItems, setAiItems] = useState([]);
  const [aiNote, setAiNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [locks, setLocks] = useState({});        // 나누기 단계에서 손으로 고친 금액 { name: amount }
  const [savedSel, setSavedSel] = useState(null);   // 기억해둔 계좌 중 고른 것(accKey) — null이면 아래 직접 입력값을 쓴다
  const [account, setAccount] = useState('');       // 직접 입력한 계좌
  const [accountName, setAccountName] = useState('');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const accountFromRef = useRef(null);              // 계좌 단계로 어디서 왔나 — '이전'이 그리로 돌아간다
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);       // 보내기 버튼을 눌러 저장이 끝난 뒤 — 중복 생성 방지
  const shareTokenRef = useRef(newShareToken()); // 미리보기와 실제 문구의 링크가 같아야 한다

  // 작성 중 내용이 있으면 부모가 나가기 전에 묻는다. 첫 화면(종류)만 보고 있으면 묻지 않는다.
  useEffect(() => { if (dirtyRef) dirtyRef.current = step !== 'kind'; }, [dirtyRef, step]);

  // 등록해둔 계좌 — 최근 쓴 순. 첫 번째가 기본 계좌(확인 화면에 바로 들어감).
  useEffect(() => {
    storage.load(STORAGE_KEYS.settlementAccounts, []).then(v => {
      const list = dedupeAccounts(Array.isArray(v) ? v : []);
      setSavedAccounts(list);
      storage.save(STORAGE_KEYS.settlementAccounts, list);
      if (list[0]) setSavedSel(accKey(list[0].account));
      // preset으로 열렸으면 종류 화면을 안 거치므로 여기서 계좌 단계 생략 여부를 정한다
      if (preset?.kind) hasAccountAtStart.current = !!list[0];
      setAccountsLoaded(true);
    });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const savedPick = savedSel ? savedAccounts.find(a => accKey(a.account) === savedSel) : null;
  const effAccount = (savedPick ? savedPick.account : account).trim();
  const effAccountName = (savedPick ? savedPick.accountName : accountName).trim();
  const writeAccounts = (fn) => setSavedAccounts(prev => {
    const next = dedupeAccounts(fn(prev));
    storage.save(STORAGE_KEYS.settlementAccounts, next);
    return next;
  });
  const rememberAccount = (acc, name) => {
    const a = (acc || '').trim();
    if (!a) return;
    writeAccounts(prev => [{ account: a, accountName: (name || '').trim() }, ...prev]);
  };
  const forgetAccount = (acc) => {
    const key = accKey(acc);
    showAppAlert('이 계좌를 목록에서 지울까요?', (acc || '').trim(), [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => {
        writeAccounts(prev => prev.filter(x => accKey(x.account) !== key));
        if (savedSel === key) setSavedSel(null);
      } },
    ]);
  };
  // 계좌 단계를 건너뛸 수 있나 — 기억해둔 계좌가 자동으로 들어갔을 때. 단계 목록은 종류를 고른 시점에 굳힌다
  //   (계좌 화면에서 고르는 도중 단계가 사라져 '이전'이 엉뚱한 데로 가지 않게).
  const hasAccountAtStart = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => stepsFor(kind, hasAccountAtStart.current), [kind, accountsLoaded]);

  // ── 일정 후보 ─────────────────────────────────────────────
  // 일정 '공유'로 들어온 동반자는 companions에 없고 전파 그룹에 있다 → 공용 유틸로 보강
  const [groupsById, setGroupsById] = useState({});
  const [friendMeta, setFriendMeta] = useState({});
  useEffect(() => { loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {}); }, []);
  const groupIdSig = useMemo(
    () => [...new Set((schedules || []).map(s => s?.groupId).filter(Boolean))].sort().join(','),
    [schedules]);
  useEffect(() => {
    const gids = groupIdSig ? groupIdSig.split(',') : [];
    if (!gids.length) { setGroupsById({}); return undefined; }
    let alive = true;
    Promise.all(gids.map(gid => getScheduleGroup(gid).then(g => [gid, g]).catch(() => [gid, null])))
      .then(pairs => { if (alive) setGroupsById(Object.fromEntries(pairs.filter(([, g]) => g))); });
    return () => { alive = false; };
  }, [groupIdSig]);

  const scheduleNames = (s) => buildCompanionNames(s, { group: groupsById[s.groupId], friendMeta, myUid })
    .map(n => String(n).replace(/\(초대중\)$/, '').trim()).filter(Boolean);

  // ── preset 적용 ───────────────────────────────────────────
  // 일정에서 왔으면 그 일정을 src로, 명단을 채운다. 전파 그룹·친구 별명은 비동기로 오므로 그게 도착할 때마다
  //   명단을 다시 채운다 — 단, 총무가 이미 명단을 손댔으면(namesTouched) 덮지 않는다.
  useEffect(() => {
    if (!preset?.kind) return;
    if (preset.scheduleId) {
      const s = (schedules || []).find(x => x.id === preset.scheduleId);
      const names = s ? scheduleNames(s) : [];
      const o = { key: 'sch_' + preset.scheduleId, type: 'schedule', id: preset.scheduleId,
        course: s?.course || preset.course || '', date: s?.date || preset.date || '', day: s?.day || preset.day || '', names };
      setSrc(o);
      if (!namesTouched.current) setNamesText(names.join('\n'));
      setIncludeSelf(preset.kind === 'meal');
      return;
    }
    if (preset.fromId && preset.kind === 'dues') {
      const prev = (recent || []).find(x => x?.id === preset.fromId) || (recent || []).find(x => x?.kind === 'dues');
      if (prev?.linkedLedgerId) setLedgerId(prev.linkedLedgerId);   // 지난번과 같은 장부
      if (namesTouched.current) return;
      const prevNames = (prev?.members || []).map(m => m.name).filter(n => n && n !== myName);
      setNamesText(prevNames.join('\n'));
      setIncludeSelf((prev?.members || []).some(m => m.name === myName) || !prev);
      const amounts = (prev?.members || []).map(m => m.amount).filter(a => a > 0);
      if (amounts.length && amounts.every(a => a === amounts[0])) setPerHead(String(amounts[0]));
      setDuesTitle(monthDuesTitle());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce, schedules, groupsById, friendMeta]);

  // 선입금 = 예정 일정(가까운 순 6개). 정산 = 지난 2주의 일정·라운딩 기록(최근 순, 구장·날짜 같으면 하나로).
  //   전엔 7일이었는데 "다녀온 일정"을 고르는 단계가 따로 생겨 한 주 더 남긴다(주말 라운딩을 다다음 주에 정산하는 경우).
  const options = useMemo(() => {
    const t = today();
    if (kind === 'prepay') {
      return (schedules || [])
        .filter(s => (s.date || '') >= t)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .slice(0, 6)
        .map(s => ({ key: 'sch_' + s.id, type: 'schedule', id: s.id, course: s.course || '', date: s.date || '',
          day: s.day || '', names: scheduleNames(s) }));
    }
    if (kind === 'meal') {
      const since = daysAgo(14);
      const seen = new Set();
      const out = [];
      const push = (o) => {
        const k = `${o.course}|${o.date}`;
        if (seen.has(k)) return;
        seen.add(k); out.push(o);
      };
      roundsOnly(diaries || [])
        .filter(d => (d.date || '') < t && (d.date || '') >= since)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach(d => push({ key: 'rnd_' + d.id, type: 'round', id: d.id, course: d.course || '', date: d.date || '',
          day: d.day || '',
          names: (d.companions || []).filter(c => c && !c.isMe && String(c.name || '').trim()).map(c => String(c.name).trim()) }));
      (schedules || [])
        .filter(s => (s.date || '') < t && (s.date || '') >= since)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach(s => push({ key: 'sch_' + s.id, type: 'schedule', id: s.id, course: s.course || '', date: s.date || '',
          day: s.day || '', names: scheduleNames(s) }));
      return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    }
    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, schedules, diaries, groupsById, friendMeta, myUid]);

  // ── 명단 ─────────────────────────────────────────────────
  const [friends, setFriends] = useState([]);
  useEffect(() => { loadMyFriendsEnriched().then(setFriends).catch(() => {}); }, []);

  // 후보 칩 — 자주 같이 친 사람(기록 동반자, 많이 친 순) → 나머지 친구. 동일인은 uid·별명·실명으로 합친다.
  const candidates = useMemo(() => {
    const friendLabel = new Map(
      friends.map(f => [f.id, (f.customName || f.nickname || f.name || '').trim()]).filter(([, n]) => n));
    const aliasToUid = new Map();
    friends.forEach(f => {
      [f.customName, f.nickname, f.name, f.realName].forEach(a => {
        const t = String(a || '').trim();
        if (t && !aliasToUid.has(t)) aliasToUid.set(t, f.id);
      });
    });
    const count = new Map();
    roundsOnly(diaries || []).slice(0, 40).forEach(d => {
      (d.companions || []).forEach(c => {
        if (c?.isMe) return;
        const stored = String(c?.name || '').trim();
        const uid = c?.friendUid || aliasToUid.get(stored) || null;
        const label = (uid && friendLabel.get(uid)) || stored;
        if (!label) return;
        const key = uid || label;
        const cur = count.get(key);
        if (cur) cur.n += 1; else count.set(key, { label, n: 1 });
      });
    });
    const often = [...count.entries()].sort((a, b) => b[1].n - a[1].n);
    const usedKeys = new Set(often.map(([k]) => k));
    const usedLabels = new Set(often.map(([, v]) => v.label));
    const rest = friends
      .filter(f => !usedKeys.has(f.id))
      .map(f => (f.customName || f.nickname || f.name || '').trim())
      .filter(n => n && !usedLabels.has(n));
    return [...often.map(([, v]) => v.label), ...rest].slice(0, 24);
  }, [diaries, friends]);

  const others = useMemo(() => parseNames(namesText), [namesText]);
  // 저장·계산에 쓰는 최종 명단 — 나(총무)는 토글이 켜졌을 때만 맨 뒤에 붙는다.
  const names = useMemo(() => {
    if (includeSelf && myName && !others.some(n => n.name === myName)) {
      return [...others, { id: 'm_self', name: myName, amount: 0, status: PAY_PENDING }];
    }
    return others;
  }, [others, includeSelf, myName]);
  const selfAdded = includeSelf && !!myName && !others.some(n => n.name === myName);

  const chipList = useMemo(() => {
    const sel = others.map(n => n.name);
    const seen = new Set([...sel, myName]);
    return [...sel, ...candidates.filter(n => !seen.has(n))].slice(0, 24);
  }, [others, candidates, myName]);
  const picked = useMemo(() => new Set(others.map(n => n.name)), [others]);
  const toggleName = (n) => {
    namesTouched.current = true;
    const cur = namesText.split('\n').map(s => s.trim()).filter(Boolean);
    const next = cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n];
    setNamesText(next.join('\n'));
    setLocks(prev => { if (!(n in prev)) return prev; const c = { ...prev }; delete c[n]; return c; });
  };
  const addTypedName = () => {
    const n = newName.trim();
    if (!n) return;
    namesTouched.current = true;
    const cur = namesText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!cur.includes(n)) setNamesText([...cur, n].join('\n'));
    setNewName('');
  };

  // ── 금액 ─────────────────────────────────────────────────
  // 선입금·회비 = 1인당 단가(전원 동일). 정산 = AI 결과가 있으면 그것, 없으면 총액 1/n. 손으로 고친 사람(locks)은 그 금액.
  const members = useMemo(() => {
    if (names.length === 0) return [];
    if (kind !== 'meal') {
      const per = Number(perHead) || 0;
      return names.map(m => ({ ...m, amount: Math.round(per) }));
    }
    const aiOk = aiMembers && aiMembers.length === names.length && aiMembers.every((m, i) => m.name === names[i].name);
    if (aiOk) return aiMembers.map(m => (m.name in locks ? { ...m, amount: locks[m.name], locked: true } : m));
    const withLocks = names.map(m => (m.name in locks ? { ...m, amount: locks[m.name], locked: true } : m));
    return splitEvenly(withLocks, Number(total) || 0);
  }, [names, kind, perHead, aiMembers, locks, total]);
  const sumAmount = members.reduce((a, m) => a + (m.amount || 0), 0);
  const uniform = members.length > 0 && members.every(m => m.amount === members[0].amount);

  // AI 계산 — 영수증·문자·요구사항을 한 번에 보낸다(따로 보내면 건별 내역이 안 나온다, 2026-07-22).
  const runAi = async () => {
    const manualLine = Number(total) > 0 ? `총액 ${won(total)}원` : '';
    setAiBusy(true); setAiError('');
    const r = await computeSettlement({
      text: [paste, manualLine].filter(Boolean).join('\n'),
      uris: photos, names, instruction: instr, kind,
    });
    setAiBusy(false);
    if (r?.error) {
      if (Number(total) > 0) { setAiNote('자동 계산이 안 돼 총액을 1/n로 나눴어요'); return true; }
      setAiError(r.error); return false;
    }
    setAiMembers(r.members || null);
    setAiItems(r.items || []);
    setAiNote(r.fallback ? (r.note ? r.note + ' · ' : '') + '이름을 못 맞춰 1/n으로 나눴어요' : (r.note || ''));
    setLocks({});
    if (r.account && !effAccount) { setSavedSel(null); setAccount(r.account); setAccountName(r.accountName || ''); }
    return true;
  };

  const addPhotos = async (source) => {
    if (aiBusy) return;
    Keyboard.dismiss();
    let got = [];
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setAiError('카메라 권한이 필요해요'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      got = [res.assets[0].uri];
    } else {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setAiError('사진 접근 권한이 필요해요'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: RECEIPT_MAX,
      });
      if (res.canceled || !res.assets?.length) return;
      got = res.assets.map(a => a.uri);
    }
    setPhotos(prev => {
      const next = [...prev, ...got].slice(0, RECEIPT_MAX);
      setAiError(prev.length + got.length > RECEIPT_MAX ? `영수증은 ${RECEIPT_MAX}장까지예요` : '');
      return next;
    });
    setAiMembers(null); setAiItems([]); setAiNote('');   // 재료가 바뀌면 지난 계산은 무효
  };

  // ── 단계 이동 ─────────────────────────────────────────────
  const idx = steps.indexOf(step);
  const goto = (s) => {
    Keyboard.dismiss();
    if (s === 'account') accountFromRef.current = step;
    setStep(s);
  };

  // 종류를 고르면 '지난번 그대로' 기본값을 채우고 바로 다음으로.
  const pickKind = (k) => {
    hasAccountAtStart.current = !!effAccount;
    namesTouched.current = false;
    setKind(k);
    setSrc(null); setFree(false);
    setAiMembers(null); setAiItems([]); setAiNote(''); setAiError(''); setLocks({});
    setPhotos([]); setPaste(''); setInstr(''); setShowPaste(false); setShowInstr(false);
    setTotal(''); setPerHead('');
    const prev = (recent || []).find(s => s?.kind === k);
    if (k === 'dues') {
      setIncludeSelf(true);
      // 명단·금액: 지난번 회비 걷기 → 없으면 연결된 장부의 회원 명단·월 회비 금액
      const prevNames = (prev?.members || []).map(m => m.name).filter(n => n && n !== myName);
      const ledgerNames = (ledger?.dues?.members || []).map(m => m?.name).filter(n => n && n !== myName);
      setNamesText((prevNames.length ? prevNames : ledgerNames).join('\n'));
      const amounts = (prev?.members || []).map(m => m.amount).filter(a => a > 0);
      if (amounts.length && amounts.every(a => a === amounts[0])) setPerHead(String(amounts[0]));
      else if (ledger?.dues?.monthly?.amount > 0) setPerHead(String(ledger.dues.monthly.amount));
      setDuesTitle(monthDuesTitle());
      goto('who');
      return;
    }
    setIncludeSelf(k === 'meal');
    setNamesText('');
    if (k === 'prepay' && prev?.members?.length) {
      const amounts = prev.members.map(m => m.amount).filter(a => a > 0);
      if (amounts.length && amounts.every(a => a === amounts[0])) setPerHead(String(amounts[0]));
    }
    goto('source');
  };

  const pickSource = (o) => {
    setSrc(o); setFree(false);
    namesTouched.current = false;
    setNamesText(o.names.join('\n'));
    setLocks({}); setAiMembers(null);
    goto('who');
  };

  const next = async () => {
    if (aiBusy || saving) return;
    if (step === 'source') {
      if (!free) return;
      if (!freeTitle.trim()) { showToast('모임 이름을 적어주세요'); return; }
      goto('who'); return;
    }
    if (step === 'who') {
      if (names.length === 0) { showToast('한 명 이상 골라주세요'); return; }
      goto('amount'); return;
    }
    if (step === 'amount') {
      if (kind !== 'meal') {
        if (!(Number(perHead) > 0)) { showToast('1인당 금액을 적어주세요'); return; }
      } else {
        const hasAi = paste.trim() || instr.trim() || photos.length > 0;
        if (!hasAi && !(Number(total) > 0)) { setAiError('총액을 적거나 영수증을 넣어주세요'); return; }
        if (hasAi && !aiMembers) {
          const ok = await runAi();
          if (!ok) return;
        }
      }
      const after = steps[steps.indexOf('amount') + 1];
      goto(after); return;
    }
    if (step === 'split') {
      if (sumAmount <= 0) { showToast('금액이 비어 있어요'); return; }
      goto(steps.includes('account') ? 'account' : 'confirm'); return;
    }
    if (step === 'account') {
      if (!effAccount) { showToast('계좌를 적거나 "계좌 없이 진행"을 눌러주세요'); return; }
      goto('confirm'); return;
    }
  };

  // 뒤로 — 한 단계씩. 계좌 단계는 들어온 곳(나누기·금액 또는 확인 화면 '바꾸기')으로 돌아간다.
  const back = () => {
    if (step === 'kind') return false;
    if (step === 'account') { goto(accountFromRef.current || (steps.includes('account') ? steps[steps.indexOf('account') - 1] : 'confirm')); return true; }
    if (idx > 0) { goto(steps[idx - 1]); return true; }
    goto('kind'); return true;
  };
  useEffect(() => { if (backRef) backRef.current = back; });

  // ── 저장 + 보내기 ────────────────────────────────────────
  const draft = useMemo(() => ({
    kind,
    title: kind === 'dues' ? duesTitle.trim() : (free ? freeTitle.trim() : ''),
    course: (!free && src?.course) || '',
    date: kind === 'dues' ? today() : (free ? (freeDate || today()) : (src?.date || today())),
    members: selfAdded ? members.map(m => (m.name === myName ? { ...m, status: PAY_CONFIRMED } : m)) : members,
    total: sumAmount, account: effAccount, accountName: effAccountName,
    items: kind === 'meal' ? aiItems : [], note: kind === 'meal' ? aiNote : '',
    memo: memo.trim(),
    shareToken: shareTokenRef.current,
    linkedScheduleId: src?.type === 'schedule' ? src.id : null,
    linkedLedgerId: kind === 'dues' ? (ledgerId || null) : null,
    duesPeriod: kind === 'dues' ? duesPeriod : null,
  }), [kind, duesTitle, free, freeTitle, freeDate, src, members, selfAdded, myName, sumAmount, effAccount, effAccountName, aiItems, aiNote, memo, ledgerId, duesPeriod]);
  const previewText = useMemo(() => buildSettlementText(draft, { detail: true }), [draft]);

  const finish = async (send) => {
    if (saving || sent) return;
    if (members.length === 0) { showToast('참가자가 없어요'); return; }
    if (sumAmount <= 0) { showToast('금액이 비어 있어요'); return; }
    Keyboard.dismiss();
    setSaving(true);
    let created;
    try {
      created = await createSettlement(draft);
      rememberAccount(draft.account, draft.accountName);
      setSent(true);
      // 회비 걷기 — 나(총무)는 만들 때부터 '확인'이라 장부 납부에도 바로 체크(다른 사람은 상세에서 확인할 때).
      if (draft.kind === 'dues' && draft.linkedLedgerId && selfAdded) {
        syncDuesPaidFromSettlement(draft.linkedLedgerId, { names: [myName], periodKey: draft.duesPeriod, amount: Number(perHead) || 0, paid: true })
          .catch(() => {});
      }
    } catch (e) { setSaving(false); showToast('저장하지 못했어요'); return; }
    setSaving(false);
    if (send) {
      try { await Share.share({ message: previewText }); } catch (e) { /* 공유 시트 닫음 */ }
    }
    onCreated(created);
  };

  // ── 렌더 ─────────────────────────────────────────────────
  const showBar = step !== 'kind' && !(step === 'source' && !free) && step !== 'confirm';

  const renderKind = () => (
    <>
      <Text style={question}>무엇을 걷나요?</Text>
      <View style={{ height: 22 }} />
      {KIND_CARDS.map(k => (
        <TouchableOpacity key={k.key} onPress={() => pickKind(k.key)} activeOpacity={0.8}
          style={[box, { paddingHorizontal: 18, paddingVertical: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17.5), color: C.charcoal }}>{k.title}</Text>
            {k.desc.split('\n').map((l, i) => (
              <Text key={i} style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, marginTop: i === 0 ? 5 : 1, lineHeight: fs(19) }}>{l}</Text>
            ))}
          </View>
          <Text style={{ fontSize: fs(22), color: C.warmGray, marginLeft: 10 }}>›</Text>
        </TouchableOpacity>
      ))}
    </>
  );

  const renderSource = () => (
    <>
      <Text style={question}>{kind === 'prepay' ? '어느 라운딩인가요?' : '어느 모임인가요?'}</Text>
      <Text style={sub}>{kind === 'prepay' ? '예정된 일정이에요. 고르면 명단이 따라와요' : '최근 2주 안에 다녀온 라운딩이에요'}</Text>
      <View style={{ height: 18 }} />
      {!free && options.map(o => (
        <TouchableOpacity key={o.key} onPress={() => pickSource(o)} activeOpacity={0.8}
          style={[box, { paddingHorizontal: 16, paddingVertical: 15, marginBottom: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>
              {o.course || '구장 미정'}
            </Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.textSecondary }}>
              {o.date}{o.day ? ` (${o.day})` : ''}
            </Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), marginTop: 5, color: C.textSecondary }} numberOfLines={1}>
            {o.names.length ? `${o.names.length}명 · ${o.names.join(', ')}` : '명단 없음 — 다음에서 고르면 돼요'}
          </Text>
        </TouchableOpacity>
      ))}
      {!free && options.length === 0 && (
        <Text style={[sub, { marginBottom: 10 }]}>
          {kind === 'prepay' ? '예정된 일정이 없어요. 아래에서 직접 적어주세요' : '최근에 다녀온 라운딩이 없어요. 아래에서 직접 적어주세요'}
        </Text>
      )}
      {free ? (
        <View>
          <Text style={hint}>{kind === 'prepay' ? '라운딩 이름' : '모임 이름'}</Text>
          <AppTextInput value={freeTitle} onChangeText={setFreeTitle} autoFocus
            placeholder={kind === 'prepay' ? '예) 11월 정기 라운딩' : '예) 송년 회식'}
            style={[input, { marginBottom: 14 }]} />
          <Text style={hint}>날짜</Text>
          <AppTextInput value={freeDate} onChangeText={setFreeDate} placeholder="2026.10.01"
            keyboardType="numbers-and-punctuation" style={input} />
          {options.length > 0 && (
            <TouchableOpacity onPress={() => setFree(false)} activeOpacity={0.7} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.textSecondary }}>목록에서 고르기</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity onPress={() => { setFree(true); setSrc(null); }} activeOpacity={0.8}
          style={{ paddingVertical: 15, paddingHorizontal: 16, borderRadius: 12, marginTop: 4,
            backgroundColor: 'transparent', borderWidth: 1, borderColor: C.hairline, borderStyle: 'dashed' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: BURGUNDY }}>
            {kind === 'prepay' ? '목록에 없는 라운딩' : '골프 아닌 모임 (회식 등)'}
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 3 }}>이름과 날짜만 적으면 돼요</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderWho = () => (
    <>
      <Text style={question}>누구에게 걷나요?</Text>
      <Text style={sub}>
        {src?.names?.length ? '일정의 명단이 들어가 있어요. 탭해서 빼거나 더하세요'
          : kind === 'dues' && others.length ? '지난번 회비 명단이에요. 탭해서 빼거나 더하세요'
          : '이름을 탭하면 들어가요'}
      </Text>
      <View style={{ height: 16 }} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{names.length}명</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {/* 나(총무) — 정산은 1/n 분모에 들어가야 맞고(기본 켬), 선입금은 '나도 냈다' 표시용(기본 끔) */}
        <TouchableOpacity activeOpacity={0.7} onPress={() => setIncludeSelf(v => !v)}
          style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18,
            backgroundColor: includeSelf ? C.navy : C.bgSecondary }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: includeSelf ? C.butter : C.charcoal }}>
            {includeSelf ? `나(${myName}) ✕` : `+ 나(${myName})`}
          </Text>
        </TouchableOpacity>
        {chipList.map(n => {
          const on = picked.has(n);
          return (
            <TouchableOpacity key={n} activeOpacity={0.7} onPress={() => toggleName(n)}
              style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18,
                backgroundColor: on ? BURGUNDY : C.bgSecondary }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: on ? C.butter : C.charcoal }}>
                {on ? `${n} ✕` : `+ ${n}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <AppTextInput value={newName} onChangeText={setNewName}
          onSubmitEditing={addTypedName} returnKeyType="done" blurOnSubmit={false}
          placeholder="목록에 없으면 이름 직접 추가"
          style={[input, { flex: 1 }]} />
        <TouchableOpacity onPress={addTypedName} activeOpacity={0.85} disabled={!newName.trim()}
          style={{ paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            backgroundColor: newName.trim() ? C.navy : C.bgSecondary }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: newName.trim() ? C.butter : C.warmGray }}>추가</Text>
        </TouchableOpacity>
      </View>
      {kind === 'meal' && (
        <Text style={[sub, { marginTop: 14 }]}>
          {includeSelf ? `내 몫까지 ${names.length}명으로 나눠요` : '나를 빼고 나누면 남들이 내 몫까지 더 내요'}
        </Text>
      )}
    </>
  );

  const renderAmount = () => {
    if (kind !== 'meal') {
      return (
        <>
          <Text style={question}>{kind === 'dues' ? '회비는 얼마인가요?' : '1인당 얼마인가요?'}</Text>
          <Text style={sub}>전원 같은 금액이에요{names.length ? ` · ${names.length}명` : ''}</Text>
          <View style={{ height: 22 }} />
          {kind === 'dues' && (
            <>
              <Text style={hint}>이름</Text>
              <AppTextInput value={duesTitle} onChangeText={setDuesTitle} placeholder="10월 회비"
                style={[input, { marginBottom: 16 }]} />
            </>
          )}
          {/* 회비 장부 연결 — 입금 확인한 사람이 장부의 이번 달 납부로 체크된다. 장부가 하나면 한 줄만, 여럿이면 고른다 */}
          {kind === 'dues' && ledgers.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity onPress={() => ledgers.length > 1 && setLedgerPickOpen(v => !v)} activeOpacity={ledgers.length > 1 ? 0.7 : 1}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary }} numberOfLines={1}>
                  {ledger ? `회비 장부  ${ledger.name} · 입금 확인하면 ${Number(duesPeriod.slice(5))}월 납부로 체크돼요` : '회비 장부에 기록하지 않아요'}
                </Text>
                {ledgers.length > 1 && (
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: BURGUNDY }}>{ledgerPickOpen ? '접기' : '바꾸기'}</Text>
                )}
              </TouchableOpacity>
              {ledgerPickOpen && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {[...ledgers, { id: null, name: '기록 안 함' }].map(l => {
                    const on = (l.id || null) === (ledgerId || null);
                    return (
                      <TouchableOpacity key={l.id || 'none'} activeOpacity={0.7} onPress={() => { setLedgerId(l.id); setLedgerPickOpen(false); }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: on ? C.navy : C.bgSecondary }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: on ? C.butter : C.charcoal }}>{l.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
          <Text style={hint}>1인당</Text>
          <View style={[box, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }]}>
            <AppTextInput value={perHead} keyboardType="number-pad" autoFocus={!perHead}
              onChangeText={t => setPerHead(t.replace(/[^0-9]/g, ''))}
              placeholder="40000" placeholderTextColor={C.warmGray}
              style={{ flex: 1, paddingVertical: 15, fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal }} />
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.textSecondary }}>원</Text>
          </View>
          {Number(perHead) > 0 && names.length > 0 && (
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, marginTop: 14 }}>
              {names.length}명 · 합계 {won(sumAmount)}원
            </Text>
          )}
          {kind === 'prepay' && !!perHead && (recent || []).some(s => s?.kind === 'prepay') && (
            <Text style={[sub, { marginTop: 6 }]}>지난번 금액이 들어가 있어요. 다르면 고치세요</Text>
          )}
        </>
      );
    }
    return (
      <>
        <Text style={question}>얼마를 썼나요?</Text>
        <Text style={sub}>총액을 적거나, 영수증·카드문자를 넣으면 읽어드려요</Text>
        <View style={{ height: 22 }} />
        <Text style={hint}>총액</Text>
        <View style={[box, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }]}>
          <AppTextInput value={total} keyboardType="number-pad"
            onChangeText={t => { setTotal(t.replace(/[^0-9]/g, '')); setAiMembers(null); setAiNote(''); if (aiError) setAiError(''); }}
            placeholder="600000" placeholderTextColor={C.warmGray}
            style={{ flex: 1, paddingVertical: 15, fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal }} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.textSecondary }}>원</Text>
        </View>

        {/* 영수증·문자 — 골드 = AI 영역(가계부와 같은 관례). 고른 즉시 계산하지 않고 '다음'에서 한 번에. */}
        <View style={{ borderRadius: 16, backgroundColor: 'rgba(201,168,76,0.08)', padding: 12, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD_DEEP, alignItems: 'center', justifyContent: 'center' }}>
              {aiBusy ? <Spinner size={16} color="#FFFFFF" /> : <Icon name="sparkle" size={15} color="#FFFFFF" strokeWidth={1.8} />}
            </View>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>
              {aiBusy ? 'AI가 읽고 있어요…' : '영수증·카드문자로 채우기'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'camera', icon: 'camera', label: '촬영', onPress: () => addPhotos('camera') },
              { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => addPhotos('gallery') },
              { key: 'paste', icon: 'clipboard', label: '붙여넣기', onPress: () => setShowPaste(v => !v) },
            ].map(m => (
              <TouchableOpacity key={m.key} activeOpacity={0.8} onPress={m.onPress} disabled={aiBusy}
                style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12,
                  backgroundColor: (m.key === 'paste' && showPaste) ? 'rgba(201,168,76,0.18)' : '#FFFFFF' }}>
                <Icon name={m.icon} size={21} color={GOLD_DEEP} strokeWidth={1.8} />
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {photos.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {photos.map((uri, i) => (
                <TouchableOpacity key={uri} activeOpacity={0.7}
                  onPress={() => { setPhotos(prev => prev.filter(x => x !== uri)); setAiMembers(null); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP }}>영수증 {i + 1}</Text>
                  <Text style={{ fontSize: fs(12), color: C.textSecondary }}>✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {showPaste && (
            <AppTextInput value={paste} onChangeText={v => { setPaste(v); setAiMembers(null); if (aiError) setAiError(''); }} multiline
              placeholder="카드결제 문자나 정산 메시지를 붙여넣어 주세요" placeholderTextColor={C.warmGray}
              style={{ minHeight: fs(70), backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                marginTop: 10, textAlignVertical: 'top', fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
          )}
          {/* 요구사항 — 쓰는 사람이 적어 접어둔다. "김이사는 빼줘" 같은 예외가 있을 때만. */}
          {showInstr ? (
            <AppTextInput value={instr} onChangeText={v => { setInstr(v); setAiMembers(null); if (aiError) setAiError(''); }} multiline autoFocus
              placeholder="예) 김이사는 술 안 마셔서 빼줘 · 점심은 3명, 저녁은 전원" placeholderTextColor={C.warmGray}
              style={{ minHeight: fs(60), backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                marginTop: 10, textAlignVertical: 'top', fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
          ) : (
            <TouchableOpacity onPress={() => setShowInstr(true)} activeOpacity={0.7} style={{ paddingTop: 12, paddingBottom: 2, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD_DEEP }}>예외가 있으면 적기 (빼기·따로 계산)</Text>
            </TouchableOpacity>
          )}
        </View>
        {!!aiError && !aiBusy && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: BURGUNDY, marginTop: 10 }}>{aiError}</Text>
        )}
      </>
    );
  };

  const renderSplit = () => (
    <>
      <Text style={question}>이렇게 나눌게요</Text>
      <Text style={sub}>
        {uniform ? `${members.length}명 · 1인 ${won(members[0]?.amount)}원` : `${members.length}명 · 사람마다 달라요`}
        {'  ·  금액을 탭하면 고칠 수 있어요'}
      </Text>
      {!!aiNote && <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: GOLD_DEEP, marginTop: 8 }}>{aiNote}</Text>}
      <View style={{ height: 16 }} />
      {aiItems.length > 0 && (
        <View style={[box, { paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 }]}>
          {aiItems.map((i, k) => (
            <View key={`${i.label}_${k}`} style={{ flexDirection: 'row', paddingVertical: 4 }}>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>{i.label}</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }}>{won(i.amount)}원</Text>
            </View>
          ))}
        </View>
      )}
      <View style={[box, { paddingVertical: 4 }]}>
        {members.map((m, i) => (
          <View key={m.id || i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
            borderBottomWidth: i === members.length - 1 ? 0 : 0.5, borderBottomColor: C.hairline }}>
            <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>{m.name}</Text>
            <AppTextInput value={String(m.amount || '')} keyboardType="number-pad" placeholder="0"
              onChangeText={t => setLocks(prev => ({ ...prev, [m.name]: Number(t.replace(/[^0-9]/g, '')) || 0 }))}
              style={{ width: fs(112), textAlign: 'right', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
                backgroundColor: m.locked ? 'rgba(107,30,42,0.08)' : '#FFFFFF',
                fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }} />
            {/* 빼기 — 내 행은 토글을 끄고, 남은 명단에서 지운다. 빠지면 1/n 분모가 줄어 나머지가 다시 계산된다 */}
            <TouchableOpacity onPress={() => { if (selfAdded && m.name === myName) setIncludeSelf(false); else toggleName(m.name); }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ paddingLeft: 10 }}>
              <Text style={{ fontSize: fs(14), color: C.textSecondary }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>합계 {won(sumAmount)}원</Text>
        {Object.keys(locks).length > 0 && (
          <TouchableOpacity onPress={() => setLocks({})} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: BURGUNDY }}>다시 똑같이 나누기</Text>
          </TouchableOpacity>
        )}
      </View>
      {!aiMembers && Number(total) > 0 && sumAmount > Number(total) && (
        <Text style={[sub, { marginTop: 6 }]}>100원 단위로 올려서 {won(sumAmount - Number(total))}원이 남아요. 정산서에 그대로 적혀요</Text>
      )}
    </>
  );

  const renderAccount = () => (
    <>
      <Text style={question}>어느 계좌로 받나요?</Text>
      <Text style={sub}>한 번 적으면 다음부터는 묻지 않아요</Text>
      <View style={{ height: 20 }} />
      {savedAccounts.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          {savedAccounts.map(a => {
            const on = accKey(a.account) === savedSel;
            return (
              <View key={accKey(a.account)} style={[box, { flexDirection: 'row', alignItems: 'center', marginBottom: 8,
                backgroundColor: on ? C.navy : C.bgSecondary }]}>
                <TouchableOpacity activeOpacity={0.7} style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}
                  onPress={() => { setSavedSel(accKey(a.account)); Keyboard.dismiss(); }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: on ? C.butter : C.charcoal }}>{a.account}</Text>
                  {!!a.accountName && <Text style={{ fontFamily: F.sys, fontSize: fs(13), marginTop: 2, color: on ? 'rgba(245,239,222,0.75)' : C.textSecondary }}>{a.accountName}</Text>}
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} onPress={() => forgetAccount(a.account)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }} style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                  <Text style={{ fontSize: fs(14), color: on ? 'rgba(245,239,222,0.7)' : C.warmGray }}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
      {/* 직접 입력 — 적기 시작하면 위에서 고른 건 풀린다(둘 중 하나만). 은행명은 계좌번호와 한 칸(카톡 한 줄과 같은 모양). */}
      <Text style={hint}>{savedAccounts.length > 0 ? '다른 계좌' : '은행 + 계좌번호'}</Text>
      <AppTextInput value={account} onFocus={() => setSavedSel(null)}
        onChangeText={t => { setSavedSel(null); setAccount(t); }}
        placeholder="국민 123456-78-901234" style={[input, { marginBottom: 12, opacity: savedSel ? 0.55 : 1 }]} />
      <Text style={hint}>예금주</Text>
      <AppTextInput value={accountName} onFocus={() => setSavedSel(null)}
        onChangeText={t => { setSavedSel(null); setAccountName(t); }}
        placeholder="홍길동" style={[input, { opacity: savedSel ? 0.55 : 1 }]} />
      <TouchableOpacity onPress={() => { setSavedSel(null); setAccount(''); setAccountName(''); goto('confirm'); }} activeOpacity={0.7}
        style={{ paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textSecondary }}>계좌 없이 진행</Text>
      </TouchableOpacity>
    </>
  );

  const renderConfirm = () => (
    <>
      <Text style={question}>이렇게 보낼게요</Text>
      <Text style={sub}>카톡에 이 문구가 그대로 올라가요. 참가자는 링크에서 '보냈어요'를 눌러요</Text>
      <View style={{ height: 18 }} />
      <View style={[box, { padding: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>{settleTitle(draft) || settleKindLabel(kind)}</Text>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD }}>{settleKindLabel(kind)}</Text>
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary }}>
          {members.length}명 · {uniform ? `1인 ${won(members[0]?.amount)}원 · ` : ''}합계 {won(sumAmount)}원
        </Text>
        <View style={{ height: 0.5, backgroundColor: C.hairline, marginVertical: 12 }} />
        <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal, lineHeight: fs(21) }}>{previewText}</Text>
      </View>

      {/* 덧붙일 한 줄(사용자 제안 2026-10-01 "더 넣을 메모칸") — "입금은 금요일까지", "회비는 5일까지" 같은 당부.
          정산서 머리 아래에 그대로 들어가고 웹 링크에도 보인다. 접힌 채 시작, 적으면 위 미리보기에 바로 반영. */}
      {showMemo || memo ? (
        <AppTextInput value={memo} onChangeText={t => setMemo(t.slice(0, 120))} autoFocus={!memo}
          placeholder="예) 입금은 금요일까지 부탁드려요" placeholderTextColor={C.warmGray}
          style={[input, { marginTop: 12 }]} />
      ) : (
        <TouchableOpacity onPress={() => setShowMemo(true)} activeOpacity={0.7} style={{ paddingTop: 14, paddingBottom: 2, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: BURGUNDY }}>+ 한 줄 덧붙이기 (입금 기한 등)</Text>
        </TouchableOpacity>
      )}

      {/* 계좌 한 줄 — 기억해둔 계좌가 자동으로 들어갔다. 다른 계좌면 여기서 바꾼다 */}
      <TouchableOpacity onPress={() => goto('account')} activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 }}>
        <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary }} numberOfLines={1}>
          {effAccount ? `받는 계좌  ${effAccount}${effAccountName ? ` ${effAccountName}` : ''}` : '받는 계좌가 없어요'}
        </Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: BURGUNDY }}>{effAccount ? '바꾸기' : '넣기'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => finish(true)} activeOpacity={0.85} disabled={saving || sent}
        style={{ marginTop: 6, backgroundColor: saving ? C.warmGray : C.butter, borderRadius: 14, paddingVertical: 17,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {saving && <Spinner size={15} color={C.charcoal} />}
        <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>{saving ? '만드는 중…' : '카톡으로 보내기'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => finish(false)} activeOpacity={0.7} disabled={saving || sent}
        style={{ paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.textSecondary }}>보내지 않고 만들기만</Text>
      </TouchableOpacity>
    </>
  );

  const body = {
    kind: renderKind, source: renderSource, who: renderWho, amount: renderAmount,
    split: renderSplit, account: renderAccount, confirm: renderConfirm,
  }[step];

  // 진행 표시 — 점으로. 확인 화면 '바꾸기'로 들어온 계좌 단계는 목록에 없으니 확인 자리로 센다
  const dotSteps = steps.filter(s => s !== 'kind');
  const dotIdx = dotSteps.indexOf(step === 'account' && !steps.includes('account') ? 'confirm' : step);

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 }}
        bottomOffset={24} keyboardShouldPersistTaps="handled">
        {step !== 'kind' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD, marginRight: 6 }}>{settleKindLabel(kind)}</Text>
            {dotSteps.map((s, i) => (
              <View key={s} style={{ width: i === dotIdx ? 18 : 6, height: 6, borderRadius: 3,
                backgroundColor: i <= dotIdx ? BURGUNDY : C.hairline }} />
            ))}
          </View>
        )}
        {accountsLoaded || step === 'kind' ? body() : null}
      </KeyboardAwareScrollView>

      {showBar && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14,
          borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgPrimary }}>
          <TouchableOpacity onPress={back} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingVertical: 14, paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textSecondary }}>이전</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={next} activeOpacity={0.85} disabled={aiBusy || saving}
            style={{ flex: 1, backgroundColor: aiBusy ? C.warmGray : BURGUNDY, borderRadius: 14, paddingVertical: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {aiBusy && <Spinner size={15} color={C.butter} />}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.butter }}>
              {aiBusy ? '읽고 있어요…' : step === 'account' ? '이 계좌로' : '다음'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
