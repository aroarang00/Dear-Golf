import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { OVERSEAS_COURSE_LOG, COURSE_LOG, DIARY_DATA, getCountryFlag } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses } from '../utils/userCourses';
import { getTop100Courses, matchVisitedTop100, getManualTop100Checks, saveManualTop100Checks } from '../utils/top100';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
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

function getRegionStyle(loc) {
  if (!loc) return REGION_STYLE.other;
  // 카카오 도로명 주소는 풀 행정명(경기도·서울특별시·강원특별자치도…)을 쓰므로 짧은/긴 형태 모두 매칭
  const first = loc.split(' ')[0];
  if (['서울', '서울특별시', '인천', '인천광역시', '경기', '경기도'].includes(first)) return REGION_STYLE.capital;
  if (['충북', '충청북도', '충남', '충청남도', '대전', '대전광역시', '세종', '세종특별자치시'].includes(first)) return REGION_STYLE.chungcheong;
  if (['강원', '강원도', '강원특별자치도'].includes(first)) return REGION_STYLE.gangwon;
  if (['경북', '경상북도', '경남', '경상남도', '대구', '대구광역시', '부산', '부산광역시', '울산', '울산광역시'].includes(first)) return REGION_STYLE.gyeongsang;
  if (['전북', '전북특별자치도', '전라북도', '전남', '전라남도', '광주', '광주광역시'].includes(first)) return REGION_STYLE.jeolla;
  if (['제주', '제주특별자치도', '제주도'].includes(first)) return REGION_STYLE.jeju;
  return REGION_STYLE.other;
}

const isStarTag = (t) => typeof t === 'string' && t.startsWith('★');

