import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';

// 활동 마일스톤(누적량) 카드 — 다크 럭셔리. 미드나잇 네이비 단일 배경 + 골드 메달 + 양옆 가로 골드 바(DEAR / GOLF).
// 단계 구분은 '메달 장식'으로: 50 기본 / 100 얇은 두 줄 / 200 왕관. 배경/프레임은 통일, 숫자·멘트만 함께 바뀜.
// 네이비는 라운지 전용색([[navy-lounge-color]])이라, 여기선 라운지 navy(#1A3D52)와 구분되는 훨씬 어두운 미드나잇 톤 사용.

export const MILESTONE_DEFS = {
  rounds:  { label: '라운딩',    unit: 'ROUNDS',  thresholds: [30, 50, 100, 200] },  // 라운딩 30 정식 추가(2026-06-09)
  courses: { label: '방문 구장', unit: 'COURSES', thresholds: [30, 50, 100] },
};

// 메달 장식 단계 — 임계값 '개수'와 무관하게 value 기준으로 안정화(라운딩 4단계·구장 3단계·TEMP 10 모두 대응).
//   트랙 최고 임계값 = 왕관(2) / 트랙 첫 임계값 이하(TEMP 10·엔트리) = 기본 메달(0) / 그 사이 = 골드(1).
export const milestoneDecoLevel = (category, value) => {
  const ths = MILESTONE_DEFS[category]?.thresholds || MILESTONE_DEFS.rounds.thresholds;
  if (value >= ths[ths.length - 1]) return 2;
  if (value <= ths[0]) return 0;
  return 1;
};

// 멱등 등재용 안정 id — 같은 마일스톤은 항상 같은 id (중복 등재 방지)
export const milestoneId = (category, value) => `hof_ms_${category}_${value}`;

// ⚠️⚠️ TEMP(2026-06-09) — 마일스톤 메달 '배지' 표시 위치 확인용 임시 10 임계값.
//   사용자가 라운딩 10회·구장 10회로 배지가 어디에 붙는지 보려고 요청. **확인 후 이 블록 통째 삭제 +
//   topMilestone의 badgeThresholdsFor → MILESTONE_DEFS 원복 할 것!** (배지에만 적용, hallOfFame 백필엔
//   미적용이라 영구 기록 잔여물 없음 — reachedMilestones는 그대로 50/30 임계값 사용.)
const TEMP_PREVIEW_10 = true;
const badgeThresholdsFor = (category) =>
  (TEMP_PREVIEW_10 ? [10, ...MILESTONE_DEFS[category].thresholds] : MILESTONE_DEFS[category].thresholds);

// 누적 카운트 → 도달한 마일스톤 목록. 백필(이미 넘긴 단계도 모두 포함)에 그대로 쓴다.
//   thresholdsFor 주입 가능(기본=실 임계값). 배지 미리보기(TEMP)는 별도 임계값을 넘겨 hallOfFame 오염 방지.
export function reachedMilestones(counts, thresholdsFor = (category) => MILESTONE_DEFS[category].thresholds) {
  const out = [];
  Object.keys(MILESTONE_DEFS).forEach((category) => {
    const n = counts[category] || 0;
    thresholdsFor(category).forEach((value, tier) => {
      if (n >= value) out.push({ category, value, tier });
    });
  });
  return out;
}

// 명함 배지용 — 도달한 마일스톤 중 가장 큰 1개(value 내림차순, 동률이면 라운딩 우선). 없으면 null.
//   배지는 badgeThresholdsFor 사용(TEMP 10 포함). hallOfFame 백필(reachedMilestones 기본 호출)과 분리.
export function topMilestone(counts) {
  const reached = reachedMilestones(counts, badgeThresholdsFor);
  if (!reached.length) return null;
  return reached.sort((a, b) => (b.value - a.value) || (a.category === 'rounds' ? -1 : 1))[0];
}

// 명함 배지 라벨·아이콘 — tier 0/1/2 → 메달/금메달/왕관 (MilestoneCard 단계 장식과 결 맞춤)
export function milestoneBadge(ms) {
  if (!ms) return null;
  return {
    icon: ['🏅', '🥇', '👑'][milestoneDecoLevel(ms.category, ms.value)] || '🏅',
    label: `${MILESTONE_DEFS[ms.category]?.label || ''} ${ms.value}`,
  };
}

