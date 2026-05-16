import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { TOP_100_COURSES, OVERSEAS_COURSE_LOG, COURSE_LOG, DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses } from '../utils/userCourses';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { dS } from '../styles/dS';

const REGION_STYLE = {
  capital:     { bg: '#C8D9E6', fg: '#1A3D52', label: '수도권' },
  chungcheong: { bg: '#F5E6A8', fg: '#5A4500', label: '충청' },
  gangwon:     { bg: '#6B8B5E', fg: '#fff',    label: '강원' },
  gyeongsang:  { bg: '#8B8680', fg: '#fff',    label: '경상' },
  jeolla:      { bg: '#8B5E6B', fg: '#fff',    label: '전라' },
  jeju:        { bg: '#6B1E2A', fg: '#F5E6A8', label: '제주' },
  other:       { bg: '#8B8680', fg: '#fff',    label: '국내' },
};

const OVERSEAS_STYLE = { bg: '#C8D9E6', fg: '#1A3D52' };

// 위치 정보가 없을 때
const ETC_STYLE = { bg: '#B8B3AB', fg: '#fff', label: '기타' };

// MY 헤더와 동일한 네이비
const NAVY = '#1A3D52';

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
        style={{ backgroundColor: NAVY, borderRadius: 6, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '600' }}>✏️ 기록 추가하기 →</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CourseLogTab({ avgRating, navigation }) {
  const { schedules } = React.useContext(SchedulesContext);
  const [region, setRegion] = useState('domestic');
  const [show100, setShow100] = useState(false);
  const [countryFilter, setCountryFilter] = useState('전체');
  const [top100Filter, setTop100Filter] = useState('전체');
  const [expanded, setExpanded] = useState({});
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [userCourses, setUserCourses] = useState([]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // 라운딩 기록 + 등록 코스 로드 — 탭 진입 시마다 갱신 (다이어리 기록 후 즉시 반영)
  useEffect(() => {
    const load = async () => {
      const [d, uc] = await Promise.all([
        storage.load(STORAGE_KEYS.diaries, DIARY_DATA),
        getUserCourses(),
      ]);
      setDiaries(d || DIARY_DATA);
      setUserCourses(uc || []);
    };
    load();
    if (!navigation) return;
    const unsub = navigation.addListener('focus', load);
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

  const visitedCount = TOP_100_COURSES.filter(c => c.visited).length;
  const countries = ['전체', ...new Set(OVERSEAS_COURSE_LOG.map(c => c.country))];
  const filteredOverseas = countryFilter === '전체' ? OVERSEAS_COURSE_LOG : OVERSEAS_COURSE_LOG.filter(c => c.country === countryFilter);
  const filteredTop100 = top100Filter === '전체' ? TOP_100_COURSES : top100Filter === '방문' ? TOP_100_COURSES.filter(c => c.visited) : TOP_100_COURSES.filter(c => !c.visited);

  const renderRegionTag = (bg, fg, label) => (
    <View style={{ backgroundColor: bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 11, color: fg, fontWeight: '500' }}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        style={[dS.banner, { backgroundColor: '#fff', borderColor: '#C9A84C', borderWidth: 1.5 }]}
        onPress={() => setShow100(!show100)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[dS.bannerTitle, { color: '#3D3935' }]}>100대 코스 도전하기</Text>
            <Text style={[dS.bannerSub, { color: '#C9A84C' }]}>{visitedCount}/100 달성 · {visitedCount}%</Text>
          </View>
          <View style={{ backgroundColor: '#C9A84C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', fontWeight: '600' }}>{show100 ? '접기' : '보기'}</Text>
          </View>
        </View>
        <View style={{ marginTop: 10, height: 4, backgroundColor: C.hairline, borderRadius: 2 }}>
          <View style={{ width: `${visitedCount}%`, height: '100%', backgroundColor: '#C9A84C', borderRadius: 2 }} />
        </View>
      </TouchableOpacity>
      {show100 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            {['전체', '방문', '미방문'].map(f => (
              <TouchableOpacity key={f} style={[dS.tag, top100Filter === f && { backgroundColor: C.charcoal }]} onPress={() => setTop100Filter(f)}>
                <Text style={[dS.tagTxt, top100Filter === f && { color: C.butter }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {filteredTop100.map(c => (
            <View key={c.rank} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <Text style={{ fontFamily: F.en, fontSize: 13, color: c.visited ? C.burgundy : C.warmGrayLight, width: 30 }}>{c.rank}</Text>
              <Text style={{ fontSize: 14, marginRight: 8 }}>{c.visited ? '✓' : '○'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: c.visited ? C.textPrimary : C.warmGrayLight }}>{c.name}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{c.loc}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 8 }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 3, borderWidth: 0.5, borderColor: C.hairline }}>
        {[['domestic', '국내'], ['overseas', '해외']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, region === k && { backgroundColor: C.charcoal }]} onPress={() => setRegion(k)}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: region === k ? C.butter : C.warmGrayLight }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {region === 'domestic' && (
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 10, marginHorizontal: 16 }}>
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
  );
}
