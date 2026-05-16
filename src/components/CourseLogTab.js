import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { TOP_100_COURSES, OVERSEAS_COURSE_LOG, COURSE_LOG, DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses } from '../utils/userCourses';
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

// 위치 정보가 없을 때 — '기타'
const ETC_STYLE = { bg: '#8B8680', fg: '#fff', label: '기타' };

const isStarTag = (t) => typeof t === 'string' && t.startsWith('★');

export function CourseLogTab({ avgRating, navigation }) {
  const [region, setRegion] = useState('domestic');
  const [show100, setShow100] = useState(false);
  const [countryFilter, setCountryFilter] = useState('전체');
  const [top100Filter, setTop100Filter] = useState('전체');
  const [expanded, setExpanded] = useState({});
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [userCourses, setUserCourses] = useState([]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // 라운딩 기록 + 등록 코스 로드 — 탭 진입 시마다 갱신
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

  // 내 라운딩 기록을 골프장별로 집계 — 가짜 COURSE_LOG 대신 실제 기록 기반
  const myCourses = React.useMemo(() => {
    const groups = {};
    (diaries || []).forEach(d => {
      const name = (d.course || '').trim();
      if (!name) return;
      if (!groups[name]) groups[name] = [];
      groups[name].push(d);
    });
    return Object.entries(groups).map(([name, recs]) => {
      const scores = recs.map(r => r.score).filter(s => typeof s === 'number' && s > 0);
      const ratings = recs.map(r => r.starRating).filter(s => typeof s === 'number' && s > 0);
      const sorted = [...recs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const latest = sorted[0];
      const courseId = recs.find(r => r.courseId)?.courseId || null;
      // 지역 — courseId로 저장된 코스(userCourse)·COURSE_LOG 위치 보강, 없으면 코스명 매칭
      let loc = '';
      if (courseId) {
        loc = userCourses.find(u => u.id === courseId)?.loc
          || COURSE_LOG.find(c => c.id === courseId)?.loc || '';
      }
      if (!loc) loc = COURSE_LOG.find(c => c.name === name)?.loc || '';
      return {
        key: name,
        courseId,
        name,
        loc,
        visits: recs.length,
        best: scores.length ? Math.min(...scores) : 0,
        avg: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
        rating: ratings.length ? Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10 : 0,
        memo: latest?.memo || '',
        latestDate: latest?.date || '',
        tags: [...new Set(recs.flatMap(r => r.tags || []))],
      };
    }).sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
  }, [diaries, userCourses]);

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
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 10 }}>방문한 골프장 · {myCourses.length}곳</Text>
          {myCourses.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>아직 기록한 코스가 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>라운딩 기록을 추가하면 여기에 모여요</Text>
            </View>
          ) : myCourses.map(c => {
            const rs = c.loc ? getRegionStyle(c.loc) : ETC_STYLE;
            const isOpen = !!expanded[c.key];
            return (
              <TouchableOpacity key={c.key}
                style={[dS.courseCard, { borderLeftWidth: 6, borderLeftColor: rs.bg }]}
                activeOpacity={0.85}
                onPress={() => toggle(c.key)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: C.burgundy }}>✓</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={dS.courseName}>{c.name}</Text>
                      {c.rating > 0 && isOpen && (
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {c.rating}</Text>
                      )}
                    </View>
                    <Text style={dS.courseLoc}>{c.visits}회 방문</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {c.courseId ? (
                      <>
                        <TouchableOpacity
                          activeOpacity={0.6}
                          onPress={() => navigation && navigation.navigate('코스', { openCourseId: c.courseId })}
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

                {/* 지역 태그 + 별점 (접힌 상태) */}
                {!isOpen && (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {renderRegionTag(rs.bg, rs.fg, rs.label)}
                    {c.rating > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {c.rating}</Text>
                    )}
                  </View>
                )}

                {isOpen && (
                  <>
                    <View style={dS.recordRow}>
                      <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                      <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                      <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 10, marginBottom: 10 }}>
                      {c.tags.map((t, i) => <View key={`f${i}`} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
                      {renderRegionTag(rs.bg, rs.fg, rs.label)}
                    </View>
                    {c.memo ? <Text style={dS.courseMemo}>"{c.memo}"</Text> : null}
                  </>
                )}
              </TouchableOpacity>
            );
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
