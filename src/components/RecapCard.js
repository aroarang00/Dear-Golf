import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';

// 결산 카드 — 월·연 단위 내 라운딩 요약 한 장([[record-share-redesign]]).
//  ★2차 디자인(사용자 2026-10-11 "색이 너무 진하고 박스가 많아 조잡") — 다크·타일 2×2 폐기.
//   화이트 카드(RoundCardPolaroid)와 같은 결: 웜 화이트 종이 그라데이션 + 잉크 차콜 + 네이비 제목 + 골드 룰 + 하단 삼색 시그니처.
//   구조 = 편집형 스탯 시트. 박스 없이 ①상단 라벨 ②히어로(라운딩 수) ③헤어라인 행 리스트(라벨 좌·값 우) ④하단 사진 띠/월별 막대.
//   값이 없는 행(버디 0·동반자 없음)은 그려 넣지 않는다 — 빈칸보다 여백이 낫다. 점수로 색을 깎지 않음([[golfer-score-psychology]]).
//  ※ 캡처 이미지라 폰트스케일 무관 — 작은 라벨은 고정 px.

const INK = '#2A2622';
const INK_SOFT = 'rgba(42,38,34,0.62)';
const NAVY = '#1A3D52';
const GOLD = '#C9A84C';
const GOLD_DEEP = '#A9854A';
const HAIR = 'rgba(42,38,34,0.11)';
const MS_YELLOW = '#ECD884';
const MS_SKY = '#B2CADD';
const MS_BURGUNDY = '#6B1E2A';
const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

const fmtAvg = (v) => (v == null ? '–' : (Number.isInteger(v) ? String(v) : v.toFixed(1)));
const mmdd = (d) => { const p = String(d || '').split('.'); return p.length === 3 ? `${parseInt(p[1], 10)}.${parseInt(p[2], 10)}` : d || ''; };

// 행 — 좌 라벨(작게·흐리게) / 우 값(진하게) + 보조(골드 작게). 아래 헤어라인.
function Row({ label, value, sub, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 6, borderBottomWidth: last ? 0 : 1, borderBottomColor: HAIR }}>
      <Text style={{ width: 76, fontFamily: F.sysM, fontSize: 10.5, color: INK_SOFT, letterSpacing: 0.4 }}>{label}</Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(14), color: INK }}>{value}</Text>
      {sub ? <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysM, fontSize: 10.5, color: GOLD_DEEP, marginLeft: 7 }}>{sub}</Text> : null}
    </View>
  );
}