// 트랙별 최고 달성 메달 value — 명함 '흐린 메달 줄'용. { rounds: value|null, courses: value|null }.
//   배지 임계값(badgeThresholdsFor, TEMP 포함) 기준 → TEMP_PREVIEW_10이면 10도 잡힘(미리보기).
//   TEMP 제거 시 자동으로 실 임계값(라운딩 30·구장 30부터)으로 복귀.
export function trackTopMedals(counts) {
  const out = {};
  Object.keys(MILESTONE_DEFS).forEach((category) => {
    const n = counts[category] || 0;
    let best = null;
    badgeThresholdsFor(category).forEach((value) => { if (n >= value) best = value; });
    out[category] = best;
  });
  return out;
}

// 마일스톤 → hallOfFame 엔트리. kind:'milestone'로 카드 분기.
export function buildMilestoneEntry({ category, value, tier, date }) {
  return {
    id: milestoneId(category, value),
    kind: 'milestone',
    type: `${MILESTONE_DEFS[category]?.label || ''} ${value}`,  // 공유 미리보기 등에서 식별용
    category,
    value,
    tier,
    date: date || '',
  };
}

// 의미 있는 헤드라인 — 장식 단계(value 기준)별. 부드럽되 '쌓아온 것'의 무게가 느껴지게.
function headlineFor(category, value) {
  const level = milestoneDecoLevel(category, value);
  if (category === 'courses') {
    return ['발길이 그려온 지도', '넓어진 라운드의 반경', '백 개의 코스를 품다'][level] || '발길이 그려온 지도';
  }
  return ['꾸준함이 만든 발자취', '흔치 않은 기록에 닿다', '이 길 위에서 보낸 시간'][level] || '꾸준함이 만든 발자취';
}

// ── 럭셔리 팔레트(통일) ─────────────────────────────────────────
const GOLD = '#E6C677';        // 밝은 금 — 멘트/ACHIEVED
const GOLD_DIM = '#C9A85E';    // 중간 금 — 단위 라벨·얇은 링
const GOLD_DK = '#A9854A';     // 어두운 금 — 테두리·헤어라인
const GOLD_BRIGHT = '#F2D585'; // 밝은 금 — 메달 숫자(전 단계 또렷하게)
const RIM_GOLD = ['#F8E7B2', '#D2AC63', '#7C5C28'];  // 골드 베벨(위 밝게→아래 어둡게, 강하게) — 메달 림·왕관 공용
const FACE_DARK = ['#1C2A3B', '#0C141E'];            // 메달 중앙(미드나잇) — 골드 숫자 새김
// 미드나잇 네이비 — 단계 오를수록 더 깊게(무게감으로 위계). 같은 계열 내 명도만 단계적으로.
const CARD_BG_TIERS = [
  ['#1C3149', '#102032', '#0A121C'],  // 50 / 30  — 가장 옅은 미드나잇
  ['#15243A', '#0C1827', '#070E16'],  // 100 / 50 — 더 깊게
  ['#0F1C2C', '#08111B', '#04080E'],  // 200 / 100 — 거의 블랙 네이비
];
const CARD_BORDER = '#33425A';                       // 카드 외곽 가는 테

const M_RIM = 168;    // 골드 림 지름(키움 — 3자리 숫자 여유)
const M_FACE = 152;   // 미드나잇 면 지름(림 얇게·면 넓게)

// 왕관(최고 단계) — SVG/이모지 없이 골드 삼각 3개 + 보석 점 + 받침 바. OS 무관.
function Crown() {
  const tri = (hw, h) => (
    <View style={{ width: 0, height: 0, borderLeftWidth: hw, borderRightWidth: hw, borderBottomWidth: h,
      borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: GOLD }} />
  );
  const point = (h, key) => (
    <View key={key} style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginBottom: -1 }} />
      {tri(9, h)}
    </View>
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -16, left: 0, right: 0, alignItems: 'center',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3 },
        android: {},
      }),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {point(13, 'l')}{point(20, 'c')}{point(13, 'r')}
      </View>
      <LinearGradient colors={RIM_GOLD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} locations={[0, 0.5, 1]}
        style={{ width: 46, height: 8, borderRadius: 2, marginTop: -1, borderWidth: 0.5, borderColor: GOLD_DK }} />
    </View>
  );
}

