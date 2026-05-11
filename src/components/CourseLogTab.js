import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { TOP_100_COURSES, OVERSEAS_COURSE_LOG, COURSE_LOG } from '../constants/data';
import { dS } from '../styles/dS';

export function CourseLogTab({ avgRating }) {
  const [region, setRegion] = useState('domestic');
  const [show100, setShow100] = useState(false);
  const [countryFilter, setCountryFilter] = useState('전체');
  const [top100Filter, setTop100Filter] = useState('전체');

  const visitedCount = TOP_100_COURSES.filter(c => c.visited).length;
  const countries = ['전체', ...new Set(OVERSEAS_COURSE_LOG.map(c => c.country))];
  const filteredOverseas = countryFilter === '전체' ? OVERSEAS_COURSE_LOG : OVERSEAS_COURSE_LOG.filter(c => c.country === countryFilter);
  const filteredTop100 = top100Filter === '전체' ? TOP_100_COURSES : top100Filter === '방문' ? TOP_100_COURSES.filter(c => c.visited) : TOP_100_COURSES.filter(c => !c.visited);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={[dS.banner, { borderColor: '#C9A84C' }]} onPress={() => setShow100(!show100)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={dS.bannerTitle}>100대 코스 도전하기</Text>
            <Text style={dS.bannerSub}>{visitedCount}/100 달성 · {visitedCount}%</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy }}>{show100 ? '접기' : '보기'}</Text>
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
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 10 }}>방문한 골프장 · {COURSE_LOG.length}곳</Text>
          {COURSE_LOG.map(c => (
            <TouchableOpacity key={c.id} style={dS.courseCard} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 14, color: C.burgundy, marginTop: 1 }}>✓</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={dS.courseName}>{c.name}</Text>
                    {avgRating && avgRating(c.id) > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {avgRating(c.id)}</Text>
                    )}
                  </View>
                  <Text style={dS.courseLoc}>{c.loc} · {c.visits}회 방문</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {c.tags.map((t, i) => <View key={i} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
              </View>
              <View style={dS.recordRow}>
                <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
              </View>
              <Text style={dS.courseMemo}>"{c.memo}"</Text>
            </TouchableOpacity>
          ))}
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
          {filteredOverseas.map(c => (
            <TouchableOpacity key={c.id} style={dS.courseCard} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
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
              </View>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {c.tags.map((t, i) => <View key={i} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
              </View>
              <View style={dS.recordRow}>
                <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
              </View>
              <Text style={dS.courseMemo}>"{c.memo}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
