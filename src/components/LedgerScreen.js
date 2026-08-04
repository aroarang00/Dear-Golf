import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Platform, Keyboard, Share, Clipboard } from 'react-native';
// Clipboard는 RN 코어에서 분리 예정이라 콘솔에 경고가 한 번 뜨지만 아직 동작한다.
//   expo-clipboard로 바꾸려면 네이티브 재빌드가 필요해, 다음 빌드 때 교체하는 걸로 미룬다.
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';   // 하단 네비바 여백 — 버튼 가림 방지
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import AppTextInput from './common/AppTextInput';
import { Icon } from './common/Icon';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { showAppAlert, AppAlertHost } from './AppAlert';   // 풀스크린 모달(정산·크루) 안에서도 알럿이 위로 보이게 자체 호스트 장착([[ios-modal-stacking]])
import { C, F, fs } from '../constants/colors';
import {
  subscribeMyLedgers, createLedger, deleteLedger,
  subscribeLedgerEntries, addEntry, updateEntry, deleteEntry,
  findLedgerByCrew, updateLedgerDues, normDues, summarizeDues, listDuesPeriods, totalDuesCollected, duesCollectedIn,
  DUES_CYCLES, duesCycleTitle, duesCycleLabel, duesAmountLabel, duesPeriodKey, duesPeriodLabel, shiftDuesPeriod, isMemberIn,
  LEDGER_INCOME_CATEGORIES, LEDGER_EXPENSE_CATEGORIES, ledgerCatLabel, buildLedgerText,
} from '../utils/ledger';
import { extractExpenseFromText, extractExpenseFromImage } from '../utils/golfExpense';   // 영수증·카드문자 자동입력(가계부와 같은 CF)

// 모임 '회비 장부' — 총무가 모임 통장(수입·지출·잔액)을 지속 관리. 걷기(1회성)와 별개.
//   목록(여러 모임) ↔ 상세(잔액 카드 + 거래 + 입력) 한 컴포넌트. 정산 화면 탭·크루 화면 양쪽에서 재사용.
//   순수 View라 SafeArea/Modal은 감싸는 쪽(SettlementModal 탭 / 크루 진입 Modal)이 책임진다.
//
// props:
//   currentUid       — 총무(로그인) uid
//   initialCrewId    — 크루에서 진입하면 그 크루 장부로 직행(없으면 만들기 유도)
//   initialCrewName  — 크루명(새 장부 기본 이름)
//   onClose          — 상세 최상단에서 뒤로/닫기 (크루 진입은 목록을 안 거치므로 여기서 닫는다)

const SAGE = '#5E7E42';        // 수입(플러스) — 세이지그린
const SAGE_SOFT = 'rgba(94,126,66,0.10)';
const RED = C.burgundy;        // 지출(마이너스) — 버건디
const RED_SOFT = 'rgba(107,30,42,0.08)';
const GOLD_DEEP = '#8A6A33';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => {
  const [y, m, dd] = String(s || '').split('.').map(Number);
  return (y && m && dd) ? new Date(y, m - 1, dd) : new Date();
};
const fmtWon = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const label = { fontFamily: F.sysSb, fontSize: fs(13), color: C.textSecondary, marginBottom: 8 };
const boxInput = { backgroundColor: C.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sys, fontSize: fs(15), color: C.charcoal };

