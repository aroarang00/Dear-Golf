import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';   // 대표사진 선택 썸네일
import { resolvePhotoUri } from '../utils/photoStorage';   // dgphoto:/객체 URI 해석(카드와 동일)
import AppTextInput from './common/AppTextInput';
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
import { RoundupShareCardFormal } from './RoundupShareCardFormal';   // 친구지정 격식 초대장 공유본
import { ScheduleShareCard } from './ScheduleShareCard';
import { FriendInviteCard } from './FriendInviteCard';
import { OverlayAlert } from './common/OverlayAlert';
import { loadMyFriendsEnriched } from '../utils/friends';
import { loadFriendData, resolveGroupAudience, groupColor } from '../utils/friendGroups';   // 그룹 단위 DM 공유
import { uploadDmImage, sendImageMessageUrl, ensureConversation } from '../utils/dm';
import { loadMyCrews, addCrewPost } from '../utils/crews';   // 모집을 내 크루 '진행 중인 모집' 핀에 카드로 올리기
import { getUid } from '../utils/firebase';

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

// 특별한 순간 공유 — 카드 미리보기(워터마크 포함) + 갤러리 저장.
export function ShareMomentModal({ moment, visible, onClose, onShareLink }) {
  const insets = useSafeAreaInsets(); // DM 피커 시트가 안드 네비바에 안 가리도록(absolute 오버레이라 SafeAreaView 패딩 미적용)
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef(null);
  const roundRefs = useRef([]);                          // 라운딩 카드 4종 캐러셀 — 각 ViewShot ref
  const [roundStyleIdx, setRoundStyleIdx] = useState(0); // 선택된 라운딩 카드 스타일(0 매거진/1 스코어카드/2 기념/3 폴라로이드)
  const [coverIdx, setCoverIdx] = useState(0);           // 카드 배경에 쓸 사진 인덱스 — 대표(0) 외 다른 업로드 사진도 선택 가능(공유 때만 일시 적용)
  useEffect(() => { setCoverIdx(0); }, [moment?.id]);    // 다른 기록 열면 대표(0)로 초기화
  // DM 공유 — 친구 다중선택해 카드 이미지를 DM으로 한 번에 전송([[dm-design]] 사진공유)
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedDm, setSelectedDm] = useState([]);      // 선택한 친구 uid 배열
  const [dmSending, setDmSending] = useState(false);
  const [dmSearch, setDmSearch] = useState('');          // 친구 검색(많을 때 빨리 찾기)
  const [dmGroups, setDmGroups] = useState([]);          // 친구 그룹 — 그룹 단위 공유(내가 만든 그룹)
  const [dmGroupMeta, setDmGroupMeta] = useState({});    // uid→{groupIds} (resolveGroupAudience용)
  // 크루 공유 — 모집을 내 크루(들) '진행 중인 모집' 핀에 카드로 올림(모집만 해당)
  const [crewPickerOpen, setCrewPickerOpen] = useState(false);
  const [crews, setCrews] = useState([]);
  const [crewsLoading, setCrewsLoading] = useState(false);
  const [selectedCrews, setSelectedCrews] = useState([]);
  const [crewPosting, setCrewPosting] = useState(false);
  const isRound = moment?.shareKind === 'round';
  const isRoundup = moment?.shareKind === 'roundup';
  const isSchedule = moment?.shareKind === 'schedule';
  const isInvite = moment?.shareKind === 'invite';
  // 친구지정(select) 모집 — 미리 지정한 친구만 열람·참여 가능(firestore.rules). 미지정 친구에겐 카드만 전달되고
  //   '모집 바로가기'가 동작 안 함 → DM 공유 시 호스트에게 그 제약을 안내(결원을 새 사람으로 충원하려면 모집 수정 필요).
  const isSelectRoundup = isRoundup && moment?.scope === 'select';
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
    if (crewPickerOpen) { setCrewPickerOpen(false); return; }
    onClose();
  };

  if (!moment) return null;

  // 라운딩 카드 배경 사진 — 카드는 photos[0]을 배경으로 쓰므로, 고른 사진을 맨 앞으로 재정렬해 넘긴다.
  //   원본 moment.photos(대표 순서)는 그대로 두고 공유 카드 렌더에만 일시 적용. 스코어카드는 사진 미사용.
  const roundPhotos = (isRound && Array.isArray(moment.photos)) ? moment.photos : [];
  const roundMoment = (coverIdx > 0 && roundPhotos.length > coverIdx)
    ? { ...moment, photos: [roundPhotos[coverIdx], ...roundPhotos.filter((_, i) => i !== coverIdx)] }
    : moment;

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
    setSelectedDm([]); setDmSearch(''); setDmPickerOpen(true); setFriendsLoading(true);
    try { setFriends(await loadMyFriendsEnriched()); } catch { setFriends([]); }
    try { const fd = await loadFriendData(); setDmGroups(fd.friendGroups || []); setDmGroupMeta(fd.friendMeta || {}); } catch {}
    finally { setFriendsLoading(false); }
  };
  // 그룹 토글 — 그 그룹 멤버(현재 친구목록에 있는) 전원을 한 번에 선택/해제(개별 선택과 혼용 가능).
  const toggleDmGroup = (groupId) => {
    const members = resolveGroupAudience(dmGroupMeta, [groupId]).filter(u => friends.some(f => f.id === u));
    if (!members.length) return;
    setSelectedDm(prev => {
      const allSel = members.every(u => prev.includes(u));
      return allSel ? prev.filter(u => !members.includes(u)) : [...new Set([...prev, ...members])];
    });
  };
  // 표시용 친구 목록 — 검색 필터 + 이 라운딩 동반자 먼저(보통 같이 친 사람에게 보냄), 그 외 이름순.
  const dmCompUids = new Set((moment?.companions || []).map(c => (typeof c === 'object' ? c?.friendUid : null)).filter(Boolean));
  const dmList = (() => {
    const q = dmSearch.trim().toLowerCase();
    const filtered = q
      ? friends.filter(f => [(f.customName || ''), (f.name || ''), (f.realName || '')].some(n => n.toLowerCase().includes(q)))
      : friends;
    return [...filtered].sort((a, b) => {
      const ac = dmCompUids.has(a.id) ? 0 : 1; const bc = dmCompUids.has(b.id) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return (a.customName || a.name || '').localeCompare(b.customName || b.name || '', 'ko');
    });
  })();
  const toggleDm = (uid) => setSelectedDm(prev => (prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]));
  // 카드 캡처 → 1회 업로드 → 선택한 친구 각 대화방에 같은 URL 전송(업로드 재사용).
  const sendDm = async () => {
    if (dmSending || !selectedDm.length) return;
    setDmSending(true);
    try {
      // ★화질 — pixelRatio 4로 캡처(카드폭 320×4=1280px ≥ 압축 maxWidth 1200)해 compressImage가 '다운스케일'(선명)되게.
      //   pixelRatio 2(=640px)면 1200으로 '업스케일'되며 텍스트가 뭉개졌음(사용자 2026-06-19). 카드는 텍스트가 많아 quality도 0.9.
      const uri = await captureRef(isRound ? roundRefs.current[roundStyleIdx] : cardRef, { format: 'png', quality: 1, pixelRatio: 4 });
      // 평면 벡터 카드(모집·일정·초대)는 PNG로 업로드 — 둥근 모서리 투명도를 JPEG가 흰색으로 굳혀
      //   어두운 격식 초대장 하단에 '하얀 티'가 보이던 문제 방지. 사진 많은 라운딩 카드는 용량 때문에 JPEG 유지.
      const flatCard = isRoundup || isSchedule || isInvite;
      const url = await uploadDmImage(uri, { quality: 0.95, ...(flatCard ? { format: 'png' } : {}) });
      const targets = [...selectedDm];
      // 모집 공유(초대)면 roundupId를 메시지에 실어 수신측 DM에 '모집 보러 가기' 버튼 → 라운지 상세로 바로 참여.
      const roundupMeta = (isRoundup && moment?.id)
        ? { roundupId: moment.id, roundupScope: moment.scope || 'friends', ...(moment.authorUid ? { roundupHost: moment.authorUid } : {}) }
        : null;
      // ★대화방을 먼저 보장(ensureConversation) — 메시지 생성 규칙이 members()=대화방 문서를 get()으로 읽어,
      //   상대와 처음 DM하는 경우(방 미존재) 메시지 create가 거부돼 수신자가 못 받던 버그 수정.
      //   정상 채팅은 입장 시 ensureConversation을 부르지만 이 공유 경로엔 없었음(첫 대화일 때만 실패=들쭉날쭉).
      const results = await Promise.all(targets.map(fid =>
        ensureConversation(fid)
          .then(() => sendImageMessageUrl(fid, url, false, roundupMeta))
          .then(() => true)
          .catch(e => { if (__DEV__) console.warn('[dmShare] send fail', fid, e?.message); return false; })));
      const sent = results.filter(Boolean).length;
      setDmPickerOpen(false);
      // 거짓 성공 방지 — 전부 실패/일부 실패/전부 성공을 정확히 구분해 안내.
      if (sent === 0) {
        setAlert({ title: '전송에 실패했어요', message: '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] });
      } else if (sent < targets.length) {
        setAlert({ title: '일부만 전송됐어요', message: `${targets.length}명 중 ${sent}명에게 보냈어요.`, buttons: [{ text: '확인', onPress: onClose }] });
      } else {
        setAlert({ title: 'DM으로 보냈어요', message: `${targets.length}명에게 카드를 보냈어요.`, buttons: [{ text: '확인', onPress: onClose }] });
      }
    } catch (e) {
      setAlert({ title: '전송에 실패했어요', message: e?.message || '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] });
    } finally { setDmSending(false); }
  };

  // 크루 공유 — 내 크루 목록 로드 후 다중선택 시트 오픈(모집 전용)
  const openCrewPicker = async () => {
    setSelectedCrews([]); setCrewPickerOpen(true); setCrewsLoading(true);
    try { const uid = await getUid(); setCrews(uid ? await loadMyCrews(uid) : []); } catch { setCrews([]); }
    finally { setCrewsLoading(false); }
  };
  const toggleCrew = (id) => setSelectedCrews(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
  // 선택한 크루(들)에 모집 카드 게시 — addCrewPost(roundupId+roundupHost). 핀이 roundupId로 중복 제거하므로 같은 모집 재게시도 무해.
  const shareToCrews = async () => {
    if (crewPosting || !selectedCrews.length || !moment?.id) return;
    setCrewPosting(true);
    try {
      const uid = await getUid();
      if (!uid) throw new Error('not-auth');
      const host = moment.authorUid || uid;
      const results = await Promise.all(selectedCrews.map(cid =>
        addCrewPost(cid, { authorUid: uid, text: '', media: [], roundupId: moment.id, roundupHost: host, roundupShare: true })
          .then(() => true).catch(e => { if (__DEV__) console.warn('[crewShare] post fail', cid, e?.message); return false; })));
      const ok = results.filter(Boolean).length;
      setCrewPickerOpen(false);
      if (ok === 0) {
        setAlert({ title: '공유에 실패했어요', message: '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] });
      } else if (ok < selectedCrews.length) {
        setAlert({ title: '일부만 올렸어요', message: `${selectedCrews.length}개 중 ${ok}개 크루에 올렸어요.`, buttons: [{ text: '확인', onPress: onClose }] });
      } else {
        setAlert({ title: '크루에 공유했어요', message: `${ok}개 크루 피드에 모집 카드를 올렸어요.`, buttons: [{ text: '확인', onPress: onClose }] });
      }
    } catch (e) {
      setAlert({ title: '공유에 실패했어요', message: e?.message || '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] });
    } finally { setCrewPosting(false); }
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
                        <Comp item={roundMoment} width={CARD_WIDTH} />
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
                        ? (moment.inviteStyle === 'formal'
                            ? <RoundupShareCardFormal post={moment} width={CARD_WIDTH} />   // 친구지정 격식
                            : <RoundupShareCard post={moment} width={CARD_WIDTH} />)          // 편안(보딩패스)·일반 공유
                        : moment.kind === 'milestone'
                          ? <MilestoneCard item={moment} />
                          : <HallOfFameCard item={moment} />}
                </View>
              </ViewShot>
            )}

            {/* 대표 사진 고르기 — 업로드한 사진 중 카드 배경에 쓸 것을 일시 선택(원본 대표순서는 안 바뀜). 사진 2장↑일 때만.
                매거진·기념·폴라로이드 카드에 즉시 반영(스코어카드는 사진 미사용). */}
            {isRound && roundPhotos.length > 1 && (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>
                  카드 배경 사진
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                  {roundPhotos.map((p, i) => {
                    const uri = resolvePhotoUri(typeof p === 'object' ? p?.uri : p);
                    const sel = i === coverIdx;
                    return (
                      <TouchableOpacity key={i} onPress={() => setCoverIdx(i)} activeOpacity={0.8}
                        style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden',
                          borderWidth: sel ? 2.5 : 1, borderColor: sel ? C.burgundy : C.hairline }}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
                        {sel && (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(107,30,42,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: fs(12), color: C.butter }}>✓</Text>
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 8, lineHeight: 17, textAlign: 'center' }}>
              {(isRoundup || isSchedule || isInvite) && onShareLink
                ? '‘공유하기’는 카드 이미지만 전송돼요(링크 없음).\n받는 분이 바로 열어볼 수 있게 ‘링크 공유’도 함께 보내주세요.'
                : (isRoundup || isSchedule || isInvite || isRound)
                  ? '카드 이미지로 공유돼요.\nDear Golf 마크가 들어가요.'
                  : '투명 배경 PNG로 저장돼요.\n카드에 Dear Golf 마크가 들어가요.'}
            </Text>

            {/* 공유 옵션 — 종류별 순서. 링크 공유가 가장 중요(받는 분 바로 열람·설치 funnel)라 링크 있는 종류는 최상단.
                · 모집/일정(링크+DM): 링크 → 디엠 공유하기 → 카드 이미지 공유하기 → 이미지 저장
                · 라운딩기록(링크 없음): 공유하기 → 디엠 공유하기 → 이미지 저장
                · 친구 초대(DM 없음): 공유하기 → 링크 공유 → 이미지 저장
                카카오톡 공유는 딥링크 미연동으로 보류([[invite-deeplink-system]]). */}
            <View style={{ gap: 10, marginTop: 22 }}>
              {(() => {
                const disabled = sharing || saving;
                const btn = (key, icon, label, bg, fg) => (
                  <TouchableOpacity key={key} activeOpacity={0.85}
                    onPress={() => { if (key === 'link') onShareLink?.(); else if (key === 'dm') openDmPicker(); else if (key === 'crew') openCrewPicker(); else handleOption(key); }}
                    disabled={disabled}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: bg, borderRadius: 12, height: 48, opacity: disabled ? 0.5 : 1 }}>
                    <Text style={{ fontSize: fs(16) }}>{icon}</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: fg }}>{label}</Text>
                  </TouchableOpacity>
                );
                const link = onShareLink ? btn('link', '🔗', '링크 공유', C.navy, '#fff') : null;
                // 라운딩기록은 '디엠으로 보내기'(현행), 모집·일정은 '디엠 공유하기'.
                const dm = !isInvite ? btn('dm', '💬', isRound ? '디엠으로 보내기' : '디엠 공유하기', '#6B1E2A', '#F5E6A8') : null;
                // 크루 공유 — 모집만. 내 크루 '진행 중인 모집' 핀에 카드로(라운지 모집과 동일 진입).
                const crew = isRoundup ? btn('crew', '👥', '크루에 공유', '#5E7E42', '#fff') : null;
                // 카드 이미지 공유 — 모집·일정은 명칭을 '카드 이미지 공유하기'로(링크와 구분), 라운딩기록·초대는 '공유하기' 유지.
                const shareLabel = sharing ? '공유 준비 중...' : ((isRoundup || isSchedule) ? '카드 이미지 공유하기' : '공유하기');
                const share = btn('share', '📤', shareLabel, C.charcoal, '#fff');
                const save = btn('save', '🖼', saving ? '저장 중...' : '이미지 저장', C.butter, C.charcoal);
                const order = isInvite ? [share, link, save]
                  : isRound ? [share, dm, save]
                  : isRoundup ? [link, dm, crew, share, save]
                  : [link, dm, share, save];
                return order;
              })()}
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
                {/* 친구지정 모집 — 지정한 친구만 참여 가능. 미지정 친구에겐 카드만 가고 '모집 바로가기'가 안 떠 헷갈리던 점 안내. */}
                {isSelectRoundup && (
                  <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(0,11,92,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.navy, lineHeight: fs(18) }}>
                      💡 친구지정 모집은 지정한 친구만 참여할 수 있어요. 지정하지 않은 친구에겐 초대장만 전달되고 모집 참여는 안 돼요(결원에 새 친구를 넣으려면 모집을 수정해 추가하세요).
                    </Text>
                  </View>
                )}
                {/* 검색 — 친구 많을 때 빠르게 찾기. 이름(별명/닉네임/본명) 부분일치. */}
                {!friendsLoading && friends.length > 0 && (
                  <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                    <AppTextInput value={dmSearch} onChangeText={setDmSearch} placeholder="친구 이름 검색" placeholderTextColor={C.warmGrayLight}
                      style={{ backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} />
                  </View>
                )}
                {/* 그룹으로 선택 — 내가 만든 친구 그룹 칩 탭 → 멤버 전원 토글(멤버 있는 그룹만 노출). */}
                {!friendsLoading && dmGroups.length > 0 && friends.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, paddingHorizontal: 20, marginBottom: 6 }}>그룹으로 선택</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                      {dmGroups.map(g => {
                        const members = resolveGroupAudience(dmGroupMeta, [g.id]).filter(u => friends.some(f => f.id === u));
                        if (!members.length) return null;
                        const allSel = members.every(u => selectedDm.includes(u));
                        return (
                          <TouchableOpacity key={g.id} onPress={() => toggleDmGroup(g.id)} activeOpacity={0.8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                              backgroundColor: allSel ? C.burgundy : C.bgSecondary, borderWidth: allSel ? 0 : 1, borderColor: C.hairline }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupColor(dmGroups, g.id) }} />
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: allSel ? C.butter : C.charcoal }} numberOfLines={1}>{g.name}</Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: allSel ? 'rgba(245,230,168,0.85)' : C.warmGray }}>{members.length}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
                {friendsLoading ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>불러오는 중…</Text>
                ) : friends.length === 0 ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>아직 친구가 없어요.</Text>
                ) : dmList.length === 0 ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>검색 결과가 없어요.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
                    {dmList.map(f => {
                      const sel = selectedDm.includes(f.id);
                      const isComp = dmCompUids.has(f.id); // 이 라운딩 동반자 — 상단 정렬 + 칩 표시
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
                          {isComp && (
                            <View style={{ backgroundColor: 'rgba(107,30,42,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.burgundy }}>동반자</Text>
                            </View>
                          )}
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

          {/* 크루 다중선택 시트 — 모집을 선택한 크루(들) '진행 중인 모집' 핀에 카드로 올림 */}
          {crewPickerOpen && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setCrewPickerOpen(false)} />
              <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '72%', paddingBottom: 16 + insets.bottom }}>
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline }} />
                </View>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>크루에 모집 올리기</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingHorizontal: 20, paddingBottom: 8 }}>올릴 크루를 선택하세요 (여러 개 가능) · 크루 피드에 모집 카드 글로 올라가요</Text>
                {/* 친구공개/친구지정 모집 — 주최자와 친구 아닌 크루 멤버는 카드만 보이고 참여하려면 친구 신청 필요 안내. */}
                {isRoundup && moment?.scope !== 'all' && (
                  <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(0,11,92,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.navy, lineHeight: fs(18) }}>
                      💡 친구공개 모집이에요. 주최자와 친구가 아닌 크루 멤버에겐 ‘친구만 볼 수 있어요’로 표시되고, 참여하려면 친구 신청이 필요해요.
                    </Text>
                  </View>
                )}
                {crewsLoading ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>불러오는 중…</Text>
                ) : crews.length === 0 ? (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 28 }}>아직 크루가 없어요.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
                    {crews.map(c => {
                      const sel = selectedCrews.includes(c.id);
                      const cnt = (c.memberUids || []).length;
                      return (
                        <TouchableOpacity key={c.id} onPress={() => toggleCrew(c.id)} activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10,
                            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                            borderColor: sel ? C.burgundy : C.hairline, backgroundColor: sel ? C.burgundy : 'transparent',
                            alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <Text style={{ fontSize: fs(13), color: C.butter }}>✓</Text>}
                          </View>
                          <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{c.name || '크루'}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{cnt}명</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                  <TouchableOpacity onPress={shareToCrews} disabled={!selectedCrews.length || crewPosting} activeOpacity={0.85}
                    style={{ backgroundColor: C.burgundy, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center',
                      opacity: (!selectedCrews.length || crewPosting) ? 0.5 : 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>
                      {crewPosting ? '올리는 중…' : `올리기${selectedCrews.length ? ` (${selectedCrews.length})` : ''}`}
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
