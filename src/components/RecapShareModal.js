import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';   // 안드 모달 입력 가림 방지(CrewComposeScreen과 같은 처방)
import ViewShot from 'react-native-view-shot';
import { C, F, fs } from '../constants/colors';
import { RecapCard } from './RecapCard';
import { OverlayAlert } from './common/OverlayAlert';
import { buildRecap, listRecapPeriods, recapTitle } from '../utils/recap';
import { shareCardImage, saveCardToGallery } from '../utils/shareCard';

// 결산 카드 공유 — 월/연 전환 + ‹ › 기간 이동 + 공유하기·이미지 저장([[record-share-redesign]] 2026-10-10).
//   기록 탭 '결산' 입구에서 열린다. 기간은 기록이 있는 달·해만 돈다(빈 결산 없음).
const CARD_WIDTH = 320;   // 고정폭 — 폰마다 카드가 달라지지 않게(ShareMomentModal과 동일 이유)

export function RecapShareModal({ visible, onClose, diaries, playerName = '', initial = null }) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef(null);
  const [alert, setAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(initial);   // {year, month|null}
  const [showWith, setShowWith] = useState(true);   // 함께한 사람 표시(동반자 이름 — 남의 정보라 끄고 공유 가능, 사용자 2026-10-11)
  const [caption, setCaption] = useState('');       // 한마디(≤40자) — 카드 골드 룰 아래 인용 줄
  useEffect(() => { if (visible) { setPeriod(initial); setShowWith(true); setCaption(''); } }, [visible, initial]);

  const periods = useMemo(() => listRecapPeriods(diaries), [diaries]);
  const isYear = !!period && period.month == null;
  const list = isYear ? periods.years : periods.months;   // 최신순
  const idx = period ? list.findIndex(p => p.year === period.year && (isYear || p.month === period.month)) : -1;
  const newer = idx > 0 ? list[idx - 1] : null;
  const older = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const toPeriod = (p) => setPeriod(p ? { year: p.year, month: isYear ? null : p.month } : period);
  // 월↔연 전환 — 같은 연도 유지. 연→월은 그 해 최신 달.
  const switchMode = (toYear) => {
    if (!period || toYear === isYear) return;
    if (toYear) { const y = periods.years.find(p => p.year === period.year) || periods.years[0]; if (y) setPeriod({ year: y.year, month: null }); }
    else { const m = periods.months.find(p => p.year === period.year) || periods.months[0]; if (m) setPeriod({ year: m.year, month: m.month }); }
  };

  const recap = useMemo(() => (period ? buildRecap(diaries, period) : null), [diaries, period]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(cardRef); if (r?.alert) setAlert(r.alert); } finally { setBusy(false); }
  };

  const handleRequestClose = () => { if (alert) { setAlert(null); return; } onClose(); };
  if (!period || !recap) return null;

  const chip = (label, on, onPress) => (
    <TouchableOpacity key={label} onPress={onPress} activeOpacity={0.75}
      style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: on ? C.charcoal : C.bgSecondary, borderWidth: on ? 0 : 1, borderColor: C.hairline }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
      <KeyboardProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>결산 카드</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {chip('월', !isYear, () => switchMode(false))}
              {chip('연', isYear, () => switchMode(true))}
            </View>
          </View>

          {/* 키보드 — iOS는 ScrollView 자체 인셋, 안드는 keyboard-controller KAV(padding)로 ScrollView 높이를 줄인다(사용자 2026-10-11 "안드는 가린다") */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" enabled={Platform.OS === 'android'}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
            {/* 기간 이동 — ‹ 이전(더 옛날) / 다음(더 최근) › */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => toPeriod(older)} disabled={!older} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(22), color: older ? C.charcoal : C.warmGrayLight }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, minWidth: 140, textAlign: 'center' }}>{recapTitle(period)}</Text>
              <TouchableOpacity onPress={() => toPeriod(newer)} disabled={!newer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(22), color: newer ? C.charcoal : C.warmGrayLight }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* 한마디 — ★카드 '위'에(사용자 2026-10-11). 아래 두면 입력 때 카드가 고정 헤더 밑으로 밀려 들어갔다.
                위에 있으면 키보드가 떠도 입력칸·카드 인용 줄(카드 상단부) 둘 다 보여 스크롤 자체가 필요 없다. 비우면 카드에 줄이 안 들어간다 */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>한마디</Text>
              <AppTextInput value={caption} onChangeText={setCaption} maxLength={40}
                placeholder="카드에 넣을 한마디 (비우면 생략)" placeholderTextColor={C.warmGrayLight}
                style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: C.hairline, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} />
            </View>
            {/* 카드 입체감 — 웜 화이트 카드가 크림 바탕(bgPrimary)과 같은 계열이라 경계가 안 보임(사용자 2026-10-11, 안드 먼저·iOS도).
                그림자는 ViewShot 바깥에 — 안쪽이면 공유 PNG에 그림자가 같이 찍힌다. 안드 elevation은 배경색 필수(카드 종이색). */}
            <View style={{ alignSelf: 'center', width: CARD_WIDTH, borderRadius: 8, backgroundColor: '#FFFDF8',
              shadowColor: '#2A2622', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 10 }}>
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH, alignSelf: 'center' }}>
              <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                <RecapCard recap={recap} playerName={playerName} width={CARD_WIDTH} showWith={showWith} caption={caption} />
              </View>
            </ViewShot>
            </View>

            {/* 표시 토글 — 동반자가 있는 기간만 '함께한 사람' 칩(이름 토글은 불필요, 사용자 2026-10-11) */}
            {recap.topCompanions?.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>카드에 표시</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {chip('함께한 사람', showWith, () => setShowWith(v => !v))}
                </View>
              </View>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 12, lineHeight: fs(17), textAlign: 'center' }}>
              카드 이미지로 공유돼요. Dear Golf 마크가 들어가요.
            </Text>

            {/* 공유하기 · 이미지 저장 — 위아래 긴 버튼 둘 → 좌우 한 줄(사용자 2026-10-11, 결산·라운딩 카드 공통) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity activeOpacity={0.85} disabled={busy} onPress={() => run(r => shareCardImage(r, { dialogTitle: '결산 카드 공유' }))}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.charcoal, borderRadius: 11, height: 44, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontSize: fs(15) }}>📤</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }}>{busy ? '준비 중...' : '공유하기'}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} disabled={busy} onPress={() => run(saveCardToGallery)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.butter, borderRadius: 11, height: 44, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontSize: fs(15) }}>🖼</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.charcoal }}>이미지 저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}
