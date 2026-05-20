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
import { TrustGradeModal } from './common/TrustBadge';
import { WhoLikedModal } from './common/WhoLikedModal';
import { pickNames } from '../constants/roundup';

// 특별한 순간 타입 → 한글 라벨
const SPECIAL_LABEL = { 'HOLE IN ONE': '홀인원', 'EAGLE': '이글', 'ALBATROSS': '알바트로스' };

// 라운딩 피드 1건 — 특별한 순간이면 강조, 내 기록에 받은 좋아요 표시
function FeedCard({ item, onShowLikers }) {
  const par = item.par || 72;
  const diff = item.score - par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const isSpecial = !!item.special;
  // 더미 — 내 기록에 좋아요 누른 사람 (id 기반 결정적)
  const likers = pickNames('like' + (item.id || ''), ((item.id || '0').charCodeAt(0) || 0) % 4);

  return (
    <View style={{
      backgroundColor: isSpecial ? '#FBF6E8' : C.bgSecondary, borderRadius: 12,
      borderWidth: isSpecial ? 1 : 0.5, borderColor: isSpecial ? '#C9A84C' : C.hairline,
      padding: 14, marginBottom: 10,
    }}>
      {isSpecial && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <Text style={{ fontSize: 13 }}>🏆</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#8B6914', fontWeight: '700', letterSpacing: 1 }}>
            {SPECIAL_LABEL[item.special] || item.special}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{item.course}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{item.date}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <Text style={{ fontFamily: F.en, fontSize: 24, color: C.charcoal, fontWeight: '700' }}>{item.score}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>타 · {diffLabel}</Text>
        {item.badge ? (
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C', marginLeft: 4 }}>{item.badge}</Text>
        ) : null}
      </View>
      {item.memo ? (
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 6, lineHeight: 18 }}>"{item.memo}"</Text>
      ) : null}
      {/* 좋아요 — 내 기록에 누가 좋아요 눌렀는지 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10,
        borderTopWidth: 0.5, borderTopColor: isSpecial ? '#E8D9A8' : C.hairline }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontSize: 12 }}>👍</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '700', color: C.warmGray }}>{likers.length}</Text>
        </View>
        {likers.length > 0 && (
          <TouchableOpacity onPress={() => onShowLikers(likers)} activeOpacity={0.7}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>누가 좋아요 눌렀는지 보기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// "친구에게 비공개" 배지 — 공개 설정이 꺼진 섹션에 표시
function HiddenBadge() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFEADC', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 9 }}>🔒</Text>
      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, fontWeight: '600' }}>친구에게 비공개</Text>
    </View>
  );
}

// 공개 설정 토글 한 줄
function PrivacyRow({ icon, label, sub, on, onToggle }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11 }}>
      <Text style={{ fontSize: 16, marginRight: 10 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 2 }}>{sub}</Text>
      </View>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8}
        style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center',
          backgroundColor: on ? C.burgundy : C.hairline }}>
        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
          alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </TouchableOpacity>
    </View>
  );
}

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
  const [alert, setAlert] = useState(null);   // 프로필 내 알럿/액션시트
  const [likers, setLikers] = useState(null); // 좋아요 누른 사람 목록 팝업

  const privacy = userProfile.privacy || { stats: true, feed: true, phone: false };
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

  const togglePrivacy = (key) => {
    persist({ privacy: { ...privacy, [key]: !privacy[key] } });
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
      return result.canceled ? null : result.assets[0].uri;
    } catch (e) {
      console.warn('[MyProfile] 이미지 선택 오류', e?.message);
      return null;
    }
  };

  // 아바타 변경 — 갤러리 / 카카오(준비 중) / 기본 이미지
  const changeAvatar = () => {
    const buttons = [
      {
        text: '갤러리에서 선택',
        onPress: async () => { const uri = await pickImage([1, 1]); if (uri) persist({ avatarUri: uri }); },
      },
      {
        text: '카카오 프로필 가져오기 (준비 중)',
        onPress: () => showLocal('준비 중이에요', '카카오 프로필 연동은 곧 추가될 예정이에요.'),
      },
    ];
    if (userProfile.avatarUri) {
      buttons.push({ text: '기본 이미지로 변경', style: 'destructive', onPress: () => persist({ avatarUri: null }) });
    }
    buttons.push({ text: '취소', style: 'cancel' });
    showLocal('프로필 사진', '프로필 사진을 어떻게 바꿀까요?', buttons);
  };

  const name = userProfile.nickname || '나';
  const initial = name.charAt(0);
  const myDiaries = diaries || [];
  const rounds = userProfile.totalRounds || myDiaries.length;
  const avg = userProfile.avgScore
    || (myDiaries.length ? Math.round(myDiaries.reduce((s, d) => s + d.score, 0) / myDiaries.length) : 0);
  const best = userProfile.lifeBest
    || (myDiaries.length ? Math.min(...myDiaries.map(d => d.score)) : 0);
  // 라운딩 피드 — 다이어리에서 '나만보기'(private)로 한 기록은 제외, 공개 기록만 노출
  const feed = myDiaries
    .filter(d => d.privacy !== 'private')
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  const statBoxes = [
    { label: '총 라운딩', value: rounds },
    { label: '평균타', value: avg, hi: true },
    { label: '베스트', value: best },
  ];

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
                    <Image source={{ uri: userProfile.avatarUri }} style={{ width: '100%', height: '100%' }} />
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
                  {/* 핸디 — 마이페이지 평균타 값을 핸디로 사용 */}
                  <View style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>
                      핸디 {avg}
                    </Text>
                  </View>
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

            {/* 공개 설정 — 편집 모드에서만 표시 (한 번 설정하면 잘 안 바꾸는 항목) */}
            {editing && (
              <View style={{ marginTop: 14, marginHorizontal: 16, backgroundColor: C.bgSecondary,
                borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>친구에게 공개</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 4, lineHeight: 16 }}>
                  친구가 내 프로필을 볼 때 보이는 항목을 정할 수 있어요.
                </Text>
                <View style={{ height: 8 }} />
                <PrivacyRow icon="📊" label="통계 공개" sub="평균타 · 베스트 · 라운딩 수"
                  on={privacy.stats} onToggle={() => togglePrivacy('stats')} />
                <View style={{ height: 0.5, backgroundColor: C.hairline }} />
                <PrivacyRow icon="⛳" label="라운딩 피드 공개" sub="최근 라운딩 기록"
                  on={privacy.feed} onToggle={() => togglePrivacy('feed')} />
                <View style={{ height: 0.5, backgroundColor: C.hairline }} />
                <PrivacyRow icon="📱" label="전화번호 공개" sub={userProfile.phone || '설정 > 내 정보에서 입력'}
                  on={privacy.phone} onToggle={() => togglePrivacy('phone')} />
              </View>
            )}

            {/* 통계 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>통계</Text>
              <View style={{ flex: 1 }} />
              {!privacy.stats && <HiddenBadge />}
            </View>
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10, opacity: privacy.stats ? 1 : 0.45 }}>
              {statBoxes.map((st, i) => (
                <View key={i} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12,
                  backgroundColor: st.hi ? '#F5F0E4' : C.bgSecondary,
                  borderWidth: st.hi ? 1 : 0.5, borderColor: st.hi ? C.burgundy : C.hairline,
                }}>
                  <Text style={{ fontFamily: F.en, fontSize: 22, color: st.hi ? C.burgundy : C.charcoal, fontWeight: '700' }}>
                    {st.value != null ? st.value : '—'}
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* 라운딩 피드 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 22, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>라운딩 피드</Text>
              <View style={{ flex: 1 }} />
              {!privacy.feed && <HiddenBadge />}
            </View>
            <View style={{ paddingHorizontal: 16, opacity: privacy.feed ? 1 : 0.45 }}>
              {feed.length === 0 ? (
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 24 }}>
                  아직 라운딩 기록이 없어요
                </Text>
              ) : (
                feed.map(item => <FeedCard key={item.id} item={item} onShowLikers={setLikers} />)
              )}
            </View>
          </ScrollView>

          {/* 신뢰 등급 설명 팝업 */}
          <TrustGradeModal visible={gradeModalOpen} highlightKey={myGrade.key}
            onClose={() => setGradeModalOpen(false)} />

          {/* 좋아요 누른 사람 */}
          <WhoLikedModal names={likers} onClose={() => setLikers(null)} />
        </SafeAreaView>

        {/* 사진 변경 액션시트 / 알럿 — 화면 전체 위에 오버레이 */}
        <LocalAlert data={alert} onClose={() => setAlert(null)} />
      </SafeAreaProvider>
    </Modal>
  );
}
