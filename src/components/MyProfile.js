import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { C, F } from '../constants/colors';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { UserContext } from '../contexts/UserContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { calcHandicap } from '../utils/handicap';
import { fetchKakaoProfileImage } from '../utils/kakaoAuth';
import { persistPhoto, resolvePhotoUri } from '../utils/photoStorage';
import { HandicapInfoModal } from './common/HandicapInfoModal';
import { TrustGradeModal } from './common/TrustBadge';
import { pickNames } from '../constants/roundup';

// 특별한 순간 타입 → 한글 라벨
const SPECIAL_LABEL = { 'HOLE IN ONE': '홀인원', 'EAGLE': '이글', 'ALBATROSS': '알바트로스' };

// 내 프로필 전용 알럿/액션시트 — 네이티브 Modal이 아닌 오버레이 View로 띄운다.
// (Modal로 띄우면 닫히는 도중 네이티브 사진 피커와 전환이 충돌해 피커가 안 뜬다)
function LocalAlert({ data, onClose }) {
  if (!data) return null;
  const buttons = data.buttons && data.buttons.length ? data.buttons : [{ text: '확인' }];
  const inRow = buttons.length <= 2;
  const btnStyle = (b) => {
    if (b.style === 'destructive') return { bg: C.burgundy, fg: C.butter, border: false };
    if (b.style === 'cancel') return { bg: C.bgSecondary, fg: C.warmGray, border: true };
    return { bg: C.charcoal, fg: C.butter, border: false };
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 340 }}>
        {!!data.title && (
          <Text style={{ fontFamily: F.sys, fontSize: 16, fontWeight: '700', color: C.charcoal, textAlign: 'center', marginBottom: data.message ? 8 : 18 }}>
            {data.title}
          </Text>
        )}
        {!!data.message && (
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            {data.message}
          </Text>
        )}
        <View style={{ flexDirection: inRow ? 'row' : 'column', gap: 8 }}>
          {buttons.map((b, i) => {
            const s = btnStyle(b);
            return (
              <TouchableOpacity key={i} activeOpacity={0.85}
                onPress={() => { onClose(); b.onPress && b.onPress(); }}
                style={{ flex: inRow ? 1 : undefined, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                  backgroundColor: s.bg, borderWidth: s.border ? 0.5 : 0, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: s.fg, fontWeight: b.style === 'cancel' ? '400' : '600' }}>
                  {b.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// 내 프로필 — 친구에게 보이는 모습 미리보기 + 공개 범위 설정
export function MyProfile({ visible, onClose }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { diaries } = React.useContext(DiariesContext);
  const [editing, setEditing] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false);
  const [alert, setAlert] = useState(null);   // 프로필 내 알럿/액션시트

  const myGrade = getTrustGrade(userProfile.hostedCount || 0, userProfile.mannerScore || 0);
  const myManner = getMannerGrade(userProfile.mannerScore || 70);

  const showLocal = (title, message, buttons) => setAlert({ title, message, buttons });

  useEffect(() => {
    if (visible) setEditing(false);
  }, [visible]);

  // userProfile 일부 갱신 + 로컬 저장
  const persist = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };

  // 갤러리에서 이미지 선택 — aspect: [w,h] 자르기 비율.
  // iOS 시스템 피커(PHPicker)는 별도 권한 요청이 필요 없어 바로 띄운다.
  const pickImage = async (aspect) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.8,
      });
      return result.canceled ? null : await persistPhoto(result.assets[0].uri);
    } catch (e) {
      console.warn('[MyProfile] 이미지 선택 오류', e?.message);
      return null;
    }
  };

  // 아바타 변경 — 갤러리 / 카카오 프로필(연동 시) / 기본 이미지
  const changeAvatar = () => {
    const buttons = [
      {
        text: '갤러리에서 선택',
        onPress: async () => { const uri = await pickImage([1, 1]); if (uri) persist({ avatarUri: uri }); },
      },
    ];
    if (userProfile.kakaoLinked) {
      buttons.push({
        text: '카카오 프로필 사진 가져오기',
        onPress: async () => {
          const uri = await fetchKakaoProfileImage();
          if (uri) persist({ avatarUri: uri });
          else showLocal('가져오지 못했어요', '카카오 프로필 사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        },
      });
    }
    if (userProfile.avatarUri) {
      buttons.push({ text: '기본 이미지로 변경', style: 'destructive', onPress: () => persist({ avatarUri: null }) });
    }
    buttons.push({ text: '취소', style: 'cancel' });
    showLocal('프로필 사진', '프로필 사진을 어떻게 바꿀까요?', buttons);
  };

  const name = userProfile.nickname || '나';
  const initial = name.charAt(0);
  const myDiaries = diaries || [];
  // 핸디 — 베스트 3개 라운드 평균. 기록 없으면 수동 입력값 폴백
  const avg = calcHandicap(myDiaries, userProfile.avgScore);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 팔레스카이 */}
          <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>내 프로필</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setEditing((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '700' }}>
                {editing ? '완료' : '편집'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
            {/* 프로필 — 인스타그램 스타일: 아바타(좌) + 이름·핸디·등급(우) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
              backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              {/* 아바타 — 편집 모드에서 탭하면 변경 */}
              <View>
                <TouchableOpacity activeOpacity={editing ? 0.85 : 1} disabled={!editing} onPress={changeAvatar}
                  style={{ width: 104, height: 104, borderRadius: 52,
                    backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {userProfile.avatarUri ? (
                    <Image source={{ uri: resolvePhotoUri(userProfile.avatarUri) }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text style={{ fontFamily: F.en, fontSize: 42, color: '#fff' }}>{initial}</Text>
                  )}
                </TouchableOpacity>
                {editing && (
                  <View style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16,
                    backgroundColor: C.charcoal, borderWidth: 2, borderColor: C.bgPrimary,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13 }}>📷</Text>
                  </View>
                )}
              </View>

              {/* 이름 · 핸디 · 등급 — 아바타 오른쪽 */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 20, color: C.charcoal, fontWeight: '700' }}>{name}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 핸디 — 베스트 3개 라운드 평균. 탭하면 계산 방식 설명 */}
                  <TouchableOpacity onPress={() => setHandicapInfoOpen(true)} activeOpacity={0.7}
                    style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>
                      핸디 {avg ?? '—'}
                    </Text>
                  </TouchableOpacity>
                  {/* 활동 등급 — 탭하면 등급 설명 */}
                  <TouchableOpacity onPress={() => setGradeModalOpen(true)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{myGrade.emoji}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, fontWeight: '700' }}>{myGrade.label}</Text>
                  </TouchableOpacity>
                  {/* 매너 등급 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                    borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{myManner.emoji}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: myManner.color, fontWeight: '700' }}>{myManner.label}</Text>
                  </View>
                </View>
                {/* 주최 · 참석 횟수 */}
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 8 }}>
                  주최 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{userProfile.hostedCount || 0}</Text>회
                  {'  ·  '}
                  참석 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{userProfile.attendedCount || 0}</Text>회
                </Text>
                {editing && (
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 8 }}>
                    프로필 사진을 탭하면 바꿀 수 있어요
                  </Text>
                )}
              </View>
            </View>

            {/* 통계 박스 제거 — 친구에겐 평균타(핸디)만 공개. 명함의 '핸디 N' 뱃지로 노출 */}

          </ScrollView>

          {/* 신뢰 등급 설명 팝업 */}
          <TrustGradeModal visible={gradeModalOpen} highlightKey={myGrade.key}
            onClose={() => setGradeModalOpen(false)} />

          {/* 핸디 계산 방식 설명 */}
          <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />
        </SafeAreaView>

        {/* 사진 변경 액션시트 / 알럿 — 화면 전체 위에 오버레이 */}
        <LocalAlert data={alert} onClose={() => setAlert(null)} />
      </SafeAreaProvider>
    </Modal>
  );
}
