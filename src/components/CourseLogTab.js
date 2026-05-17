import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { OVERSEAS_COURSE_LOG, COURSE_LOG, DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses } from '../utils/userCourses';
import { getTop100Courses, matchVisitedTop100 } from '../utils/top100';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { dS } from '../styles/dS';

const REGION_STYLE = {
  capital:     { bg: '#C8D9E6', fg: C.navy, label: '수도권' },
  chungcheong: { bg: '#F5E6A8', fg: '#5A4500', label: '충청' },
  gangwon:     { bg: '#6B8B5E', fg: '#fff',    label: '강원' },
  gyeongsang:  { bg: '#8B8680', fg: '#fff',    label: '경상' },
  jeolla:      { bg: '#8B5E6B', fg: '#fff',    label: '전라' },
  jeju:        { bg: '#6B1E2A', fg: '#F5E6A8', label: '제주' },
  other:       { bg: '#8B8680', fg: '#fff',    label: '국내' },
};

const OVERSEAS_STYLE = { bg: '#C8D9E6', fg: C.navy };

// 위치 정보가 없을 때
const ETC_STYLE = { bg: '#B8B3AB', fg: '#fff', label: '기타' };

// MY 헤더와 동일한 네이비
const NAVY = C.navy;

function getRegionStyle(loc) {
  if (!loc) return REGION_STYLE.other;
  const first = loc.split(' ')[0];
  if (['서울', '인천', '경기'].includes(first)) return REGION_STYLE.capital;
  if (['충북', '충남', '대전', '세종'].includes(first)) return REGION_STYLE.chungcheong;
  if (first === '강원') return REGION_STYLE.gangwon;
  if (['경북', '경남', '대구', '부산', '울산'].includes(first)) return REGION_STYLE.gyeongsang;
  if (['전북', '전남', '광주'].includes(first)) return REGION_STYLE.jeolla;
  if (first === '제주') return REGION_STYLE.jeju;
  return REGION_STYLE.other;
}

const isStarTag = (t) => typeof t === 'string' && t.startsWith('★');

function RegionTag({ rs }) {
  return (
    <View style={{ backgroundColor: rs.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 11, color: rs.fg, fontWeight: '500' }}>{rs.label}</Text>
    </View>
  );
}

