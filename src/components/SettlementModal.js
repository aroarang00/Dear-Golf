import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, Share, Keyboard } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAndroidBack } from '../hooks/useAndroidBack'; // 임베디드(모임 탭) 하드웨어 뒤로가기
import * as ImagePicker from 'expo-image-picker';
import AppTextInput from './common/AppTextInput';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { showAppAlert, AppAlertHost } from './AppAlert';   // 풀스크린 모달 안에서도 알럿이 위로 보이게 자체 호스트 장착([[ios-modal-stacking]])
import { C, F, fs } from '../constants/colors';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { Icon } from './common/Icon';
import { SettlementGuideModal } from './SettlementGuideModal';   // 이용 안내 — 라운지 안내와 같은 패턴
import { SettlementCompose } from './SettlementCompose';         // 걷기 만들기 위저드(2026-10-01 분리)
import { LedgerScreen } from './LedgerScreen';   // 회비 장부(모임 통장) — 같은 화면 안에서 탭으로 전환
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  settleKindLabel, settleTitle, PAY_CONFIRMED, PAY_CLAIMED,
  summarize, toggleMemberStatus, buildSettlementText, buildReminderText,
  subscribeMySettlements, updateSettlement, deleteSettlement, setSettlementArchived,
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
// 심플 모던 — 테두리 상자를 겹치지 않는다. 입력칸은 '채운 배경'으로만 구분하고(테두리 없음),
//   구획은 섹션 제목 + 넉넉한 여백 + 얇은 선으로 나눈다. 글자는 읽기 편한 크기로 키움(사용자 2026-07-22).
const label = { fontFamily: F.sysSb, fontSize: fs(14), color: C.textSecondary, marginBottom: 9 };
const box = { backgroundColor: C.bgSecondary, borderRadius: 12 };            // 테두리 없는 채운 칸
const foot = { fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 18 };
// 작성(만들기) 화면은 SettlementCompose.js로 분리(2026-10-01) — 계좌 중복 판정·명단 파싱 헬퍼도 그쪽에 있다.

