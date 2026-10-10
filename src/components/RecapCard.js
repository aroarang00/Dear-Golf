import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';

// 결산 카드 — 월·연 단위 내 라운딩 요약을 한 장으로([[record-share-redesign]] 2026-10-10).
//   매거진 카드(RoundCard 사진 없음版)와 같은 결: 차콜 그라데이션 + 골드 헤어라인 + 샴페인 제목. 4:5 세로.
//   숫자가 주인공 — 라운딩 수(히어로) · 평균 · 베스트 · 구장 · 버디 · 함께한 사람 · (연) 월별 막대 / (월) 사진 3장.
//   점수로 색을 깎지 않는다(평균 변화는 '좋아졌어요'만 강조, 나빠진 건 중립) ([[golfer-score-psychology]]).
//  ※ 캡처 이미지라 폰트스케일 무관 — 작은 라벨은 fs() 최소 클램프를 피해 고정 px.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const CHAMPAGNE = '#EFE7CC';
const WHITE = '#F6F2E9';
const MUTE = 'rgba(246,242,233,0.55)';
const LINE = 'rgba(201,168,76,0.35)';
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 };

const fmtAvg = (v) => (v == null ? '–' : (Number.isInteger(v) ? String(v) : v.toFixed(1)));
const mmdd = (d) => { const p = String(d || '').split('.'); return p.length === 3 ? `${parseInt(p[1], 10)}.${parseInt(p[2], 10)}` : d || ''; };

function Tile({ label, value, sub }) {
  return (
    <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.22)' }}>
      <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: 9.5, color: MUTE, letterSpacing: 0.8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 3 }}>
        <Text numberOfLines={1} style={[{ flexShrink: 1, fontFamily: F.sysB, fontSize: 15, color: WHITE }, SHADOW]}>{value}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: 9.5, color: GOLD, marginLeft: 5 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function RecapCard({ recap, playerName = '', width = 320 }) {
  const height = Math.round(width * 1.25);
  const isYear = recap.month == null;
  const title = isYear ? `${recap.year}` : `${recap.year}년 ${recap.month}월`;
  const name = (playerName || '').trim();
  const top = recap.topCompanions?.[0] || null;
  // 평균 변화 — 좋아진 것만 골드로 말한다. 나빠졌으면 숫자만 중립으로.
  const delta = (recap.avg != null && recap.prevAvg != null) ? Math.round((recap.avg - recap.prevAvg) * 10) / 10 : null;
  const deltaTile = delta == null ? null
    : delta < 0 ? { value: `${Math.abs(delta)}타 좋아짐`, sub: '↗' }
    : delta > 0 ? { value: `${delta}타 차이`, sub: '' }
    : { value: '같은 평균', sub: '' };
  const prevLabel = isYear ? '지난해 평균 대비' : '지난달 평균 대비';
  const tile4 = deltaTile ? { label: prevLabel, ...deltaTile }
    : recap.specials > 0 ? { label: '특별한 순간', value: `${recap.specials}번` }
    : recap.overseas > 0 ? { label: '해외 라운딩', value: `${recap.overseas}회` }
    : { label: '남긴 사진', value: `${recap.rounds.reduce((s, r) => s + ((r.photos || []).length), 0)}장` };
  const maxBar = recap.monthly ? Math.max(1, ...recap.monthly) : 1;
  const photos = (recap.photos || []).map(resolvePhotoUri).filter(Boolean);

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#2A2622' }}>
      <LinearGradient colors={['#46403A', '#2E2A25', '#1A1815']} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.09)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.62 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, justifyContent: 'space-between' }}>
        <View>
          {/* 워터마크 줄 */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[{ fontFamily: F.en, fontSize: fs(12), color: GOLD, letterSpacing: 3 }, SHADOW]}>{isYear ? 'YEAR RECAP' : 'MONTHLY RECAP'}</Text>
            <Text style={[{ fontFamily: F.brand, fontSize: fs(14), color: WHITE }, SHADOW]}>Dear Golf</Text>
          </View>

          {/* 제목 — 기간 + 이름 */}
          <Text style={[{ fontFamily: isYear ? F.en : F.sysB, fontSize: isYear ? fs(34) : fs(26), lineHeight: isYear ? fs(38) : fs(32), color: CHAMPAGNE, marginTop: 12 }, SHADOW]}>{title}</Text>
          {name ? <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(11), color: GOLD, letterSpacing: 0.5, marginTop: 3 }, SHADOW]}>{name}</Text> : null}

          {/* 히어로 — 라운딩 수 크게 + 평균·베스트 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={[{ fontFamily: F.en, fontSize: fs(54), lineHeight: fs(56), color: GOLD }, SHADOW]}>{recap.count}</Text>
              <Text style={[{ fontFamily: F.sysB, fontSize: fs(14), color: GOLD, marginLeft: 6, marginBottom: 8 }, SHADOW]}>라운딩</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 4 }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: F.en, fontSize: 9, letterSpacing: 2, color: GOLD_DEEP }}>AVG</Text>
                <Text style={[{ fontFamily: F.en, fontSize: fs(22), lineHeight: fs(26), color: WHITE }, SHADOW]}>{fmtAvg(recap.avg)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: F.en, fontSize: 9, letterSpacing: 2, color: GOLD_DEEP }}>BEST</Text>
                <Text style={[{ fontFamily: F.en, fontSize: fs(22), lineHeight: fs(26), color: WHITE }, SHADOW]}>{recap.best ? recap.best.score : '–'}</Text>
              </View>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: LINE, marginTop: 10, marginBottom: 10 }} />

          {/* 2×2 타일 */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile label="다녀온 구장" value={`${recap.courseCount}곳`} sub={recap.newCourses > 0 ? `새 구장 ${recap.newCourses}` : ''} />
            <Tile label="버디" value={`${recap.birdies}개`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Tile label="가장 많이 함께" value={top ? top.name : '–'} sub={top ? `${top.count}회` : ''} />
            <Tile label={tile4.label} value={tile4.value} sub={tile4.sub} />
          </View>
        </View>

        {/* 하단 — 베스트 한 줄 + (연) 월별 막대 / (월) 사진 띠 */}
        <View>
          {recap.best ? (
            <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(11), color: GOLD, letterSpacing: 0.3 }, SHADOW]}>
              {`베스트 ${recap.best.score}타 · ${recap.best.course || '라운딩'} · ${mmdd(recap.best.date)}`}
            </Text>
          ) : null}
          {isYear && recap.monthly ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 34 }}>
                {recap.monthly.map((n, i) => (
                  <View key={i} style={{ flex: 1, height: Math.max(3, Math.round((n / maxBar) * 34)), borderRadius: 2,
                    backgroundColor: n === 0 ? 'rgba(255,255,255,0.08)' : (i + 1 === recap.peakMonth ? GOLD : 'rgba(232,217,160,0.45)') }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                {recap.monthly.map((_, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.sysM, fontSize: 8, color: MUTE }}>{i + 1}</Text>
                ))}
              </View>
            </View>
          ) : photos.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              {photos.map((uri, i) => (
                <View key={i} style={{ width: 58, height: 58, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" allowDownscaling={false} cachePolicy="memory-disk" />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