export function LedgerScreen({ currentUid, initialCrewId = null, initialCrewName = '', onClose = null, onDetailChange = null, registerBack = null, crewMemberNames = null }) {
  const insets = useSafeAreaInsets();   // 하단 고정 버튼·시트가 네비바에 안 가리게
  const [ledgers, setLedgers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);   // 인덱스 빌드 중·네트워크 오류 — 무한 스피너 대신 안내
  const [selId, setSelId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // 거래 입력 시트
  const [sheet, setSheet] = useState(null);   // null | { editingId, prev, type, custom, amount, category, title, date, memo, who }
  const [showDate, setShowDate] = useState(false);

  // 기간 보기 — 회비가 '7월'처럼 달 단위라, 거래도 같은 달 단위로 묶어야 머릿속에서 하나로 읽힌다.
  //   month='2026.07' / year='2026'. 잔액 카드는 통장 누적이라 기간과 무관하게 그대로 둔다.
  const [viewCycle, setViewCycle] = useState('monthly');   // 'monthly'(월별) | 'yearly'(연말정산)
  const [viewPeriod, setViewPeriod] = useState(null);      // null이면 이번 달/올해
  const [openMonths, setOpenMonths] = useState([]);        // 연말정산에서 펼친 달들('2026.07')

  // 카톡 내역서 — 무엇을 보낼지 총무가 고른다(뺀 줄은 글에 안 들어간다)
  const [exportPick, setExportPick] = useState(null);      // null | { ids:[거래id…], dues:boolean }

  // 시트 본문 지연 마운트 — 거래 시트는 AI 카드·칩·날짜피커가 한꺼번에 붙어서, 안드에서 여는 순간
  //   JS가 마운트에 묶여 슬라이드가 '덜컥' 끊긴다. 빈 시트를 먼저 올리고 다음 틱에 내용을 채운다
  //   ([[rn-list-perf-patterns]]·MyPageModal과 같은 처방). 닫힐 때 즉시 false로 돌려 다음 열기도 매끄럽게.
  const [sheetBody, setSheetBody] = useState(false);
  useEffect(() => {
    if (!sheet) { setSheetBody(false); return; }
    const t = setTimeout(() => setSheetBody(true), 50);
    return () => clearTimeout(t);
  }, [!!sheet]);
  const [exportBody, setExportBody] = useState(false);
  useEffect(() => {
    if (!exportPick) { setExportBody(false); return; }
    const t = setTimeout(() => setExportBody(true), 50);
    return () => clearTimeout(t);
  }, [!!exportPick]);

  // 영수증·카드문자 AI 자동입력 — 지출에만. 개인 가계부(ExpenseAddSheet)와 같은 CF를 그대로 쓴다.
  const [aiText, setAiText] = useState('');       // 붙여넣은 카드문자
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  // 회원 회비(정기 회비) — 회비 걷는 모임만
  const [duesView, setDuesView] = useState(false);      // 상세 안에서 회원 회비 화면 진입
  const [newMember, setNewMember] = useState('');        // 회원 이름 입력
  const [amountInput, setAmountInput] = useState({ monthly: '', yearly: '' });  // 1인 회비 편집값(주기별)
  const [duesPeriod, setDuesPeriod] = useState(null);    // 보고 있는 기간 키('2026.07'/'2026'). null이면 이번 기간
  const [showPastPeriods, setShowPastPeriods] = useState(false);   // 지난 기간 기록 펼침
  const [duesTab, setDuesTab] = useState('monthly');     // 월·연 둘 다 걷는 모임에서만 쓰는 전환값
  const [showDuesSetup, setShowDuesSetup] = useState(false);       // 회비 설정(무엇을 걷나·얼마) 펼침

  const sel = useMemo(() => ledgers.find(l => l.id === selId) || null, [ledgers, selId]);

  // 내 모임 장부 목록 실시간
  useEffect(() => {
    if (!currentUid) return;
    return subscribeMyLedgers(currentUid, (list) => {
      setLedgers((list || []).filter(l => !l.archived));
      setLoadErr(false); setLoaded(true);
    }, () => { setLoadErr(true); setLoaded(true); });   // 에러(인덱스 빌드 중 등)여도 스피너는 멈춘다
  }, [currentUid]);

  // 크루에서 진입 — 그 크루 장부가 있으면 바로 열고, 없으면 만들기 폼(크루명 기본).
  useEffect(() => {
    if (!currentUid || !initialCrewId) return;
    let alive = true;
    findLedgerByCrew(initialCrewId, currentUid).then((found) => {
      if (!alive) return;
      if (found) setSelId(found.id);
      else { setNewName(initialCrewName || ''); setShowCreate(true); }
    });
    return () => { alive = false; };
  }, [currentUid, initialCrewId, initialCrewName]);

  // 선택 장부의 거래 실시간
  useEffect(() => {
    if (!selId) { setEntries([]); return; }
    return subscribeLedgerEntries(selId, (list) => setEntries(list || []));
  }, [selId]);

  // 상세/만들기 화면인지 부모(정산 모달)에 알림 — 상세에선 정산 모달 헤더·탭을 숨겨 ✕/← 중복을 없앤다.
  useEffect(() => { onDetailChange?.(!!selId || showCreate); }, [selId, showCreate, onDetailChange]);

  // ★안드 하드웨어 뒤로가기 — 부모(정산 모달)의 goBack이 이걸 먼저 물어본다.
  //   장부 안에도 목록→상세→회비 단계가 있는데, 부모는 그 상태를 모르므로 그냥 두면
  //   상세에서 뒤로 한 번에 정산 화면이 통째로 닫힌다(걷기 탭은 이미 단계별로 처리됨).
  //   true를 돌려주면 '한 단계 삼켰다'는 뜻. 시트류는 자기 onRequestClose가 먼저 먹지만,
  //   이벤트가 여기까지 내려오는 경우를 위해 방어로 함께 둔다.
  useEffect(() => {
    if (!registerBack) return;
    registerBack(() => {
      if (exportPick) { setExportPick(null); return true; }
      if (sheet) { setSheet(null); return true; }
      if (duesView) { setDuesView(false); setDuesPeriod(null); return true; }
      if (showCreate) { setShowCreate(false); return true; }
      if (selId) { goList(); return true; }
      return false;   // 목록이면 부모가 화면을 닫게 넘긴다
    });
    return () => registerBack(null);
  }, [registerBack, exportPick, sheet, duesView, showCreate, selId, goList]);

  const goList = useCallback(() => {
    // 크루로 진입했으면(목록을 안 거침) 뒤로가기는 화면 자체를 닫는다.
    if (initialCrewId) { onClose && onClose(); return; }
    setSelId(null); setDuesView(false);
  }, [initialCrewId, onClose]);

  // ── 회원 회비 조작 — 명단은 이름만, 납부는 '기간별'로 쌓인다. 장부 dues 필드에 통째로 저장 ──
  //   ★조작·표시 모두 normDues를 거친 값을 기준으로 한다 — 구버전(members[].status) 데이터가
  //     화면엔 흡수돼 보이는데 저장은 원본 기준이면, 토글 한 번에 그 체크가 날아간다.
  const dues = useMemo(() => normDues(sel?.dues), [sel?.dues]);
  // 켠 주기만 화면에 보인다. 하나만 켰으면 그걸로 고정(탭 없음), 둘 다면 duesTab으로 전환.
  const onCycles = useMemo(() => DUES_CYCLES.map(c => c.key).filter(k => dues[k].on), [dues]);
  const duesTotal = useMemo(() => totalDuesCollected(dues), [dues]);   // 걷은 회비 총액 — 잔액·수입에 더해 보여준다
  const cycle = onCycles.length === 1 ? onCycles[0] : (onCycles.includes(duesTab) ? duesTab : 'monthly');
  // 보고 있는 기간 — 주기가 바뀌면 키 체계가 달라지므로 선택값을 버리고 이번 기간으로 돌아온다.
  const curPeriod = (duesPeriod && (cycle === 'yearly') === !duesPeriod.includes('.')) ? duesPeriod : duesPeriodKey(cycle);
  const isThisPeriod = curPeriod === duesPeriodKey(cycle);

  // ★dues 저장은 반드시 '함수형'으로 — dues 전체를 통째로 덮어쓰는 구조라, 렌더 시점 스냅샷으로 저장하면
  //   그 사이 일어난 다른 변경이 되살아난다. 실제로 겪은 버그: 금액칸에 커서가 있는 채로 체크를 끄면
  //   onEndEditing이 뒤늦게 발화해 '끄기 전 dues'로 저장 → 방금 끈 체크가 다시 켜졌다.
  //   duesRef는 구독으로 갱신된 최신 dues를 들고 있고, 확인 팝업처럼 시간이 뜨는 경로에도 이게 맞다.
  const duesRef = useRef(dues);
  useEffect(() => { duesRef.current = dues; }, [dues]);
  const saveDues = (updater) => {
    if (!selId) return;
    const next = typeof updater === 'function' ? updater(duesRef.current) : updater;
    duesRef.current = next;   // 연달아 눌러도 앞 변경이 묻히지 않게 즉시 반영(서버 응답을 기다리지 않는다)
    updateLedgerDues(selId, next).catch(() => showToast('저장에 실패했어요'));
  };
  // 새 회원은 '보고 있는 기간'부터 대상 — 지난 달 미납자로 잡히면 안 된다(연 보기면 그 해 1월부터).
  const memberSince = () => (curPeriod.includes('.') ? curPeriod : `${curPeriod}.01`);
  const addMember = () => {
    const name = newMember.trim(); if (!name) return;
    saveDues(d => ({ ...d, enabled: true, members: [...(d.members || []), { name, since: memberSince() }] }));
    setNewMember('');
  };
  // 크루원 명단 가져오기 — 크루에서 들어온 장부에만. 이름이 같은 사람은 건너뛴다(중복 추가 방지).
  //   ★자동으로 채우지 않고 버튼으로 두는 이유: 크루원이라고 다 회비 대상은 아니다(게스트·면제 회원).
  //     한 번 눌러 불러온 뒤 빼고 싶은 사람만 지우는 편이 손이 덜 간다.
  const crewNamesToAdd = (crewMemberNames || []).filter(
    n => n && !(dues.members || []).some(m => m.name === n));
  const importCrewMembers = () => {
    if (!crewNamesToAdd.length) return;
    const since = memberSince();
    saveDues(d => ({ ...d, enabled: true,
      members: [...(d.members || []), ...crewNamesToAdd.map(name => ({ name, since }))] }));
    showToast(`크루원 ${crewNamesToAdd.length}명을 명단에 넣었어요`);
  };
  // 납부 토글 — 보고 있는 기간의 paid 목록에서만 넣고 뺀다. 체크할 때 그 기간의 1인 회비를 스냅샷으로 남긴다.
  const toggleMember = (mid) => saveDues(d => {
    const periods = { ...(d.periods || {}) };
    const p = periods[curPeriod] || { paid: [], amount: d[cycle].amount };
    const paid = (p.paid || []).includes(mid) ? p.paid.filter(x => x !== mid) : [...(p.paid || []), mid];
    periods[curPeriod] = { paid, amount: p.amount || d[cycle].amount };
    return { ...d, enabled: true, periods };
  });
  // 회원 정리 — 기본은 '탈퇴'(지난 기록 유지). 오타로 잘못 넣은 이름만 '완전 삭제'.
  //   ★탈퇴가 기본인 이유: 나간 사람이 지난 달에 낸 돈까지 지우면 그 달 장부가 틀어진다.
  const removeMember = (mid) => {
    const m = (dues.members || []).find(x => x.id === mid);
    const who = m?.name || '이 회원';
    // 이번 기간부터 안 걷는다 → 마지막 재적은 '직전 달'. 이미 낸 기간은 요약이 알아서 살려 준다.
    const thisMonth = duesPeriodKey('monthly');
    const until = shiftDuesPeriod('monthly', thisMonth, -1);
    showAppAlert(`${who}님을 어떻게 할까요?`,
      '탈퇴하면 이번 기간부터 명단에서 빠져요. 지난 기간에 낸 기록과 금액은 그대로 남아요.', [
      { text: '취소' },
      { text: '탈퇴 처리', onPress: () => saveDues(d => ({
        ...d, members: (d.members || []).map(x => x.id === mid ? { ...x, until } : x) })) },
      { text: '기록까지 완전 삭제', style: 'destructive', onPress: () => showAppAlert(
        '지난 기록까지 지울까요?', `${who}님이 지금까지 낸 회비가 장부에서 사라져요. 잘못 넣은 이름을 지울 때만 쓰세요.`, [
        { text: '취소' },
        { text: '완전 삭제', style: 'destructive', onPress: () => saveDues(d => {
          const periods = {};
          Object.keys(d.periods || {}).forEach(k => {
            periods[k] = { ...d.periods[k], paid: (d.periods[k].paid || []).filter(id => id !== mid) };
          });
          return { ...d, members: (d.members || []).filter(x => x.id !== mid), periods };
        }) },
      ]) },
    ]);
  };
  // 주기 켜기/끄기 — 끌 땐 기록이 남아 있으면 알려준다(지우지는 않는다. 다시 켜면 그대로 보인다).
  const toggleCycle = (k) => {
    const turningOff = dues[k].on;
    const apply = () => {
      Keyboard.dismiss();   // 금액칸 커서를 먼저 거둔다 — 늦게 오는 onEndEditing과 겹치지 않게
      saveDues(d => ({ ...d, enabled: true, [k]: { ...d[k], on: !turningOff } }));
      setDuesPeriod(null);
      if (!turningOff) setDuesTab(k);
    };
    const has = Object.keys(dues.periods || {}).some(key => (k === 'yearly' ? !key.includes('.') : key.includes('.')));
    if (turningOff && has) {
      showAppAlert(`${duesCycleLabel(k)}를 그만 걷을까요?`, '기록은 지우지 않아요. 다시 켜면 그대로 다시 보여요.', [
        { text: '취소' }, { text: '끄기', onPress: apply },
      ]);
      return;
    }
    apply();
  };
  // 금액 저장은 금액만 건드린다 — on을 true로 못박으면 방금 끈 주기를 되살린다(위 ★ 참고).
  const commitAmount = (k) => {
    const amt = Math.round(Number(String(amountInput[k]).replace(/[^\d]/g, '')) || 0);
    saveDues(d => ({ ...d, [k]: { ...d[k], amount: amt } }));
    Keyboard.dismiss();
    if (amt > 0) showToast(`${duesAmountLabel(k)}를 저장했어요`);
  };
  // 이 기간 기록만 삭제 — 명단은 그대로. 잘못 체크한 달을 통째로 지울 때.
  const removePeriod = (key) => showAppAlert(`${duesPeriodLabel(cycle, key)} 기록을 지울까요?`,
    '그 기간의 납부 체크만 지워요. 회원 명단과 다른 기간은 그대로예요.', [
    { text: '취소' },
    { text: '삭제', style: 'destructive', onPress: () => saveDues(d => {
      const periods = { ...(d.periods || {}) };
      delete periods[key];
      return { ...d, periods };
    }) },
  ]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) { showToast('모임 이름을 입력해주세요'); return; }
    setBusy(true);
    try {
      const l = await createLedger({ name, linkedCrewId: initialCrewId || null });
      setShowCreate(false); setNewName('');
      setSelId(l.id);
    } catch (e) {
      showAppAlert('만들기 실패', '잠시 후 다시 시도해주세요.');
    } finally { setBusy(false); }
  }, [newName, initialCrewId]);

  // 분류와 내용은 둘 중 하나만 쓴다 — 수입은 '회비'처럼 분류가 곧 내용이라 두 번 적게 되기 때문.
  //   custom=false면 분류 칩이 곧 내용(title은 빈 값으로 저장 → 목록이 분류 라벨을 보여준다),
  //   custom=true면 '직접 입력'으로 내용을 적은 것(새로 고르면 분류는 기타. 옛 거래를 열 땐 원래 분류를 지킨다).
  const resetAi = () => { setAiText(''); setAiBusy(false); setAiError(''); setShowPaste(false); };
  const openAdd = (type) => {
    resetAi();
    setSheet({
      editingId: null, prev: null, type, custom: false,
      amount: '', category: type === 'income' ? 'dues' : 'round',
      title: '', date: today(), memo: '', who: '',
    });
  };
  const openEdit = (e) => {
    resetAi();
    setSheet({
      editingId: e.id, prev: e, type: e.type, custom: !!e.title,
      amount: String(e.amount || ''), category: e.category || (e.type === 'income' ? 'dues' : 'etc'),
      title: e.title || '', date: e.date || today(), memo: e.memo || '', who: e.who || '',
    });
  };

  // ── 영수증·카드문자 자동입력 ────────────────────────────────
  //   ★분류(category)는 일부러 안 받는다: CF가 돌려주는 건 개인 가계부 3종(모임회비/골프장비/기타)이라
  //     모임 장부의 지출 5종(라운딩/식대/경조사/비품/기타)과 맞지 않는다. 총무는 어차피 칩으로 고른다.
  //   채우는 건 옮겨 적기 번거롭고 틀리면 손해나는 것 — 금액·날짜·내용뿐. 저장은 확인 후 사용자가 한다.
  const applyAi = (r) => {
    if (r.error) { setAiError(r.error); return; }
    setSheet(s => {
      if (!s) return s;
      const next = { ...s };
      if (r.amount > 0) next.amount = String(r.amount);
      if (r.date) next.date = r.date;
      if (r.memo) { next.title = r.memo; next.custom = true; }   // 읽어온 문구는 '직접 입력' 내용으로
      return next;
    });
    setAiText('');       // 채운 뒤 비움 — 아래 프리필된 값을 확인하도록
    setShowPaste(false);
  };
  const handleAiText = async () => {
    const t = aiText.trim();
    if (!t || aiBusy) return;
    Keyboard.dismiss();
    setAiBusy(true); setAiError('');
    const r = await extractExpenseFromText(t);
    setAiBusy(false);
    applyAi(r);
  };
  const handleAiReceipt = async (source) => {
    if (aiBusy) return;
    Keyboard.dismiss();
    let uri = null;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setAiError('카메라 권한이 필요해요'); return; }
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
        if (res.canceled || !res.assets?.length) return;
        uri = res.assets[0].uri;
      } else {
        let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { setAiError('사진 접근 권한이 필요해요'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (res.canceled || !res.assets?.length) return;
        uri = res.assets[0].uri;
      }
    } catch (e) { setAiError('사진을 불러오지 못했어요'); return; }
    setAiBusy(true); setAiError('');
    const r = await extractExpenseFromImage(uri);
    setAiBusy(false);
    applyAi(r);
  };

  const saveSheet = useCallback(async () => {
    if (!sheet || !selId) return;
    const amt = Math.round(Number(String(sheet.amount).replace(/[^\d]/g, '')) || 0);
    if (amt <= 0) { showToast('금액을 입력해주세요'); return; }
    if (sheet.custom && !String(sheet.title || '').trim()) { showToast('내용을 입력해주세요'); return; }
    Keyboard.dismiss();
    setBusy(true);
    try {
      const data = {
        type: sheet.type, amount: amt, category: sheet.category,
        // 분류 칩으로 고른 거래는 title을 비워 둔다 — 목록이 분류 라벨을 그대로 보여주므로 같은 말을 두 번 저장하지 않는다.
        title: sheet.custom ? String(sheet.title || '').trim() : '',
        date: sheet.date || today(), memo: sheet.memo,
        who: sheet.type === 'income' ? sheet.who : '',
      };
      if (sheet.editingId) await updateEntry(selId, sheet.editingId, data, sheet.prev);
      else await addEntry(selId, data);
      setSheet(null);
    } catch (e) {
      showAppAlert('저장 실패', '잠시 후 다시 시도해주세요.');
    } finally { setBusy(false); }
  }, [sheet, selId]);

  const removeEntry = useCallback((e) => {
    showAppAlert('이 거래를 삭제할까요?', `${e.title || ledgerCatLabel(e.type, e.category)} · ${fmtWon(e.amount)}원`, [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteEntry(selId, e.id, e); setSheet(null); }
        catch { showToast('삭제에 실패했어요'); }
      } },
    ]);
  }, [selId]);

  const removeLedger = useCallback(() => {
    if (!sel) return;
    showAppAlert('이 모임 장부를 삭제할까요?', `'${sel.name}'의 모든 거래가 함께 삭제돼요. 되돌릴 수 없어요.`, [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteLedger(sel.id); goList(); }
        catch { showToast('삭제에 실패했어요'); }
      } },
    ]);
  }, [sel, goList]);

  // ── 목록 뷰 ────────────────────────────────────────────────
  if (!selId && !showCreate) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, marginBottom: 16, lineHeight: 19 }}>
            모임 통장을 관리해요. 회비가 들어오면 수입, 쓰면 지출으로 기록하면 잔액이 자동으로 계산돼요.
          </Text>
          {!loaded ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}><Spinner /></View>
          ) : loadErr ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.textSecondary, marginBottom: 4 }}>목록을 불러오지 못했어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, textAlign: 'center', lineHeight: 18 }}>
                방금 기능을 켰다면 잠깐(1~5분) 준비 중일 수 있어요.{'\n'}잠시 후 화면을 나갔다 다시 들어와 주세요.
              </Text>
            </View>
          ) : ledgers.length === 0 ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.textSecondary, marginBottom: 4 }}>아직 만든 모임 장부가 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary }}>아래에서 첫 모임 장부를 만들어보세요</Text>
            </View>
          ) : ledgers.map(l => {
            // 걷은 회비는 거래로 저장하지 않으므로 잔액·수입에 더해서 보여준다(utils의 ★ 참고)
            const lDues = totalDuesCollected(l.dues);
            return (
            <TouchableOpacity key={l.id} activeOpacity={0.8} onPress={() => setSelId(l.id)}
              style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, flex: 1 }} numberOfLines={1}>{l.name}</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(18), color: C.textSecondary }}>›</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10, gap: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>잔액</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: ((l.balance || 0) + lDues) < 0 ? RED : C.charcoal }}>
                  {fmtWon((l.balance || 0) + lDues)}원
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: SAGE }}>수입 {fmtWon((l.incomeTotal || 0) + lDues)}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: RED }}>지출 {fmtWon(l.expenseTotal)}</Text>
              </View>
            </TouchableOpacity>
            );
          })}
          <TouchableOpacity activeOpacity={0.85} onPress={() => { setNewName(''); setShowCreate(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: SAGE, borderRadius: 12, paddingVertical: 14, marginTop: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>＋ 새 모임 장부</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── 새 장부 만들기 폼 ───────────────────────────────────────
  if (showCreate) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={() => { setShowCreate(false); if (initialCrewId) onClose && onClose(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4, marginRight: 6 }}>
            <Text style={{ fontSize: fs(24), color: C.charcoal }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>새 모임 장부</Text>
        </View>
        <Text style={label}>모임 이름</Text>
        <AppTextInput value={newName} onChangeText={setNewName} placeholder="예: 수요골프회"
          placeholderTextColor={C.warmGray} style={boxInput} maxLength={30} />
        <TouchableOpacity activeOpacity={0.85} onPress={handleCreate} disabled={busy}
          style={{ backgroundColor: SAGE, borderRadius: 12, paddingVertical: 14, marginTop: 20, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{busy ? '만드는 중…' : '만들기'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 회원 회비 뷰 (상세 안에서 진입) — 걷는 회비 설정 + 기간 이동 + 명단 + 그 기간 납부 체크 ──
  //   ★켠 주기만 보여준다: 월만 켜면 월별 정산 화면만, 연만 켜면 연회비 관리 화면만, 둘 다면 탭으로 전환.
  if (selId && duesView) {
    const sum = summarizeDues(dues, cycle, curPeriod);
    const members = sum.roster;   // 그 기간 대상자만 — 나중에 들어온 회원은 지난 달에 안 나오고, 나간 회원은 이번 달에 안 나온다
    const pastPeriods = listDuesPeriods(dues, cycle).filter(p => p.key !== curPeriod);
    const setupOpen = showDuesSetup || onCycles.length === 0;   // 아직 아무것도 안 켰으면 설정부터 펼친다
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
          <TouchableOpacity onPress={() => { setDuesView(false); setDuesPeriod(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4 }}>
            <Text style={{ fontSize: fs(24), color: C.charcoal }}>←</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginLeft: 6 }}>
            {onCycles.length === 0 ? '회원 회비' : duesCycleTitle(cycle)}
          </Text>
          {onCycles.length > 0 && (
            <TouchableOpacity onPress={() => setShowDuesSetup(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: setupOpen ? C.charcoal : C.warmGray }}>회비 설정</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* 걷는 회비 — 월·연 각각 켠다(둘 중 하나만 걷는 모임도, 둘 다 걷는 모임도 있다).
              켠 것만 아래 화면에 나오므로, 안 걷는 회비는 눈에 띄지 않는다. */}
          {setupOpen && (
            <View style={{ backgroundColor: '#fff', borderRadius: 14,
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, marginBottom: 20 }}>
              <Text style={[label, { marginBottom: 4 }]}>어떤 회비를 걷나요?</Text>
              {DUES_CYCLES.map(c => {
                const on = dues[c.key].on;
                return (
                  <View key={c.key} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                    <TouchableOpacity onPress={() => toggleCycle(c.key)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                        borderColor: on ? SAGE : C.warmGray, backgroundColor: on ? SAGE : 'transparent',
                        alignItems: 'center', justifyContent: 'center' }}>
                        {on && <Icon name="check" size={fs(12)} color="#fff" strokeWidth={2.6} />}
                      </View>
                      <Text style={{ flex: 1, fontFamily: on ? F.sysB : F.sysM, fontSize: fs(15), color: on ? C.charcoal : C.warmGray }}>
                        {c.label}
                      </Text>
                      {!on && <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>안 걷음</Text>}
                    </TouchableOpacity>
                    {/* 1인 회비 — 켠 주기에만 금액칸이 나온다 */}
                    {on && (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10, marginLeft: 33 }}>
                        <AppTextInput value={amountInput[c.key]} onChangeText={(v) => setAmountInput(s => ({ ...s, [c.key]: v.replace(/[^\d]/g, '') }))}
                          onEndEditing={() => commitAmount(c.key)} placeholder={duesAmountLabel(c.key)} placeholderTextColor={C.warmGray}
                          keyboardType="number-pad" style={[boxInput, { flex: 1, paddingVertical: 10 }]} />
                        <TouchableOpacity onPress={() => commitAmount(c.key)} activeOpacity={0.85}
                          style={{ backgroundColor: SAGE, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>저장</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {onCycles.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, textAlign: 'center', lineHeight: 19 }}>
                걷는 회비를 먼저 골라주세요.{'\n'}고른 회비만 아래에서 관리해요.
              </Text>
            </View>
          ) : (
          <>
          {/* 월·연 둘 다 걷는 모임에서만 전환 탭 — 하나만 걷으면 탭 자체가 없다 */}
          {onCycles.length > 1 && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 20, marginBottom: 16 }}>
              {DUES_CYCLES.filter(c => dues[c.key].on).map(c => {
                const on = cycle === c.key;
                return (
                  <TouchableOpacity key={c.key} onPress={() => { setDuesTab(c.key); setDuesPeriod(null); }} activeOpacity={0.7}
                    style={{ paddingTop: 2, paddingBottom: 8, borderBottomWidth: 2.5, borderBottomColor: on ? C.charcoal : 'transparent' }}>
                    <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(on ? 17 : 14.5), letterSpacing: 0.2,
                      color: on ? C.charcoal : C.textSecondary }}>{c.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* 기간 이동 — 지난 달(해)로 넘겨 그때 납부를 그대로 볼 수 있다. 새 기간은 전원 미납에서 시작 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setDuesPeriod(shiftDuesPeriod(cycle, curPeriod, -1))}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: fs(20), color: C.textSecondary }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, minWidth: fs(96), textAlign: 'center' }}>
              {duesPeriodLabel(cycle, curPeriod)}
            </Text>
            <TouchableOpacity onPress={() => setDuesPeriod(shiftDuesPeriod(cycle, curPeriod, 1))}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: fs(20), color: C.textSecondary }}>›</Text>
            </TouchableOpacity>
          </View>
          {!isThisPeriod && (
            <TouchableOpacity onPress={() => setDuesPeriod(null)} activeOpacity={0.7} style={{ alignSelf: 'center', marginBottom: 12 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SAGE }}>
                {cycle === 'yearly' ? '올해로' : '이번 달로'} 돌아가기
              </Text>
            </TouchableOpacity>
          )}

          {/* 요약 — 이 기간 완료/미납/걷힌. 위에 지금 적용 중인 1인 회비를 한 줄로 알려준다 */}
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, textAlign: 'center', marginBottom: 12 }}>
            {duesAmountLabel(cycle)} {fmtWon(sum.amount)}원
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {[['완료', `${sum.paidCount}/${sum.total}`, SAGE], ['미납', `${sum.unpaidCount}명`, RED], ['걷힌 금액', `${fmtWon(sum.collected)}`, C.charcoal]].map(([k, v, col]) => (
              <View key={k} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary }}>{k}</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: col, marginTop: 3 }}>{v}</Text>
              </View>
            ))}
          </View>

          {/* 크루원 불러오기 — 크루에서 들어온 장부에만, 아직 안 넣은 사람이 있을 때만 */}
          {crewNamesToAdd.length > 0 && (
            <TouchableOpacity onPress={importCrewMembers} activeOpacity={0.85}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12,
                backgroundColor: 'rgba(94,126,66,0.12)', borderRadius: 12, paddingVertical: 12 }}>
              <Icon name="crew" size={fs(16)} color={SAGE} strokeWidth={2} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: SAGE }}>
                크루원 {crewNamesToAdd.length}명 명단에 넣기
              </Text>
            </TouchableOpacity>
          )}

          {/* 회원 추가 — 명단은 기간과 무관하게 계속 남는다 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <AppTextInput value={newMember} onChangeText={setNewMember} onSubmitEditing={addMember}
              placeholder="회원 이름 추가" placeholderTextColor={C.warmGray} style={[boxInput, { flex: 1 }]} maxLength={20} returnKeyType="done" />
            <TouchableOpacity onPress={addMember} activeOpacity={0.85}
              style={{ backgroundColor: C.charcoal, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>추가</Text>
            </TouchableOpacity>
          </View>

          {/* 회원 리스트 — 행 탭하면 이 기간 미납↔완료 토글 */}
          {members.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, textAlign: 'center', lineHeight: 19 }}>
                회원을 추가하고, 회비를 낸 사람을{'\n'}이름 탭해서 완료로 체크하세요
              </Text>
            </View>
          ) : members.map(m => {
            const paid = sum.paidSet.has(m.id);
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <TouchableOpacity onPress={() => toggleMember(m.id)} activeOpacity={0.7}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
                    borderColor: paid ? SAGE : C.warmGray, backgroundColor: paid ? SAGE : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {paid && <Icon name="check" size={fs(13)} color="#fff" strokeWidth={2.6} />}
                  </View>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{m.name}</Text>
                  {/* 이미 나간 사람인데 그때 낸 기록이 있어 이 기간에만 보이는 경우 */}
                  {!isMemberIn(m, cycle, curPeriod) && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>탈퇴</Text>
                  )}
                </TouchableOpacity>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: paid ? SAGE : RED }}>{paid ? '완료' : '미납'}</Text>
                {/* 삭제 — 옆 '완료/미납' 글자와 붙어 오탭되던 것을 padding으로 떼어 놓는다(터치 영역도 함께 커진다) */}
                <TouchableOpacity onPress={() => removeMember(m.id)} activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 14, paddingVertical: 6 }}>
                  <Icon name="close" size={fs(17)} color={C.warmGray} />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* 지난 기간 기록 — 접어뒀다 펼친다. 행 탭하면 그 기간으로 이동, ✕는 그 기간 기록만 삭제 */}
          {pastPeriods.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <TouchableOpacity onPress={() => setShowPastPeriods(v => !v)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textSecondary }}>
                  지난 기록 {pastPeriods.length}건
                </Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textSecondary }}>{showPastPeriods ? '접기' : '보기'}</Text>
              </TouchableOpacity>
              {showPastPeriods && pastPeriods.map(p => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <TouchableOpacity onPress={() => setDuesPeriod(p.key)} activeOpacity={0.7} style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{p.label}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 3 }}>
                      완료 {p.paidCount}/{p.total}명 · {fmtWon(p.collected)}원
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removePeriod(p.key)} activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 14, paddingVertical: 6 }}>
                    <Icon name="close" size={fs(17)} color={C.warmGray} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          </>
          )}
        </ScrollView>
        <AppAlertHost />
      </View>
    );
  }

  // ── 상세 뷰 (잔액 + 기간별 거래) ────────────────────────────
  const cats = sheet?.type === 'income' ? LEDGER_INCOME_CATEGORIES : LEDGER_EXPENSE_CATEGORIES;

  // 보고 있는 기간 — 주기를 바꾸면 키 모양이 달라지므로 그때는 이번 기간으로 되돌린다(회비 화면과 같은 규칙).
  const curView = (viewPeriod && (viewCycle === 'yearly') === !viewPeriod.includes('.'))
    ? viewPeriod : duesPeriodKey(viewCycle);
  const isThisView = curView === duesPeriodKey(viewCycle);
  // 그 기간 거래만 — 날짜가 'YYYY.MM.DD'라 앞자리로 자르면 그대로 걸러진다.
  //   ★여기는 위쪽 조건부 return들(목록·만들기·회비 화면) 뒤라서 훅을 쓰면 안 된다 —
  //     화면마다 훅 개수가 달라져 상세로 들어가는 순간 터진다. 한 장부의 거래라 그냥 걸러도 가볍다.
  const viewEntries = entries.filter(
    e => String(e.date || '').slice(0, viewCycle === 'yearly' ? 4 : 7) === curView);
  const viewIncome = viewEntries.filter(e => e.type === 'income').reduce((a, e) => a + (e.amount || 0), 0);
  const viewExpense = viewEntries.filter(e => e.type === 'expense').reduce((a, e) => a + (e.amount || 0), 0);
  const viewDues = duesCollectedIn(dues, curView);   // 그 기간에 걷은 회비(거래엔 없는 돈)

  // 연말정산 — 그 해를 달별로 접어서 쌓는다. 거래나 회비가 있는 달만(빈 달까지 12줄 늘어놓지 않는다).
  //   월별 보기는 이미 한 달치뿐이라 접을 게 없어 그대로 목록으로 둔다.
  const monthRows = viewCycle !== 'yearly' ? null : (() => {
    const map = {};
    viewEntries.forEach(e => { const k = String(e.date).slice(0, 7); (map[k] = map[k] || []).push(e); });
    Object.keys(dues.periods).forEach(k => {          // 거래는 없고 회비만 걷은 달도 한 줄로 보여준다
      if (k.startsWith(`${curView}.`)) map[k] = map[k] || [];
    });
    return Object.keys(map).sort().reverse().map(k => {
      const list = map[k];
      const income = list.filter(e => e.type === 'income').reduce((a, e) => a + (e.amount || 0), 0);
      const expense = list.filter(e => e.type === 'expense').reduce((a, e) => a + (e.amount || 0), 0);
      const mDues = duesCollectedIn(dues, k);
      return { key: k, label: `${Number(k.split('.')[1])}월`, list, income: income + mDues, expense, dues: mDues };
    });
  })();

  // ── 카톡 내역서 내보내기 ────────────────────────────────────
  //   기본은 그 기간 전부 선택. 회원에게 안 알리고 싶은 줄(개인 경조사 등)만 빼고 보낸다.
  const openExport = () => {
    if (!viewEntries.length && viewDues <= 0) { showToast('내보낼 내역이 없어요'); return; }
    setExportPick({ ids: viewEntries.map(e => e.id), dues: viewDues > 0 });
  };
  const toggleExport = (id) => setExportPick(p => ({
    ...p, ids: p.ids.includes(id) ? p.ids.filter(x => x !== id) : [...p.ids, id],
  }));
  // 고른 내역으로 글 만들기 — 공유·복사가 같은 글을 쓰도록 한 군데서만 만든다. 보낼 게 없으면 null.
  const composeExport = () => {
    if (!exportPick) return null;
    const picked = viewEntries.filter(e => exportPick.ids.includes(e.id));
    // 회비 줄 — 월 보기면 그 달, 연 보기면 그 해 전체를 한 줄로. 인원은 그 기간 요약에서 가져온다.
    let duesLine = null;
    if (exportPick.dues && viewDues > 0) {
      const s = summarizeDues(dues, viewCycle, curView);
      duesLine = { label: duesPeriodLabel(viewCycle, curView) + ' 회비', collected: viewDues,
        paidCount: s.paidCount, total: s.total };
    }
    if (!picked.length && !duesLine) { showToast('보낼 내역을 하나 이상 골라주세요'); return null; }
    // 연말정산은 달별 요약으로 — 한 해 거래를 낱개로 붙이면 글이 너무 길어진다.
    //   회비는 위 [회비] 줄에서 한 번만 세므로 월별 수입에는 넣지 않는다(이중 집계 방지).
    const months = viewCycle !== 'yearly' ? null : (monthRows || []).map(m => {
      const mine = m.list.filter(e => exportPick.ids.includes(e.id));
      return {
        label: m.label,
        income: mine.filter(e => e.type === 'income').reduce((a, e) => a + (e.amount || 0), 0),
        expense: mine.filter(e => e.type === 'expense').reduce((a, e) => a + (e.amount || 0), 0),
      };
    }).filter(m => m.income > 0 || m.expense > 0);
    return buildLedgerText({
      name: sel?.name, periodLabel: duesPeriodLabel(viewCycle, curView), entries: picked, dues: duesLine, months,
    });
  };
  const sendExport = async () => {
    const message = composeExport();
    if (!message) return;
    setExportPick(null);
    try { await Share.share({ message }); } catch (e) { /* 사용자가 공유창을 닫은 경우 — 조용히 */ }
  };
  // 복사 — 공유창을 거치지 않고 바로 클립보드로. 크루 게시글·메모에 그대로 붙여넣으려는 용도.
  const copyExport = () => {
    const message = composeExport();
    if (!message) return;
    Clipboard.setString(message);
    setExportPick(null);
    showToast('내역서를 복사했어요 · 붙여넣기 하세요');
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
        <TouchableOpacity onPress={goList} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(24), color: C.charcoal }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginLeft: 6 }} numberOfLines={1}>
          {sel?.name || '회비 장부'}
        </Text>
        <TouchableOpacity onPress={removeLedger} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6 }}>
          <Icon name="trash" size={fs(20)} color={C.warmGray} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
        {/* 잔액 카드 — 걷은 회비는 거래로 남지 않으므로 여기서 더해 보여준다.
            거래 목록엔 안 보이는 돈이라, 회비가 있으면 수입 칸에 '회비 N원 포함'을 밝혀 둔다. */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 18 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary }}>현재 잔액</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(30), color: ((sel?.balance || 0) + duesTotal) < 0 ? RED : C.charcoal, marginTop: 4 }}>
            {fmtWon((sel?.balance || 0) + duesTotal)}원
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: SAGE_SOFT, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: SAGE }}>수입</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: SAGE, marginTop: 2 }}>{fmtWon((sel?.incomeTotal || 0) + duesTotal)}</Text>
              {duesTotal > 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: SAGE, marginTop: 3 }}>회비 {fmtWon(duesTotal)} 포함</Text>
              )}
            </View>
            <View style={{ flex: 1, backgroundColor: RED_SOFT, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: RED }}>지출</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: RED, marginTop: 2 }}>{fmtWon(sel?.expenseTotal)}</Text>
            </View>
          </View>
        </View>

        {/* 회원 회비 진입 — 걷는 회비만 줄로 보여준다. 월만 걷으면 월별 정산 한 줄, 둘 다 걷으면 두 줄.
            제목은 하나만 걷으면 그 이름('월별 정산'/'연회비 관리'), 둘 다·아직 안 정했으면 '회원 회비'. */}
        <TouchableOpacity activeOpacity={0.8}
          onPress={() => {
            setAmountInput({ monthly: String(dues.monthly.amount || ''), yearly: String(dues.yearly.amount || '') });
            setDuesPeriod(null); setShowDuesSetup(false); setDuesView(true);
          }}
          style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
              {onCycles.length === 1 ? duesCycleTitle(onCycles[0]) : '회원 회비'}
            </Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(18), color: C.textSecondary }}>›</Text>
          </View>
          {onCycles.length > 0 && (dues.members || []).length > 0 ? onCycles.map(k => {
            const s = summarizeDues(dues, k);
            return (
              <Text key={k} style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SAGE, marginTop: 6 }}>
                {duesPeriodLabel(k, duesPeriodKey(k))} · 완료 {s.paidCount}/{s.total}명 · 걷힌 {fmtWon(s.collected)}원{s.unpaidCount > 0 ? ` · 미납 ${s.unpaidCount}명` : ''}
              </Text>
            );
          }) : (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 6 }}>
              {onCycles.length === 0
                ? '월 회비·연회비 중 걷는 것만 골라 관리하세요'
                : '회원을 추가하고 납부를 체크하세요'}
            </Text>
          )}
        </TouchableOpacity>

        {/* 월별 / 연말정산 — 회비 화면의 기간 넘기기와 같은 조작. 여기서 고른 기간이 아래 목록·내보내기에 그대로 쓰인다 */}
        {/* 고른 탭은 글자도 커진다(걷기/회비 장부 탭과 같은 규칙). 크기가 달라도 밑줄이 어긋나지 않게 flex-end 정렬 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 20, marginBottom: 10 }}>
          {[['monthly', '월별'], ['yearly', '연말정산']].map(([k, lbl]) => {
            const on = viewCycle === k;
            return (
              <TouchableOpacity key={k} onPress={() => { setViewCycle(k); setViewPeriod(null); }} activeOpacity={0.7}
                style={{ paddingTop: 2, paddingBottom: 8, borderBottomWidth: 2.5, borderBottomColor: on ? C.charcoal : 'transparent' }}>
                <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(on ? 17 : 14.5), letterSpacing: 0.2,
                  color: on ? C.charcoal : C.textSecondary }}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => setViewPeriod(shiftDuesPeriod(viewCycle, curView, -1))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: fs(20), color: C.textSecondary }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, minWidth: fs(96), textAlign: 'center' }}>
            {duesPeriodLabel(viewCycle, curView)}
          </Text>
          <TouchableOpacity onPress={() => setViewPeriod(shiftDuesPeriod(viewCycle, curView, 1))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: fs(20), color: C.textSecondary }}>›</Text>
          </TouchableOpacity>
        </View>
        {!isThisView && (
          <TouchableOpacity onPress={() => setViewPeriod(null)} activeOpacity={0.7} style={{ alignSelf: 'center', marginBottom: 10 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SAGE }}>
              {viewCycle === 'yearly' ? '올해로' : '이번 달로'} 돌아가기
            </Text>
          </TouchableOpacity>
        )}

        {/* 이 기간 요약 — 회비는 거래에 없는 돈이라 수입에 더해 넣고 따로 밝혀 둔다 */}
        <View style={{ backgroundColor: '#fff', borderRadius: 14,
          paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
          {[
            ['수입', viewIncome + viewDues, SAGE, viewDues > 0 ? `회비 ${fmtWon(viewDues)} 포함` : ''],
            ['지출', viewExpense, RED, ''],
          ].map(([k, v, col, sub]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
              {/* 라벨 폭은 '남은 돈'(4글자)이 한 줄에 들어가는 크기로. numberOfLines로 줄바꿈도 막는다 */}
              <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, width: fs(56) }}>{k}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: col }}>{fmtWon(v)}원</Text>
              {!!sub && <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginLeft: 8 }}>{sub}</Text>}
            </View>
          ))}
          <View style={{ height: 0.5, backgroundColor: C.hairline, marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text numberOfLines={1} style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal, width: fs(56) }}>남은 돈</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: (viewIncome + viewDues - viewExpense) < 0 ? RED : C.charcoal }}>
              {fmtWon(viewIncome + viewDues - viewExpense)}원
            </Text>
          </View>
        </View>

        {/* 연말정산 — 달별로 접어서 쌓는다. 줄을 누르면 그 달 거래가 펼쳐진다. */}
        {monthRows ? (
          monthRows.length === 0 ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary }}>
                {duesPeriodLabel(viewCycle, curView)}에 기록이 없어요
              </Text>
            </View>
          ) : monthRows.map(m => {
            const open = openMonths.includes(m.key);
            return (
              <View key={m.key} style={{ borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => setOpenMonths(v => v.includes(m.key) ? v.filter(x => x !== m.key) : [...v, m.key])}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, width: fs(14) }}>{open ? '▾' : '▸'}</Text>
                  <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>{m.label}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: SAGE }}>+{fmtWon(m.income)}</Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: RED, marginTop: 2 }}>−{fmtWon(m.expense)}</Text>
                  </View>
                </TouchableOpacity>
                {open && (
                  <View style={{ paddingLeft: fs(22), paddingBottom: 6 }}>
                    {m.dues > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                        <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }}>회비</Text>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: SAGE }}>+{fmtWon(m.dues)}</Text>
                      </View>
                    )}
                    {m.list.length === 0 && m.dues === 0 ? (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, paddingVertical: 10 }}>기록이 없어요</Text>
                    ) : m.list.map(e => (
                      <TouchableOpacity key={e.id} activeOpacity={0.7} onPress={() => openEdit(e)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>
                            {e.title || ledgerCatLabel(e.type, e.category)}
                          </Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 2 }}>
                            {[e.date, e.title ? ledgerCatLabel(e.type, e.category) : null, e.who].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: e.type === 'income' ? SAGE : RED }}>
                          {e.type === 'income' ? '+' : '−'}{fmtWon(e.amount)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        ) : viewEntries.length === 0 ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary }}>
              {duesPeriodLabel(viewCycle, curView)}에 기록한 거래가 없어요
            </Text>
          </View>
        ) : viewEntries.map(e => (
          <TouchableOpacity key={e.id} activeOpacity={0.7} onPress={() => openEdit(e)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
              borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14.5), color: C.charcoal }} numberOfLines={1}>
                {e.title || ledgerCatLabel(e.type, e.category)}
              </Text>
              {/* 분류로 고른 거래는 제목이 이미 분류 라벨이라, 아랫줄에 또 쓰지 않는다 */}
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 3 }}>
                {[e.date, e.title ? ledgerCatLabel(e.type, e.category) : null, e.who].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: e.type === 'income' ? SAGE : RED }}>
              {e.type === 'income' ? '+' : '−'}{fmtWon(e.amount)}
            </Text>
          </TouchableOpacity>
        ))}

        {/* 카톡 내역서 — 회원들에게 "이 달 이렇게 썼습니다"를 보낸다 */}
        <TouchableOpacity activeOpacity={0.85} onPress={openExport}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20,
            backgroundColor: C.bgSecondary, borderRadius: 12, paddingVertical: 13 }}>
          <Icon name="share" size={fs(16)} color={C.charcoal} strokeWidth={1.8} />
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>내역서 카톡으로 보내기</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 하단 고정 입력 바 — 스크롤과 무관하게 항상 보임. 하단 네비바 여백은 부모 SafeAreaView가 처리하므로
          여기선 시각 여백만(insets 이중 방지). 수입/지출을 바로 선택. */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10,
        paddingBottom: 12, backgroundColor: C.bgPrimary, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => openAdd('income')}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SAGE, borderRadius: 12, paddingVertical: 14 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>＋ 수입</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} onPress={() => openAdd('expense')}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: RED, borderRadius: 12, paddingVertical: 14 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>－ 지출</Text>
        </TouchableOpacity>
      </View>

      {/* 내역서에 넣을 것 고르기 — 기본은 전부 켜짐. 회원에게 안 알릴 줄만 꺼서 보낸다.
          입력칸이 없어 키보드 처리는 필요 없다(거래 시트와 달리 단순 Modal). */}
      <Modal visible={!!exportPick} transparent animationType="slide" onRequestClose={() => setExportPick(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1, minHeight: 50 }} activeOpacity={1} onPress={() => setExportPick(null)} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 22, borderTopRightRadius: 22, flexShrink: 1 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>
                {duesPeriodLabel(viewCycle, curView)} 내역서
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 4 }}>
                보낼 내역만 남기고 체크를 꺼주세요{'\n'}복사하면 크루 게시글에 그대로 붙여넣을 수 있어요
              </Text>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, minHeight: exportBody ? 0 : 120 }}>
              {/* 목록은 다음 틱에 — 항목이 많으면 여는 순간 슬라이드가 끊긴다(위 ★ 지연 마운트) */}
              {!exportBody ? null : <>
              {/* 회비 한 줄 — 개별 거래가 아니라 그 기간 회비 전체 */}
              {viewDues > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setExportPick(p => ({ ...p, dues: !p.dues }))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12,
                    borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                    borderColor: exportPick?.dues ? SAGE : C.warmGray, backgroundColor: exportPick?.dues ? SAGE : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {exportPick?.dues && <Icon name="check" size={fs(12)} color="#fff" strokeWidth={2.6} />}
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>회비</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: SAGE }}>+{fmtWon(viewDues)}</Text>
                </TouchableOpacity>
              )}
              {viewEntries.map(e => {
                const on = !!exportPick?.ids.includes(e.id);
                return (
                  <TouchableOpacity key={e.id} activeOpacity={0.7} onPress={() => toggleExport(e.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12,
                      borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                      borderColor: on ? SAGE : C.warmGray, backgroundColor: on ? SAGE : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" size={fs(12)} color="#fff" strokeWidth={2.6} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: on ? C.charcoal : C.warmGray }} numberOfLines={1}>
                        {e.title || ledgerCatLabel(e.type, e.category)}
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 2 }}>{e.date}</Text>
                    </View>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: e.type === 'income' ? SAGE : RED }}>
                      {e.type === 'income' ? '+' : '−'}{fmtWon(e.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </>}
            </ScrollView>
            {/* 전체 선택은 위에 한 줄, 내보내기는 아래 두 갈래.
                복사 = 공유창을 안 거치고 바로 클립보드로(크루 게시글에 붙여넣기). 보내기 = 공유창(카톡·문자 등). */}
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
              <TouchableOpacity onPress={() => setExportPick(p => ({
                ...p,
                ids: p.ids.length === viewEntries.length ? [] : viewEntries.map(e => e.id),
                dues: p.ids.length === viewEntries.length ? false : viewDues > 0,
              }))} activeOpacity={0.8} style={{ alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 6 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: SAGE }}>
                  {exportPick?.ids.length === viewEntries.length ? '전체 해제' : '전체 선택'}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={copyExport} activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 14, borderRadius: 12, backgroundColor: C.bgSecondary }}>
                  <Icon name="clipboard" size={fs(16)} color={C.charcoal} strokeWidth={1.8} />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>복사</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={sendExport} activeOpacity={0.85}
                  style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 14, borderRadius: 12, backgroundColor: C.charcoal }}>
                  <Icon name="share" size={fs(16)} color="#fff" strokeWidth={1.8} />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: '#fff' }}>보내기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 거래 입력/수정 시트 — RN Modal은 별도 네이티브 윈도우라 자체 KeyboardProvider가 필요하다.
          ★하단 시트는 '스크롤'만으론 부족하다: 시트가 화면 아래에 붙어 있어 키보드가 통째로 덮는다.
            KeyboardAvoidingView(behavior=padding)로 시트 자체를 키보드 위로 올리고,
            내용이 길어질 때만 안쪽 ScrollView가 스크롤한다(CrewComposeScreen과 같은 패턴).
            시트는 flexShrink로 남는 공간 안에서 줄어든다 — 키보드가 올라와도 화면을 넘지 않게. */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1, minHeight: 50 }} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setSheet(null); }} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 22, borderTopRightRadius: 22, flexShrink: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag">
            {/* 수입/지출 토글 */}
            <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 12, padding: 4, marginBottom: 18 }}>
              {['income', 'expense'].map(t => (
                <TouchableOpacity key={t} activeOpacity={0.8}
                  onPress={() => { resetAi(); setSheet(s => ({ ...s, type: t, category: t === 'income' ? 'dues' : 'round', custom: false, title: '' })); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9,
                    backgroundColor: sheet?.type === t ? (t === 'income' ? SAGE : RED) : 'transparent' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14),
                    color: sheet?.type === t ? '#fff' : C.warmGray }}>{t === 'income' ? '수입' : '지출'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 아래부터는 다음 틱에 — 여는 순간 한꺼번에 붙으면 슬라이드가 덜컥거린다(위 ★ 지연 마운트).
                토글까지는 즉시 보여 시트가 빈 채로 올라오지 않게 한다. */}
            {!sheetBody ? <View style={{ height: 220 }} /> : <>

            {/* 영수증·카드문자 자동입력 — 지출에만. 회비 수입은 회원 명단 체크로 관리하고, 이체 문자는
                형식이 제각각이라 이득이 적다. 분류는 AI가 아니라 아래 칩에서 총무가 고른다(주석 ★ 참고). */}
            {sheet?.type === 'expense' && (
              <View style={{ marginBottom: 20, borderRadius: 16,
                backgroundColor: 'rgba(201,168,76,0.08)', padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD_DEEP, alignItems: 'center', justifyContent: 'center' }}>
                    {aiBusy ? <Spinner size={16} color="#FFFFFF" /> : <Icon name="sparkle" size={15} color="#FFFFFF" strokeWidth={1.8} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>영수증·카드문자로 자동입력</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 1 }}>
                      {aiBusy ? 'AI가 내용을 읽고 있어요...' : '금액·날짜·내용을 채워드려요 (분류는 직접 골라주세요)'}
                    </Text>
                  </View>
                </View>

                {aiBusy ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12,
                    paddingVertical: 22, borderRadius: 12, backgroundColor: '#FFFFFF' }}>
                    <Spinner size={20} color={GOLD_DEEP} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD_DEEP }}>AI가 내용을 읽고 있어요...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {[
                      { key: 'camera', icon: 'camera', label: '촬영', onPress: () => handleAiReceipt('camera') },
                      { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => handleAiReceipt('gallery') },
                      { key: 'paste', icon: 'clipboard', label: '붙여넣기', onPress: () => setShowPaste(v => !v) },
                    ].map(m => {
                      const active = m.key === 'paste' && showPaste;
                      return (
                        <TouchableOpacity key={m.key} activeOpacity={0.8} onPress={m.onPress}
                          style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12,
                            backgroundColor: active ? 'rgba(201,168,76,0.18)' : '#FFFFFF' }}>
                          <Icon name={m.icon} size={21} color={GOLD_DEEP} strokeWidth={1.8} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>{m.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {showPaste && !aiBusy && (
                  <View style={{ marginTop: 10 }}>
                    <AppTextInput value={aiText} onChangeText={(v) => { setAiText(v); if (aiError) setAiError(''); }} multiline
                      placeholder={'카드결제 문자나 “OO CC 그린피 32만원”처럼 복사해서 붙여넣어 주세요'}
                      placeholderTextColor={C.warmGray}
                      style={{ minHeight: 70, maxHeight: 150, backgroundColor: '#FFFFFF',
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, textAlignVertical: 'top' }} />
                    <TouchableOpacity activeOpacity={0.85} disabled={!aiText.trim()} onPress={handleAiText}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
                        backgroundColor: aiText.trim() ? GOLD_DEEP : C.hairline, borderRadius: 12, paddingVertical: 12 }}>
                      <Icon name="sparkle" size={16} color={aiText.trim() ? '#FFFFFF' : C.warmGray} strokeWidth={1.8} />
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: aiText.trim() ? '#FFFFFF' : C.warmGray }}>붙여넣은 내용으로 자동입력</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!!aiError && !aiBusy && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: RED, marginTop: 9 }}>{aiError}</Text>
                )}
              </View>
            )}

            {/* 분류 — 칩이 곧 내용이다. 따로 적고 싶을 때만 마지막 '직접 입력' 칩을 골라 쓴다(내용칸 따로 없음).
                고르는 게 먼저라 키보드가 바로 올라오지 않게 금액 autoFocus는 두지 않는다. */}
            <Text style={label}>분류</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cats.map(c => {
                const on = !sheet?.custom && sheet?.category === c.key;
                const tint = sheet?.type === 'income' ? SAGE : RED;
                return (
                  <TouchableOpacity key={c.key} activeOpacity={0.8}
                    onPress={() => setSheet(s => ({ ...s, category: c.key, custom: false, title: '' }))}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
                      backgroundColor: on ? tint : C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: on ? '#fff' : C.warmGray }}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity activeOpacity={0.8}
                onPress={() => setSheet(s => ({ ...s, custom: true, category: 'etc' }))}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
                  backgroundColor: sheet?.custom ? (sheet?.type === 'income' ? SAGE : RED) : C.bgSecondary }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: sheet?.custom ? '#fff' : C.warmGray }}>직접 입력</Text>
              </TouchableOpacity>
            </View>
            {sheet?.custom && (
              <AppTextInput value={sheet?.title} onChangeText={(v) => setSheet(s => ({ ...s, title: v }))}
                placeholder={sheet?.type === 'income' ? '예: 총무 대납분' : '예: OO CC 그린피'}
                placeholderTextColor={C.warmGray} style={[boxInput, { marginTop: 10 }]} maxLength={40} autoFocus />
            )}

            {/* 금액 */}
            <Text style={[label, { marginTop: 16 }]}>금액</Text>
            <AppTextInput value={sheet?.amount} onChangeText={(v) => setSheet(s => ({ ...s, amount: v.replace(/[^\d]/g, '') }))}
              placeholder="0" placeholderTextColor={C.warmGray} keyboardType="number-pad" style={boxInput} />

            {/* 낸 사람 (수입만) */}
            {sheet?.type === 'income' && (
              <>
                <Text style={[label, { marginTop: 16 }]}>낸 사람 (선택)</Text>
                <AppTextInput value={sheet?.who} onChangeText={(v) => setSheet(s => ({ ...s, who: v }))}
                  placeholder="예: 김총무 외 3명" placeholderTextColor={C.warmGray} style={boxInput} maxLength={40} />
              </>
            )}

            {/* 날짜 */}
            <Text style={[label, { marginTop: 16 }]}>날짜</Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowDate(true)} style={boxInput}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: C.charcoal }}>{sheet?.date || today()}</Text>
            </TouchableOpacity>
            {showDate && (
              <DateTimePicker value={parseYmd(sheet?.date)} mode="date" display="spinner" locale="ko"
                onChange={(ev, d) => {
                  setShowDate(Platform.OS === 'ios' ? true : false);
                  if (ev.type === 'set' && d) setSheet(s => ({ ...s, date: ymd(d) }));
                }} />
            )}
            {showDate && Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setShowDate(false)} style={{ alignSelf: 'flex-end', padding: 8 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: SAGE }}>완료</Text>
              </TouchableOpacity>
            )}

            {/* 액션 */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              {sheet?.editingId && (
                <TouchableOpacity onPress={() => removeEntry(sheet.prev)} activeOpacity={0.8}
                  style={{ paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: RED }}>삭제</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={saveSheet} disabled={busy} activeOpacity={0.85}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12,
                  backgroundColor: sheet?.type === 'income' ? SAGE : RED, opacity: busy ? 0.6 : 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{busy ? '저장 중…' : '저장'}</Text>
              </TouchableOpacity>
            </View>
            </>}
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
        </KeyboardProvider>
      </Modal>

      <AppAlertHost />
    </View>
  );
}
