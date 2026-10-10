import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';   // 한마디 입력칸이 키보드에 가리지 않게(사용자 2026-10-10). RN Modal은 별도 윈도우라 자체 Provider 필요
import { Image } from 'expo-image';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import AppTextInput from './common/AppTextInput';
import { C, F, fs } from '../constants/colors';
import { RoundCard } from './RoundCard';
import { RoundCardScorecard } from './RoundCardScorecard';
import { RoundCardPolaroid } from './RoundCardPolaroid';
import { OverlayAlert } from './common/OverlayAlert';
import { resolvePhotoUri } from '../utils/photoStorage';
import { shareCardImage, saveCardToGallery } from '../utils/shareCard';

// 라운딩 카드 공유 — 전면 간소화([[record-share-redesign]] 2026-10-10).
//   전(ShareMomentModal 라운딩 분기): 4종 캐러셀 스와이프 + 배경사진 + 글상자 토글 + 공유/디엠/저장 3버튼 → 결정이 7개라 아무도 안 썼다.
//   후: 한 화면에서 ①스타일 칩 3개 ②표시 토글(스코어·함께한 사람·이름·글상자 위) ③한마디 ④배경 사진 → 공유/저장 2버튼.
//   스타일은 사진(매거진)·스코어카드·화이트 3종. 옛 '기념' 카드는 사진 카드에서 스코어 끄고 함께한 사람 켜면 같은 결과라 뺐다.
//   디엠 보내기 제거 — 앱 친구는 피드에서 이미 보고, 카드 이미지는 단톡방(OS 공유)이 목적지.
//   캡처 폭 고정 320(폰 폭 무관, 레이아웃 흔들림 방지).
const CARD_WIDTH = 320;
const STYLES = [
  { key: 'photo', label: '사진', Comp: RoundCard },
  { key: 'score', label: '스코어카드', Comp: RoundCardScorecard },
  { key: 'white', label: '화이트', Comp: RoundCardPolaroid },
];