// showWith / showName — 공유 모달 토글(사용자 2026-10-11 "동반자 표시 선택"). 동반자 이름은 남의 정보라 끄고 공유할 수 있어야 한다.
export function RecapCard({ recap, playerName = '', width = 320, showWith = true, showName = true }) {
  const height = Math.round(width * 1.25);
  const isYear = recap.month == null;
  const PAD = 22;
  const name = showName ? (playerName || '').trim() : '';

  // 평균 변화 — 좋아진 것만 말한다. 나빠졌거나 같으면 보조 문구 생략(숫자는 그대로).
  const delta = (recap.avg != null && recap.prevAvg != null) ? Math.round((recap.avg - recap.prevAvg) * 10) / 10 : null;
  const avgSub = delta != null && delta < 0 ? `${isYear ? '지난해' : '지난달'}보다 ${Math.abs(delta)}타 ↓` : '';
  const top = showWith ? (recap.topCompanions || []) : [];
  const withValue = top.length ? top.slice(0, 2).map(c => c.name).join(', ') : '';
  const withSub = top.length ? `${top[0].count}회${top.length > 2 ? ` 외 ${top.length - 2}명` : ''}` : '';

  const rows = [
    recap.avg != null ? { label: '평균', value: `${fmtAvg(recap.avg)}타`, sub: avgSub } : null,
    recap.best ? { label: '베스트', value: `${recap.best.score}타`, sub: `${recap.best.course || ''}${recap.best.date ? ` · ${mmdd(recap.best.date)}` : ''}` } : null,
    recap.courseCount > 0 ? { label: '구장', value: `${recap.courseCount}곳`, sub: recap.newCourses > 0 ? `처음 밟은 곳 ${recap.newCourses}` : '' } : null,
    recap.birdies > 0 ? { label: '버디', value: `${recap.birdies}개` } : null,
    withValue ? { label: '함께', value: withValue, sub: withSub } : null,
    recap.specials > 0 ? { label: '특별한 순간', value: `${recap.specials}번` } : null,
    recap.overseas > 0 ? { label: '해외', value: `${recap.overseas}회` } : null,
  ].filter(Boolean).slice(0, 5);   // 최대 5행 — 더 넣으면 다시 빽빽해진다

  const maxBar = recap.monthly ? Math.max(1, ...recap.monthly) : 1;
  const photos = (recap.photos || []).map(resolvePhotoUri).filter(Boolean);
  // 사진 없는 달 폴백 — 그 달 날짜 점 띠(라운딩 친 날만 골드 채움). 빈 여백보다 '언제 쳤나'가 남는다(사용자 2026-10-11 "사진 없는 유저는?")
  const daysInMonth = isYear ? 0 : new Date(recap.year, recap.month, 0).getDate();
  const roundDays = new Set((recap.rounds || []).map(r => parseInt(String(r.date || '').split('.')[2], 10)).filter(Boolean));
  const topLabel = isYear ? `${recap.year} SEASON` : `${MONTHS_EN[recap.month - 1]} ${recap.year}`;

  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
      {/* 종이 — 흰 바탕 웜 그라데이션(화이트 카드와 동일) */}
      <LinearGradient colors={['#FFFDF8', '#F2EBDC']} start={{ x: 0.35, y: 0 }} end={{ x: 0.65, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      <View style={{ flex: 1, paddingHorizontal: PAD, paddingTop: 20, paddingBottom: 18, justifyContent: 'space-between' }}>
        <View>
          {/* 상단 — 기간 라벨(영문 트래킹) / Dear Golf */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: 10, letterSpacing: 3, color: GOLD_DEEP }}>{topLabel}</Text>
            <Text style={{ fontFamily: F.brand, fontSize: fs(14), color: INK }}>Dear Golf</Text>
          </View>

          {/* 히어로 — 좌: 제목(네이비)+이름 / 우: 라운딩 수(골드 큰 숫자)+단위.
              ★숫자를 제목 앞에 두면 '7 9월…'이 날짜처럼 읽혀 횟수인지 월인지 애매(사용자 2026-10-11) → 우측으로, 단위 '라운딩'을 붙여 횟수임을 명시 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 }}>
            <View style={{ flex: 1, marginRight: 12, marginBottom: 6 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(21), color: NAVY, letterSpacing: 0.2 }}>
                {isYear ? `${recap.year} 결산` : `${recap.month}월 결산`}
              </Text>
              {name ? <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: INK_SOFT, marginTop: 3 }}>{name}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(50), lineHeight: fs(52), color: GOLD }}>{recap.count}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: GOLD_DEEP, marginLeft: 5 }}>라운딩</Text>
            </View>
          </View>
          <View style={{ height: 1.5, width: 28, backgroundColor: GOLD, marginTop: 10, marginBottom: 6 }} />

          {/* 행 리스트 — 박스 없이 헤어라인으로만 */}
          {rows.map((r, i) => <Row key={r.label} {...r} last={i === rows.length - 1} />)}
        </View>

        {/* 하단 — (연) 월별 막대 / (월) 사진 띠. 없으면 여백 */}
        <View>
          {isYear && recap.monthly ? (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 34 }}>
                {recap.monthly.map((n, i) => (
                  <View key={i} style={{ flex: 1, height: Math.max(3, Math.round((n / maxBar) * 34)), borderRadius: 1.5,
                    backgroundColor: n === 0 ? HAIR : (i + 1 === recap.peakMonth ? GOLD : 'rgba(26,61,82,0.45)') }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
                {recap.monthly.map((_, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.sysM, fontSize: 8, color: INK_SOFT }}>{i + 1}</Text>
                ))}
              </View>
            </View>
          ) : photos.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {photos.map((uri, i) => (
                <View key={i} style={{ flex: 1, height: 62, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: '#E7E0D2' }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" allowDownscaling={false} cachePolicy="memory-disk" />
                </View>
              ))}
              {/* 3장 미만이면 빈 자리는 종이색으로 — 폭이 들쭉날쭉하지 않게 */}
              {Array.from({ length: Math.max(0, 3 - photos.length) }).map((_, i) => <View key={`e${i}`} style={{ flex: 1 }} />)}
            </View>
          ) : daysInMonth > 0 ? (
            <View>
              <Text style={{ fontFamily: F.sysM, fontSize: 9.5, color: INK_SOFT, letterSpacing: 0.4, marginBottom: 7 }}>라운딩 간 날</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const on = roundDays.has(i + 1);
                  return <View key={i} style={{ width: on ? 7 : 5, height: on ? 7 : 5, borderRadius: 4, backgroundColor: on ? GOLD : HAIR }} />;
                })}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: 8, color: INK_SOFT }}>1</Text>
                <Text style={{ fontFamily: F.sysM, fontSize: 8, color: INK_SOFT }}>{daysInMonth}</Text>
              </View>
            </View>
          ) : null}
          {/* 브랜드 삼색 미니바 — 화이트 카드와 같은 시그니처 */}
          <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 14 }}>
            <View style={{ flex: 1, backgroundColor: MS_YELLOW }} />
            <View style={{ flex: 1, backgroundColor: MS_SKY }} />
            <View style={{ flex: 1, backgroundColor: MS_BURGUNDY }} />
          </View>
        </View>
      </View>
    </View>
  );
}
