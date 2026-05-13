import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { DIARY_DATA, HALL_OF_FAME } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { HallOfFameCard } from './HallOfFameCard';
import { DiaryCard } from './DiaryCard';
import { DiaryDetail } from './DiaryDetail';
import { FriendsTab } from './FriendsTab';
import { MyScheduleTab } from './MyScheduleTab';
import { DiaryAddModal } from './DiaryAddModal';
import { MyPageModal } from './MyPageModal';

export function DiaryScreen({ route, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [tab, setTab] = useState('round');
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
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
      setShowMyPage(false);
      setShowSearch(false);
      setTab('round');
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

  const [showMyPage, setShowMyPage] = useState(false);
  const statsAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const STATS_HEIGHT = 80;

  const showStatsTemporary = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(statsAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(statsAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }, 1500);
  };

  useEffect(() => {
    showStatsTemporary();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const TAB_DIARY = [['round', '내 라운딩'], ['log', '내 일정'], ['friends', '친구']];
  const TAB_DIARY_COLORS = [C.butter, C.paleSky, C.burgundy];

  useEffect(() => {
    if (route?.params?.openDiaryId) {
      const target = diaries.find(d => d.id === route.params.openDiaryId);
      if (target) setSelected(target);
    }
  }, [route?.params?.openDiaryId]);

  useEffect(() => {
    if (route?.params?.openAddModal) {
      setShowModal(true);
      navigation.setParams({ openAddModal: undefined });
    }
  }, [route?.params?.openAddModal]);

  useEffect(() => {
    const t = route?.params?.initialTab ?? route?.params?.tab;
    if (!t) return;
    const match = TAB_DIARY.find(([, label]) => label === t);
    if (match) setTab(match[0]);
  }, [route?.params?.initialTab, route?.params?.tab]);

  const handleSave = (type, data) => {
    if (type === 'diary') {
      const newD = {
        id: String(Date.now()),
        date: data.date, day: data.day, course: data.course,
        score: data.score, par: 72, memo: data.memo || '',
        badge: null, weather: data.weather,
        special: data.special || null,
        specialHole: data.specialHole || null,
        companions: data.companions || [{ name: userProfile.nickname, isMe: true }],
        photos: data.photos || [],
        starRating: data.starRating || 0,
        tags: data.tags || [],
        detailMemo: data.detailMemo || '',
        courseId: data.courseId || null,
      };
      setDiaries(prev => [newD, ...prev]);
      if (data.special) {
        const newHof = {
          id: String(Date.now()),
          type: data.special, date: data.date,
          course: data.course, hole: data.specialHole,
          par: 3, distance: data.specialDist || '',
          ball: data.specialBall || '', companions: [],
          memo: data.specialMemo || '',
        };
        setHallOfFame(prev => [newHof, ...prev]);
      }
    } else if (type === 'diary-edit') {
      setDiaries(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d));
    }
  };

  const avg = userProfile.avgScore || (diaries.length > 0 ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length) : 0);
  const best = userProfile.lifeBest || (diaries.length > 0 ? Math.min(...diaries.map(d => d.score)) : 0);
  const totalRounds = userProfile.totalRounds || diaries.length;
  const tabIdx = TAB_DIARY.findIndex(([k]) => k === tab);

  const sortedDiaries = [...diaries].sort((a, b) => {
    const dateA = new Date((a.date || '').replace(/\./g, '-'));
    const dateB = new Date((b.date || '').replace(/\./g, '-'));
    return dateB - dateA;
  });

  if (selected) return <DiaryDetail item={selected} onClose={() => setSelected(null)}
    onUpdate={(updated) => {
      setDiaries(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
    }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: '#6B6660', paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 2 }}>나의 골프 이야기</Text>
          <Text style={{ fontFamily: F.en, fontSize: 32, color: C.butter, fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>Diary</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
            style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: '#6B1E2A',
              borderWidth: 1.5, borderColor: '#F5E6A8',
              alignItems: 'center', justifyContent: 'center',
            }}>
            <Text style={{ fontFamily: F.en, fontSize: 14, color: '#F5E6A8', fontStyle: 'italic', lineHeight: 18 }}>
              {userProfile.nickname?.charAt(0).toUpperCase() || 'G'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.7}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5E6A8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: 20, color: '#3D3935', lineHeight: 24, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity onPress={showStatsTemporary} activeOpacity={1}>
        <Animated.View style={{
          height: statsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, STATS_HEIGHT] }),
          opacity: statsAnim,
          overflow: 'hidden',
        }}>
          <View style={dS.statsRow}>
            {[
              { label: '라운딩', value: totalRounds },
              { label: '평균타', value: avg, hi: true },
              { label: '베스트', value: best }
            ].map((st, i) => (
              <View key={i} style={[dS.statBox, st.hi && dS.statBoxHi]}>
                <Text style={[dS.statVal, st.hi && { color: C.burgundy }]}>{st.value}</Text>
                <Text style={dS.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
        <View style={{ paddingVertical: 7, alignItems: 'center', backgroundColor: C.bgPrimary }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1 }}>
            라운딩 {totalRounds} · 평균 {avg}타 · 베스트 {best}타  ∨
          </Text>
        </View>
      </TouchableOpacity>

      <View style={dS.tabStripeRow}>
        {TAB_DIARY_COLORS.map((color, i) => (
          <View key={i} style={[dS.tabStripeSegment, { backgroundColor: color }, tabIdx === i && dS.tabStripeSegmentOn]} />
        ))}
      </View>
      <View style={dS.tabRow}>
        {TAB_DIARY.map(([k, l]) => (
          <TouchableOpacity key={k} style={dS.tabBtn} onPress={() => setTab(k)}>
            <Text style={[dS.tabTxt, tab === k && dS.tabTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'round' && (() => {
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
              {hallOfFame.length > 0 && (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity style={dS.hofToggle} onPress={() => setHofExpanded(!hofExpanded)}>
                    <Text style={dS.hofSectionLabel}>특별한 순간 · {hallOfFame.length}개</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C' }}>{hofExpanded ? '접기' : '펼치기'}</Text>
                  </TouchableOpacity>
                  {hofExpanded && hallOfFame.map(item => <HallOfFameCard key={item.id} item={item} />)}
                  <View style={{ height: 8 }} />
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
      {tab === 'log' && (
        <MyScheduleTab
          onRequestAddDiary={() => {
            setTab('round');
            setShowModal(true);
          }}
        />
      )}
      {tab === 'friends' && <FriendsTab />}

      <DiaryAddModal visible={showModal} onClose={() => setShowModal(false)} onSave={handleSave} />
      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
    </SafeAreaView>
  );
}
