import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { OVERSEAS_COURSE_LOG, COURSE_LOG, getCountryFlag } from '../constants/data';
import { syncUserCoursesFromFirestore } from '../utils/userCourses';
import { getTop100Courses, matchVisitedTop100, getManualTop100Checks, saveManualTop100Checks, normalizeCourseName } from '../utils/top100';
import { getGolfCourses } from '../utils/golfCourses';
import { Icon } from './common/Icon'; // 🏆 → 커스텀 트로피
import { isRoundDiary } from '../utils/diaryKind';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { UserContext } from '../contexts/UserContext';
import { ScoreStatsScreen, ScoreBanner } from './ScoreStatsScreen';
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

function RegionTag({ rs }) {
  return (
    <View style={{ backgroundColor: rs.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: rs.fg }}>{rs.label}</Text>
    </View>
  );
}

// 기록 있는 카드 — 구장명 + 통계박스 + (지역·별점 최근). 펼침 고정, 태그·메모·중복 방문 제거
function RecordedCard({ c, rs, navigation }) {
  return (
    <View style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: rs.bg }]}>
      {/* › 셰브론을 구장명 바로 옆에 + 구장명·셰브론을 탭 영역으로 — 작은 › 단독 타깃이라 정확히 안 눌리던 문제 개선.
          구장명만 탭해도 코스 이동(iOS·안드 공통, 2026-06-13) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: fs(14), color: C.burgundy }}>✓</Text>
        {c.courseId && navigation ? (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => navigation.navigate(ROUTES.COURSE, { openCourseId: c.courseId })}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 12 }}
            style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <Text style={[dS.courseName, { flexShrink: 1 }]} numberOfLines={1}>{c.name}</Text>
            <Text style={{ fontSize: fs(18), color: C.warmGray, marginLeft: 5 }}>›</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[dS.courseName, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
        )}
      </View>

      <View style={dS.recordRow}>
        <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
        <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best || '-'}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
        <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg || '-'}</Text><Text style={dS.recLblButter}>평균</Text></View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <RegionTag rs={rs} />
        {c.rating > 0 && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#C9A84C' }}>{'★'.repeat(Math.round(c.rating))}</Text>
        )}
      </View>
    </View>
  );
}

// 기록 없는 카드 — 완료된 일정만 있고 다이어리 기록이 없음
function UnrecordedCard({ c, rs, onAdd }) {
  return (
    <View style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: C.warmGrayLight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/* 일정만 있고 기록이 없는 카드 — 이모지 대신 커스텀 캘린더. 아이콘만 두면 밋밋해 옅은 원 배경을 깐다
            ([[project_deargolf_icon_convention]] 2026-07-22) */}
        <View style={{ width: fs(26), height: fs(26), borderRadius: fs(13), backgroundColor: '#F0EDE6',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" size={fs(15)} color={C.warmGray} strokeWidth={1.9} />
        </View>
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
        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 9,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="pen" size={fs(14)} color={C.butter} strokeWidth={1.9} />
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter }}>기록 추가하기 →</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CourseLogTab({ avgRating, navigation }) {
  const { schedules } = React.useContext(SchedulesContext);
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  const { diaries } = React.useContext(DiariesContext);
  const { userProfile } = React.useContext(UserContext);
  const [scoreStatsOpen, setScoreStatsOpen] = useState(false);
  const [region, setRegion] = useState('domestic');
  const [countryFilter, setCountryFilter] = useState('전체');
  const [userCourses, setUserCourses] = useState([]);
  const [masterCourses, setMasterCourses] = useState([]); // 전국 골프장 마스터 — 옛 기록 지역 복구용
  const [top100, setTop100] = useState([]);
  const [top100Open, setTop100Open] = useState(false);
  const [manualChecks, setManualChecks] = useState([]); // 사용자가 직접 체크한 100대 코스 rank
  const scrollRef = useRef(null);

  // 스코어 배너 계산·렌더는 공용 ScoreBanner로 위임(MY 명함 화면과 동일 컴포넌트).

  // 등록 코스·100대·체크 로드 — 다이어리는 DiariesContext가 단일 소스라 별도 로드 X
  useEffect(() => {
    const load = async () => {
      // 프레시설치 시 로컬 userCourses가 비어 코스 주소(loc)가 전부 누락 → 지역탭이 모두 '기타'로 떨어짐.
      // Firestore 동기화본을 써서 등록코스 주소를 확실히 확보 (실패 시 내부적으로 로컬 폴백)
      const [uc, t100, checks, master] = await Promise.all([
        syncUserCoursesFromFirestore(),
        getTop100Courses(),
        getManualTop100Checks(),
        getGolfCourses().catch(() => []),
      ]);
      setUserCourses(uc || []);
      if (t100 && t100.length) setTop100(t100);
      setManualChecks(checks || []);
      if (master && master.length) setMasterCourses(master);
    };
    load();
    if (!navigation) return;
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  // MY 탭 재탭 시 — 목록 맨 위로 + 기본 상태(국내·100대 접힘)로
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setRegion('domestic');
    });
    return unsub;
  }, [navigation]);

  // 전국 마스터 → 정규화 이름별 주소 맵. 옛 기록(주소·id 누락)의 지역 복구용.
  // 안전장치: 같은 정규화 이름이 서로 다른 지역(도)로 갈리면 모호 처리(null) — 오매칭 방지([[course-matching-accuracy]]).
  const masterLocByName = React.useMemo(() => {
    const m = new Map();
    for (const c of masterCourses) {
      const loc = c.loc || '';
      if (!loc) continue;
      const nm = normalizeCourseName(c.name);
      if (!nm) continue;
      if (!m.has(nm)) { m.set(nm, loc); continue; }
      const prev = m.get(nm);
      if (prev && getRegionStyle(prev).label !== getRegionStyle(loc).label) m.set(nm, null); // 지역 충돌 → 모호
    }
    return m;
  }, [masterCourses]);

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
    (diaries || []).filter(d => !d.overseas && isRoundDiary(d)).forEach(d => { const e = entryOf(d.course); if (e) e.records.push(d); }); // 일상(모멘트) 제외
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
        const recDates = recs.map(r => r.date).filter(Boolean);
        const schedDates = e.scheduleEntries.map(s => s.date).filter(Boolean);
        const allDates = [...new Set([...recDates, ...schedDates])].sort((a, b) => (b || '').localeCompare(a || ''));
        // 방문 = 라운딩 횟수 (1라운딩 1방문). 기록(다이어리) 전부 + 기록 없는 지난 일정. 같은 날 2라운딩(36홀)도 각각 셈.
        // (allDates 고유 날짜로 세면 같은 날 2개가 1로 합쳐져 코스코멘트·일정 횟수와 불일치 → 그 버그 수정)
        const unrecordedSched = e.scheduleEntries.filter(s =>
          !recs.some(r => (s.id && r.scheduleId === s.id) || (!r.scheduleId && r.date === s.date)));
        const visitCount = recs.length + unrecordedSched.length;
        // 미기록 카드 기록 진입 시 자동채울 티오프 — 가장 최근 미기록 일정 기준. 단체(teams>1)는 조별로 달라 제외.
        const latestUnrec = [...unrecordedSched].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
        const teeTime = (latestUnrec && !(latestUnrec.roundupId && (latestUnrec.teams || 1) > 1)) ? (latestUnrec.time || '') : '';
        const courseId = recs.find(r => r.courseId)?.courseId
          || e.scheduleEntries.find(s => s.courseId)?.courseId || null;
        const courseKakaoId = recs.find(r => r.courseKakaoId)?.courseKakaoId
          || e.scheduleEntries.find(s => s.courseKakaoId)?.courseKakaoId || null;
        // loc 해석 순서: ①기록에 직접 박힌 주소(courseLoc) → ②courseId → ③kakaoId → ④등록코스 이름 → ⑤정적 COURSE_LOG.
        // ①이 핵심 — 일정·기록 저장 시 주소를 동봉해, userCourses 동기화·미러 상태와 무관하게 지역탭이 항상 맞음 ([[region-classification]]).
        let loc = recs.find(r => r.courseLoc)?.courseLoc
          || e.scheduleEntries.find(s => s.courseLoc)?.courseLoc || '';
        if (!loc && courseId) loc = userCourses.find(u => u.id === courseId)?.loc
          || COURSE_LOG.find(c => c.id === courseId)?.loc || '';
        if (!loc && courseKakaoId) loc = userCourses.find(u => u.kakaoId === courseKakaoId)?.loc || '';
        if (!loc) loc = userCourses.find(u => u.name === e.name)?.loc || '';
        if (!loc) loc = COURSE_LOG.find(c => c.name === e.name)?.loc || '';
        // ⑥ 전국 마스터 정규화 완전일치 — 옛 기록(주소·id 누락)이 '기타'로 떨어지던 것 복구
        if (!loc) loc = masterLocByName.get(normalizeCourseName(e.name)) || '';
        // 별점은 가장 최근에 매긴 평점 하나만 반영 (평균 아님)
        const latestRatedRec = [...recs]
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .find(r => typeof r.starRating === 'number' && r.starRating > 0);
        return {
          key: e.name,
          name: e.name,
          courseId,
          loc,
          hasRecord,
          visits: visitCount,
          latestDate: allDates[0] || '',
          time: teeTime,   // 미기록 → 기록 진입 시 자동채울 티오프(없거나 단체면 빈칸)
          best: scores.length ? Math.min(...scores) : 0,
          avg: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
          rating: latestRatedRec?.starRating || 0,
        };
      })
      .sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
  }, [diaries, schedules, userCourses, masterLocByName]);

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
    (diaries || []).filter(d => d.overseas && isRoundDiary(d)).forEach(d => { // 일상(모멘트) 제외
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
        const recDates = recs.map(r => r.date).filter(Boolean);
        const schedDates = e.scheduleEntries.map(s => s.date).filter(Boolean);
        const allDates = [...new Set([...recDates, ...schedDates])].sort((a, b) => (b || '').localeCompare(a || ''));
        // 방문 = 라운딩 횟수 (국내와 동일 정책). 기록 + 기록 없는 지난 일정, 같은 날도 각각 셈.
        const unrecordedSched = e.scheduleEntries.filter(s =>
          !recs.some(r => (s.id && r.scheduleId === s.id) || (!r.scheduleId && r.date === s.date)));
        const visitCount = recs.length + unrecordedSched.length;
        const latestRatedRec = [...recs]
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .find(r => typeof r.starRating === 'number' && r.starRating > 0);
        return {
          key: e.key, name: e.name, country: e.country,
          visits: visitCount,
          rating: latestRatedRec?.starRating || 0,
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
      addTime: c.time || null,   // 코스의 최근 미기록 일정 티오프 자동채움(단체·없음이면 null=빈칸)
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
      {/* 100대 코스 도전하기 — 딥그린(앱 세이지 짙은 버전) 바탕 + 골드 포인트로 프리미엄 톤(채도 높은 골드 채움이
          촌스럽다는 피드백, 2026-06-29). 컴팩트 한 줄 유지. 탭하면 전체 목록 */}
      <TouchableOpacity
        style={[dS.banner, { backgroundColor: '#37503A', borderWidth: 0 }]}
        activeOpacity={0.85}
        onPress={() => setTop100Open(true)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon name="trophy" size={fs(17)} color="#E8C760" />
            <Text style={[dS.bannerTitle, { color: '#F4EFE2', fontFamily: F.sysB, marginBottom: 0 }]}>100대 코스 도전하기</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(18), color: '#E8C760' }}>{checkedCount}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.6)' }}> / 100</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: '#E8C760', marginLeft: 6 }}>›</Text>
          </View>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 8, overflow: 'hidden' }}>
          <View style={{ height: 5, borderRadius: 3, backgroundColor: '#D8B85E', width: `${checkedCount}%` }} />
        </View>
      </TouchableOpacity>
      {/* 내 스코어 — 진입 배너(공용 ScoreBanner). 탭 → 통계·추세·분포·구장별 전용 화면. [[feature-backlog]] ① */}
      <ScoreBanner diaries={diaries} userProfile={userProfile} onPress={() => setScoreStatsOpen(true)}
        style={{ marginTop: 2, marginBottom: 14 }} />
      {/* 국내/해외 — 언더라인 텍스트 탭 + 방문 개수(박스 토글 탈피, 세련). 선택=짙은 글씨+골드 밑줄 / 비선택=회색 */}
      <View style={{ flexDirection: 'row', gap: 22, marginHorizontal: 16, marginBottom: 16,
        borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        {[['domestic', '국내', myCourses.length], ['overseas', '해외', overseasCourses.length]].map(([k, l, n]) => {
          const on = region === k;
          return (
            <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setRegion(k)}
              style={{ paddingTop: 2, paddingBottom: 9, marginBottom: -0.5,
                borderBottomWidth: 2, borderBottomColor: on ? '#C9A84C' : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(14), color: on ? C.charcoal : C.warmGrayLight }}>{l}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: on ? '#A8801E' : C.warmGrayLight }}>{n}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {region === 'domestic' && (
        <View>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: Platform.OS === 'android' ? 10 : 14, marginHorizontal: 16 }}>
            방문한 골프장 · {myCourses.length}곳
          </Text>
          {myCourses.length === 0 ? (
            <View style={{ marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
              <View style={{ marginBottom: 10 }}><Icon name="flag" size={fs(30)} color="#5E8B60" strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>
                다녀온 코스가 여기 모여요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 19, marginBottom: 16 }}>
                예정 라운딩을 추가하거나 과거에 다녀온 라운딩을 일정에 등록하면 — 따로 코스 기록을 하지 않아도 다녀온 골프장의 통계와 기록이 자동으로 모여요.
              </Text>
              <View style={{ gap: 12 }}>
                {[
                  ['calendar', '예정·지난 라운딩을 일정에 등록하면 자동으로 집계돼요'],
                  ['plane', "해외 라운딩은 '해외' 탭에서 따로 모아 볼 수 있어요"],
                  ['trophy', '다녀온 100대 코스를 체크하며 도전할 수 있어요'],
                ].map(([icon, txt]) => (
                  <View key={txt} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <View style={{ marginTop: 1 }}><Icon name={icon} size={fs(15)} color={C.warmGray} strokeWidth={1.8} /></View>
                    <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>{txt}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : myCourses.map(c => {
            const rs = c.loc ? getRegionStyle(c.loc) : ETC_STYLE;
            return c.hasRecord
              ? <RecordedCard key={c.key} c={c} rs={rs} navigation={navigation} />
              : <UnrecordedCard key={c.key} c={c} rs={rs} onAdd={() => handleAddRecord(c)} />;
          })}
        </View>
      )}
      {region === 'overseas' && (() => {
        const hint = (
          <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <View style={{ marginTop: 1 }}><Icon name="bulb" size={fs(13)} color={C.charcoal} strokeWidth={1.8} /></View>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                해외 구장 데이터는 차차 보강해갈 예정이에요
              </Text>
            </View>
          </View>
        );
        return (
        <View>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: overseasCourses.length === 0 ? 10 : (Platform.OS === 'android' ? 10 : 14), marginHorizontal: 16 }}>
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
                <Icon name="plane" size={fs(15)} color="#3E6E8E" strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <Text style={dS.courseName}>{c.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {c.country ? (
                      <View style={{ backgroundColor: C.paleSky, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {getCountryFlag(c.country) ? <Text style={{ fontSize: fs(14) }}>{getCountryFlag(c.country)}</Text> : null}
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.navy }}>{c.country}</Text>
                      </View>
                    ) : null}
                    <Text style={[dS.courseLoc, { marginBottom: 0 }]}>{c.visits}회 방문</Text>
                    {c.rating > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#C9A84C' }}>{'★'.repeat(Math.round(c.rating))}</Text>
                    )}
                  </View>
                </View>
              </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="trophy" size={fs(18)} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.butter }}>100대 코스 도전하기</Text>
              </View>
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
            <Text style={{ fontFamily: F.en, fontSize: fs(15), color: C.butter }}>
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
                <Text style={{ fontFamily: F.en, fontSize: fs(14), width: 30, color: checked ? '#A88A2E' : C.warmGrayLight }}>
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
    <ScoreStatsScreen visible={scoreStatsOpen} onClose={() => setScoreStatsOpen(false)}
      diaries={diaries} schedules={schedules} userProfile={userProfile} />
    </>
  );
}
