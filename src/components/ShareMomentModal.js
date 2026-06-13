import React, { useState, useRef } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { C, F, fs } from '../constants/colors';
import { HallOfFameCard } from './HallOfFameCard';
import { MilestoneCard } from './MilestoneCard';
import { RoundCard } from './RoundCard';
import { RoundupShareCard } from './RoundupShareCard';
import { ScheduleShareCard } from './ScheduleShareCard';
import { FriendInviteCard } from './FriendInviteCard';
import { OverlayAlert } from './common/OverlayAlert';

// 캡처 영역 너비 고정 — ViewShot이 화면 너비를 못 잡으면 셀(47%) 비율이 깨져 박스에 공간이 생기고
// 텍스트가 잘림. ScrollView 좌우 padding 20씩이라 화면폭 - 40으로 고정.
const CARD_WIDTH = Dimensions.get('window').width - 40;

// 공유 옵션 — ①바로 공유(OS 공유 시트로 카톡·인스타 직행, expo-sharing) ②갤러리 저장(폴백·보관).
// OS 공유 시트는 카카오 SDK 직접 공유([[share-moment]] 보류)와 별개라 출시 전 사용 가능. 인스타는 제외.
const OPTIONS = [
  { key: 'share', icon: '📤', label: '공유하기', primary: true },
  { key: 'save', icon: '🖼', label: '이미지 저장' },
];

// 특별한 순간 공유 — 카드 미리보기(워터마크 포함) + 갤러리 저장.
export function ShareMomentModal({ moment, visible, onClose, onShareLink }) {
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef(null);
  const isRound = moment?.shareKind === 'round';
  const isRoundup = moment?.shareKind === 'roundup';
  const isSchedule = moment?.shareKind === 'schedule';
  const isInvite = moment?.shareKind === 'invite';
  const titleText = isInvite ? '친구 초대'
    : isSchedule ? '라운딩 일정'
    : isRoundup ? '모집 초대장'
    : isRound ? '라운딩 카드'
    : '특별한 순간 공유';

  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  // (RN Modal에선 onRequestClose가 신뢰되는 back 핸들러 — BackHandler 훅 제거)
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };

  if (!moment) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 사진첩 권한 요청 — iOS는 NSPhotoLibraryAddUsageDescription 필요(app.json)
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setAlert({
          title: '사진첩 권한이 필요해요',
          message: '이미지를 저장하려면 사진첩 접근 권한이 필요해요. 설정 > Dear Golf에서 허용해주세요.',
          buttons: [{ text: '확인' }],
        });
        return;
      }
      // 카드 + 워터마크 영역을 캡처해서 PNG로 저장
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await MediaLibrary.saveToLibraryAsync(uri);
      setAlert({
        title: '갤러리에 저장됐어요',
        message: '원하는 앱(카카오톡·인스타 등)에서 갤러리 사진으로 공유해보세요.',
        buttons: [{ text: '확인' }],
      });
    } catch (e) {
      setAlert({
        title: '저장에 실패했어요',
        message: e?.message || '잠시 후 다시 시도해주세요.',
        buttons: [{ text: '확인' }],
      });
    } finally {
      setSaving(false);
    }
  };

  // 바로 공유 — 카드 캡처 후 OS 공유 시트(카톡·인스타·메시지 등). 불가 환경이면 갤러리 저장으로 폴백.
  const handleShare = async () => {
    if (sharing || saving) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: isRound ? '라운딩 카드 공유' : '특별한 순간 공유' });
      } else {
        await handleSave();
      }
    } catch (e) {
      // 사용자가 공유 시트를 취소하면 에러가 아니므로 조용히 무시, 그 외만 안내
      if (e?.message && !/cancel/i.test(e.message)) {
        setAlert({ title: '공유에 실패했어요', message: e.message, buttons: [{ text: '확인' }] });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleOption = (key) => {
    if (key === 'share') handleShare();
    else if (key === 'save') handleSave();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{titleText}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>
              공유 미리보기
            </Text>

            {/* 공유될 카드 — 명예의 전당 카드 + Dear Golf 워터마크. ViewShot으로 감싸 캡처 영역 지정 */}
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH }}>
              {/* 배경 투명 — 카드만 깔끔하게 저장. Dear Golf 마크는 카드 헤더 안(HallOfFameCard, onShare 없을 때)에 들어가
                  투명 배경·SNS 미리보기에 영향받지 않고 항상 또렷하게 보인다.
                  width 고정(CARD_WIDTH)으로 캡처 시 셀 비율 깨짐·이름 잘림 방지. */}
              <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                {isInvite
                  ? <FriendInviteCard width={CARD_WIDTH} />
                  : isSchedule
                    ? <ScheduleShareCard schedule={moment} width={CARD_WIDTH} />
                    : isRoundup
                      ? <RoundupShareCard post={moment} width={CARD_WIDTH} />
                      : isRound
                        ? <RoundCard item={moment} width={CARD_WIDTH} />
                        : moment.kind === 'milestone'
                          ? <MilestoneCard item={moment} />
                          : <HallOfFameCard item={moment} />}
              </View>
            </ViewShot>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 16 }}>
              {(isRoundup || isSchedule || isInvite) && onShareLink
                ? '카드 이미지로 공유돼요. 클릭 가능한 링크는 ‘링크와 함께 공유’를 눌러주세요.'
                : (isRoundup || isSchedule || isInvite || isRound)
                  ? '카드 이미지로 공유돼요. Dear Golf 마크가 들어가요.'
                  : '투명 배경 PNG로 저장돼요. 카드에 Dear Golf 마크가 들어가요.'}
            </Text>

            {/* 공유 옵션 */}
            <View style={{ gap: 10, marginTop: 22 }}>
              {OPTIONS.map(o => {
                const busy = o.key === 'share' ? sharing : saving;
                const disabled = sharing || saving;
                return (
                  <TouchableOpacity key={o.key} activeOpacity={0.85}
                    onPress={() => handleOption(o.key)}
                    disabled={disabled}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: o.primary ? C.charcoal : C.bgSecondary, borderRadius: 12, paddingVertical: 14,
                      borderWidth: o.primary ? 0 : 1, borderColor: C.hairline,
                      opacity: disabled ? 0.5 : 1 }}>
                    <Text style={{ fontSize: fs(16) }}>{o.icon}</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: o.primary ? '#fff' : C.charcoal }}>
                      {busy ? (o.key === 'share' ? '공유 준비 중...' : '저장 중...') : o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* 모집 — 클릭 가능한 설치 링크가 담긴 평문 공유(설치 유도 funnel 보존) */}
              {onShareLink && (
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => { onShareLink(); }}
                  disabled={sharing || saving}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: C.bgSecondary, borderRadius: 12, paddingVertical: 14,
                    borderWidth: 1, borderColor: C.hairline, opacity: (sharing || saving) ? 0.5 : 1 }}>
                  <Text style={{ fontSize: fs(16) }}>🔗</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>링크와 함께 공유</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
