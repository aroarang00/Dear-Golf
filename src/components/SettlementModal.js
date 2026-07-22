import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, Share, Keyboard } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AppTextInput from './common/AppTextInput';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { showAppAlert } from './AppAlert';
import { C, F, fs } from '../constants/colors';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { roundsOnly } from '../utils/diaryKind';
import { buildCompanionNames } from '../utils/scheduleCompanions';   // companions + 전파 그룹(친구초대) 보강
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadFriendData } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { Icon } from './common/Icon';
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  SETTLE_KINDS, settleKindLabel, PAY_PENDING, PAY_CLAIMED, PAY_CONFIRMED,
  splitEvenly, summarize, toggleMemberStatus, buildSettlementText,
  loadMySettlements, createSettlement, updateSettlement, deleteSettlement,
  computeSettlementFromText, computeSettlementFromImages, RECEIPT_MAX,
} from '../utils/settlement';

// 모임 '걷기' — 총무가 참가자에게 돈을 걷는 화면. 목록 ↔ 상세 한 모달 안에서 전환.
//
// ★설계 근거(사용자 실제 운영 방식, 2026-07-22)
//   총무는 지금 카톡에 계좌 올리고 각자 금액 정리 → 각자 "입완" 쓰고 방 나감 → 남은 사람이 미납자.
//   그 수동 해법을 그대로 화면으로 옮긴다. 방을 만들 필요도, 나갈 필요도 없이 목록의 ✅/⏳로 보인다.
//   그린피·카트비는 각자 카드 결제라 여기서 안 다룬다 — 걷는 건 캐디피·참가비(선입금)와 식사비뿐.
//
// ★동반자가 앱을 안 깔았어도 총무 혼자 끝까지 쓸 수 있어야 한다(조편성이 죽은 이유 재발 방지).
//   그래서 참가자는 이름만으로 충분하고, 통지는 카톡 정산서 내보내기로 나간다.
//   참가자 앱 내 알림·'보냈어요'는 2차 — 그때도 이 단독 경로는 유지할 것.

const GOLD = '#C9A84C';
const GOLD_DEEP = '#8A6A33';   // AI 영역 강조 — 가계부·예정 라운딩 자동입력과 같은 톤
const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const today = () => ymd(new Date());
// n일 전 날짜 문자열 — 'YYYY.MM.DD'는 사전순 비교가 곧 날짜 비교라 그대로 필터에 쓴다.
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
// 심플 모던 — 테두리 상자를 겹치지 않는다. 입력칸은 '채운 배경'으로만 구분하고(테두리 없음),
//   구획은 섹션 제목 + 넉넉한 여백 + 얇은 선으로 나눈다. 글자는 읽기 편한 크기로 키움(사용자 2026-07-22).
const label = { fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray, marginBottom: 9 };
const box = { backgroundColor: C.bgSecondary, borderRadius: 12 };            // 테두리 없는 채운 칸
const sec = { fontFamily: F.sysB, fontSize: fs(15.5), color: C.charcoal, marginBottom: 12, letterSpacing: -0.2 };
const hint = { fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginBottom: 7 };
const divider = { height: 0.5, backgroundColor: C.hairline, marginVertical: 28 };

// 계좌 동일성 판단 키 — 숫자만 뽑아 비교한다.
//   "국민 123456-78-901234"와 "국민은행 123456-78-901234", 공백이 하나 더 붙은 것은 같은 계좌인데
//   문자열을 그대로 비교하면 서로 다른 걸로 보여 중복이 쌓였다(사용자 2026-07-22). AI가 채운 계좌는
//   표기가 매번 조금씩 다를 수 있어 더 그렇다. 숫자가 없으면 공백만 정규화해 비교한다.
const accKey = (s) => {
  const digits = String(s || '').replace(/\D/g, '');
  return digits || String(s || '').replace(/\s+/g, ' ').trim();
};
// 최근 쓴 순 유지 + 같은 계좌 합치기 + 최대 4개
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

// 명단 붙여넣기 → 이름 배열. 카톡 명단을 그대로 붙여넣는 걸 전제로 한다(총무는 이미 카톡에 명단이 있다).
//   줄바꿈·쉼표·가운뎃점 모두 구분자로 보고, 숫자만 있는 줄(금액·번호)은 버린다.
function parseNames(text) {
  return String(text || '')
    .split(/[\n,·]/)
    .map(s => s.replace(/^\s*[-•\d]+[.)]?\s*/, '').trim())   // '1. 김이사' → '김이사'
    .filter(s => s && !/^\d+$/.test(s))
    .slice(0, 40)
    .map((name, i) => ({ id: `m${i}_${name.slice(0, 8)}`, name: name.slice(0, 20), amount: 0, status: PAY_PENDING }));
}

