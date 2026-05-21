import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { C, F } from '../constants/colors';
import { HALL_OF_FAME } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { showAppAlert } from './AppAlert';
import { HallOfFameCard } from './HallOfFameCard';
import { ShareMomentModal } from './ShareMomentModal';
import { DiaryCard } from './DiaryCard';
import { DiaryDetail } from './DiaryDetail';
import { DiaryAddModal } from './DiaryAddModal';
import { GolfLedgerModal } from './GolfLedgerModal';
import { MyPageModal } from './MyPageModal';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { calcHandicap } from '../utils/handicap';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';

// 빈 상태 예시 카드용 더미 데이터 (실제 DiaryCard 컴포넌트로 렌더)
const SAMPLE_DIARY = {
  id: 'sample', date: '2026.05.24', day: '토',
  course: '제이드팰리스 GC', score: 88, par: 72,
  memo: '드라이버가 잘 맞은 날 ⛳', badge: null, special: null,
  photos: [], tags: ['넓은 페어웨이', '그린 빠름'], birdieCount: 2, companions: [],
};

// 라운딩 기록 → 명예의 전당 카드 엔트리. diaryId로 기록과 연결해 수정 시 동기화 가능
function buildHofEntry(data, diaryId) {
  return {
    id: 'hof_' + diaryId,
    diaryId,
    type: data.special,
    date: data.date,
    course: data.course,
    hole: data.specialHole,
    par: data.specialPar || 3,
    distance: data.specialDist || '',
    ball: data.specialBall || '',
    // 라운딩 동반자(나 제외)를 카드에 연동
    companions: (data.companions || []).filter(c => !c.isMe).map(c => c.name),
    memo: data.specialMemo || '',
  };
}

// 라운딩 기록 → 퍼스트 싱글 명예의 전당 엔트리 (라운드 단위 성취 — 80타 미만)
function buildSingleHofEntry(data, diaryId) {
  return {
    id: 'hof_single_' + diaryId,
    diaryId,
    type: '퍼스트 싱글',
    date: data.date,
    course: data.course,
    score: data.score,
    companions: (data.companions || []).filter(c => !c.isMe).map(c => c.name),
    memo: data.memo || '',
  };
}

