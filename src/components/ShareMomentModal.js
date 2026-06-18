import React, { useState, useRef } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { C, F, fs } from '../constants/colors';
import { HallOfFameCard } from './HallOfFameCard';
import { MilestoneCard } from './MilestoneCard';
import { RoundCard } from './RoundCard';
import { RoundCardScorecard } from './RoundCardScorecard';
import { RoundCardMemory } from './RoundCardMemory';
import { RoundCardPolaroid } from './RoundCardPolaroid';
import { RoundupShareCard } from './RoundupShareCard';
import { ScheduleShareCard } from './ScheduleShareCard';
import { FriendInviteCard } from './FriendInviteCard';
import { OverlayAlert } from './common/OverlayAlert';
import { loadMyFriendsEnriched } from '../utils/friends';
import { uploadDmImage, sendImageMessageUrl } from '../utils/dm';

// 캡처 영역 너비 — ★고정값(폰 화면 폭에 의존하지 않음). 화면폭(window.width-40) 기준이면 폰마다 카드 크기가
// 달라져, 같은 카드도 좁은 폰에선 라벨이 서로 붙는 등 레이아웃이 어긋났음(앱의 얼굴인 공유 이미지 완성도 문제, 2026-06-14).
// 고정하면 어떤 폰에서 만들어도 동일한 카드·동일한 공유 이미지가 나온다. 대부분 폰(≥360dp)에서 미리보기도 화면에 들어감.
const CARD_WIDTH = 320;

// 공유 옵션 — ①바로 공유(OS 공유 시트로 카톡·인스타 직행, expo-sharing) ②갤러리 저장(폴백·보관).
// OS 공유 시트는 카카오 SDK 직접 공유([[share-moment]] 보류)와 별개라 출시 전 사용 가능. 인스타는 제외.
// 라운딩 자랑 카드 4종 — 캐러셀로 골라 공유. 스코어 있는 것(매거진·스코어카드) + 스코어 없는 기념용(기념·폴라로이드).
//  배경·결을 다르게 구분([[score-brag-card]]). 빅스코어(RoundCardBig)는 매거진과 결이 겹쳐 미등록(파일 보존).
const ROUND_CARDS = [RoundCard, RoundCardScorecard, RoundCardMemory, RoundCardPolaroid];
const ROUND_NAMES = ['매거진', '스코어카드', '기념', '폴라로이드'];

// 버튼별 색으로 역할을 구분 — 공유하기(차콜·이미지 전송) / 이미지 저장(버터·로컬 보관). 링크 버튼은 아래 별도(네이비).
const OPTIONS = [
  { key: 'share', icon: '📤', label: '공유하기', bg: C.charcoal, fg: '#fff', border: false },
  { key: 'save', icon: '🖼', label: '이미지 저장', bg: C.butter, fg: C.charcoal, border: false },
];