export function SettlementModal({ visible, onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(null);      // null이면 목록, 아니면 상세
  const [composing, setComposing] = useState(false); // 새 걷기 만들기

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setList(await loadMySettlements()); }
    catch (e) { console.warn('[정산] 목록 로드 실패', e?.code, e?.message); setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setOpenId(null); setComposing(false);
    load();
  }, [visible, load]);

  const current = useMemo(() => list.find(s => s.id === openId) || null, [list, openId]);

  // 낙관적 반영 — 서버 왕복을 기다리면 체크가 굼떠 보인다. 실패하면 되돌리고 알린다.
  const patchLocal = (id, patch) =>
    setList(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const save = async (id, patch) => {
    const before = list.find(s => s.id === id);
    patchLocal(id, patch);
    try { await updateSettlement(id, patch); }
    catch (e) {
      if (before) patchLocal(id, before);
      showToast('저장하지 못했어요');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom']}>
            {/* 헤더 — 상세/작성 중이면 뒤로, 아니면 닫기 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              {/* 뒤로/닫기 — Icon 맵에 chevron·close가 없어 가계부와 같은 기호 문자를 쓴다(이모지 아님) */}
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => { if (composing) setComposing(false); else if (openId) setOpenId(null); else onClose(); }}>
                <Text style={{ fontSize: fs(20), color: C.charcoal, width: fs(22) }}>
                  {(composing || openId) ? '‹' : '✕'}
                </Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                {composing ? '걷기 만들기' : current ? (current.course || '걷기') : '모임 정산'}
              </Text>
              <View style={{ width: fs(20) }} />
            </View>

            {composing ? (
              <ComposeView onCancel={() => setComposing(false)}
                onCreated={(s) => { setList(prev => [s, ...prev]); setComposing(false); setOpenId(s.id); }} />
            ) : current ? (
              <DetailView s={current} onSave={(patch) => save(current.id, patch)}
                onDeleted={() => { setList(prev => prev.filter(x => x.id !== current.id)); setOpenId(null); }} />
            ) : (
              <ListView list={list} loading={loading} failed={failed} onRetry={load}
                onOpen={setOpenId} onNew={() => setComposing(true)} />
            )}
          </SafeAreaView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

// ── 목록 ──────────────────────────────────────────────────────
function ListView({ list, loading, failed, onRetry, onOpen, onNew }) {
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>불러오지 못했어요</Text>
        <TouchableOpacity onPress={onRetry} style={{ marginTop: 14, paddingHorizontal: 20, paddingVertical: 10,
          backgroundColor: C.navy, borderRadius: 10 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onNew} activeOpacity={0.85}
        style={{ backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>+ 걷기 만들기</Text>
      </TouchableOpacity>

      {list.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 8 }}>아직 걷기가 없어요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 19 }}>
            이름만 적으면 됩니다{'\n'}동반자가 앱을 안 써도 정산서는 카톡으로 보낼 수 있어요
          </Text>
        </View>
      ) : list.map(s => {
        const sum = summarize(s.members);
        return (
          <TouchableOpacity key={s.id} onPress={() => onOpen(s.id)} activeOpacity={0.8}
            style={[box, { padding: 14, marginBottom: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }} numberOfLines={1}>
                {s.course || '이름 없는 걷기'}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD }}>{settleKindLabel(s.kind)}</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray }}>{s.date}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }}>
                {won(sum.total)}원
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13),
                color: sum.confirmedCount === sum.count ? '#6B8B5E' : '#6B1E2A' }}>
                {sum.confirmedCount}/{sum.count} 입금
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </KeyboardAwareScrollView>
  );
}

