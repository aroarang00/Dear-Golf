import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
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
import { UserContext } from '../contexts/UserContext';
import { roundsOnly } from '../utils/diaryKind';
import { buildCompanionNames } from '../utils/scheduleCompanions';   // companions + 전파 그룹(친구초대) 보강
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadFriendData } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { Icon } from './common/Icon';
import { SettlementGuideModal } from './SettlementGuideModal';   // 이용 안내 — 라운지 안내와 같은 패턴
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  SETTLE_KINDS, settleKindLabel, PAY_PENDING, PAY_CLAIMED, PAY_CONFIRMED,
  splitEvenly, summarize, toggleMemberStatus, buildSettlementText, buildReminderText,
  subscribeMySettlements, createSettlement, updateSettlement, deleteSettlement, setSettlementArchived,
  computeSettlement, RECEIPT_MAX, newShareToken,
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
const foot = { fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', marginTop: 10, lineHeight: 18 };
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
  const [showGuide, setShowGuide] = useState(false); // 이용 안내

  const myUid = useCurrentUid();
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey(k => k + 1), []);

  // 화면이 떠 있는 동안 실시간 구독 — 참가자가 웹에서 '보냈어요'를 누르면 바로 뜬다.
  //   한 번 읽고 끝이면 서버가 바뀌어도 화면이 그대로다(사용자 2026-07-22).
  useEffect(() => {
    if (!visible || !myUid) return undefined;
    setLoading(true); setFailed(false);
    const unsub = subscribeMySettlements(myUid,
      (rows) => { setList(rows); setLoading(false); setFailed(false); },
      (e) => { console.warn('[정산] 구독 실패', e?.code, e?.message); setLoading(false); setFailed(true); });
    return unsub;
  }, [visible, myUid, reloadKey]);

  useEffect(() => {
    if (!visible) return;
    setOpenId(null); setComposing(false);
  }, [visible]);

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

  // 치우기 — 보관과 삭제를 갈라서 묻는다. 끝난 걸 목록에서 안 보이게 하고 싶은 것과
  //   데이터를 없애고 싶은 것은 다른 일이고, 지운 건 되살릴 수 없다(사용자 2026-07-22).
  const remove = (s) => {
    const head = [s.course, s.date].filter(Boolean).join(' · ');
    showAppAlert('이 걷기를 어떻게 할까요?', head, [
      { text: '취소', style: 'cancel' },
      { text: '보관하기', onPress: async () => {
        patchLocal(s.id, { archived: true });
        try { await setSettlementArchived(s.id, true); }
        catch (e) { patchLocal(s.id, { archived: false }); showToast('보관하지 못했어요'); }
      } },
      { text: '삭제', style: 'destructive', onPress: () => {
        showAppAlert('정말 지울까요?', '입금 체크한 내용까지 사라지고 되돌릴 수 없어요.', [
          { text: '취소', style: 'cancel' },
          { text: '지우기', style: 'destructive', onPress: async () => {
            const before = list;
            setList(prev => prev.filter(x => x.id !== s.id));
            try { await deleteSettlement(s.id); }
            catch (e) { setList(before); showToast('삭제하지 못했어요'); }
          } },
        ]);
      } },
    ]);
  };

  // 보관 — 상세에서 바로. 목록으로 돌아가 치워진 걸 보여준다(어디로 갔는지 알 수 있게).
  const archive = async (s) => {
    patchLocal(s.id, { archived: true });
    setOpenId(null);
    showToast('보관함으로 옮겼어요');
    try { await setSettlementArchived(s.id, true); }
    catch (e) { patchLocal(s.id, { archived: false }); showToast('보관하지 못했어요'); }
  };

  // 보관 해제 — 보관함에서 되돌린다
  const unarchive = async (s) => {
    patchLocal(s.id, { archived: false });
    try { await setSettlementArchived(s.id, false); }
    catch (e) { patchLocal(s.id, { archived: true }); showToast('되돌리지 못했어요'); }
  };

  // ★한 단계만 뒤로 — 헤더 '‹'와 안드로이드 하드웨어 뒤로가기가 같은 길로 가야 한다.
  //   전에는 onRequestClose가 곧장 onClose여서, 걷기를 만들다 뒤로 한 번 누르면 적어둔 요구사항·
  //   첨부한 영수증까지 통째로 날아갔다(안드에서만 나는 사고 — iOS엔 하드웨어 뒤로가기가 없다).
  //   안내 시트가 떠 있으면 그것부터 닫는다. 시트가 자기 onRequestClose로 이미 닫혀도,
  //   여기까지 이벤트가 내려올 경우 showGuide가 아직 true라 모달을 통째로 닫는 걸 막아준다.
  // 작성 중에 적어둔 게 있으면 한 번 묻는다 — 요구사항을 쓰고 영수증을 3장 골라둔 상태에서
  //   뒤로가기가 한 번 잘못 눌리면 전부 처음부터다. 빈 화면일 땐 묻지 않는다(귀찮기만 하다).
  const composeDirty = useRef(false);
  const goBack = () => {
    if (showGuide) { setShowGuide(false); return; }
    if (composing) {
      const leave = () => { composeDirty.current = false; setComposing(false); };
      if (composeDirty.current) {
        showAppAlert('작성 중인 내용이 사라져요', '적어둔 내용과 첨부한 영수증은 저장되지 않아요.', [
          { text: '계속 쓰기', style: 'cancel' },
          { text: '나가기', style: 'destructive', onPress: leave },
        ]);
        return;
      }
      leave(); return;
    }
    if (openId) { setOpenId(null); return; }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack} transparent={false}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom']}>
            {/* 헤더 — 상세/작성 중이면 뒤로, 아니면 닫기 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              {/* 뒤로/닫기 — Icon 맵에 chevron·close가 없어 가계부와 같은 기호 문자를 쓴다(이모지 아님) */}
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={goBack}>
                <Text style={{ fontSize: fs(20), color: C.charcoal, width: fs(22) }}>
                  {(composing || openId) ? '‹' : '✕'}
                </Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                {composing ? '걷기 만들기' : current ? (current.course || '걷기') : '모임 정산'}
              </Text>
              {/* 안내 — 라운지와 같은 관례(book 아이콘 + 시트). 걷기는 총무가 카톡으로 하던 일을 옮긴
                  것이라 "앱으로 하면 뭐가 달라지는지"를 모르면 만들다 만다.
                  뒤로 버튼과 같은 폭을 차지해 제목이 가운데를 유지한다. */}
              <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: fs(22), alignItems: 'flex-end' }}>
                <Icon name="book" size={fs(19)} color={C.charcoal} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            {composing ? (
              <ComposeView onCancel={() => setComposing(false)} dirtyRef={composeDirty}
                onCreated={(s) => { setList(prev => [s, ...prev]); setComposing(false); setOpenId(s.id); }} />
            ) : current ? (
              <DetailView s={current} onSave={(patch) => save(current.id, patch)}
                onArchive={() => archive(current)}
                onDeleted={() => { setList(prev => prev.filter(x => x.id !== current.id)); setOpenId(null); }} />
            ) : (
              <ListView list={list} loading={loading} failed={failed} onRetry={load}
                onOpen={setOpenId} onNew={() => setComposing(true)}
                onDelete={remove} onUnarchive={unarchive} />
            )}

            {/* ★안내 시트는 이 모달 '안'에 중첩한다 — 형제로 두면 iOS에서 둘 다 안 뜬다
                ([[ios-modal-stacking]]). 라운지는 화면이라 형제로 둬도 되지만 여기는 모달 안이다. */}
            <SettlementGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
          </SafeAreaView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