function RegionTag({ rs }) {
  return (
    <View style={{ backgroundColor: rs.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: rs.fg }}>{rs.label}</Text>
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
        <Text style={{ fontSize: fs(14), color: C.burgundy }}>✓</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Text style={dS.courseName}>{c.name}</Text>
            {c.rating > 0 && isOpen && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#C9A84C' }}>★ {c.rating}</Text>
            )}
          </View>
          <Text style={dS.courseLoc}>{c.visits}회 방문</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {c.courseId && navigation ? (
            <>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => navigation.navigate(ROUTES.COURSE, { openCourseId: c.courseId })}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Text style={{ fontSize: fs(18), color: C.warmGray }}>›</Text>
              </TouchableOpacity>
              <View style={{ width: 1, height: 14, backgroundColor: C.hairline }} />
            </>
          ) : null}
          <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{isOpen ? '▴' : '▾'}</Text>
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
        <Text style={{ fontSize: fs(14) }}>🗓️</Text>
        <View style={{ flex: 1 }}>
          <Text style={dS.courseName}>{c.name}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
            {c.latestDate || '날짜 미정'} · {c.visits}회 방문
          </Text>
        </View>
        <View style={{ backgroundColor: '#F0EDE6', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: 2 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray }}>미기록</Text>
        </View>
        <RegionTag rs={rs} />
      </View>
      <TouchableOpacity onPress={onAdd} activeOpacity={0.8}
        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter }}>✏️ 기록 추가하기 →</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CourseLogTab({ avgRating, navigation }) {
  const { schedules } = React.useContext(SchedulesContext);
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  const { diaries } = React.useContext(DiariesContext);
  const [region, setRegion] = useState('domestic');
  const [countryFilter, setCountryFilter] = useState('전체');
  const [expanded, setExpanded] = useState({});
  const [userCourses, setUserCourses] = useState([]);
  const [top100, setTop100] = useState([]);
  const [top100Open, setTop100Open] = useState(false);
  const [manualChecks, setManualChecks] = useState([]); // 사용자가 직접 체크한 100대 코스 rank
  const scrollRef = useRef(null);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // 등록 코스·100대·체크 로드 — 다이어리는 DiariesContext가 단일 소스라 별도 로드 X
  useEffect(() => {
    const load = async () => {
      const [uc, t100, checks] = await Promise.all([
        getUserCourses(),
        getTop100Courses(),
        getManualTop100Checks(),
      ]);
      setUserCourses(uc || []);
      if (t100 && t100.length) setTop100(t100);
      setManualChecks(checks || []);
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
    (diaries || []).filter(d => !d.overseas).forEach(d => { const e = entryOf(d.course); if (e) e.records.push(d); });
    // 해외 다이어리가 연결한 일정 id — overseas 플래그가 누락된 옛 데이터라도 국내로 새지 않게 방어
    const overseasLinkedSchedIds = new Set(
      (diaries || []).filter(d => d.overseas && d.scheduleId).map(d => d.scheduleId));
    // 예정(미래) 일정은 제외 — 지난 일정만 '완료된 라운딩'으로 집계
    // 해외 일정은 해외 탭에서 별도로 집계되므로 국내에서는 제외
    (schedules || []).forEach(s => {
      if (!isPast(s.date)) return;
      if (s.overseas || overseasLinkedSchedIds.has(s.id)) return;
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
        // 방문 = 라운딩 횟수 (1라운딩 1방문). 기록(다이어리) 전부 + 기록 없는 지난 일정. 같은 날 2라운딩(36홀)도 각각 셈.
        // (allDates 고유 날짜로 세면 같은 날 2개가 1로 합쳐져 코스코멘트·일정 횟수와 불일치 → 그 버그 수정)
        const unrecordedSched = e.scheduleEntries.filter(s =>
          !recs.some(r => (s.id && r.scheduleId === s.id) || (!r.scheduleId && r.date === s.date)));
        const visitCount = recs.length + unrecordedSched.length;
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
          visits: visitCount,
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

  // 해외 라운딩 — 다이어리 기록 + 지난 해외 일정 통합 집계
  const overseasCourses = React.useMemo(() => {
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
      if (!map[k]) map[k] = { key: k, name: k, country: '', records: [], scheduleEntries: [] };
      return map[k];
    };
    (diaries || []).filter(d => d.overseas).forEach(d => {
      const e = entryOf(d.course);
      if (!e) return;
      e.records.push(d);
      if (d.country && !e.country) e.country = d.country;
    });
    (schedules || []).forEach(s => {
      if (!isPast(s.date)) return;
      if (!s.overseas) return;
      const e = entryOf(s.course);
      if (!e) return;
      e.scheduleEntries.push(s);
      const sCountry = s.cityCountry || s.city || '';
      if (sCountry && !e.country) e.country = sCountry;
    });
    return Object.values(map)
      .filter(e => e.records.length > 0 || e.scheduleEntries.length > 0)
      .map(e => {
        const recs = e.records;
        const ratings = recs.map(r => r.starRating).filter(s => typeof s === 'number' && s > 0);
        const recDates = recs.map(r => r.date).filter(Boolean);
        const schedDates = e.scheduleEntries.map(s => s.date).filter(Boolean);
        const allDates = [...new Set([...recDates, ...schedDates])].sort((a, b) => (b || '').localeCompare(a || ''));
        // 방문 = 라운딩 횟수 (국내와 동일 정책). 기록 + 기록 없는 지난 일정, 같은 날도 각각 셈.
        const unrecordedSched = e.scheduleEntries.filter(s =>
          !recs.some(r => (s.id && r.scheduleId === s.id) || (!r.scheduleId && r.date === s.date)));
        const visitCount = recs.length + unrecordedSched.length;
        const latestRec = [...recs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        return {
          key: e.key, name: e.name, country: e.country,
          visits: visitCount,
          rating: ratings.length ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length * 10) / 10 : 0,
          tags: [...new Set(recs.flatMap(r => r.tags || []))],
          memo: latestRec?.memo || '',
          latestDate: allDates[0] || '',
        };
      })
      .sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
  }, [diaries, schedules]);

  // 100대 코스 체크 상태
  //  자동: 완료된 라운딩(다이어리 기록 + 지난 일정)이 있는 코스
  //        — 예정 일정은 취소될 수 있어 제외, 일정 삭제 시 자동으로 해제됨
  //  수동: 사용자가 목록에서 직접 체크한 코스
  const autoCheckedRanks = React.useMemo(
    () => new Set(matchVisitedTop100(top100, myCourses.map(c => c.name)).map(c => c.rank)),
    [top100, myCourses],
  );
  const checkedRanks = React.useMemo(
    () => new Set([...autoCheckedRanks, ...manualChecks]),
    [autoCheckedRanks, manualChecks],
  );
  const checkedCount = checkedRanks.size;

  // 직접 체크 토글 — 자동 체크된 코스(라운딩 기록 있음)는 토글 불가
  const toggleManualCheck = (rank) => {
    setManualChecks(prev => {
      const next = prev.includes(rank) ? prev.filter(r => r !== rank) : [...prev, rank];
      saveManualTop100Checks(next);
      return next;
    });
  };

  // 기록 없는 카드 → 해당 골프장·날짜로 다이어리 기록 입력 화면 이동
  const handleAddRecord = (c) => {
    if (!navigation) return;
    navigation.navigate(ROUTES.MY, {
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
      <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: fg }}>{label}</Text>
    </View>
  );

  return (
    <>
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
      {/* 100대 코스 도전하기 — 컴팩트 배너 (탭하면 전체 목록) */}
      <TouchableOpacity
        style={[dS.banner, { backgroundColor: '#fff', borderColor: '#C9A84C', borderWidth: 1.5 }]}
        activeOpacity={0.85}
        onPress={() => setTop100Open(true)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[dS.bannerTitle, { color: '#3D3935' }]}>100대 코스 도전하기</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(18), color: '#C9A84C', fontWeight: '700' }}>{checkedCount}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}> / 100</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: '#A88A2E', marginLeft: 6 }}>›</Text>
          </View>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: '#F0EDE6', marginTop: 8, overflow: 'hidden' }}>
          <View style={{ height: 5, borderRadius: 3, backgroundColor: '#C9A84C', width: `${checkedCount}%` }} />
        </View>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 18, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 3, borderWidth: 0.5, borderColor: C.hairline }}>
        {[['domestic', '국내'], ['overseas', '해외']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, region === k && { backgroundColor: C.charcoal }]} onPress={() => setRegion(k)}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: region === k ? C.butter : C.warmGrayLight }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {region === 'domestic' && (
        <View>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 14, marginHorizontal: 16 }}>
            방문한 골프장 · {myCourses.length}곳
          </Text>
          {myCourses.length === 0 ? (
            <View style={{ marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 18 }}>
              <Text style={{ fontSize: fs(30), marginBottom: 10 }}>⛳</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>
                다녀온 코스가 여기 모여요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 19, marginBottom: 16 }}>
                예정 라운딩을 추가하거나 과거에 다녀온 라운딩을 일정에 등록하면 — 따로 코스 기록을 하지 않아도 다녀온 골프장의 통계와 기록이 자동으로 모여요.
              </Text>
              <View style={{ gap: 12 }}>
                {[
                  ['🗓️', '예정·지난 라운딩을 일정에 등록하면 자동으로 집계돼요'],
                  ['✈️', "해외 라운딩은 '해외' 탭에서 따로 모아 볼 수 있어요"],
                  ['🏆', '다녀온 100대 코스를 체크하며 도전할 수 있어요'],
                ].map(([icon, txt]) => (
                  <View key={txt} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <Text style={{ fontSize: fs(14) }}>{icon}</Text>
                    <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>{txt}</Text>
                  </View>
                ))}
              </View>
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
      {region === 'overseas' && (() => {
        const hint = (
          <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: C.hairline }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
              💡 해외 구장 데이터는 차차 보강해갈 예정이에요
            </Text>
          </View>
        );
        return (
        <View>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: overseasCourses.length === 0 ? 10 : 14, marginHorizontal: 16 }}>
            해외 골프장 · {overseasCourses.length}곳
          </Text>
          {overseasCourses.length === 0 && hint}
          {overseasCourses.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>아직 해외 라운딩 기록이 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>라운딩 기록 추가에서 '해외'를 선택하면 모여요</Text>
            </View>
          ) : overseasCourses.map(c => (
            <View key={c.key} style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: C.paleSky }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: fs(15) }}>✈️</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={dS.courseName}>{c.name}</Text>
                    {c.country ? (
                      <View style={{ backgroundColor: C.paleSky, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {getCountryFlag(c.country) ? <Text style={{ fontSize: fs(14) }}>{getCountryFlag(c.country)}</Text> : null}
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.navy }}>{c.country}</Text>
                      </View>
                    ) : null}
                    {c.rating > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#C9A84C' }}>{'★'.repeat(Math.round(c.rating))}</Text>
                    )}
                  </View>
                  <Text style={dS.courseLoc}>{c.visits}회 방문</Text>
                </View>
              </View>
              {c.tags.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 10, marginBottom: c.memo ? 10 : 0 }}>
                  {c.tags.map((t, i) => <View key={`ot${i}`} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
                </View>
              )}
              {c.memo ? <Text style={[dS.courseMemo, { marginTop: c.tags.length > 0 ? 0 : 10 }]}>"{c.memo}"</Text> : null}
            </View>
          ))}
          {overseasCourses.length > 0 && hint}
        </View>
        );
      })()}
      <View style={{ height: 32 }} />
    </ScrollView>

    {/* 100대 코스 전체 목록 모달 */}
    <Modal visible={top100Open} animationType="slide" onRequestClose={() => setTop100Open(false)}>
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ backgroundColor: C.charcoal, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.butter }}>🏆 100대 코스 도전하기</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>한국골프관광협회 2024-2025</Text>
            </View>
            <TouchableOpacity onPress={() => setTop100Open(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: fs(20), color: 'rgba(255,255,255,0.7)' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.13)', overflow: 'hidden' }}>
              <View style={{ height: 7, borderRadius: 4, backgroundColor: '#C9A84C', width: `${checkedCount}%` }} />
            </View>
            <Text style={{ fontFamily: F.en, fontSize: fs(15), color: C.butter, fontWeight: '700' }}>
              {checkedCount}<Text style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.5)' }}> / 100</Text>
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, paddingHorizontal: 18, paddingTop: 10, lineHeight: 16 }}>
          완료한 라운딩은 자동 체크 · 다녀온 곳은 오른쪽 ○를 탭해 직접 체크할 수 있어요
        </Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}>
          {top100.length === 0 ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>목록을 불러오는 중…</Text>
            </View>
          ) : top100.map(c => {
            const checked = checkedRanks.has(c.rank);
            const isAuto = autoCheckedRanks.has(c.rank);
            return (
              <View key={c.rank} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 18, paddingVertical: 9,
                backgroundColor: checked ? '#FBF7EE' : 'transparent',
              }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(14), fontWeight: '700', width: 30, color: checked ? '#A88A2E' : C.warmGrayLight }}>
                  {c.rank}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: checked ? F.sysB : F.sysM, fontSize: fs(15), color: C.charcoal }}>
                    {c.name}
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 1 }}>
                    {c.region}{isAuto ? ' · 라운딩 기록' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { if (!isAuto) toggleManualCheck(c.rank); }}
                  activeOpacity={isAuto ? 1 : 0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  {checked ? (
                    <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: fs(15), color: '#fff', fontWeight: '800' }}>✓</Text>
                    </View>
                  ) : (
                    <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 1.5, borderColor: C.warmGrayLight }} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
    </>
  );
}