export function MilestoneCard({ item, onShare }) {
  const def = MILESTONE_DEFS[item.category] || MILESTONE_DEFS.rounds;
  // 장식 단계 — value 기준(임계값 개수 무관). 0 기본 / 1 골드(두 줄) / 2 왕관. ([[milestone_badges]])
  const tier = milestoneDecoLevel(item.category, item.value);
  // 자릿수 기반 폰트 — 3자리(100·200)는 작게. adjustsFontSizeToFit 과축소(거의 안 보이게 줄던 문제) 방지.
  const numFs = String(item.value).length >= 3 ? 46 : 58;
  const cardBg = CARD_BG_TIERS[tier] || CARD_BG_TIERS[0];  // 단계 오를수록 깊은 배경

  return (
    <View style={{
      // 공유 캡처(onShare 없음)일 땐 카드 간격용 marginBottom 제거 — ViewShot이 그 여백을 담아
      // 저장 이미지 하단에 흰 띠가 비치던 것 방지 (명예의전당 카드와 동일 처리)
      borderRadius: 16, marginBottom: onShare ? 12 : 0, overflow: 'hidden', borderWidth: 1, borderColor: CARD_BORDER,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
        android: { elevation: 6 },
      }),
    }}>
      <LinearGradient colors={cardBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} locations={[0, 0.55, 1]} style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 }}>
        {/* 헤더 — Dear Golf 워드마크(브랜드 글씨체) + 공유 버튼 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.brand, fontSize: fs(15), color: GOLD }}>Dear Golf</Text>
          {onShare && (
            <TouchableOpacity onPress={onShare} activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                borderWidth: 1, borderColor: GOLD_DK, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: fs(11), color: GOLD }}>↗</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: GOLD }}>공유</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 메달 (중앙) — 단계: 0 기본 / 1 얇은 두 줄 / 2 왕관. 아래 ACHIEVED 리본 겹침 */}
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <View style={{ width: M_RIM, height: M_RIM, alignItems: 'center', justifyContent: 'center' }}>
            {tier >= 2 && <Crown />}
            <LinearGradient colors={RIM_GOLD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} locations={[0, 0.5, 1]}
              style={{ width: M_RIM, height: M_RIM, borderRadius: M_RIM / 2, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: GOLD_DK,
                ...Platform.select({
                  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 16 },
                  android: { elevation: 14 },
                }),
              }}>
              {/* 미드나잇 면 — 깊은 음각 테로 가라앉은 입체 */}
              <LinearGradient colors={FACE_DARK} start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }}
                style={{ width: M_FACE, height: M_FACE, borderRadius: M_FACE / 2, alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.55)' }}>
                {/* 새틴 — 위 빛 → 아래 그림자(곡면 입체, 강화) */}
                <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.34)']}
                  start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} locations={[0, 0.5, 1]}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: M_FACE / 2 }} />
                {/* 단계 1+ : 얇은 두 줄(안쪽 골드 링, 가장자리 가깝게) */}
                {tier >= 1 && (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 7, left: 7, right: 7, bottom: 7,
                    borderRadius: (M_FACE - 14) / 2, borderWidth: 1, borderColor: GOLD_DIM }} />
                )}
                {/* 숫자+단위 — 면 정중앙 정렬(폰트 패딩 제거로 OS 간 센터 일치) */}
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                    style={{ width: M_FACE - 20, textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center',
                      fontFamily: F.en, fontSize: fs(numFs), lineHeight: fs(numFs) * 1.06,
                      color: GOLD_BRIGHT, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
                    {item.value}
                  </Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: GOLD_DIM, letterSpacing: 3, marginTop: 3, includeFontPadding: false }}>
                    {def.unit}
                  </Text>
                </View>
              </LinearGradient>
            </LinearGradient>
          </View>
          {/* ACHIEVED 리본 — 메달 하단에 겹침(다크 + 골드 테두리 + 골드 텍스트) */}
          <View style={{ marginTop: -12, zIndex: 3, backgroundColor: '#0C141E', paddingHorizontal: 16, paddingVertical: 5,
            borderRadius: 6, borderWidth: 1, borderColor: GOLD_DK,
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4 },
              android: { elevation: 6 },
            }),
          }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: GOLD, letterSpacing: 3 }}>ACHIEVED</Text>
          </View>
        </View>

        {/* 멘트 — 메달 아래, 금색 + 가는 금선 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingHorizontal: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(169,133,74,0.45)' }} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD, letterSpacing: 0.4, textAlign: 'center' }}>
            {headlineFor(item.category, item.value)}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(169,133,74,0.45)' }} />
        </View>
      </LinearGradient>
    </View>
  );
}