// ── 목록 ──────────────────────────────────────────────────────
function ListView({ list, loading, failed, onRetry, onOpen, onNew, onDelete, onUnarchive }) {
  const [showArchive, setShowArchive] = useState(false);
  const live = (list || []).filter(s => !s.archived);
  const archived = (list || []).filter(s => s.archived);
  const shown = showArchive ? archived : live;
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
      {!showArchive && (
        <TouchableOpacity onPress={onNew} activeOpacity={0.85}
          style={{ backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>+ 걷기 만들기</Text>
        </TouchableOpacity>
      )}

      {shown.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 8 }}>
            {showArchive ? '보관한 걷기가 없어요' : '아직 걷기가 없어요'}
          </Text>
          {!showArchive && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 19 }}>
              이름만 적으면 됩니다{'\n'}동반자가 앱을 안 써도 정산서는 카톡으로 보낼 수 있어요
            </Text>
          )}
        </View>
      ) : shown.map(s => {
        const sum = summarize(s.members);
        const done = sum.count > 0 && sum.confirmedCount === sum.count;
        return (
          // 끝난 정산은 톤을 낮춰 진행 중인 것과 구분하고, 카드에서 바로 지울 수 있게 한다
          //   (총무가 어차피 손으로 체크하는 구조라 '끝났으니 치우기'가 마지막 동작이다 — 사용자 2026-07-22).
          <View key={s.id} style={[box, { marginBottom: 10, opacity: done ? 0.72 : 1 }]}>
            <TouchableOpacity onPress={() => onOpen(s.id)} activeOpacity={0.8} style={{ padding: 15 }}>
              {/* 버튼을 같은 줄 안에 둔다 — 절대배치로 띄웠더니 '선입금'과 줄이 안 맞고,
                  '되돌리기'처럼 폭이 달라지면 여백 계산도 매번 어긋났다(사용자 2026-07-22). */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }} numberOfLines={1}>
                  {s.course || '이름 없는 걷기'}
                </Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD }}>{settleKindLabel(s.kind)}</Text>
                <TouchableOpacity onPress={() => (showArchive ? onUnarchive(s) : onDelete(s))} activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
                  style={{ marginLeft: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: showArchive ? fs(11.5) : fs(15), color: C.warmGray }}>
                    {showArchive ? '되돌리기' : '⋯'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray }}>{s.date}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }}>
                  {won(sum.total)}원
                </Text>
                {done ? (
                  <View style={{ backgroundColor: '#6B8B5E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#FFFFFF' }}>정산 완료</Text>
                  </View>
                ) : (
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#6B1E2A' }}>
                    {sum.confirmedCount}/{sum.count} 입금
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        );
      })}

      {/* 보관함 — 보관한 게 있을 때만. 지운 게 아니라 치워둔 것이라 언제든 되돌릴 수 있다 */}
      {(archived.length > 0 || showArchive) && (
        <TouchableOpacity onPress={() => setShowArchive(v => !v)} activeOpacity={0.7}
          style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>
            {showArchive ? '← 진행 중인 걷기 보기' : `보관함 ${archived.length}`}
          </Text>
        </TouchableOpacity>
      )}
    </KeyboardAwareScrollView>
  );
}