export function DiaryScreen({ route, navigation }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { setSchedules } = React.useContext(SchedulesContext);
  const { diaries, setDiaries } = React.useContext(DiariesContext);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false); // 골프 가계부
  const [showMyPage, setShowMyPage] = useState(false); // 설정 (마이페이지)
  const [gradeModalOpen, setGradeModalOpen] = useState(false); // 신뢰 등급 설명
  const [mannerModalOpen, setMannerModalOpen] = useState(false); // 매너 등급 설명
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false); // 핸디 계산 설명
  const [statsExpanded, setStatsExpanded] = useState(true); // 통계 박스 펼침 (기본 펼침, 검색 토글과 독립)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false); // 프로필 사진 변경 시트
  const [addSeed, setAddSeed] = useState(null);
  const [hofExpanded, setHofExpanded] = useState(false);
  const [hofTeaserDismissed, setHofTeaserDismissed] = useState(false); // 명예의 전당 티저 '다시 보지 않기' 여부
  const [hallOfFame, setHallOfFame] = useState(HALL_OF_FAME);
  const [hofHydrated, setHofHydrated] = useState(false);
  const [shareMoment, setShareMoment] = useState(null);   // 특별한 순간 공유 대상
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState('전체');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setSelected(null);
      setShowModal(false);
      setShowSearch(false);
      setHofExpanded(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const [h, teaserDismissed] = await Promise.all([
        storage.load(STORAGE_KEYS.hof, HALL_OF_FAME),
        storage.load(STORAGE_KEYS.hofTeaserDismissed, false),
      ]);
      setHallOfFame(h);
      setHofHydrated(true);
      setHofTeaserDismissed(teaserDismissed);
    })();
  }, []);

  useEffect(() => {
    if (!hofHydrated) return;
    storage.save(STORAGE_KEYS.hof, hallOfFame);
  }, [hallOfFame, hofHydrated]);

  useEffect(() => {
    if (route?.params?.openDiaryId) {
      const target = diaries.find(d => d.id === route.params.openDiaryId);
      if (target) setSelected(target);
    }
  }, [route?.params?.openDiaryId]);

  useEffect(() => {
    if (route?.params?.openAddModal) {
      // 일정 캘린더·내 코스기록에서 날짜·골프장을 미리 채워서 전달
      const { addDate, addCourse, addCourseId } = route.params;
      setAddSeed((addDate || addCourse)
        ? { date: addDate, course: addCourse, courseId: addCourseId }
        : null);
      setShowModal(true);
      navigation.setParams({ openAddModal: undefined, addDate: undefined, addCourse: undefined, addCourseId: undefined });
    }
  }, [route?.params?.openAddModal]);

  const handleSave = (type, data) => {
    if (type === 'diary') {
      const newD = {
        id: String(Date.now()),
        date: data.date, day: data.day, course: data.course,
        score: data.score, par: 72, memo: data.memo || '',
        badge: null, weather: data.weather,
        special: data.special || null,
        specialHole: data.specialHole || null,
        specialPar: data.specialPar || null,
        specialDist: data.specialDist || '',
        specialBall: data.specialBall || '',
        specialMemo: data.specialMemo || '',
        companions: data.companions || [{ name: userProfile.nickname, isMe: true }],
        photos: data.photos || [],
        starRating: data.starRating || 0,
        tags: data.tags || [],
        detailMemo: data.detailMemo || '',
        courseId: data.courseId || null,
        cost: data.cost || null,
      };
      setDiaries(prev => [newD, ...prev]);
      setHallOfFame(prev => {
        let next = prev;
        // 특별한 순간(홀인원·이글·알바트로스) 카드
        if (data.special) next = [buildHofEntry(data, newD.id), ...next];
        // 퍼스트 싱글 — 80타 미만 첫 기록 시 1회 자동 등재
        if (data.score <= 79 && !prev.some(h => h.type === '퍼스트 싱글')) {
          next = [buildSingleHofEntry(data, newD.id), ...next];
        }
        return next;
      });
    } else if (type === 'diary-edit') {
      setDiaries(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d));
      // 명예의 전당 동기화 — 홀 성취 카드(hof_<diaryId>)만 등재/갱신/해제
      // (퍼스트 싱글 카드는 최초 1회 마일스톤이라 수정으로 건드리지 않음)
      setHallOfFame(prev => {
        const holeId = 'hof_' + data.id;
        const exists = prev.some(h => h.id === holeId);
        if (data.special) {
          return exists
            ? prev.map(h => h.id === holeId ? buildHofEntry(data, data.id) : h)
            : [buildHofEntry(data, data.id), ...prev];
        }
        return exists ? prev.filter(h => h.id !== holeId) : prev;
      });
    }
  };

  // 다이어리 기록 삭제 — diaryOnly: 기록만 / all: 같은 날짜·골프장의 일정까지 삭제
  const handleDeleteDiary = (target, mode) => {
    setDiaries(prev => prev.filter(d => d.id !== target.id));
    // 연결된 명예의 전당 카드도 함께 삭제
    setHallOfFame(prev => prev.filter(h => h.diaryId !== target.id));
    if (mode === 'all') {
      setSchedules(prev => prev.filter(s => !(s.date === target.date && s.course === target.course)));
    }
    setSelected(null);
  };

  // 명예의 전당 티저 '다시 보지 않기' — 영구 감춤
  const dismissHofTeaser = () => {
    setHofTeaserDismissed(true);
    storage.save(STORAGE_KEYS.hofTeaserDismissed, true);
  };

  const sortedDiaries = [...diaries].sort((a, b) => {
    const dateA = new Date((a.date || '').replace(/\./g, '-'));
    const dateB = new Date((b.date || '').replace(/\./g, '-'));
    return dateB - dateA;
  });

  // 퍼스트 싱글 명예의 전당 카드와 연결된 다이어리 id — 피드 배지 표시용
  const firstSingleId = hallOfFame.find(h => h.type === '퍼스트 싱글')?.diaryId;

  if (selected) return <DiaryDetail item={selected} onClose={() => setSelected(null)}
    onUpdate={(updated) => {
      setDiaries(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
    }}
    onDelete={handleDeleteDiary} />;

  // 프로필 사진 변경 — 갤러리·카카오·기본
  const persistProfile = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };
  const pickAvatarImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      return result.canceled ? null : result.assets[0].uri;
    } catch (e) {
      console.warn('[DiaryScreen] 이미지 선택 오류', e?.message);
      return null;
    }
  };
  // 자체 오버레이 시트로 처리 — Modal 위에서 갤러리 피커 호출 시 전환 충돌 회피
  const avatarOptions = [
    { text: '갤러리에서 선택', onPress: async () => { const uri = await pickAvatarImage(); if (uri) persistProfile({ avatarUri: uri }); } },
    { text: '카카오 프로필 가져오기 (준비 중)', onPress: () => showAppAlert('준비 중이에요', '카카오 프로필 연동은 곧 추가될 예정이에요.') },
    ...(userProfile.avatarUri
      ? [{ text: '기본 이미지로 변경', danger: true, onPress: () => persistProfile({ avatarUri: null }) }]
      : []),
  ];

  // 명함·통계용 값
  const myName = userProfile.nickname || '나';
  const myInitial = myName.charAt(0);
  const myGrade = getTrustGrade(userProfile.hostedCount || 0, userProfile.mannerScore || 0);
  const myManner = getMannerGrade(userProfile.mannerScore || 70);
  const myHandicap = calcHandicap(diaries, userProfile.avgScore);
  // 통계 박스 — 기록 있으면 다이어리 자동 집계, 하나도 없으면 수동 입력값 폴백
  const hasRecords = diaries.length > 0;
  const totalRounds = hasRecords ? diaries.length : (userProfile.totalRounds || null);
  const avgScore = hasRecords
    ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length)
    : (userProfile.avgScore || null);
  const bestScore = hasRecords
    ? Math.min(...diaries.map(d => d.score))
    : (userProfile.lifeBest || null);
  const statBoxes = [
    { label: '총 라운딩', value: totalRounds },
    { label: '평균타', value: avgScore, hi: true },
    { label: '베스트', value: bestScore },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 명함 영역 — 헤더 제거, 아바타 + 닉네임·등급 + 주최/참석, 우상단에 💰·⚙️ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, backgroundColor: C.bgPrimary }}>
        <View style={{ position: 'absolute', top: 14, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 1 }}>
          <TouchableOpacity onPress={() => setShowLedger(true)} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>💰</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 80 }}>
          {/* 아바타 — 탭하면 사진 변경 액션시트 */}
          <View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setAvatarSheetOpen(true)}
              style={{ width: 80, height: 80, borderRadius: 40,
                backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {userProfile.avatarUri ? (
                <Image source={{ uri: userProfile.avatarUri }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ fontFamily: F.en, fontSize: 32, color: '#fff' }}>{myInitial}</Text>
              )}
            </TouchableOpacity>
            <View pointerEvents="none" style={{ position: 'absolute', right: -2, bottom: -2,
              width: 26, height: 26, borderRadius: 13, backgroundColor: C.charcoal,
              borderWidth: 2, borderColor: C.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12 }}>📷</Text>
            </View>
          </View>
          {/* 닉네임·핸디 / 신뢰·매너 등급 / 주최·참석 — 3단 */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 17, color: C.charcoal, fontWeight: '700' }}>{myName}</Text>
              {/* 핸디 — 베스트 3개 평균. 탭하면 계산 방식 설명 */}
              <TouchableOpacity onPress={() => setHandicapInfoOpen(true)} activeOpacity={0.7}
                style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.butter, fontWeight: '700' }}>핸디 {myHandicap ?? '—'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => setGradeModalOpen(true)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12 }}>{myGrade.emoji}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.charcoal, fontWeight: '700' }}>{myGrade.label}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMannerModalOpen(true)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12 }}>{myManner.emoji}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: myManner.color, fontWeight: '700' }}>{myManner.label}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 6 }}>
              주최 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{userProfile.hostedCount || 0}</Text>회
              {'  ·  '}
              참석 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{userProfile.attendedCount || 0}</Text>회
            </Text>
          </View>
        </View>
      </View>

      {/* 통계 토글 — 검색 토글과 완전히 독립. 기본 펼침 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
        {statsExpanded && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            {statBoxes.map((st, i) => (
              <View key={i} style={{
                flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
                backgroundColor: st.hi ? '#F5F0E4' : C.bgSecondary,
                borderWidth: st.hi ? 1 : 0.5, borderColor: st.hi ? C.burgundy : C.hairline,
              }}>
                <Text style={{ fontFamily: F.en, fontSize: 20, color: st.hi ? C.burgundy : C.charcoal, fontWeight: '700' }}>
                  {st.value != null ? st.value : '—'}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>{st.label}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity onPress={() => setStatsExpanded(v => !v)} activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 12 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, fontWeight: '600' }}>
            통계 {statsExpanded ? '접기' : '펼치기'}
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: 9, color: C.warmGrayLight }}>{statsExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {(() => {
        const FILTERS = ['전체', '올해', '최근 3개월', '베스트순', '특별한 순간'];

        const filtered = (() => {
          let list = sortedDiaries;
          const q = search.trim().toLowerCase();
          if (q) {
            list = list.filter(d => {
              if ((d.course || '').toLowerCase().includes(q)) return true;
              return (d.companions || []).some(c => (c.name || '').toLowerCase().includes(q));
            });
          }
          const now = new Date();
          if (filterKey === '올해') {
            list = list.filter(d => (d.date || '').startsWith(String(now.getFullYear())));
          } else if (filterKey === '최근 3개월') {
            const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
            list = list.filter(d => {
              const [y, m, day] = (d.date || '').split('.').map(Number);
              return y ? new Date(y, m - 1, day) >= cutoff : false;
            });
          } else if (filterKey === '특별한 순간') {
            list = list.filter(d => d.special != null);
          }
          if (filterKey === '베스트순') {
            list = [...list].sort((a, b) => a.score - b.score);
          }
          return list;
        })();

        const avgScore = diaries.length > 0
          ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length)
          : null;

        // 기록이 하나도 없을 때 — 빈 상태 (예시 카드 + CTA)
        if (diaries.length === 0) {
          return (
            <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', paddingTop: 40, paddingBottom: 48 }}>
              <Text style={{ fontSize: 40, marginBottom: 14 }}>⛳</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700', marginBottom: 6 }}>
                아직 라운딩 기록이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight, textAlign: 'center', lineHeight: 20 }}>
                첫 라운딩을 기록하면 이렇게 남아요
              </Text>
              <View style={{ width: '100%', marginTop: 22 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8, marginLeft: 16 }}>예시</Text>
                <View style={{ opacity: 0.6, paddingHorizontal: 16 }} pointerEvents="none">
                  <DiaryCard item={SAMPLE_DIARY} avgScore={null} onPress={() => {}} />
                </View>
              </View>
              <TouchableOpacity onPress={() => { setAddSeed(null); setShowModal(true); }} activeOpacity={0.85}
                style={{ marginTop: 18, backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 32 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '600' }}>✏️ 첫 기록 남기기</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        }

        return (
          <>
            <View style={dS.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }} contentContainerStyle={dS.filterTabRow}>
                {FILTERS.map(f => {
                  const on = filterKey === f;
                  return (
                    <TouchableOpacity key={f} activeOpacity={0.7}
                      style={[dS.filterTab, on && dS.filterTabOn]}
                      onPress={() => setFilterKey(on ? '전체' : f)}>
                      <Text style={[dS.filterTabTxt, on && dS.filterTabTxtOn]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity activeOpacity={0.6}
                style={dS.searchToggleBtn}
                onPress={() => {
                  if (showSearch) { setShowSearch(false); setSearch(''); }
                  else setShowSearch(true);
                }}>
                <Text style={[dS.searchToggleTxt, showSearch && { color: '#6B1E2A' }]}>🔍</Text>
              </TouchableOpacity>
            </View>

            {showSearch && (
              <View style={dS.searchWrap}>
                <Text style={dS.searchIcon}>🔍</Text>
                <TextInput
                  style={dS.searchInput}
                  placeholder="골프장 또는 동반자 이름"
                  placeholderTextColor={C.warmGrayLight}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                <TouchableOpacity activeOpacity={0.6}
                  onPress={() => { setShowSearch(false); setSearch(''); }}>
                  <Text style={dS.searchCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
              {hallOfFame.length > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity style={dS.hofToggle} onPress={() => setHofExpanded(!hofExpanded)}>
                    <Text style={dS.hofSectionLabel}>특별한 순간 · {hallOfFame.length}개</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C' }}>{hofExpanded ? '접기' : '펼치기'}</Text>
                  </TouchableOpacity>
                  {hofExpanded && hallOfFame.map(item => (
                    <HallOfFameCard key={item.id} item={item} onShare={() => setShareMoment(item)} />
                  ))}
                  <View style={{ height: 8 }} />
                </View>
              ) : !hofTeaserDismissed ? (
                /* 특별한 기록이 없을 때 — 명예의 전당 잠금 티저 ('다시 보지 않기' 전까지) */
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={dS.hofSectionLabel}>명예의 전당</Text>
                  <View style={{ marginTop: 10, marginBottom: 8, backgroundColor: '#2A2622', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center' }}>
                    <Text style={{ fontSize: 26 }}>🔒</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#C9A84C', fontWeight: '600', marginTop: 8 }}>아직 특별한 순간이 없어요</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6, textAlign: 'center', lineHeight: 17 }}>
                      홀인원 · 알바트로스 · 이글을 기록하면{'\n'}명예의 전당 카드가 만들어져요
                    </Text>
                    <TouchableOpacity onPress={dismissHofTeaser} activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 14 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecorationLine: 'underline' }}>더 이상 보지 않기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {filtered.length === 0 ? (
                <View style={dS.emptyWrap}>
                  <Text style={dS.emptyMsg}>검색 결과가 없어요</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                  {filtered.map((item, idx) => {
                    const isFS = !!firstSingleId && item.id === firstSingleId;
                    return (
                    <View key={item.id} style={dS.tlNode}>
                      {idx < filtered.length - 1 && <View style={dS.tlLine} />}
                      <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, (item.special || isFS) && dS.tlDotSpecial]} />
                      <DiaryCard item={item} avgScore={avgScore} isFirstSingle={isFS} onPress={(it) => setSelected(it)} />
                    </View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          </>
        );
      })()}

      {/* + 다이어리 추가 — 우하단 FAB */}
      <TouchableOpacity onPress={() => { setAddSeed(null); setShowModal(true); }} activeOpacity={0.85}
        style={{ position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
          backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}>
        <View style={{ width: 18, height: 2.5, borderRadius: 1, backgroundColor: '#fff' }} />
        <View style={{ position: 'absolute', width: 2.5, height: 18, borderRadius: 1, backgroundColor: '#fff' }} />
      </TouchableOpacity>

      <DiaryAddModal visible={showModal} onClose={() => setShowModal(false)} onSave={handleSave} initial={addSeed} />
      <GolfLedgerModal visible={showLedger} onClose={() => setShowLedger(false)} diaries={diaries} />
      <ShareMomentModal moment={shareMoment} visible={!!shareMoment} onClose={() => setShareMoment(null)} />
      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      <TrustGradeModal visible={gradeModalOpen} highlightKey={myGrade.key} onClose={() => setGradeModalOpen(false)} />
      <MannerGradeModal visible={mannerModalOpen} highlightKey={myManner.key} onClose={() => setMannerModalOpen(false)} />
      <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />

      {/* 프로필 사진 변경 시트 — 자체 오버레이 (Modal 전환 충돌 회피) */}
      {avatarSheetOpen && (
        <TouchableOpacity activeOpacity={1} onPress={() => setAvatarSheetOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: C.bgSecondary, borderRadius: 16, overflow: 'hidden' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, fontWeight: '700', textAlign: 'center', paddingTop: 16, paddingBottom: 12 }}>
              프로필 사진
            </Text>
            {avatarOptions.map((opt, i) => (
              <TouchableOpacity key={i} activeOpacity={0.6}
                onPress={() => { setAvatarSheetOpen(false); opt.onPress(); }}
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline,
                  backgroundColor: i === 0 ? '#FBF3D3' : 'transparent' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, fontWeight: i === 0 ? '700' : '500',
                  color: opt.danger ? C.warmGray : C.charcoal, textAlign: 'center' }}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity activeOpacity={0.6} onPress={() => setAvatarSheetOpen(false)}
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.warmGrayLight, textAlign: 'center' }}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