// embedded — 모임 탭 '정산' 세그먼트로 얹힐 때 true(2026-08-26 정식 메뉴 승격):
//   Modal 래퍼·자체 Provider 없이 일반 화면으로. 헤더 ✕ 없음(목록 레벨 헤더 자체 생략 —
//   세그먼트 '정산'과 "모임 정산" 타이틀이 중복이라), 안내(book)는 걷기/회비장부 탭 줄 우측으로.
// onBack(embedded 전용) — 목록 레벨 헤더의 '‹ 모임'(대문 복귀). 모임 스트립을 폐지하고 이 화면이 한 줄 헤더로 품음(2026-09-23).
// preset — 다른 화면이 걷기 만들기를 바로 열 때 { kind, scheduleId?, fromId?, nonce }. nonce가 바뀔 때마다 새로 연다.
//   일정 시트 '선입금 걷기/정산하기'(홈·캘린더) → MeetScreen → 여기. 목록의 '이번 달 회비'도 같은 길.
export function SettlementModal({ visible, onClose, embedded = false, onBack, preset = null }) {
  const insets = useSafeAreaInsets(); // 임베디드 하단 여백(플로팅 탭바 회피)용
  const [composePreset, setComposePreset] = useState(null);   // 위저드에 넘길 시작값(없으면 종류부터)
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(null);      // null이면 목록, 아니면 상세
  const [composing, setComposing] = useState(false); // 새 걷기 만들기
  const [showGuide, setShowGuide] = useState(false); // 이용 안내
  const [tab, setTab] = useState('settle');          // 'settle'(걷기) | 'ledger'(회비 장부) — 목록 레벨에서만 전환
  const [ledgerDetail, setLedgerDetail] = useState(false);   // 회비장부 상세/만들기 진입 — 이때 정산 헤더·탭 숨김(✕/← 중복 방지)

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
    setOpenId(null); setComposing(false); setComposePreset(null);
  }, [visible]);

  // 밖에서 온 시작값 — 걷기 탭으로 바꾸고 작성 화면을 그 값으로 연다(이미 작성 중이면 새 값으로 다시 시작: key).
  useEffect(() => {
    if (!preset?.nonce) return;
    setTab('settle'); setOpenId(null); setLedgerDetail(false);
    setComposePreset(preset); setComposing(true);
  }, [preset?.nonce]);   // eslint-disable-line react-hooks/exhaustive-deps

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
    const head = [settleTitle(s), s.date].filter(Boolean).join(' · ');
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
  // 위저드 안에서 한 단계 뒤로 — 헤더 ‹·안드 뒤로가기가 먼저 이걸 부른다. 첫 화면이면 false를 돌려주고 아래 나가기로.
  const composeBack = useRef(null);
  // 회비 장부 탭은 자기 안에 목록→상세→회비 단계를 갖고 있다. 그 단계를 먼저 물어봐야
  //   상세에서 뒤로 한 번에 이 모달이 통째로 닫히지 않는다(LedgerScreen의 registerBack).
  const ledgerBack = useRef(null);
  const goBack = () => {
    if (showGuide) { setShowGuide(false); return; }
    if (tab === 'ledger' && ledgerBack.current && ledgerBack.current()) return;
    if (composing) {
      if (composeBack.current && composeBack.current()) return;
      const leave = () => { composeDirty.current = false; setComposing(false); setComposePreset(null); };
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
    if (!embedded) onClose();
  };

  // ★임베디드 안드 뒤로가기 — 모달일 땐 onRequestClose가 받지만, 임베디드는 직접 잡아야 한다.
  //   안 잡으면 작성 중 하드웨어 뒤로가기가 탭 네비게이터로 흘러 작성 내용을 잃는다(모달 시절 사고 재발 방지).
  //   목록 레벨(아무것도 안 열림)에선 비활성 — 탭 기본 뒤로가기(홈 복귀)가 자연스럽다.
  useAndroidBack(embedded && (showGuide || composing || !!openId || ledgerDetail), goBack);

  const inner = (
    <>
            {/* 헤더 — 상세/작성 중이면 뒤로, 아니면 닫기. 회비장부 상세일 땐 숨김(LedgerScreen 자체 ← 헤더와 ✕ 중복 방지).
                ★임베디드 목록 레벨에선 헤더 통째 생략 — 세그먼트 '정산'과 "모임 정산" 타이틀 중복(사용자 2026-08-26 라운지 타이틀과 같은 지적). */}
            {/* ★임베디드(2026-09-23): 모임 스트립(‹ 모임 | 정산) 폐지 → 이 헤더가 한 줄로 품는다(친구·모집·크루와 같은 규격).
                  목록 레벨 = ‹ 모임 · 정산 / 작성·상세 = ‹ · 제목 · 안내. 상태바 자리(insets.top)도 여기서 채운다.
                  전엔 작성·상세에서 스트립 밑에 이 헤더가 또 있어 두 줄로 두꺼웠다(사용자 "걷기 만들기 헤더 불필요하게 넓다"). */}
            {!(tab === 'ledger' && ledgerDetail) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: embedded ? 12 : 16,
              paddingTop: embedded ? insets.top + 6 : 12, paddingBottom: embedded ? 6 : 12,
              borderBottomWidth: (embedded && !composing && !openId) ? 0 : 0.5, borderBottomColor: C.hairline }}>
              {embedded && !composing && !openId ? (
                <>
                  <TouchableOpacity onPress={onBack} activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}>
                    <Text style={{ fontSize: fs(21), color: C.charcoal, fontWeight: '600', marginTop: -2 }}>‹</Text>
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(13.5), color: C.charcoal, opacity: 0.85 }}>모임</Text>
                  </TouchableOpacity>
                  <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginLeft: 6 }}>정산</Text>
                </>
              ) : (
                <>
                  {/* 뒤로/닫기 — Icon 맵에 chevron·close가 없어 가계부와 같은 기호 문자를 쓴다(이모지 아님) */}
                  <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={goBack}>
                    <Text style={{ fontSize: fs(20), color: C.charcoal, width: fs(22) }}>
                      {(composing || openId) ? '‹' : '✕'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                    {composing ? '걷기 만들기' : current ? (settleTitle(current) || '걷기') : (tab === 'ledger' ? '회비 장부' : '모임 정산')}
                  </Text>
                  {/* 안내 — 라운지와 같은 관례(book 아이콘 + 시트). 걷기 탭에서만 노출(회비 장부는 아직 별도 안내 없음).
                      뒤로 버튼과 같은 폭을 차지해 제목이 가운데를 유지한다. 회비 장부 탭에선 빈 자리로 폭만 유지. */}
                  {tab === 'settle' ? (
                    <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ width: fs(22), alignItems: 'flex-end' }}>
                      <Icon name="book" size={fs(19)} color={C.charcoal} strokeWidth={1.8} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: fs(22) }} />
                  )}
                </>
              )}
            </View>
            )}

            {/* 걷기 / 회비 장부 전환 탭 — 목록 레벨(작성·상세 아님)에서만. 걷기=1회성, 회비장부=지속 통장 관리.
                고른 탭은 글자도 커진다 — 색·굵기만으로는 어느 쪽인지 얼른 안 읽힌다(중장년 가독성).
                글자 크기가 달라도 밑줄이 어긋나지 않게 컨테이너를 flex-end로 정렬. */}
            {!composing && !openId && !ledgerDetail && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 20, paddingHorizontal: 16, paddingTop: 12 }}>
                {[['settle', '걷기'], ['ledger', '회비 장부']].map(([k, lbl]) => {
                  const on = tab === k;
                  return (
                    <TouchableOpacity key={k} onPress={() => setTab(k)} activeOpacity={0.7}
                      style={{ paddingTop: 2, paddingBottom: 9, borderBottomWidth: 2.5,
                        borderBottomColor: on ? C.charcoal : 'transparent' }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(on ? 17 : 14.5), letterSpacing: 0.2,
                        color: on ? C.charcoal : C.textSecondary }}>{lbl}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* 임베디드 — 목록 헤더가 없으니 안내(book)는 탭 줄 우측으로(걷기 탭만, 모달의 헤더 book과 같은 역할) */}
                {embedded && <View style={{ flex: 1 }} />}
                {embedded && tab === 'settle' && (
                  <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ paddingBottom: 9 }}>
                    <Icon name="book" size={fs(19)} color={C.charcoal} strokeWidth={1.8} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(!composing && !openId && tab === 'ledger') ? (
              <LedgerScreen currentUid={myUid} onDetailChange={setLedgerDetail} topInset={embedded ? insets.top : 0}
                registerBack={(fn) => { ledgerBack.current = fn; }} />
            ) : composing ? (
              <SettlementCompose key={composePreset?.nonce || 'new'} dirtyRef={composeDirty} backRef={composeBack} recent={list}
                preset={composePreset}
                onCreated={(s) => { setList(prev => [s, ...prev]); setComposing(false); setComposePreset(null); setOpenId(s.id); }} />
            ) : current ? (
              <DetailView s={current} onSave={(patch) => save(current.id, patch)}
                onArchive={() => archive(current)}
                onDeleted={() => { setList(prev => prev.filter(x => x.id !== current.id)); setOpenId(null); }} />
            ) : (
              <ListView list={list} loading={loading} failed={failed} onRetry={load}
                onOpen={setOpenId} onNew={(pre) => { setComposePreset(pre || null); setComposing(true); }}
                onDelete={remove} onUnarchive={unarchive} />
            )}

            {/* ★안내 시트는 이 모달 '안'에 중첩한다 — 형제로 두면 iOS에서 둘 다 안 뜬다
                ([[ios-modal-stacking]]). 라운지는 화면이라 형제로 둬도 되지만 여기는 모달 안이다.
                (임베디드는 화면이라 어차피 안전) */}
            <SettlementGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />

            {/* ★삭제·보관·계좌삭제·나가기 확인창은 이 모달 '안'의 호스트가 그려야 위로 뜬다.
                없으면 루트 호스트가 그려 이 풀스크린 모달 뒤로 깔려 '눌러도 아무 일 없음'으로 보였다
                (사용자 2026-07-27 — 삭제가 안 되던 진짜 원인). LedgerScreen은 자체 호스트가 있어 회비 탭은 정상이었다.
                ★임베디드에선 렌더 금지 — 모달 창이 아니라 루트 호스트가 정상으로 위에 뜨고, 호스트가 둘이면 확인창이 겹으로 그려진다. */}
            {!embedded && <AppAlertHost />}
    </>
  );

  // 임베디드(모임 탭 세그먼트) — Modal·자체 Provider 없이 일반 화면. 루트 KeyboardProvider/AppAlertHost 사용.
  //   하단 paddingBottom — 플로팅 탭바(≈insets+66)에 목록·버튼이 가리지 않게.
  if (embedded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingBottom: insets.bottom + 78 }}>
        {inner}
      </View>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack} transparent={false}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom']}>
            {inner}
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
  // 가장 최근 회비 걷기(보관 포함) — '이번 달 회비' 바로가기의 원본. 금액이 전원 같을 때만 1인 금액을 보여준다.
  const lastDues = (list || []).find(s => s?.kind === 'dues') || null;
  const duesUniform = (() => {
    const a = (lastDues?.members || []).map(m => m.amount).filter(x => x > 0);
    return a.length && a.every(x => x === a[0]) ? a[0] : 0;
  })();
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
        <TouchableOpacity onPress={() => onNew(null)} activeOpacity={0.85}
          style={{ backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: lastDues ? 8 : 16 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>+ 걷기 만들기</Text>
        </TouchableOpacity>
      )}
      {/* 이번 달 회비 — 회비는 매달 같다. 지난번 회비의 명단·금액을 그대로 채운 채 '누구에게'부터 연다(2026-10-01). */}
      {!showArchive && lastDues && (
        <TouchableOpacity onPress={() => onNew({ kind: 'dues', fromId: lastDues.id, nonce: Date.now() })} activeOpacity={0.85}
          style={[box, { paddingVertical: 13, paddingHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>{new Date().getMonth() + 1}월 회비 걷기</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginTop: 3 }}>
              지난번과 같게 · {(lastDues.members || []).length}명{duesUniform ? ` · 1인 ${won(duesUniform)}원` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: fs(20), color: C.warmGray }}>›</Text>
        </TouchableOpacity>
      )}

      {shown.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 8 }}>
            {showArchive ? '보관한 걷기가 없어요' : '아직 걷기가 없어요'}
          </Text>
          {!showArchive && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, textAlign: 'center', lineHeight: 19 }}>
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
                  {settleTitle(s) || '이름 없는 걷기'}
                </Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: GOLD }}>{settleKindLabel(s.kind)}</Text>
                <TouchableOpacity onPress={() => (showArchive ? onUnarchive(s) : onDelete(s))} activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
                  style={{ marginLeft: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: showArchive ? fs(11.5) : fs(15), color: C.textSecondary }}>
                    {showArchive ? '되돌리기' : '⋯'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary }}>{s.date}</Text>
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
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textSecondary }}>
            {showArchive ? '← 진행 중인 걷기 보기' : `보관함 ${archived.length}`}
          </Text>
        </TouchableOpacity>
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

  // 수정 중 '영수증 다시 읽기' — 만들 때와 같은 AI 흐름(computeSettlement). 새 영수증/카드문자/요구사항을
  //   넣으면 금액·내역을 다시 채운다(사용자 2026-07-27: 텍스트만 고쳐지던 걸 개선). ★이미 입금 확인한
  //   사람의 status는 지키고 금액만 갈아끼운다 — 재계산했다고 낸 사람이 '대기'로 돌아가면 안 된다.
  const [ePhotos, setEPhotos] = useState([]);
  const [ePaste, setEPaste] = useState('');
  const [eInstr, setEInstr] = useState('');
  const [eShowPaste, setEShowPaste] = useState(false);
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState('');
  const [eNote, setENote] = useState('');
  const [recomputeOpen, setRecomputeOpen] = useState(false);   // 다시 계산 카드 — 접힌 채 시작(2026-09-22, 금액 하나 고칠 때 작성 화면이 통째로 다시 뜨던 것)
  const resetRecompute = () => {
    setEPhotos([]); setEPaste(''); setEInstr(''); setEShowPaste(false);
    setEBusy(false); setEError(''); setENote(''); setRecomputeOpen(false);
  };

  const startEdit = () => {
    setDItems((s.items || []).map(i => ({ label: i.label || '', amount: String(i.amount || '') })));
    setDMembers((s.members || []).map(m => ({ ...m, amount: String(m.amount || '') })));
    resetRecompute();
    setEditing(true);
  };
  const cancelEdit = () => { resetRecompute(); setEditing(false); };
  const saveEdit = () => {
    const items = dItems
      .map(i => ({ label: i.label.trim(), amount: Math.max(0, parseInt(i.amount, 10) || 0) }))
      .filter(i => i.label && i.amount > 0);
    const members = dMembers.map(m => ({ ...m, amount: Math.max(0, parseInt(m.amount, 10) || 0) }));
    if (members.length === 0) { showToast('참가자가 없어요'); return; }
    // total은 사람별 금액의 합 — 화면 요약과 정산서 합계가 어긋나면 안 된다
    onSave({ items, members, total: members.reduce((a, m) => a + m.amount, 0) });
    resetRecompute();
    setEditing(false);
  };

  // 영수증 첨부 — SettlementCompose.addPhotos와 같은 규칙(촬영/갤러리, 최대 RECEIPT_MAX장). 고른 즉시 계산 안 하고 쌓아둔다.
  const addEditPhotos = async (source) => {
    if (eBusy) return;
    Keyboard.dismiss();
    let picked = [];
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setEError('카메라 권한이 필요해요'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      picked = [res.assets[0].uri];
    } else {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setEError('사진 접근 권한이 필요해요'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: RECEIPT_MAX,
      });
      if (res.canceled || !res.assets?.length) return;
      picked = res.assets.map(a => a.uri);
    }
    setEPhotos(prev => {
      const next = [...prev, ...picked].slice(0, RECEIPT_MAX);
      if (prev.length + picked.length > RECEIPT_MAX) setEError(`영수증은 ${RECEIPT_MAX}장까지예요`);
      else setEError('');
      return next;
    });
  };

  // 다시 계산 — 새 영수증/문자/요구사항을 AI에 보내 draft(dItems·dMembers)를 갱신한다.
  //   ★입금 상태(status)는 이름으로 이어붙여 보존하고 금액만 교체한다.
  const recompute = async () => {
    if (eBusy) return;
    if (!ePaste.trim() && !eInstr.trim() && ePhotos.length === 0) {
      setEError('영수증을 올리거나 카드문자를 붙여넣어 주세요'); return;
    }
    const names = dMembers.map(m => ({ name: m.name }));
    if (names.length === 0) { showToast('참가자가 없어요'); return; }
    Keyboard.dismiss();
    setEBusy(true);
    const r = await computeSettlement({ text: ePaste, uris: ePhotos, names, instruction: eInstr, kind: s.kind });
    setEBusy(false);
    if (r?.error) { setEError(r.error); return; }
    const byName = new Map((r.members || []).map(m => [m.name, m.amount]));
    setDMembers(prev => prev.map(m => (byName.has(m.name) ? { ...m, amount: String(byName.get(m.name) || 0) } : m)));
    setDItems((r.items || []).map(i => ({ label: i.label || '', amount: String(i.amount || '') })));
    setENote(r.fallback ? '이름을 못 맞춰 1/n으로 나눴어요' : (r.note || '다시 계산했어요'));
    setEError('');
    setEPhotos([]); setEPaste(''); setEShowPaste(false);
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
  const [previewOpen, setPreviewOpen] = useState(false);   // 미리보기 — 접힌 채 시작, 보내기 버튼 밑 링크로 편다
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
              <TouchableOpacity onPress={cancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginRight: 16 }}>취소</Text>
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
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary }}>삭제</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal }}>{won(sum.total)}원</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), marginTop: 8,
          color: allDone ? '#6B8B5E' : '#6B1E2A' }}>
          {allDone ? '전원 입금 완료' : `${sum.confirmedCount}/${sum.count} 입금 · ${won(sum.remain)}원 남음`}
        </Text>
        {/* 덧붙인 한 줄(memo) — 정산서 머리 아래에 그대로 나간 문구("입금은 금요일까지") */}
        {!!s.memo && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary, marginTop: 8 }}>{s.memo}</Text>
        )}
      </View>

      {/* ★카톡으로 보내기를 요약 바로 아래로(2026-09-22 "정산 과정이 너무 복잡") — 만든 직후 총무가 할 일은
          '보내기' 하나인데 요약·내역·명단·계좌·선택 칩 2줄·미리보기를 지나 맨 아래에 있었다.
          정산서/독촉 전환·내역 넣기/빼기·미리보기는 버튼 밑 작은 글씨 한 줄로 격하. 미리보기는 접힌 채 시작.
          수정 중에는 감춘다 — 아직 저장 안 된 값으로 보내면 헷갈린다. */}
      {!editing && (
        <View style={{ marginBottom: 16 }}>
          <TouchableOpacity onPress={sendKakao} activeOpacity={0.85}
            style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
              {mode === 'remind' ? `카톡으로 독촉 보내기 · ${sum.pending.length}명` : '카톡으로 정산서 보내기'}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
            gap: 18, marginTop: 9 }}>
            {/* ★독촉은 총무가 제일 싫어하는 일이라 문구를 앱이 대신 쓴다(사용자 2026-07-22).
                안 낸 사람이 없으면 링크 자체를 감춘다 — 누를 일 없는 버튼은 없는 게 낫다. */}
            {canRemind && (
              <TouchableOpacity onPress={() => setMode(m => (m === 'remind' ? 'full' : 'remind'))} activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: '#6B1E2A' }}>
                  {mode === 'remind' ? '정산서로 바꾸기' : `안 낸 ${sum.pending.length}명만 독촉`}
                </Text>
              </TouchableOpacity>
            )}
            {/* 내역 넣기/빼기는 정산서에만 — 독촉은 이름과 금액만 짧게 나가는 게 낫다. 고른 건 기억한다. */}
            {mode === 'full' && (
              <TouchableOpacity onPress={() => setDetailKeep(!detail)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.textSecondary }}>
                  {detail ? '내역 넣음 · 빼기' : '내역 뺌 · 넣기'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setPreviewOpen(v => !v)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.textSecondary }}>
                {previewOpen ? '미리보기 접기' : '미리보기'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* 미리보기 — buildSettlementText/buildReminderText 결과를 그대로 그린다. 화면과 실제 보낼 문구가
              어긋나면 안 되므로 따로 꾸미지 않고 같은 함수의 출력을 쓴다. */}
          {previewOpen && (
            <View style={[box, { paddingHorizontal: 16, paddingVertical: 14, marginTop: 10 }]}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.textSecondary, marginBottom: 8 }}>
                이렇게 보내집니다
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: fs(21) }}>
                {mode === 'remind' ? remindText : buildSettlementText(shareDoc, { detail })}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 영수증 다시 읽기 — 수정 중일 때만. 만들 때와 같은 AI 흐름(computeSettlement)으로 금액·내역을 다시 채운다.
          아래 직접 수정칸(내역·사람별 금액)은 그대로 두어, 다시 계산 후에도 텍스트로 마저 손볼 수 있다. */}
      {editing && !recomputeOpen && (
        <TouchableOpacity onPress={() => setRecomputeOpen(true)} activeOpacity={0.7}
          style={{ paddingVertical: 10, alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD_DEEP }}>영수증·문자로 다시 계산하기</Text>
        </TouchableOpacity>
      )}
      {editing && recomputeOpen && (
        <View style={{ backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(14), color: GOLD_DEEP }}>
              영수증·문자로 다시 계산
            </Text>
            <TouchableOpacity onPress={() => setRecomputeOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.textSecondary }}>접기</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.textSecondary, marginBottom: 10, lineHeight: fs(18) }}>
            새 영수증을 올리거나 카드문자를 붙여넣으면 금액·내역을 다시 채워드려요
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'camera', icon: 'camera', label: '촬영', onPress: () => addEditPhotos('camera') },
              { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => addEditPhotos('gallery') },
              { key: 'paste', icon: 'clipboard', label: '붙여넣기', onPress: () => setEShowPaste(v => !v) },
            ].map(m => {
              const active = m.key === 'paste' && eShowPaste;
              return (
                <TouchableOpacity key={m.key} activeOpacity={0.8} onPress={m.onPress} disabled={eBusy}
                  style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12,
                    backgroundColor: active ? 'rgba(201,168,76,0.18)' : '#FFFFFF' }}>
                  <Icon name={m.icon} size={21} color={GOLD_DEEP} strokeWidth={1.8} />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {ePhotos.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {ePhotos.map((uri, i) => (
                <TouchableOpacity key={uri} activeOpacity={0.7}
                  onPress={() => setEPhotos(prev => prev.filter(x => x !== uri))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF',
                    borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP }}>영수증 {i + 1}</Text>
                  <Text style={{ fontSize: fs(12), color: C.textSecondary }}>✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {eShowPaste && !eBusy && (
            <AppTextInput value={ePaste} onChangeText={v => { setEPaste(v); if (eError) setEError(''); }} multiline
              placeholder={'카드결제 문자나 정산 메시지를 붙여넣어 주세요'}
              placeholderTextColor={C.warmGray}
              style={{ minHeight: fs(70), backgroundColor: '#FFFFFF',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, textAlignVertical: 'top',
                fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, lineHeight: fs(20) }} />
          )}

          {/* 요구사항 — "○○는 빼줘" 같은 자연어. 있으면 사람별 금액에 반영된다(만들 때 instr와 같은 역할). */}
          <AppTextInput value={eInstr} onChangeText={setEInstr}
            placeholder={'요구사항 (예: 김이사는 빼줘) — 없으면 비워두세요'}
            placeholderTextColor={C.warmGray}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 10, marginTop: 10,
              fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }} />

          <TouchableOpacity onPress={recompute} activeOpacity={0.85} disabled={eBusy}
            style={{ marginTop: 12, backgroundColor: eBusy ? C.warmGray : GOLD_DEEP, borderRadius: 12,
              paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {eBusy && <Spinner size={14} color={C.butter} />}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>
              {eBusy ? '다시 계산하고 있어요…' : '다시 계산'}
            </Text>
          </TouchableOpacity>

          {!!eError && !eBusy && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: '#6B1E2A', marginTop: 9 }}>{eError}</Text>
          )}
          {!!eNote && !eError && !eBusy && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: GOLD_DEEP, marginTop: 9 }}>{eNote}</Text>
          )}
        </View>
      )}

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
                <Text style={{ fontSize: fs(13), color: C.textSecondary }}>✕</Text>
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
                <Text style={{ fontSize: fs(13), color: C.textSecondary }}>✕</Text>
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
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.textSecondary, marginRight: 12 }}>
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

      {!editing && (
      <>
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