// ── 새로 만들기 ───────────────────────────────────────────────
// ── 새로 만들기 ───────────────────────────────────────────────
// ★입력칸을 채우게 하지 않는다(사용자 2026-07-22: "구장명 따로 날짜 따로 명단 따로, 뭐가 다 따로입력인데").
//   구장·날짜·명단은 이미 일정/기록에 있으니 라운딩만 고르면 따라온다. 금액은 카드문자·영수증을 AI가 읽는다.
//   손으로 치는 경로는 '직접 입력'으로 남긴다 — 일정 없이 급히 걷을 때가 있다.
function ComposeView({ onCancel, onCreated, dirtyRef }) {
  const { schedules } = useContext(SchedulesContext);
  const { diaries } = useContext(DiariesContext);
  const { userProfile } = useContext(UserContext);
  const myUid = useCurrentUid();
  // 명단은 buildCompanionNames가 나(총무)를 빼고 준다 — 걷는 대상은 남들이니 맞다. 다만 식사 1/n은
  //   총무 몫도 나눠야 총액÷N이 맞다(빼면 남들이 총무 몫까지 더 낸다). 그래서 식사정산에선 나를 명단에
  //   더한다. 선입금은 각자 내는 거라 나를 넣지 않는다. → '나 포함' 토글(식사 기본 ON, 선입금 숨김).
  const myName = (userProfile?.nickname || '').trim() || '나';

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
  const [includeSelf, setIncludeSelf] = useState(false);   // 식사 1/n에 나(총무)도 포함할지
  const [total, setTotal] = useState('');
  const [perHead, setPerHead] = useState('');
  const [account, setAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState('');      // 카드문자·정산 메시지 붙여넣기
  const [instr, setInstr] = useState('');      // 총무 요구사항 — "김이사는 빼줘" 같은 자연어(기본은 1/n·100원 올림)
  const [showPaste, setShowPaste] = useState(false);
  const [photos, setPhotos] = useState([]);    // 첨부한 영수증 URI — 계산할 때 문자와 함께 보낸다
  const [aiMembers, setAiMembers] = useState(null); // AI가 계산한 사람별 금액(있으면 이걸 쓴다)
  const [aiItems, setAiItems] = useState([]);   // AI가 읽은 품목별 내역(그린피·식사…)
  const [aiNote, setAiNote] = useState('');    // 계산 근거 한 줄 — 총무가 검산할 수 있게
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // 뒤로가기가 잘못 눌렸을 때 물어볼지 판단할 신호 — 손으로 적었거나 영수증을 골랐을 때만 true.
  //   부모(goBack)가 읽는다. 상태로 올리면 타이핑마다 부모가 다시 그려져 ref로 둔다.
  useEffect(() => {
    if (!dirtyRef) return;
    dirtyRef.current = !!(paste.trim() || instr.trim() || photos.length > 0 || total || perHead);
  }, [dirtyRef, paste, instr, photos, total, perHead]);

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
    const meal = o.when === 'past';
    setKind(meal ? 'meal' : 'prepay');
    setIncludeSelf(meal);   // 식사정산이면 나도 1/n에 포함(기본), 선입금이면 제외
  };

  // 명단은 namesText(남들) + 토글 켜면 나(총무). namesText를 더럽히지 않고 여기서만 더해,
  //   토글을 끄면 바로 빠지고 이름 겹침도 막는다(수동으로 내 이름을 이미 적었으면 중복 안 넣음).
  //   식사=나눗셈 분모(÷N)가 나로 인해 맞춰지고, 선입금=남들 금액은 그대로고 내 행만 '냈음'으로 붙는다.
  const selfName = myName.slice(0, 20);
  const names = useMemo(() => {
    const base = parseNames(namesText);
    if (includeSelf && selfName && !base.some(n => n.name === selfName)) {
      return [...base, { id: 'm_self', name: selfName, amount: 0, status: PAY_PENDING }];
    }
    return base;
  }, [namesText, includeSelf, selfName]);
  // 저장할 때 내 행은 '확인'으로 — 총무는 이미 냈으니(식사는 전액 선결제, 선입금은 내 몫) 독촉·남은금액에서 빠진다.
  const selfWasAdded = includeSelf && !!selfName && !parseNames(namesText).some(n => n.name === selfName);

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

    // ★uid가 없는 옛 기록은 이름으로만 남아 있어 uid 대조가 안 통한다. 그래서 친구가 가진 모든 표기
    //   (내 별명·닉네임·실명)를 uid로 되짚는 표를 만든다 — 기록의 '이정아'(실명)와 친구 '설레인'(닉네임)이
    //   같은 사람인데 따로 뜨던 문제(사용자 2026-07-22). 동명이인은 한 사람으로 합쳐지지만,
    //   한 모임 안에 같은 이름이 둘이면 어차피 이름만으로 구분이 안 된다.
    const aliasToUid = new Map();
    friends.forEach(f => {
      [f.customName, f.nickname, f.name, f.realName].forEach(a => {
        const t = String(a || '').trim();
        if (t && !aliasToUid.has(t)) aliasToUid.set(t, f.id);
      });
    });

    const count = new Map();   // key(uid 또는 이름) → { label, n }
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

  // 정산서에 남길 계산 근거 한 줄 — 화면에 보여주는 값과 저장하는 값이 갈리면 안 되므로 한 곳에서 만든다.
  const noteFrom = (r) => (r?.fallback
    ? (r.note ? r.note + ' · ' : '') + '이름을 못 맞춰 1/n으로 나눴어요'
    : (r?.note || ''));

  // AI 결과 반영 — 사람별 금액을 그대로 쓴다(요구사항까지 반영된 값). 계산 근거는 note로 보여준다.
  const applyAi = (r) => {
    if (r?.error) { setAiError(r.error); return; }
    setAiMembers(r.members || null);
    setAiItems(r.items || []);
    setAiNote(noteFrom(r));
    setTotal(''); setPerHead('');   // 직접 입력값이 남아 AI 결과를 덮지 않게
    setPaste(''); setAiError('');
    // 계좌도 붙여넣은 내용에서 정리해준다. 이미 적어둔 계좌가 있으면 덮지 않는다.
    //   저장 목록에 없는 새 계좌를 채웠으면 입력칸을 펴서 보이게 한다 — 접힌 채 값만 바뀌면 뭘 쓰는지 모른다.
    if (r.account && !account.trim()) {
      setAccount(r.account);
      if (!savedAccounts.some(a => accKey(a.account) === accKey(r.account))) setEditAccount(true);
    }
    if (r.accountName && !accountName.trim()) setAccountName(r.accountName);
  };
  // 영수증은 '첨부'만 한다 — 고른 즉시 계산하지 않는다. 문자와 함께 한 번에 읽혀야 합산이 맞는다.
  const addPhotos = async (source) => {
    if (aiBusy) return;
    Keyboard.dismiss();
    let picked = [];
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setAiError('카메라 권한이 필요해요'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      picked = [res.assets[0].uri];
    } else {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setAiError('사진 접근 권한이 필요해요'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: RECEIPT_MAX,
      });
      if (res.canceled || !res.assets?.length) return;
      picked = res.assets.map(a => a.uri);
    }
    setPhotos(prev => {
      const next = [...prev, ...picked].slice(0, RECEIPT_MAX);
      if (prev.length + picked.length > RECEIPT_MAX) setAiError(`영수증은 ${RECEIPT_MAX}장까지예요`);
      else setAiError('');
      return next;
    });
  };

  const submit = async () => {
    if (saving || aiBusy) return;
    if (names.length === 0) { showToast('참가자가 없어요'); return; }
    Keyboard.dismiss();

    // ★계산과 시작을 한 버튼으로 합쳤다(사용자 2026-07-22). 전에는 'AI로 계산'을 누르고 다시
    //   '걷기 시작'을 눌러야 했는데, 계산을 건너뛰면 아무 일도 안 일어난 것처럼 보였다(본인도 걸림).
    //   이제 적어둔 게 있으면 시작 한 번에 계산까지 하고, 결과가 틀리면 상세에서 고친다.
    // ★AI 결과는 전부 '지역 변수'로 받는다. applyAi()는 화면을 갱신할 뿐이고 setState는 이 함수가
    //   끝난 뒤에야 반영되므로, 저장에 state를 그대로 쓰면 낡은 값이 나간다. 실제로 건별 내역과
    //   계좌가 이렇게 빠져나갔다(사용자 2026-07-22). 저장 경로는 응답값만 본다.
    let ready = members;
    let sum = sumAmount;
    let items = aiItems;
    let note = aiNote;
    let acc = account;
    let accName = accountName;

    if (paste.trim() || instr.trim() || photos.length > 0) {
      // 칸에 직접 적어둔 금액도 함께 넘긴다 — 총액만 칸에 넣고 "김이사는 빼줘"를 적는 총무가 있다.
      //   안 넘기면 AI가 금액을 못 찾아 요구사항이 통째로 무시된다.
      const manualLine = Number(perHead) > 0 ? `1인당 ${won(perHead)}원`
        : Number(total) > 0 ? `총액 ${won(total)}원` : '';
      setAiBusy(true);
      const r = await computeSettlement({
        text: [paste, manualLine].filter(Boolean).join('\n'),
        uris: photos, names, instruction: instr, kind,
      });
      setAiBusy(false);
      if (r?.error) {
        // 직접 입력한 금액이 있으면 그걸로라도 만든다 — 여기서 막으면 총무가 갇힌다.
        if (sum <= 0) { setAiError(r.error); return; }
      } else {
        applyAi(r);
        ready = r.members || [];
        sum = ready.reduce((a, m) => a + (m.amount || 0), 0);
        items = r.items || [];
        note = noteFrom(r);
        // 붙여넣은 문자에서 뽑은 계좌 — 총무가 직접 적은 게 있으면 그걸 이긴다(applyAi와 같은 규칙).
        if (r.account && !acc.trim()) acc = r.account;
        if (r.accountName && !accName.trim()) accName = r.accountName;
      }
    }
    if (sum <= 0) { setAiError('금액이 비어 있어요. 붙여넣거나 직접 입력해주세요'); return; }

    // 내가 명단에 더해졌으면 내 행은 '확인'으로 저장 — 총무는 이미 냈으니 독촉·남은금액에서 빠진다.
    //   selfWasAdded일 때만 selfName과 이름이 겹치는 건 내 행 하나뿐이라(겹치면 애초에 안 더함) 안전하다.
    if (selfWasAdded) ready = ready.map(m => (m.name === selfName ? { ...m, status: PAY_CONFIRMED } : m));

    setSaving(true);
    try {
      const s = await createSettlement({
        kind,
        course: manual ? mCourse : (src?.course || ''),
        date: (manual ? mDate : src?.date) || today(),
        members: ready, total: sum, account: acc, accountName: accName,
        items, note,   // '자세히' 정산서에 건별 내역·계산 근거로 붙는다
      });
      rememberAccount(acc, accName);
      onCreated(s);
    } catch (e) { showToast('저장하지 못했어요'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} bottomOffset={24}>
      {/* 1 — 어떤 라운딩. 고르면 구장·날짜·명단이 따라온다 */}
      <Text style={sec}>어떤 라운딩인가요</Text>
      {/* 고르고 나면 나머지 카드는 감춘다 — 남겨두면 뭘 고른 건지 헷갈린다(사용자 2026-07-22).
          고른 카드만 남기고, 바꾸려면 아래 '다른 라운딩 고르기'로 다시 편다. */}
      {(src || manual ? options.filter(o => src?.key === o.key) : options).map(o => {
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
      {manual && (
        <View style={[box, { paddingHorizontal: 16, paddingVertical: 14 }]}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>직접 입력</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 5 }}>
            목록에 없는 라운딩을 직접 적어요
          </Text>
        </View>
      )}
      <TouchableOpacity activeOpacity={0.7}
        onPress={() => {
          if (src || manual) { setSrc(null); setManual(false); }   // 다시 고르기 — 카드를 펼친다
          else setManual(true);
        }}
        style={{ paddingVertical: 13, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5),
          color: (src || manual) ? C.warmGray : '#6B1E2A' }}>
          {(src || manual) ? '다른 라운딩 고르기' : '직접 입력하기'}
        </Text>
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
                    setKind(k.key); setAiMembers(null); setAiItems([]); setAiNote(''); setTotal(''); setPerHead('');
                    setIncludeSelf(k.key === 'meal');   // 식사로 바꾸면 나 포함 켜기, 아니면 끄기
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

          {/* 나 포함 — 식사정산 1/n은 총무 몫도 나눠야 총액÷N이 맞다(빼면 남들이 총무 몫까지 더 냄).
              선입금은 남들 금액은 그대로고, 명단에 나를 넣어 '나도 냈다'를 정산서에 보여준다(사용자 2026-07-23).
              어느 쪽이든 내 행은 '확인'으로 저장돼 독촉·남은금액에서 빠진다. */}
          <TouchableOpacity onPress={() => setIncludeSelf(v => !v)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14,
              backgroundColor: C.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 11,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: includeSelf ? '#6B1E2A' : 'transparent',
              borderWidth: includeSelf ? 0 : 1.5, borderColor: C.warmGray }}>
              {includeSelf && <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>
                나({myName})도 {kind === 'meal' ? '1/n에 포함' : '명단에 넣기'}
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>
                {kind === 'meal'
                  ? (includeSelf ? `총 ${names.length}명으로 나눠요` : '나를 빼고 나눠요 (남들이 내 몫까지 더 냄)')
                  : (includeSelf ? '나도 낸 걸로 정산서에 표시돼요' : '나는 명단에서 빠져요')}
              </Text>
            </View>
          </TouchableOpacity>

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
                : ['김이사는 술 안 마셔서 빼줘', '점심은 3명, 저녁은 전원', '천원 단위로 올려줘']
              ).map(ex => (
                <Text key={ex} style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, lineHeight: fs(18) }}>
                  · {ex}
                </Text>
              ))}
            </View>
            {/* 기본 규칙을 밝혀둔다 — 총무 관행은 100원 절사지만 그러면 버린 만큼을 총무가 떠안는다.
                기본을 올림으로 바꾼 이상 말없이 바꾸면 안 된다(사용자 2026-07-22). 절사도 여전히 되고,
                요구사항 칸에 "100원 절사"라고 쓰면 그대로 버린다. */}
            {kind !== 'prepay' && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 8, lineHeight: fs(17) }}>
                따로 안 적으면 1/n 하고 100원 단위로 올려요{'\n'}
                남는 잔돈은 정산서에 그대로 밝혀지고, "100원 절사"라고 적으면 버립니다
              </Text>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 9, lineHeight: fs(16) }}>
              카드 문자·계좌번호를 같이 붙여넣으면 금액과 계좌까지 정리해드려요{'\n'}
              1차·2차처럼 여러 건이면 문자를 이어서 붙여넣거나, 영수증을 {RECEIPT_MAX}장까지 골라주세요
            </Text>

            {/* 금액 출처 — 촬영 / 갤러리 / 붙여넣기 (가계부와 동일 3분할) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {[
                { key: 'camera', icon: 'camera', label: '촬영', onPress: () => addPhotos('camera') },
                { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => addPhotos('gallery') },
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

            {/* 첨부한 영수증 — 고른 즉시 계산하지 않고 여기 쌓아뒀다가 문자와 함께 한 번에 보낸다 */}
            {photos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {photos.map((uri, i) => (
                  <TouchableOpacity key={uri} activeOpacity={0.7}
                    onPress={() => setPhotos(prev => prev.filter(x => x !== uri))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF',
                      borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP }}>영수증 {i + 1}</Text>
                    <Text style={{ fontSize: fs(12), color: C.warmGray }}>✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {showPaste && !aiBusy && (
              <AppTextInput value={paste} onChangeText={v => { setPaste(v); if (aiError) setAiError(''); }} multiline
                placeholder={'카드결제 문자나 정산 메시지를 붙여넣어 주세요'}
                placeholderTextColor={C.warmGray}
                style={{ minHeight: fs(70), backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, textAlignVertical: 'top',
                  fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
            )}

            {/* ★계산 버튼을 두지 않는다(사용자 2026-07-22) — 적어놓고 '걷기 시작'을 누르면 그때 계산한다.
                버튼을 따로 두면 안 누르고 넘어가서 아무 일도 안 일어난 것처럼 보였다. 대신 어디를 눌러야
                하는지는 말해줘야 한다 — 입력칸만 있고 누를 게 없으면 그것대로 막힌 것처럼 보인다. */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: GOLD_DEEP, marginTop: 12,
              textAlign: 'center', lineHeight: fs(17) }}>
              적어두면 맨 아래 '걷기 시작'을 누를 때 한 번에 계산해드려요
            </Text>

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

          {/* 계산까지 겸하므로 누른 뒤 몇 초가 걸린다 — 버튼 안에서 스피너를 돌려 '먹통'으로 안 보이게 한다 */}
          <TouchableOpacity onPress={submit} activeOpacity={0.85} disabled={saving || aiBusy}
            style={{ marginTop: 28, backgroundColor: (saving || aiBusy) ? C.warmGray : '#6B1E2A', borderRadius: 14,
              paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {(saving || aiBusy) && <Spinner size={15} color={C.butter} />}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>
              {aiBusy ? '계산하고 있어요…' : saving ? '만드는 중…' : '걷기 시작'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAwareScrollView>
  );
}
// ── 상세 (입금 체크) ──────────────────────────────────────────
function DetailView({ s, onSave, onDeleted, onArchive }) {
  const sum = useMemo(() => summarize(s.members), [s.members]);
  const allDone = sum.count > 0 && sum.confirmedCount === sum.count;

  // 이름 탭 → 입금 확정 토글. 총무가 은행앱 보면서 하나씩 찍는 동작.
  const tapMember = (memberId) => onSave({ members: toggleMemberStatus(s.members, memberId) });

  // 수정 — AI가 영수증을 잘못 읽거나 금액이 틀릴 수 있어 만든 뒤에도 손볼 수 있어야 한다(사용자 2026-07-22).
  //   편집 중에는 원본을 건드리지 않고 초안(draft)에만 쓰고, 저장할 때 한 번에 반영한다.
  const [editing, setEditing] = useState(false);
  const [dItems, setDItems] = useState([]);
  const [dMembers, setDMembers] = useState([]);

  const startEdit = () => {
    setDItems((s.items || []).map(i => ({ label: i.label || '', amount: String(i.amount || '') })));
    setDMembers((s.members || []).map(m => ({ ...m, amount: String(m.amount || '') })));
    setEditing(true);
  };
  const saveEdit = () => {
    const items = dItems
      .map(i => ({ label: i.label.trim(), amount: Math.max(0, parseInt(i.amount, 10) || 0) }))
      .filter(i => i.label && i.amount > 0);
    const members = dMembers.map(m => ({ ...m, amount: Math.max(0, parseInt(m.amount, 10) || 0) }));
    if (members.length === 0) { showToast('참가자가 없어요'); return; }
    // total은 사람별 금액의 합 — 화면 요약과 정산서 합계가 어긋나면 안 된다
    onSave({ items, members, total: members.reduce((a, m) => a + m.amount, 0) });
    setEditing(false);
  };

  // 정산서에 내역을 넣을지는 모임마다 다르다(사용자 2026-07-22) — 총무가 고르고, 그 선택을 기억한다.
  const [detail, setDetail] = useState(true);
  useEffect(() => { storage.load(STORAGE_KEYS.settlementDetail, true).then(v => setDetail(v !== false)); }, []);
  const setDetailKeep = (v) => { setDetail(v); storage.save(STORAGE_KEYS.settlementDetail, v); };

  // 링크 도입 전에 만든 걷기는 토큰이 없다. 보낼 때 만들면 미리보기에는 링크가 없고 실제로는
  //   붙어서 나가 둘이 어긋난다 — 화면에서 쓸 토큰을 먼저 정해두고 보낼 때 문서에 저장한다.
  const pendingTokenRef = useRef(null);
  const shareDoc = useMemo(() => {
    if (s.shareToken) return s;
    if (!pendingTokenRef.current) pendingTokenRef.current = newShareToken();
    return { ...s, shareToken: pendingTokenRef.current };
  }, [s]);

  // 보낼 것 — 정산서(전원) / 독촉(안 낸 사람만). 안 낸 사람이 없으면 독촉은 아예 없다.
  const [mode, setMode] = useState('full');
  const remindText = useMemo(() => buildReminderText(shareDoc), [shareDoc]);
  const canRemind = remindText.length > 0;
  // 독촉을 보고 있는 사이 마지막 한 명을 확인하면 독촉이 사라진다 — 빈 미리보기에 머무르지 않게 되돌린다.
  useEffect(() => { if (!canRemind) setMode('full'); }, [canRemind]);

  const sendKakao = async () => {
    if (!s.shareToken) onSave({ shareToken: shareDoc.shareToken });
    const message = mode === 'remind' ? remindText : buildSettlementText(shareDoc, { detail });
    try { await Share.share({ message }); }
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
          {editing ? (
            <>
              <TouchableOpacity onPress={() => setEditing(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginRight: 16 }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#6B1E2A' }}>저장</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={startEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal, marginRight: 16 }}>수정</Text>
              </TouchableOpacity>
              {/* 보관 — 목록에서 치우되 데이터는 남는다. 여기 없으면 '어디서 보관하지?'가 된다 */}
              <TouchableOpacity onPress={onArchive} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal, marginRight: 16 }}>보관</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray }}>삭제</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal }}>{won(sum.total)}원</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), marginTop: 8,
          color: allDone ? '#6B8B5E' : '#6B1E2A' }}>
          {allDone ? '전원 입금 완료' : `${sum.confirmedCount}/${sum.count} 입금 · ${won(sum.remain)}원 남음`}
        </Text>
      </View>

      {/* 건별 내역 — 카드문자 가맹점명 그대로("1차 복돌이식당"). 정산서 '내역 넣기'에 이대로 나간다 */}
      {editing ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={label}>내역 — AI가 잘못 읽었으면 고치세요</Text>
          {dItems.map((i, idx) => (
            <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <AppTextInput value={i.label} placeholder="상호명"
                onChangeText={t => setDItems(p => p.map((x, k) => (k === idx ? { ...x, label: t } : x)))}
                style={[box, { flex: 1.6, paddingHorizontal: 12, paddingVertical: 11,
                  fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }]} />
              <AppTextInput value={i.amount} placeholder="금액" keyboardType="number-pad"
                onChangeText={t => setDItems(p => p.map((x, k) => (k === idx ? { ...x, amount: t.replace(/[^0-9]/g, '') } : x)))}
                style={[box, { flex: 1, paddingHorizontal: 12, paddingVertical: 11,
                  fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }]} />
              <TouchableOpacity onPress={() => setDItems(p => p.filter((_, k) => k !== idx))}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: fs(13), color: C.warmGray }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => setDItems(p => [...p, { label: '', amount: '' }])}
            activeOpacity={0.7} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: '#6B1E2A' }}>+ 내역 추가</Text>
          </TouchableOpacity>
        </View>
      ) : (Array.isArray(s.items) && s.items.length > 0 && (
        <View style={[box, { paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14 }]}>
          {s.items.map((i, idx) => (
            <View key={`${i.label}_${idx}`}
              style={{ flexDirection: 'row', paddingVertical: 5 }}>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>
                {i.label}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }}>{won(i.amount)}원</Text>
            </View>
          ))}
        </View>
      ))}

      {/* 명단 — 평소엔 탭으로 입금 확인, 수정 중엔 금액을 직접 고친다.
          '확정'보다 '확인'이 맞는 말이다 — 총무가 하는 건 돈이 들어왔는지 확인하는 일(사용자 2026-07-22) */}
      {editing ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={label}>사람별 금액</Text>
          {dMembers.map((m, idx) => (
            <View key={m.id || idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14.5), color: C.charcoal }} numberOfLines={1}>
                {m.name}
              </Text>
              <AppTextInput value={m.amount} keyboardType="number-pad" placeholder="0"
                onChangeText={t => setDMembers(p => p.map((x, k) => (k === idx ? { ...x, amount: t.replace(/[^0-9]/g, '') } : x)))}
                style={[box, { width: fs(110), paddingHorizontal: 12, paddingVertical: 11, textAlign: 'right',
                  fontFamily: F.sysSb, fontSize: fs(14.5), color: C.charcoal }]} />
              <TouchableOpacity onPress={() => setDMembers(p => p.filter((_, k) => k !== idx))}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: fs(13), color: C.warmGray }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, marginTop: 6 }}>
            합계 {won(dMembers.reduce((a, m) => a + (parseInt(m.amount, 10) || 0), 0))}원
          </Text>
        </View>
      ) : (<>
      <Text style={label}>이름을 탭하면 입금 확인으로 바뀝니다</Text>
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
                {done ? '✓ 확인' : claimed ? '확인대기' : '대기'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </>)}

      {/* 계좌 — 예금주는 줄을 바꿔 적는다(카톡 정산서와 같은 모양) */}
      {!!s.account && !editing && (
        <View style={[box, { padding: 14, marginBottom: 14 }]}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal }}>{s.account}</Text>
          {!!s.accountName && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, marginTop: 3 }}>{s.accountName}</Text>
          )}
        </View>
      )}

      {/* 카톡으로 보내기 — 앱 안 깐 사람에게 가는 경로. 정산서(전원)와 독촉(안 낸 사람)이 같은 자리를 쓴다.
          수정 중에는 감춘다 — 아직 저장 안 된 값으로 미리보기를 보여주면 헷갈린다. */}
      {!editing && (
      <>

      {/* ★독촉은 총무가 제일 싫어하는 일이라 문구를 앱이 대신 쓴다(사용자 2026-07-22).
          안 낸 사람이 없으면 칩 자체를 감춘다 — 누를 일 없는 버튼은 없는 게 낫다. */}
      {canRemind && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>카톡으로 보낼 것</Text>
          {[['full', '정산서'], ['remind', `독촉 ${sum.pending.length}명`]].map(([v, l]) => {
            const on = mode === v;
            return (
              <TouchableOpacity key={v} onPress={() => setMode(v)} activeOpacity={0.7}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, marginLeft: 6,
                  backgroundColor: on ? '#6B1E2A' : C.bgSecondary }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 내역 넣기/빼기는 정산서에만 — 독촉은 이름과 금액만 짧게 나가는 게 낫다 */}
      {mode === 'full' && (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>정산서에 내역</Text>
        {/* 라벨만 보고는 뭐가 달라지는지 모른다 — 아래 미리보기로 실제 문구를 보고 고르게 한다(사용자 2026-07-22) */}
        {[[true, '넣기'], [false, '빼기']].map(([v, l]) => {
          const on = detail === v;
          return (
            <TouchableOpacity key={l} onPress={() => setDetailKeep(v)} activeOpacity={0.7}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, marginLeft: 6,
                backgroundColor: on ? '#6B1E2A' : C.bgSecondary }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      )}

      {/* 미리보기 — buildSettlementText/buildReminderText 결과를 그대로 그린다. 화면과 실제 보낼 문구가
          어긋나면 안 되므로 따로 꾸미지 않고 같은 함수의 출력을 쓴다. */}
      <View style={[box, { paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 }]}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.warmGray, marginBottom: 8 }}>
          이렇게 보내집니다
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: fs(21) }}>
          {mode === 'remind' ? remindText : buildSettlementText(shareDoc, { detail })}
        </Text>
      </View>

      <TouchableOpacity onPress={sendKakao} activeOpacity={0.85}
        style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
          {mode === 'remind' ? '카톡으로 독촉 보내기' : '카톡으로 정산서 보내기'}
        </Text>
      </TouchableOpacity>

      {/* 남은 사람 — 안 낸 사람과 '보냈다고 한 사람'은 총무가 할 일이 다르다. 한 줄에 섞어두면
          이미 보낸 사람에게까지 독촉을 보내게 된다(예전 unpaid가 그랬다). */}
      {sum.pending.length > 0 && (
        <Text style={foot}>아직 안 낸 사람: {sum.pending.map(m => m.name).join(', ')}</Text>
      )}
      {sum.claimed.length > 0 && (
        <Text style={foot}>
          보냈다고 한 사람: {sum.claimed.map(m => m.name).join(', ')}{'\n'}이름을 탭하면 확인 처리돼요
        </Text>
      )}
      </>
      )}
    </KeyboardAwareScrollView>
  );
}

