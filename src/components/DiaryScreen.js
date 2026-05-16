import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { DIARY_DATA, HALL_OF_FAME } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { HallOfFameCard } from './HallOfFameCard';
import { DiaryCard } from './DiaryCard';
import { DiaryDetail } from './DiaryDetail';
import { DiaryAddModal } from './DiaryAddModal';

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
  const { userProfile } = React.useContext(UserContext);
  const { setSchedules } = React.useContext(SchedulesContext);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [addSeed, setAddSeed] = useState(null);
  const [hofExpanded, setHofExpanded] = useState(false);
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [hallOfFame, setHallOfFame] = useState(HALL_OF_FAME);
  const [diariesHydrated, setDiariesHydrated] = useState(false);
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
      const [d, h] = await Promise.all([
        storage.load(STORAGE_KEYS.diaries, DIARY_DATA),
        storage.load(STORAGE_KEYS.hof, HALL_OF_FAME),
      ]);
      setDiaries(d);
      setHallOfFame(h);
      setDiariesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!diariesHydrated) return;
    storage.save(STORAGE_KEYS.diaries, diaries);
  }, [diaries, diariesHydrated]);

  useEffect(() => {
    if (!diariesHydrated) return;
    storage.save(STORAGE_KEYS.hof, hallOfFame);
  }, [hallOfFame, diariesHydrated]);

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

  const sortedDiaries = [...diaries].sort((a, b) => {
    const dateA = new Date((a.date || '').replace(/\./g, '-'));
    const dateB = new Date((b.date || '').replace(/\./g, '-'));
    return dateB - dateA;
  });

  if (selected) return <DiaryDetail item={selected} onClose={() => setSelected(null)}
    onUpdate={(updated) => {
      setDiaries(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
    }}
    onDelete={handleDeleteDiary} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.warmGray, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 2 }}>나의 골프 이야기</Text>
          <Text style={{ fontFamily: F.en, fontSize: 32, color: C.butter, fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>Diary</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => { setAddSeed(null); setShowModal(true); }} activeOpacity={0.7}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5E6A8', alignItems: 'center', justifyContent: 'center' }}>
            {/* + 아이콘 — 얇은 선 2개로 원 중앙에 정확히 배치 */}
            <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: '#3D3935' }} />
            <View style={{ position: 'absolute', width: 2, height: 14, borderRadius: 1, backgroundColor: '#3D3935' }} />
          </TouchableOpacity>
        </View>
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
                  {hofExpanded && hallOfFame.map(item => <HallOfFameCard key={item.id} item={item} />)}
                  <View style={{ height: 8 }} />
                </View>
              ) : (
                /* 특별한 기록이 아직 없을 때 — 명예의 전당 잠금 티저 */
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={dS.hofSectionLabel}>명예의 전당</Text>
                  <View style={{ marginTop: 10, marginBottom: 8, backgroundColor: '#2A2622', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center' }}>
                    <Text style={{ fontSize: 26 }}>🔒</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#C9A84C', fontWeight: '600', marginTop: 8 }}>아직 특별한 순간이 없어요</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6, textAlign: 'center', lineHeight: 17 }}>
                      홀인원 · 알바트로스 · 이글을 기록하면{'\n'}명예의 전당 카드가 만들어져요
                    </Text>
                  </View>
                </View>
              )}

              {filtered.length === 0 ? (
                <View style={dS.emptyWrap}>
                  <Text style={dS.emptyMsg}>검색 결과가 없어요</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                  {filtered.map((item, idx) => (
                    <View key={item.id} style={dS.tlNode}>
                      {idx < filtered.length - 1 && <View style={dS.tlLine} />}
                      <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, item.special && dS.tlDotSpecial]} />
                      <DiaryCard item={item} avgScore={avgScore} onPress={(it) => setSelected(it)} />
                    </View>
                  ))}
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          </>
        );
      })()}

      <DiaryAddModal visible={showModal} onClose={() => setShowModal(false)} onSave={handleSave} initial={addSeed} />
    </SafeAreaView>
  );
}