// 특별한 순간 공유 — 카드 미리보기(워터마크 포함) + 갤러리 저장.
export function ShareMomentModal({ moment, visible, onClose, onShareLink }) {
  const insets = useSafeAreaInsets(); // DM 피커 시트가 안드 네비바에 안 가리도록(absolute 오버레이라 SafeAreaView 패딩 미적용)
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef(null);
  const roundRefs = useRef([]);                          // 라운딩 카드 4종 캐러셀 — 각 ViewShot ref
  const [roundStyleIdx, setRoundStyleIdx] = useState(0); // 선택된 라운딩 카드 스타일(0 매거진/1 스코어카드/2 기념/3 폴라로이드)
  // DM 공유 — 친구 다중선택해 카드 이미지를 DM으로 한 번에 전송([[dm-design]] 사진공유)
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedDm, setSelectedDm] = useState([]);      // 선택한 친구 uid 배열
  const [dmSending, setDmSending] = useState(false);
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
    if (dmPickerOpen) { setDmPickerOpen(false); return; }
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
      const uri = await captureRef(isRound ? roundRefs.current[roundStyleIdx] : cardRef, { format: 'png', quality: 1, pixelRatio: 3 });
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
      const uri = await captureRef(isRound ? roundRefs.current[roundStyleIdx] : cardRef, { format: 'png', quality: 1, pixelRatio: 3 });
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

  // DM 공유 — 친구 목록 로드 후 다중선택 시트 오픈
  const openDmPicker = async () => {
    setSelectedDm([]); setDmPickerOpen(true); setFriendsLoading(true);
    try { setFriends(await loadMyFriendsEnriched()); } catch { setFriends([]); }
    finally { setFriendsLoading(false); }
  };
  const toggleDm = (uid) => setSelectedDm(prev => (prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]));
  // 카드 캡처 → 1회 업로드 → 선택한 친구 각 대화방에 같은 URL 전송(업로드 재사용).
  const sendDm = async () => {
    if (dmSending || !selectedDm.length) return;
    setDmSending(true);
    try {
      // DM용은 pixelRatio 2(표시 210px·뷰어 충분) — 3보다 가볍게 캡처해 업로드 지연 단축. 저장/외부공유는 그대로 3.
      const uri = await captureRef(isRound ? roundRefs.current[roundStyleIdx] : cardRef, { format: 'png', quality: 1, pixelRatio: 2 });
      const url = await uploadDmImage(uri);
      const targets = [...selectedDm];
      await Promise.all(targets.map(fid => sendImageMessageUrl(fid, url).catch(e => __DEV__ && console.warn('[dmShare] send fail', fid, e?.message))));
      setDmPickerOpen(false);
      setAlert({ title: 'DM으로 보냈어요', message: `${targets.length}명에게 카드를 보냈어요.`, buttons: [{ text: '확인', onPress: onClose }] });
    } catch (e) {
      setAlert({ title: '전송에 실패했어요', message: e?.message || '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] });
    } finally { setDmSending(false); }
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
            {isRound ? (
              // 라운딩 카드 캐러셀 — 가로 스와이프로 스타일 선택, 선택된 카드만 캡처/공유
              <View style={{ width: CARD_WIDTH, alignSelf: 'center' }}>
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => setRoundStyleIdx(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))}>
                  {ROUND_CARDS.map((Comp, i) => (
                    <ViewShot key={i} ref={(el) => (roundRefs.current[i] = el)} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH }}>
                      <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                        <Comp item={moment} width={CARD_WIDTH} />
                      </View>
                    </ViewShot>
                  ))}
                </ScrollView>
                {/* 닷 인디케이터 + 현재 스타일 이름 */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 }}>
                  {ROUND_CARDS.map((_, i) => (
                    <View key={i} style={{ width: i === roundStyleIdx ? 16 : 7, height: 7, borderRadius: 4, backgroundColor: i === roundStyleIdx ? C.charcoal : C.hairline }} />
                  ))}
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 7 }}>
                  넘겨서 카드 스타일을 골라보세요 · {ROUND_NAMES[roundStyleIdx]}
                </Text>
              </View>
            ) : (
              <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH, alignSelf: 'center' }}>
                {/* 배경 투명 — 카드만 깔끔하게 저장. Dear Golf 마크는 카드 안. width 고정으로 캡처 비율 안정 */}
                <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                  {isInvite
                    ? <FriendInviteCard width={CARD_WIDTH} />
                    : isSchedule
                      ? <ScheduleShareCard schedule={moment} width={CARD_WIDTH} />
                      : isRoundup
                        ? <RoundupShareCard post={moment} width={CARD_WIDTH} />
                        : moment.kind === 'milestone'
                          ? <MilestoneCard item={moment} />
                          : <HallOfFameCard item={moment} />}
                </View>
              </ViewShot>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 8, lineHeight: 17, textAlign: 'center' }}>
              {(isRoundup || isSchedule || isInvite) && onShareLink
                ? '‘공유하기’는 카드 이미지만 전송돼요(링크 없음).\n받는 분이 바로 열어볼 수 있게 ‘링크 공유’도 함께 보내주세요.'
                : (isRoundup || isSchedule || isInvite || isRound)
                  ? '카드 이미지로 공유돼요.\nDear Golf 마크가 들어가요.'
                  : '투명 배경 PNG로 저장돼요.\n카드에 Dear Golf 마크가 들어가요.'}
            </Text>

            {/* 공유 옵션 — 버튼별 색으로 역할 구분: 공유하기(차콜·이미지만) / 이미지 저장(버터·보관) / 링크 공유(네이비·링크만).
                카카오톡 공유는 딥링크 미연동으로 철회 보류([[invite-deeplink-system]], 사용자 2026-06-16). */}
            <View style={{ gap: 10, marginTop: 22 }}>
              {OPTIONS.map(o => {
                const busy = o.key === 'share' ? sharing : saving;
                const disabled = sharing || saving;
                return (
                  <TouchableOpacity key={o.key} activeOpacity={0.85}
                    onPress={() => handleOption(o.key)}
                    disabled={disabled}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: o.bg, borderRadius: 12, height: 48,
                      borderWidth: o.border ? 1 : 0, borderColor: C.hairline,
                      opacity: disabled ? 0.5 : 1 }}>
                    <Text style={{ fontSize: fs(16) }}>{o.icon}</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: o.fg }}>
                      {busy ? (o.key === 'share' ? '공유 준비 중...' : '저장 중...') : o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* DM으로 보내기 — 친구 다중선택 후 카드 이미지를 인앱 DM으로 한 번에 전송(앱 안에서 끝, 외부 X). 버건디 */}
              <TouchableOpacity activeOpacity={0.85} onPress={openDmPicker} disabled={sharing || saving}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: '#6B1E2A', borderRadius: 12, height: 48, opacity: (sharing || saving) ? 0.5 : 1 }}>
                <Text style={{ fontSize: fs(16) }}>💬</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#F5E6A8' }}>DM으로 보내기</Text>
              </TouchableOpacity>
              {/* 링크 공유 — 클릭 가능한 링크 평문 공유(이미지 없이 링크만). '링크와 함께'는 이미지도 같이 가는 듯한
                  오해를 줘 '링크 공유'로 단순화(사용자 2026-06-16). 네이비로 강조(받는 분 바로 열람·설치 funnel). */}
              {onShareLink && (
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => { onShareLink(); }}
                  disabled={sharing || saving}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: C.navy, borderRadius: 12, height: 48,
                    opacity: (sharing || saving) ? 0.5 : 1 }}>
                  <Text style={{ fontSize: fs(16) }}>🔗</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>링크 공유</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* DM 친구 다중선택 시트 — 카드 이미지를 선택한 친구들에게 한 번에 전송 */}
          {dmPickerOpen && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDmPickerOpen(false)} />
              <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '72%', paddingBottom: 16 + insets.bottom }}>
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline }} />
                </View>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>친구에게 DM으로 보내기</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingHorizontal: 20, paddingBottom: 8 }}>받을 친구를 선택하세요 (여러 명 가능)</Text>
                {friendsLoading ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>불러오는 중…</Text>
                ) : friends.length === 0 ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>아직 친구가 없어요.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
                    {friends.map(f => {
                      const sel = selectedDm.includes(f.id);
                      return (
                        <TouchableOpacity key={f.id} onPress={() => toggleDm(f.id)} activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10,
                            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                            borderColor: sel ? C.burgundy : C.hairline, backgroundColor: sel ? C.burgundy : 'transparent',
                            alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <Text style={{ fontSize: fs(13), color: C.butter }}>✓</Text>}
                          </View>
                          {/* 별명(customName, owner-only) 우선 표시 — 없으면 닉네임 ([[friend_groups]]) */}
                          <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{f.customName || f.name || '친구'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                  <TouchableOpacity onPress={sendDm} disabled={!selectedDm.length || dmSending} activeOpacity={0.85}
                    style={{ backgroundColor: C.burgundy, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center',
                      opacity: (!selectedDm.length || dmSending) ? 0.5 : 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>
                      {dmSending ? '보내는 중…' : `보내기${selectedDm.length ? ` (${selectedDm.length})` : ''}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