// ── 새로 만들기 ───────────────────────────────────────────────
// ── 새로 만들기 ───────────────────────────────────────────────
// ★입력칸을 채우게 하지 않는다(사용자 2026-07-22: "구장명 따로 날짜 따로 명단 따로, 뭐가 다 따로입력인데").
//   구장·날짜·명단은 이미 일정/기록에 있으니 라운딩만 고르면 따라온다. 금액은 카드문자·영수증을 AI가 읽는다.
//   손으로 치는 경로는 '직접 입력'으로 남긴다 — 일정 없이 급히 걷을 때가 있다.
function ComposeView({ onCancel, onCreated }) {
  const { schedules } = useContext(SchedulesContext);
  const { diaries } = useContext(DiariesContext);
  const myUid = useCurrentUid();

  // ★일정 '공유'로 들어온 동반자는 schedule.companions에 없고 전파 그룹(scheduleGroups)에 있다.
  //   companions만 읽으면 친구초대 동반자가 통째로 누락된다(사용자 2026-07-22 — 1명 추가했는데 안 나타남).
  //   캘린더·홈 바텀시트와 같은 공용 유틸(buildCompanionNames)을 쓰려면 그룹과 친구 별명이 필요하다.
  const [groupsById, setGroupsById] = useState({});
  const [friendMeta, setFriendMeta] = useState({});
  useEffect(() => { loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {}); }, []);
  const groupIdSig = useMemo(
    () => [...new Set((schedules || []).map(s => s?.groupId).filter(Boolean))].sort().join(','),
    [schedules]);
  useEffect(() => {
    const gids = groupIdSig ? groupIdSig.split(',') : [];
    if (!gids.length) { setGroupsById({}); return; }
    let alive = true;
    Promise.all(gids.map(gid => getScheduleGroup(gid).then(g => [gid, g]).catch(() => [gid, null])))
      .then(pairs => { if (alive) setGroupsById(Object.fromEntries(pairs.filter(([, g]) => g))); });
    return () => { alive = false; };
  }, [groupIdSig]);

  const [src, setSrc] = useState(null);        // 고른 라운딩 { course, date, names[], when }
  const [manual, setManual] = useState(false); // 직접 입력 경로
  const [mCourse, setMCourse] = useState(''); // 직접 입력일 때만 쓰는 구장·날짜
  const [mDate, setMDate] = useState(today());
  const [kind, setKind] = useState('prepay');
  const [namesText, setNamesText] = useState('');
  const [total, setTotal] = useState('');
  const [perHead, setPerHead] = useState('');
  const [account, setAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState('');      // 카드문자·정산 메시지 붙여넣기
  const [instr, setInstr] = useState('');      // 총무 요구사항 — "1/n 백원단위 절사" 같은 자연어
  const [showPaste, setShowPaste] = useState(false);
  const [aiMembers, setAiMembers] = useState(null); // AI가 계산한 사람별 금액(있으면 이걸 쓴다)
  const [aiNote, setAiNote] = useState('');    // 계산 근거 한 줄 — 총무가 검산할 수 있게
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // 등록해둔 계좌 — 최근 쓴 순. 총무는 보통 같은 계좌를 쓰지만 참가비=모임통장, 식사비=개인계좌처럼
  //   나눠 쓰기도 한다(사용자 2026-07-22). 그래서 하나만 기억하지 않고 목록으로 두고 탭해서 고른다.
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [editAccount, setEditAccount] = useState(false);   // 새 계좌 직접 입력 중
  useEffect(() => {
    storage.load(STORAGE_KEYS.settlementAccounts, []).then(v => {
      const list = dedupeAccounts(Array.isArray(v) ? v : []);   // 이미 중복이 쌓인 데이터도 여기서 정리
      setSavedAccounts(list);
      storage.save(STORAGE_KEYS.settlementAccounts, list);
      if (list[0]) { setAccount(list[0].account || ''); setAccountName(list[0].accountName || ''); }
    });
  }, []);

  // ★상태를 함수형으로 갱신하고 저장도 그 안에서 한다.
  //   이전엔 렌더 시점의 savedAccounts를 읽어 새 배열을 만들었는데, 삭제 확인 팝업의 콜백은 팝업을 띄운
  //   시점의 목록을 붙잡고 있어 그 사이 추가된 항목이 되살아나거나 중복이 남았다(사용자 2026-07-22).
  const writeAccounts = (fn) => setSavedAccounts(prev => {
    const next = dedupeAccounts(fn(prev));
    storage.save(STORAGE_KEYS.settlementAccounts, next);
    return next;
  });

  // 쓴 계좌를 목록 맨 앞으로 — 같은 계좌는 하나로 합치고 최대 4개.
  const rememberAccount = (acc, name) => {
    const a = (acc || '').trim();
    if (!a) return;
    writeAccounts(prev => [{ account: a, accountName: (name || '').trim() }, ...prev]);
  };

  // 등록한 계좌 지우기 — 오타로 저장된 걸 못 지우면 목록이 쓰레기가 된다(사용자 2026-07-22).
  const forgetAccount = (acc) => {
    const key = accKey(acc);
    showAppAlert('이 계좌를 목록에서 지울까요?', (acc || '').trim(), [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => {
        writeAccounts(prev => prev.filter(x => accKey(x.account) !== key));
        if (accKey(account) === key) { setAccount(''); setAccountName(''); }
      } },
    ]);
  };

  // 고를 수 있는 라운딩 — 예정 일정(앞으로) + 최근 라운딩 기록(지난). 선입금은 예정, 식사정산은 지난 쪽이 보통.
  const options = useMemo(() => {
    const t = today();
    const nameOf = (arr) => (arr || [])
      .filter(c => c && !c.isMe && String(c.name || '').trim())
      .map(c => String(c.name).trim());
    const up = (schedules || [])
      .filter(s => (s.date || '') >= t)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 5)
      .map(s => ({ key: 'sch_' + s.id, course: s.course || '', date: s.date || '', day: s.day || '',
        // '(초대중)' 꼬리는 걷을 명단엔 군더더기라 뗀다 — 표시용 유틸을 명단용으로 재사용하는 대가
        names: buildCompanionNames(s, { group: groupsById[s.groupId], friendMeta, myUid })
          .map(n => String(n).replace(/\(초대중\)$/, '').trim()).filter(Boolean),
        when: 'upcoming', members: s.members }));
    // 지난 라운딩은 최근 7일까지만 — 한 달 전 라운딩이 아직 정산 안 됐을 리 없다(사용자 2026-07-22).
    //   목록이 길면 고르는 것부터 일이 된다. 그보다 오래된 건 '직접 입력하기'로 간다.
    //   3일로 잡았다가 7일로 늘림 — 주말 라운딩을 다음 주말에 정산하는 경우가 있어 한 주는 남긴다.
    const since = daysAgo(7);
    const past = roundsOnly(diaries || [])
      .filter(d => (d.date || '') < t && (d.date || '') >= since)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(d => ({ key: 'rnd_' + d.id, course: d.course || '', date: d.date || '', day: d.day || '',
        names: nameOf(d.companions), when: 'past' }));
    return [...up, ...past];
  }, [schedules, diaries, groupsById, friendMeta, myUid]);

  // 라운딩을 고르면 명단이 따라온다. 선입금은 예정, 식사정산은 지난 라운딩이 기본값으로 맞다.
  const pick = (o) => {
    setSrc(o); setManual(false);
    setNamesText(o.names.join('\n'));
    setKind(o.when === 'past' ? 'meal' : 'prepay');
  };

  const names = useMemo(() => parseNames(namesText), [namesText]);

  // 후보 명단 — 탭해서 넣는다. 검색창은 결국 이름을 다 쳐야 해서 안 맞는다(사용자 2026-07-22).
  //   ① 자주 같이 친 사람(지난 기록의 동반자, 많이 친 순) → 골프 모임은 멤버가 고정적이라 적중률이 높다
  //   ② 그다음 친구 목록(기록에 없는 사람) → 아직 같이 안 쳤거나 기록을 안 남긴 경우를 메운다
  //   후보가 많을 때만 아래 검색으로 걸러낸다.
  const [friends, setFriends] = useState([]);
  const [newName, setNewName] = useState('');   // 목록에 없는 사람 직접 추가
  useEffect(() => { loadMyFriendsEnriched().then(setFriends).catch(() => {}); }, []);

  const candidates = useMemo(() => {
    // ★같은 사람이 두 번 나오던 문제(사용자 2026-07-22 — '설레인'과 '이정아'가 따로 떴다).
    //   기록엔 그때 적은 이름이, 친구 목록엔 지금 닉네임·내 별명이 들어 있어 문자열이 다르다.
    //   동반자에 friendUid가 보존되므로(companion-design Phase A) uid를 우선 키로 합치고,
    //   표시는 친구 목록의 현재 이름을 쓴다(DiaryAddModal의 sameComp와 같은 판정 순서).
    const friendLabel = new Map(
      friends.map(f => [f.id, (f.customName || f.nickname || f.name || '').trim()]).filter(([, n]) => n));

    const count = new Map();   // key(uid 또는 이름) → { label, n }
    roundsOnly(diaries || []).slice(0, 40).forEach(d => {
      (d.companions || []).forEach(c => {
        if (c?.isMe) return;
        const stored = String(c?.name || '').trim();
        const uid = c?.friendUid || null;
        const label = (uid && friendLabel.get(uid)) || stored;
        if (!label) return;
        const key = uid || label;
        const cur = count.get(key);
        if (cur) cur.n += 1; else count.set(key, { label, n: 1 });
      });
    });

    const often = [...count.entries()].sort((a, b) => b[1].n - a[1].n);
    const usedKeys = new Set(often.map(([k]) => k));
    const usedLabels = new Set(often.map(([, v]) => v.label));   // uid 없이 이름만 남은 옛 기록 대비
    const rest = friends
      .filter(f => !usedKeys.has(f.id))
      .map(f => (f.customName || f.nickname || f.name || '').trim())
      .filter(n => n && !usedLabels.has(n));

    return [...often.map(([, v]) => v.label), ...rest].slice(0, 24);
  }, [diaries, friends]);

  // 화면에 그릴 칩 — 고른 사람이 먼저(순서 유지), 그다음 아직 안 고른 후보.
  //   직접 추가한 이름도 names에 들어가 있으니 같은 줄에 자연스럽게 섞인다.
  const chipList = useMemo(() => {
    const sel = names.map(n => n.name);
    const seen = new Set(sel);
    return [...sel, ...candidates.filter(n => !seen.has(n))].slice(0, 20);
  }, [names, candidates]);

  const picked = useMemo(() => new Set(names.map(n => n.name)), [names]);
  const toggleName = (n) => {
    const cur = namesText.split('\n').map(s => s.trim()).filter(Boolean);
    const next = cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n];
    setNamesText(next.join('\n'));
  };
  const addTypedName = () => {
    const n = newName.trim();
    if (!n) return;
    const cur = namesText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!cur.includes(n)) setNamesText([...cur, n].join('\n'));
    setNewName('');
  };

  // 선입금은 "1인 15만원"처럼 단가가 먼저 정해지고, 식사는 총액을 나눈다.
  //   둘 다 지원하되 입력한 쪽을 기준으로 계산 — 총무가 실제로 생각하는 순서를 그대로 둔다.
  //   AI가 계산해준 게 있으면 그걸 우선한다(요구사항이 반영된 값이라 우리가 다시 나누면 안 된다).
  //   단 명단을 손대면 AI 결과는 무효 — 인원이 바뀌었는데 옛 금액을 들고 있으면 안 되니까.
  const members = useMemo(() => {
    if (names.length === 0) return [];
    if (aiMembers && aiMembers.length === names.length
      && aiMembers.every((m, i) => m.name === names[i].name)) return aiMembers;
    const per = Number(perHead) || 0;
    if (per > 0) return names.map(m => ({ ...m, amount: Math.round(per) }));
    return splitEvenly(names, Number(total) || 0);
  }, [names, perHead, total, aiMembers]);

  const sumAmount = members.reduce((a, m) => a + m.amount, 0);
  const ready = !!(src || manual);

  // AI 결과 반영 — 사람별 금액을 그대로 쓴다(요구사항까지 반영된 값). 계산 근거는 note로 보여준다.
  const applyAi = (r) => {
    if (r?.error) { setAiError(r.error); return; }
    setAiMembers(r.members || null);
    setAiNote(r.note || '');
    setTotal(''); setPerHead('');   // 직접 입력값이 남아 AI 결과를 덮지 않게
    setPaste(''); setAiError('');
    // 계좌도 붙여넣은 내용에서 정리해준다. 이미 적어둔 계좌가 있으면 덮지 않는다.
    //   저장 목록에 없는 새 계좌를 채웠으면 입력칸을 펴서 보이게 한다 — 접힌 채 값만 바뀌면 뭘 쓰는지 모른다.
    if (r.account && !account.trim()) {
      setAccount(r.account);
      if (!savedAccounts.some(a => accKey(a.account) === accKey(r.account))) setEditAccount(true);
    }
    if (r.accountName && !accountName.trim()) setAccountName(r.accountName);
    if (r.fallback) setAiNote((r.note ? r.note + ' · ' : '') + '이름을 못 맞춰 1/n으로 나눴어요');
  };
  const aiFromText = async () => {
    const t = paste.trim();
    if ((!t && !instr.trim()) || aiBusy) return;
    Keyboard.dismiss(); setAiBusy(true); setAiError('');
    applyAi(await computeSettlementFromText({ text: t, names, instruction: instr, kind }));
    setAiBusy(false);
  };
  // 영수증 — 갤러리는 여러 장 선택(1차·2차), 촬영은 한 장씩. 3장 초과분은 잘라내고 알려준다.
  const aiFromPhoto = async (source) => {
    if (aiBusy) return;
    Keyboard.dismiss();
    let uris = [];
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setAiError('카메라 권한이 필요해요'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      uris = [res.assets[0].uri];
    } else {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setAiError('사진 접근 권한이 필요해요'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: RECEIPT_MAX,
      });
      if (res.canceled || !res.assets?.length) return;
      uris = res.assets.map(a => a.uri);
    }
    const over = uris.length > RECEIPT_MAX;
    setAiBusy(true); setAiError('');
    const r = await computeSettlementFromImages({ uris, names, instruction: instr, kind });
    setAiBusy(false);
    applyAi(r);
    if (over && !r?.error) setAiNote(p => `${p ? p + ' · ' : ''}앞 ${RECEIPT_MAX}장만 읽었어요`);
  };

  const submit = async () => {
    if (saving || aiBusy) return;
    if (names.length === 0) { showToast('참가자가 없어요'); return; }
    Keyboard.dismiss();

    // ★붙여넣기만 해두고 'AI로 계산'을 안 누른 채 '걷기 시작'을 누르면 아무 일도 안 일어나
    //   무엇이 잘못됐는지 알 수 없었다(사용자 2026-07-22 — 본인도 걸림). 누를 걸 하나 더 요구하지 말고,
    //   금액이 비었는데 읽을 재료가 있으면 여기서 대신 계산해준다.
    let ready = members;
    let sum = sumAmount;
    if (sum <= 0 && (paste.trim() || instr.trim())) {
      setAiBusy(true);
      const r = await computeSettlementFromText({ text: paste.trim(), names, instruction: instr, kind });
      setAiBusy(false);
      if (r?.error) { setAiError(r.error); return; }
      applyAi(r);
      ready = r.members || [];
      sum = ready.reduce((a, m) => a + (m.amount || 0), 0);
    }
    if (sum <= 0) { setAiError('금액이 비어 있어요. 붙여넣거나 직접 입력해주세요'); return; }

    setSaving(true);
    try {
      const s = await createSettlement({
        kind,
        course: manual ? mCourse : (src?.course || ''),
        date: (manual ? mDate : src?.date) || today(),
        members: ready, total: sum, account, accountName,
      });
      rememberAccount(account, accountName);
      onCreated(s);
    } catch (e) { showToast('저장하지 못했어요'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} bottomOffset={24}>
      {/* 1 — 어떤 라운딩. 고르면 구장·날짜·명단이 따라온다 */}
      <Text style={sec}>어떤 라운딩인가요</Text>
      {options.map(o => {
        const on = src?.key === o.key;
        return (
          <TouchableOpacity key={o.key} onPress={() => pick(o)} activeOpacity={0.75}
            style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
              backgroundColor: on ? C.navy : C.bgSecondary,
              }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15.5),
                color: on ? C.butter : C.charcoal }} numberOfLines={1}>
                {o.course || '구장 미정'}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5),
                color: on ? 'rgba(245,239,222,0.7)' : (o.when === 'past' ? C.warmGray : GOLD) }}>
                {o.when === 'past' ? '지난 라운딩' : '예정'}
              </Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), marginTop: 5,
              color: on ? 'rgba(245,239,222,0.75)' : C.warmGray }} numberOfLines={1}>
              {o.date}{o.day ? ` (${o.day})` : ''}
              {o.names.length ? `  ·  ${o.names.join(', ')}` : '  ·  명단 없음'}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity onPress={() => { setManual(true); setSrc(null); }} activeOpacity={0.7}
        style={{ paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5),
          color: manual ? '#6B1E2A' : C.warmGray }}>직접 입력하기</Text>
      </TouchableOpacity>

      {/* 라운딩을 고르기 전엔 아래를 감춘다 — 한 번에 다 보이면 아까 그 '따로 입력' 폼과 똑같아진다 */}
      {ready && (
        <>
          <View style={divider} />

          {/* 직접 입력일 때만 — 라운딩을 골랐으면 구장·날짜는 이미 정해졌다 */}
          {manual && (
            <>
              <Text style={sec}>어디서 · 언제</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22 }}>
                <AppTextInput value={mCourse} onChangeText={setMCourse} placeholder="남서울CC"
                  style={[box, { flex: 1.4, paddingHorizontal: 14, paddingVertical: 12,
                    fontFamily: F.sys, fontSize: fs(14.5), color: C.charcoal }]} />
                <AppTextInput value={mDate} onChangeText={setMDate} placeholder="2026.07.26"
                  keyboardType="numbers-and-punctuation"
                  style={[box, { flex: 1, paddingHorizontal: 14, paddingVertical: 12,
                    fontFamily: F.sys, fontSize: fs(14.5), color: C.charcoal }]} />
              </View>
            </>
          )}

          <Text style={sec}>무엇을 걷나요</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SETTLE_KINDS.map(k => {
              const on = kind === k.key;
              return (
                <TouchableOpacity key={k.key} activeOpacity={0.8}
                  onPress={() => {
                    if (k.key === kind) return;
                    // 선입금↔사후정산은 금액의 의미가 반대라(1인당 vs 총액) 이전 계산을 그대로 두면 틀린 값이 남는다.
                    setKind(k.key); setAiMembers(null); setAiNote(''); setTotal(''); setPerHead('');
                  }}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center',
                    backgroundColor: on ? '#6B1E2A' : C.bgSecondary,
                    }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: on ? C.butter : C.charcoal }}>
                    {k.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 명단 — 자동으로 채워져 있고, 빠진 사람만 고치면 된다 */}
          <View style={{ height: 22 }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={[sec, { flex: 1, marginBottom: 8 }]}>누구한테</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD }}>{names.length}명</Text>
          </View>
          {/* 이름을 세로 목록에 쌓으면 자리만 먹고 한눈에 안 들어온다(사용자 2026-07-22).
              고른 사람·후보를 가로 칩 한 흐름으로 합친다 — 고른 사람이 앞(버건디 ✓), 뒤가 후보.
              탭 = 넣기/빼기. 목록에 없는 사람만 아래 한 줄 입력으로 더한다. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chipList.map(n => {
              const on = picked.has(n);
              return (
                <TouchableOpacity key={n} activeOpacity={0.7} onPress={() => toggleName(n)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                    backgroundColor: on ? '#6B1E2A' : C.bgSecondary,
                    }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5),
                    color: on ? C.butter : C.charcoal }}>{on ? `${n} ✕` : `+ ${n}`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 목록에 없는 사람 추가 — 앱을 안 쓰는 동반자가 대부분이라 이 경로가 늘 필요하다 */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <AppTextInput value={newName} onChangeText={setNewName}
              onSubmitEditing={addTypedName} returnKeyType="done" blurOnSubmit={false}
              placeholder="목록에 없으면 이름 직접 추가"
              style={[box, { flex: 1, paddingHorizontal: 14, paddingVertical: 11,
                fontFamily: F.sys, fontSize: fs(14), color: C.charcoal }]} />
            <TouchableOpacity onPress={addTypedName} activeOpacity={0.85} disabled={!newName.trim()}
              style={{ paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: newName.trim() ? C.navy : C.bgSecondary,
                borderWidth: 0.5, borderColor: newName.trim() ? C.navy : C.hairline }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14),
                color: newName.trim() ? C.butter : C.warmGray }}>추가</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 7, lineHeight: fs(16) }}>
            앱을 안 쓰는 사람도 이름만 넣으면 돼요. 정산서는 카톡으로 보낼 수 있어요
          </Text>

          <View style={divider} />

          <Text style={sec}>얼마를 걷나요</Text>

          {/* ── AI 영역 (골드) ── 가계부·예정 라운딩과 같은 관례: 골드 카드 안 = AI, 밖 = 직접 입력.
              여기만 다른 점은 '요구사항'을 받는다는 것 — 정산은 총무마다 규칙이 달라서 값만 읽어선 못 채운다. */}
          <View style={{ borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.4)',
            backgroundColor: 'rgba(201,168,76,0.08)', padding: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD_DEEP,
                alignItems: 'center', justifyContent: 'center' }}>
                {aiBusy ? <Spinner size={16} color="#FFFFFF" /> : <Icon name="sparkle" size={15} color="#FFFFFF" strokeWidth={1.8} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>AI로 계산</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 1 }}>
                  {aiBusy ? 'AI가 계산하고 있어요...'
                    : kind === 'prepay' ? '1인당 얼마인지 적으면 전원에게 똑같이 매겨드려요'
                    : '어떻게 나눌지 적으면 사람별로 계산해드려요'}
                </Text>
              </View>
            </View>

            {/* 요구사항 — 이게 이 화면의 핵심. 총무가 실제로 겪는 상황을 예시로 든다(사용자 2026-07-22).
                말로 하듯 적으면 되고, 계좌를 같이 붙여넣으면 계좌칸까지 채워진다. */}
            <AppTextInput value={instr} onChangeText={v => { setInstr(v); if (aiError) setAiError(''); }} multiline
              placeholder={kind === 'prepay' ? '1인당 얼마인지 적어주세요' : '어떻게 나눌지 적어주세요'}
              placeholderTextColor={C.warmGray}
              style={{ minHeight: fs(76), backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: C.hairline,
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, textAlignVertical: 'top',
                fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
            {/* 예시 — 탭해서 넣는 버튼으로 뒀더니 금액이 박혀 오히려 잘못 유도했다(사용자 2026-07-22:
                "캐디피가 인당 5만원 넘기 힘든데 금액을 박아주는 건 맞지 않아, 경우가 다 다르다").
                넣어주지 말고 '이렇게 쓰면 된다'만 보여준다. placeholder에 넣으면 잘리므로 입력칸 밖에 둔다. */}
            <View style={{ marginTop: 9 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP, marginBottom: 4 }}>
                이렇게 적으면 돼요
              </Text>
              {(kind === 'prepay'
                ? ['캐디피 인당 4만원, 참가비 2만원', '김이사는 참가비 면제', '박부장은 3만원 더']
                : ['인원수대로 나누고 백원단위 절사', '김이사는 술 안 마셔서 빼줘', '점심은 3명, 저녁은 전원']
              ).map(ex => (
                <Text key={ex} style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, lineHeight: fs(18) }}>
                  · {ex}
                </Text>
              ))}
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 9, lineHeight: fs(16) }}>
              카드 문자·계좌번호를 같이 붙여넣으면 금액과 계좌까지 정리해드려요{'\n'}
              1차·2차처럼 여러 건이면 문자를 이어서 붙여넣거나, 영수증을 {RECEIPT_MAX}장까지 골라주세요
            </Text>

            {/* 금액 출처 — 촬영 / 갤러리 / 붙여넣기 (가계부와 동일 3분할) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {[
                { key: 'camera', icon: 'camera', label: '촬영', onPress: () => aiFromPhoto('camera') },
                { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => aiFromPhoto('gallery') },
                { key: 'paste', icon: 'clipboard', label: '붙여넣기', onPress: () => setShowPaste(v => !v) },
              ].map(m => {
                const active = m.key === 'paste' && showPaste;
                return (
                  <TouchableOpacity key={m.key} activeOpacity={0.8} onPress={m.onPress} disabled={aiBusy}
                    style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12,
                      backgroundColor: active ? 'rgba(201,168,76,0.16)' : '#FFFFFF',
                      borderWidth: 0.5, borderColor: active ? GOLD : C.hairline }}>
                    <Icon name={m.icon} size={21} color={GOLD_DEEP} strokeWidth={1.8} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {showPaste && !aiBusy && (
              <AppTextInput value={paste} onChangeText={v => { setPaste(v); if (aiError) setAiError(''); }} multiline
                placeholder={'카드결제 문자나 정산 메시지를 붙여넣어 주세요'}
                placeholderTextColor={C.warmGray}
                style={{ minHeight: fs(70), backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, textAlignVertical: 'top',
                  fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
            )}

            {/* 실행 — 회색으로 죽여두면 눈에 안 들어와 '있는 줄도 모르고' 지나친다(사용자 2026-07-22).
                내용이 없을 땐 골드 외곽선으로 살려두고, 눌렀을 때 뭐가 필요한지 말해준다. */}
            {(() => {
              const armed = !!(paste.trim() || instr.trim());
              return (
                <TouchableOpacity activeOpacity={0.85} disabled={aiBusy}
                  onPress={() => { if (armed) aiFromText(); else setAiError('금액이나 나누는 방법을 먼저 적어주세요'); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12,
                    backgroundColor: armed ? GOLD_DEEP : 'transparent', borderRadius: 12, paddingVertical: 14,
                    borderWidth: armed ? 0 : 1, borderColor: GOLD_DEEP }}>
                  <Icon name="sparkle" size={17} color={armed ? '#FFFFFF' : GOLD_DEEP} strokeWidth={1.8} />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: armed ? '#FFFFFF' : GOLD_DEEP }}>
                    {aiBusy ? 'AI가 계산 중…' : 'AI로 계산하기'}
                  </Text>
                </TouchableOpacity>
              );
            })()}

            {!!aiError && !aiBusy && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: '#6B1E2A', marginTop: 9 }}>{aiError}</Text>
            )}
            {!!aiNote && !aiError && !aiBusy && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: GOLD_DEEP, marginTop: 9 }}>{aiNote}</Text>
            )}
          </View>

          {/* ── 직접 입력 (골드 밖) ──
              선입금은 '1인당'이 본류라 총액칸을 아예 안 보여준다 — 나누는 개념이 아니다(사용자 2026-07-22).
              식사정산은 총액을 나누는 게 본류. */}
          <Text style={hint}>직접 입력</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={hint}>{kind === 'prepay' ? '1인당 (전원 동일)' : '1인당'}</Text>
              <AppTextInput value={perHead} keyboardType="number-pad"
                onChangeText={t => { setPerHead(t.replace(/[^0-9]/g, '')); if (t) setTotal(''); }}
                placeholder="150000"
                style={[box, { paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sysB, fontSize: fs(15.5), color: C.charcoal }]} />
            </View>
            {kind !== 'prepay' && (
              <View style={{ flex: 1 }}>
                <Text style={hint}>또는 총액</Text>
                <AppTextInput value={total} keyboardType="number-pad"
                  onChangeText={t => { setTotal(t.replace(/[^0-9]/g, '')); if (t) setPerHead(''); }}
                  placeholder="600000"
                  style={[box, { paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sysB, fontSize: fs(15.5), color: C.charcoal }]} />
              </View>
            )}
          </View>
          {sumAmount > 0 && members.length > 0 && (
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal, marginTop: 10 }}>
              {members.every(m => m.amount === members[0].amount)
                ? `전원 ${won(members[0].amount)}원 · 합계 ${won(sumAmount)}원`
                : `합계 ${won(sumAmount)}원 (사람마다 다름)`}
            </Text>
          )}

          <View style={divider} />

          <Text style={sec}>받을 계좌</Text>
          {/* 등록해둔 계좌 — 탭하면 아래 칸이 채워진다. 새로 적으면 만들 때 자동으로 목록에 들어간다 */}
          {savedAccounts.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {savedAccounts.map(a => {
                const on = accKey(a.account) === accKey(account);
                // 탭 = 고르기, 우측 ✕ = 목록에서 지우기
                return (
                  <View key={accKey(a.account)}
                    style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16,
                      backgroundColor: on ? '#6B1E2A' : C.bgSecondary,
                      }}>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={() => { setAccount(a.account || ''); setAccountName(a.accountName || ''); }}
                      style={{ paddingLeft: 12, paddingRight: 6, paddingVertical: 8 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>
                        {on ? '✓ ' : ''}{a.account}{a.accountName ? ` ${a.accountName}` : ''}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.6} onPress={() => forgetAccount(a.account)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                      style={{ paddingRight: 11, paddingLeft: 2, paddingVertical: 8 }}>
                      <Text style={{ fontSize: fs(13), color: on ? 'rgba(245,239,222,0.7)' : C.warmGray }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          {/* 저장된 계좌를 골랐으면 입력칸까지 같은 내용을 또 보여줄 필요가 없다(사용자 2026-07-22).
              칩이 곧 선택 상태고, 새 계좌를 넣을 때만 칸을 편다.
              ★은행명은 계좌번호와 한 칸에 같이 쓴다 — 카톡에 올릴 때도 "국민 123-456 홍길동" 한 줄이고,
                붙여넣기·AI로 채우는 경로와 형태가 같아야 해서 은행 선택기를 따로 두지 않는다. */}
          {(savedAccounts.length === 0 || editAccount) ? (
            <>
              <Text style={hint}>은행 + 계좌번호</Text>
              <AppTextInput value={account} onChangeText={setAccount} placeholder="국민 123456-78-901234"
                style={[box, { paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
                  fontFamily: F.sys, fontSize: fs(14.5), color: C.charcoal }]} />
              <Text style={hint}>예금주</Text>
              <AppTextInput value={accountName} onChangeText={setAccountName} placeholder="홍길동"
                style={[box, { paddingHorizontal: 14, paddingVertical: 12,
                  fontFamily: F.sys, fontSize: fs(14.5), color: C.charcoal }]} />
              {savedAccounts.length > 0 && (
                <TouchableOpacity onPress={() => setEditAccount(false)} activeOpacity={0.7}
                  style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray }}>저장된 계좌에서 고르기</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity onPress={() => { setEditAccount(true); setAccount(''); setAccountName(''); }}
              activeOpacity={0.7} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: '#6B1E2A' }}>+ 다른 계좌 입력</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={submit} activeOpacity={0.85} disabled={saving}
            style={{ marginTop: 28, backgroundColor: saving ? C.warmGray : '#6B1E2A', borderRadius: 14,
              paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>
              {saving ? '만드는 중…' : '걷기 시작'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAwareScrollView>
  );
}
// ── 상세 (입금 체크) ──────────────────────────────────────────
function DetailView({ s, onSave, onDeleted }) {
  const sum = useMemo(() => summarize(s.members), [s.members]);
  const allDone = sum.count > 0 && sum.confirmedCount === sum.count;

  // 이름 탭 → 입금 확정 토글. 총무가 은행앱 보면서 하나씩 찍는 동작.
  const tapMember = (memberId) => onSave({ members: toggleMemberStatus(s.members, memberId) });

  const sendKakao = async () => {
    try { await Share.share({ message: buildSettlementText(s) }); }
    catch (e) { /* 사용자가 공유 시트를 닫은 경우 — 무시 */ }
  };

  const confirmDelete = () => {
    showAppAlert('이 걷기를 지울까요?', '입금 체크한 내용도 같이 사라져요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteSettlement(s.id); onDeleted(); }
        catch (e) { showToast('삭제하지 못했어요'); }
      } },
    ]);
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* 요약 */}
      <View style={[box, { padding: 16, marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD, flex: 1 }}>
            {settleKindLabel(s.kind)}{s.date ? ` · ${s.date}` : ''}
          </Text>
          <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray }}>삭제</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal }}>{won(sum.total)}원</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), marginTop: 8,
          color: allDone ? '#6B8B5E' : '#6B1E2A' }}>
          {allDone ? '전원 입금 완료' : `${sum.confirmedCount}/${sum.count} 입금 · ${won(sum.remain)}원 남음`}
        </Text>
      </View>

      {/* 명단 — 탭하면 확정 토글 */}
      <Text style={label}>이름을 탭하면 입금 확정으로 바뀝니다</Text>
      <View style={[box, { paddingVertical: 4, marginBottom: 14 }]}>
        {(s.members || []).map((m, i) => {
          const done = m.status === PAY_CONFIRMED;
          const claimed = m.status === PAY_CLAIMED;
          return (
            <TouchableOpacity key={m.id || i} onPress={() => tapMember(m.id)} activeOpacity={0.6}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13,
                borderBottomWidth: i === s.members.length - 1 ? 0 : 0.5, borderBottomColor: C.hairline }}>
              <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(15),
                color: done ? C.warmGray : C.charcoal }}>{m.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, marginRight: 12 }}>
                {won(m.amount)}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), minWidth: fs(52), textAlign: 'right',
                color: done ? '#6B8B5E' : claimed ? GOLD : C.warmGray }}>
                {done ? '✓ 확정' : claimed ? '확인대기' : '대기'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 계좌 */}
      {!!s.account && (
        <View style={[box, { padding: 14, marginBottom: 14 }]}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal }}>
            {s.account}{s.accountName ? `  ${s.accountName}` : ''}
          </Text>
        </View>
      )}

      {/* 카톡으로 정산서 — 앱 안 깐 사람에게 가는 경로 */}
      <TouchableOpacity onPress={sendKakao} activeOpacity={0.85}
        style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>카톡으로 정산서 보내기</Text>
      </TouchableOpacity>
      {!allDone && sum.unpaid.length > 0 && (
        <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center',
          marginTop: 10, lineHeight: 18 }}>
          아직 안 낸 사람: {sum.unpaid.map(m => m.name).join(', ')}
        </Text>
      )}
    </KeyboardAwareScrollView>
  );
}