// 기록 있는 카드 — 접으면 콤팩트, 펼치면 베스트/평균·태그·메모 (정신없지 않게)
function RecordedCard({ c, rs, navigation, isOpen, onToggle }) {
  return (
    <TouchableOpacity
      style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: rs.bg }]}
      activeOpacity={0.85}
      onPress={onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ fontSize: 14, color: C.burgundy }}>✓</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Text style={dS.courseName}>{c.name}</Text>
            {c.rating > 0 && isOpen && (
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {c.rating}</Text>
            )}
          </View>
          <Text style={dS.courseLoc}>{c.visits}회 방문</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {c.courseId && navigation ? (
            <>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => navigation.navigate('코스', { openCourseId: c.courseId })}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Text style={{ fontSize: 18, color: C.warmGrayLight }}>›</Text>
              </TouchableOpacity>
              <View style={{ width: 1, height: 14, backgroundColor: C.hairline }} />
            </>
          ) : null}
          <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{isOpen ? '▴' : '▾'}</Text>
          </View>
        </View>
      </View>

      {/* 접힌 상태 — 지역 뱃지 + 별점(해외 카드처럼 ★ 기호 태그로) */}
      {!isOpen && (
        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.rating > 0 && (
            <View style={dS.tag}><Text style={dS.tagTxt}>{'★'.repeat(Math.round(c.rating))}</Text></View>
          )}
          <RegionTag rs={rs} />
        </View>
      )}

      {/* 펼친 상태 — 스코어카드 + 태그 + 메모 */}
      {isOpen && (
        <>
          <View style={dS.recordRow}>
            <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
            <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best || '-'}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
            <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg || '-'}</Text><Text style={dS.recLblButter}>평균</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: c.memo ? 10 : 0 }}>
            {c.tags.map((t, i) => <View key={`f${i}`} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
            <RegionTag rs={rs} />
          </View>
          {c.memo ? <Text style={dS.courseMemo}>"{c.memo}"</Text> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

// 기록 없는 카드 — 완료된 일정만 있고 다이어리 기록이 없음
function UnrecordedCard({ c, rs, onAdd }) {
  return (
    <View style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: C.warmGrayLight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 14 }}>🗓️</Text>
        <View style={{ flex: 1 }}>
          <Text style={dS.courseName}>{c.name}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 2 }}>
            {c.latestDate || '날짜 미정'} · {c.visits}회 방문
          </Text>
        </View>
        <View style={{ backgroundColor: '#F0EDE6', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: 2 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, fontWeight: '600' }}>미기록</Text>
        </View>
        <RegionTag rs={rs} />
      </View>
      <TouchableOpacity onPress={onAdd} activeOpacity={0.8}
        style={{ backgroundColor: NAVY, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '600' }}>✏️ 기록 추가하기 →</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CourseLogTab({ avgRating, navigation }) {
  const { schedules } = React.useContext(SchedulesContext);
  const [region, setRegion] = useState('domestic');
  const [countryFilter, setCountryFilter] = useState('전체');
  const [expanded, setExpanded] = useState({});
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [userCourses, setUserCourses] = useState([]);
  const [top100, setTop100] = useState([]);
  const [top100Open, setTop100Open] = useState(false);
  const scrollRef = useRef(null);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // 라운딩 기록 + 등록 코스 로드 — 탭 진입 시마다 갱신 (다이어리 기록 후 즉시 반영)
  useEffect(() => {
    const load = async () => {
      const [d, uc, t100] = await Promise.all([
        storage.load(STORAGE_KEYS.diaries, DIARY_DATA),
        getUserCourses(),
        getTop100Courses(),
      ]);
      setDiaries(d || DIARY_DATA);
      setUserCourses(uc || []);
      if (t100 && t100.length) setTop100(t100);
    };
    load();
    if (!navigation) return;
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  // MY 탭 재탭 시 — 목록 맨 위로 + 기본 상태(국내·100대 접힘·카드 접힘)로
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setRegion('domestic');
      setExpanded({});
    });
    return unsub;
  }, [navigation]);

  // 다이어리 + 완료된 일정을 골프장별로 집계 (예정 라운딩은 제외 — 완료된 라운딩만)
  const myCourses = React.useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const isPast = (date) => {
      if (!date) return false;
      return new Date(date.replace(/\./g, '-')).getTime() < todayMs;
    };
    const map = {};
    const entryOf = (name) => {
      const k = (name || '').trim();
      if (!k) return null;
      if (!map[k]) map[k] = { name: k, records: [], scheduleEntries: [] };
      return map[k];
    };
    (diaries || []).forEach(d => { const e = entryOf(d.course); if (e) e.records.push(d); });
    // 예정(미래) 일정은 제외 — 지난 일정만 '완료된 라운딩'으로 집계
    (schedules || []).forEach(s => {
      if (!isPast(s.date)) return;
      const e = entryOf(s.course);
      if (e) e.scheduleEntries.push(s);
    });

    return Object.values(map)
      .filter(e => e.records.length > 0 || e.scheduleEntries.length > 0)
      .map(e => {
        const recs = e.records;
        const hasRecord = recs.length > 0;
        const scores = recs.map(r => r.score).filter(s => typeof s === 'number' && s > 0);
        const ratings = recs.map(r => r.starRating).filter(s => typeof s === 'number' && s > 0);
        const recDates = recs.map(r => r.date).filter(Boolean);
        const schedDates = e.scheduleEntries.map(s => s.date).filter(Boolean);
        const allDates = [...new Set([...recDates, ...schedDates])].sort((a, b) => (b || '').localeCompare(a || ''));
        const courseId = recs.find(r => r.courseId)?.courseId
          || e.scheduleEntries.find(s => s.courseId)?.courseId || null;
        let loc = '';
        if (courseId) {
          loc = userCourses.find(u => u.id === courseId)?.loc
            || COURSE_LOG.find(c => c.id === courseId)?.loc || '';
        }
        if (!loc) loc = COURSE_LOG.find(c => c.name === e.name)?.loc || '';
        const latestRec = [...recs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        return {
          key: e.name,
          name: e.name,
          courseId,
          loc,
          hasRecord,
          visits: allDates.length,
          latestDate: allDates[0] || '',
          best: scores.length ? Math.min(...scores) : 0,
          avg: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
          rating: ratings.length ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length * 10) / 10 : 0,
          memo: latestRec?.memo || '',
          tags: [...new Set(recs.flatMap(r => r.tags || []))],
        };
      })
      .sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
  }, [diaries, schedules, userCourses]);

  // 100대 코스 중 방문한 코스 (myCourses = 다이어리·지난 일정으로 집계된 방문 골프장)
  const visitedTop100 = React.useMemo(
    () => matchVisitedTop100(top100, myCourses.map(c => c.name)),
    [top100, myCourses],
  );
  const visitedTop100Set = React.useMemo(
    () => new Set(visitedTop100.map(c => c.rank)),
    [visitedTop100],
  );

  // 기록 없는 카드 → 해당 골프장·날짜로 다이어리 기록 입력 화면 이동
  const handleAddRecord = (c) => {
    if (!navigation) return;
    navigation.navigate('다이어리', {
      openAddModal: true,
      addDate: c.latestDate || undefined,
      addCourse: c.name,
      addCourseId: c.courseId || undefined,
    });
  };

  const countries = ['전체', ...new Set(OVERSEAS_COURSE_LOG.map(c => c.country))];
  const filteredOverseas = countryFilter === '전체' ? OVERSEAS_COURSE_LOG : OVERSEAS_COURSE_LOG.filter(c => c.country === countryFilter);

  const renderRegionTag = (bg, fg, label) => (
    <View style={{ backgroundColor: bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 11, color: fg, fontWeight: '500' }}>{label}</Text>
    </View>
  );

  return (
    <>
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
      {/* 100대 코스 도전하기 — 방문 현황 (탭하면 전체 목록) */}
      <TouchableOpacity
        style={[dS.banner, { backgroundColor: '#fff', borderColor: '#C9A84C', borderWidth: 1.5 }]}
        activeOpacity={0.85}
        onPress={() => setTop100Open(true)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[dS.bannerTitle, { color: '#3D3935' }]}>100대 코스 도전하기</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#A88A2E', fontWeight: '600' }}>전체 보기 ›</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
          <Text style={{ fontFamily: F.en, fontSize: 30, color: '#C9A84C', fontWeight: '700' }}>{visitedTop100.length}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray }}>/ 100 곳 방문</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F0EDE6', marginTop: 8, overflow: 'hidden' }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#C9A84C', width: `${visitedTop100.length}%` }} />
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 8 }}>
          {top100.length === 0
            ? '목록을 불러오는 중…'
            : visitedTop100.length === 0
              ? '🏌️ 한국 100대 골프코스, 몇 곳이나 가보셨나요?'
              : `한국 100대 골프코스 중 ${visitedTop100.length}곳을 다녀왔어요`}
        </Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 18, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 3, borderWidth: 0.5, borderColor: C.hairline }}>
        {[['domestic', '국내'], ['overseas', '해외']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, region === k && { backgroundColor: C.charcoal }]} onPress={() => setRegion(k)}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: region === k ? C.butter : C.warmGrayLight }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {region === 'domestic' && (
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 14, marginHorizontal: 16 }}>
            방문한 골프장 · {myCourses.length}곳
          </Text>
          {myCourses.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>아직 등록된 코스가 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>지난 일정이 있거나 라운딩을 기록하면 모여요</Text>
            </View>
          ) : myCourses.map(c => {
            const rs = c.loc ? getRegionStyle(c.loc) : ETC_STYLE;
            return c.hasRecord
              ? <RecordedCard key={c.key} c={c} rs={rs} navigation={navigation}
                  isOpen={!!expanded[c.key]} onToggle={() => toggle(c.key)} />
              : <UnrecordedCard key={c.key} c={c} rs={rs} onAdd={() => handleAddRecord(c)} />;
          })}
        </View>
      )}
      {region === 'overseas' && (
        <View style={{ paddingHorizontal: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {countries.map(country => (
                <TouchableOpacity key={country} style={[dS.tag, countryFilter === country && { backgroundColor: C.charcoal }]} onPress={() => setCountryFilter(country)}>
                  <Text style={[dS.tagTxt, countryFilter === country && { color: C.butter }]}>
                    {country === '전체' ? '전체' : `${OVERSEAS_COURSE_LOG.find(c => c.country === country)?.flag} ${country}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {filteredOverseas.map(c => {
            const stars = (c.tags || []).filter(isStarTag);
            const features = (c.tags || []).filter(t => !isStarTag(t));
            const isOpen = !!expanded[c.id];
            const rs = { bg: OVERSEAS_STYLE.bg, fg: OVERSEAS_STYLE.fg, label: c.country };
            return (
              <TouchableOpacity key={c.id}
                style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: rs.bg }]}
                activeOpacity={0.85}
                onPress={() => toggle(c.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 20 }}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={dS.courseName}>{c.name}</Text>
                      {avgRating && avgRating(c.id) > 0 && (
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {avgRating(c.id)}</Text>
                      )}
                    </View>
                    <Text style={dS.courseLoc}>{c.loc} · {c.visits}회 방문</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={() => navigation && navigation.navigate('코스', { openCourseId: c.id })}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={{ fontSize: 18, color: C.warmGrayLight }}>›</Text>
                    </TouchableOpacity>
                    <View style={{ width: 1, height: 14, backgroundColor: C.hairline }} />
                    <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{isOpen ? '▴' : '▾'}</Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: isOpen ? 10 : 0 }}>
                  {stars.map((t, i) => <View key={`s${i}`} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
                  {!isOpen && renderRegionTag(rs.bg, rs.fg, rs.label)}
                </View>

                {isOpen && (
                  <>
                    <View style={dS.recordRow}>
                      <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                      <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                      <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      {features.map((t, i) => <View key={`f${i}`} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
                      {renderRegionTag(rs.bg, rs.fg, rs.label)}
                    </View>
                    <Text style={dS.courseMemo}>"{c.memo}"</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>

    {/* 100대 코스 전체 목록 모달 */}
    <Modal visible={top100Open} animationType="slide" onRequestClose={() => setTop100Open(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
          <View>
            <Text style={{ fontFamily: F.sys, fontSize: 16, color: C.charcoal, fontWeight: '700' }}>100대 코스 도전하기</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 2 }}>
              한국골프관광협회 2024-2025 · {visitedTop100.length}/100 방문
            </Text>
          </View>
          <TouchableOpacity onPress={() => setTop100Open(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 22, color: C.warmGray }}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
          {top100.length === 0 ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>목록을 불러오는 중…</Text>
            </View>
          ) : top100.map(c => {
            const visited = visitedTop100Set.has(c.rank);
            const rs = getRegionStyle(c.region);
            return (
              <View key={c.rank} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 18, paddingVertical: 10,
                backgroundColor: visited ? '#FBF7EE' : 'transparent',
              }}>
                <Text style={{ fontFamily: F.en, fontSize: 14, fontWeight: '700', width: 30, color: visited ? '#A88A2E' : C.warmGrayLight }}>
                  {c.rank}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: visited ? '700' : '400' }}>
                    {c.name}
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 1 }}>{c.region}</Text>
                </View>
                {visited ? (
                  <View style={{ backgroundColor: '#C9A84C', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', fontWeight: '600' }}>✓ 방문</Text>
                  </View>
                ) : (
                  <RegionTag rs={rs} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
    </>
  );
}