export function RoundShareModal({ round, visible, onClose }) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef(null);
  const [alert, setAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const [styleKey, setStyleKey] = useState('photo');
  const [coverIdx, setCoverIdx] = useState(0);          // 배경 사진(업로드 사진 중) — 공유 때만 일시 적용
  const [showScore, setShowScore] = useState(true);
  const [showWith, setShowWith] = useState(false);      // 함께한 사람(WITH 줄)
  const [showName, setShowName] = useState(true);
  const [panelTop, setPanelTop] = useState(false);      // 글상자 위로(인물이 사진 하단일 때, 사용자 2026-08-26)
  const [caption, setCaption] = useState('');           // 한마디 — 기본값은 자동 자랑 한 줄(bragLine), 비우면 생략

  // 다른 기록을 열면 초기화 — 스코어카드가 있으면 스코어카드부터, 사진 없고 홀별도 없으면 사진(차콜) 카드
  useEffect(() => {
    if (!round) return;
    const hasHoles = Array.isArray(round.holeScores) && round.holeScores.length === 18;
    setStyleKey(hasHoles && !(round.photos || []).length ? 'score' : 'photo');
    setCoverIdx(0); setShowScore(typeof round.score === 'number'); setShowWith(false); setShowName(true); setPanelTop(false);
    setCaption(round.bragLine || '');
  }, [round?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- 같은 기록이 재렌더돼도 사용자가 만진 옵션은 유지

  if (!round) return null;

  const photos = Array.isArray(round.photos) ? round.photos : [];
  const companions = (round.companions || []).filter(c => !(typeof c === 'object' && c?.isMe));
  const hasHoles = Array.isArray(round.holeScores) && round.holeScores.length === 18;
  const isPhoto = styleKey === 'photo', isScore = styleKey === 'score', isWhite = styleKey === 'white';
  const Comp = STYLES.find(s => s.key === styleKey).Comp;

  // 카드에 넘길 item — 고른 배경 사진을 맨 앞으로, 표시 옵션은 필드로(원본 기록은 안 바뀜)
  const item = {
    ...round,
    photos: coverIdx > 0 && photos.length > coverIdx ? [photos[coverIdx], ...photos.filter((_, i) => i !== coverIdx)] : photos,
    bragLine: caption.trim(),
    caption: caption.trim(),
    hideScore: !showScore,
    showWith,
    hideName: !showName,
    panelPos: panelTop ? 'top' : 'bottom',
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(cardRef); if (r?.alert) setAlert(r.alert); } finally { setBusy(false); }
  };
  const handleRequestClose = () => { if (alert) { setAlert(null); return; } onClose(); };

  const chip = (label, on, onPress, { dim = false } = {}) => (
    <TouchableOpacity key={label} onPress={onPress} activeOpacity={0.75} disabled={dim}
      style={{ borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: on ? C.charcoal : C.bgSecondary,
        borderWidth: on ? 0 : 1, borderColor: C.hairline, opacity: dim ? 0.35 : 1 }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>{label}</Text>
    </TouchableOpacity>
  );
  const Label = ({ children }) => (
    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>{children}</Text>
  );

  // 표시 토글 — 스타일별로 의미 있는 것만. 사진: 스코어·함께한 사람·이름·글상자 위 / 스코어카드: 이름 / 화이트: 스코어
  const toggles = [
    (isPhoto || isWhite) && typeof round.score === 'number' ? chip('스코어', showScore, () => setShowScore(v => !v)) : null,
    isPhoto && companions.length > 0 ? chip('함께한 사람', showWith, () => setShowWith(v => !v)) : null,
    (isPhoto || isScore) ? chip('이름', showName, () => setShowName(v => !v)) : null,
    isPhoto && photos.length > 0 ? chip('글상자 위로', panelTop, () => setPanelTop(v => !v)) : null,
  ].filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
      <KeyboardProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>라운딩 카드</Text>
          </View>

          {/* KeyboardAwareScrollView — 포커스된 한마디 칸을 키보드 위로 자동 스크롤. keyboardShouldPersistTaps="always"는 DiaryAddModal과 같은 이유(안드 첫 탭 먹힘) */}
          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" bottomOffset={24}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
            {/* 스타일 — 칩 3개(스와이프 캐러셀 대신 한눈에) */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {STYLES.map(s => chip(s.label, styleKey === s.key, () => setStyleKey(s.key), { dim: s.key === 'score' && !hasHoles }))}
            </View>

            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH, alignSelf: 'center' }}>
              <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                <Comp item={item} width={CARD_WIDTH} />
              </View>
            </ViewShot>

            {/* 표시 토글 */}
            {toggles.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Label>카드에 표시</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{toggles}</View>
              </View>
            )}

            {/* 한마디 — 사진 카드 골드 헤드라인 / 화이트 카드 인용. 스코어카드엔 자리가 없어 숨김 */}
            {!isScore && (
              <View style={{ marginTop: 16 }}>
                <Label>한마디</Label>
                <AppTextInput value={caption} onChangeText={setCaption} maxLength={40}
                  placeholder="카드에 넣을 한마디 (비우면 생략)" placeholderTextColor={C.warmGrayLight}
                  style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: C.hairline, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} />
              </View>
            )}

            {/* 배경 사진 — 2장 이상일 때만. 스코어카드는 사진 미사용 */}
            {!isScore && photos.length > 1 && (
              <View style={{ marginTop: 16 }}>
                <Label>배경 사진</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                  {photos.map((p, i) => {
                    const uri = resolvePhotoUri(typeof p === 'object' ? p?.uri : p);
                    const sel = i === coverIdx;
                    return (
                      <TouchableOpacity key={i} onPress={() => setCoverIdx(i)} activeOpacity={0.8}
                        style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', borderWidth: sel ? 2.5 : 1, borderColor: sel ? C.burgundy : C.hairline }}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 18, lineHeight: fs(17), textAlign: 'center' }}>
              카드 이미지로 공유돼요. Dear Golf 마크가 들어가요.
            </Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              <TouchableOpacity activeOpacity={0.85} disabled={busy} onPress={() => run(r => shareCardImage(r, { dialogTitle: '라운딩 카드 공유' }))}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.charcoal, borderRadius: 11, height: 44, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontSize: fs(15) }}>📤</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }}>{busy ? '준비 중...' : '공유하기'}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} disabled={busy} onPress={() => run(saveCardToGallery)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.butter, borderRadius: 11, height: 44, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontSize: fs(15) }}>🖼</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.charcoal }}>이미지 저장</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAwareScrollView>
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}
