import React, { useState, useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShortForecast } from '../../utils/kma';
import { getCurrentLocation } from '../../utils/location';

// =============================================================
// 홈 배경 — 시간대별 골프장 사진(직접 검증한 큐레이션) + 날씨별 화면 톤.
//  · 사진: 시간대(아침/낮/늦은오후/밤)에 맞춰 교체
//  · 날씨: 비/흐림이면 '실제 궂은날 사진'으로 교체 + 톤 오버레이(완화). 예전엔 비에 전용 사진이 없어
//          맑은 낮 사진에 초진한 오버레이만 덮어 답답했음(2026-07-08 궂은날 사진 풀 신설로 해소).
// =============================================================
// 로컬 번들 에셋 — 네트워크 다운로드 없이 즉시·선명하게 표시 (사용자 직접 촬영 골프장 사진, 2026-06-27 Unsplash 전량 교체).
// require는 정적 경로만 허용돼 개별 나열. 시간대별 풀에서 랜덤 1장.
// ★전부 사용자 직접 촬영 사진(2026-06-27, Unsplash 전량 교체). 겨울(누런잔디)은 WINTER_IMAGES로 계절 분기(아래).
const TIME_IMAGES = {
  morning: [ // 아침 (05~09시) — 안개·서리·여명·일출
    require('../../../assets/home-bg/morning1.jpg'), // 아침안개 — 안개 자욱한 페어웨이·나무 실루엣
    require('../../../assets/home-bg/morning2.jpg'), // 아침안개 — 안개 속 능선·티잉 그라운드
    require('../../../assets/home-bg/morning3.jpg'), // 일출/여명 — 분홍빛 새벽 하늘·조명 코스
  ],
  day: [ // 낮 (09~16시) — 밝은 햇살·파란 하늘 (전부 사용자 사진)
    require('../../../assets/home-bg/day1.jpg'), // 파란 하늘 — 연못 계곡·산·페어웨이
    require('../../../assets/home-bg/day2.jpg'), // 파란 하늘 — 코스 길·산
    require('../../../assets/home-bg/day3.jpg'), // 화창 — 연못·벙커·숲
    // ★아래 3장은 고해상 원본에서 세로(1080×2340)로 뽑음 — 확대 배율 1.0(2026-07-09).
    //   확대 배율 = 화면높이 ÷ 이미지높이. 폭을 잘라내는 크롭은 배율에 영향이 없다(옛 3:4 크롭이 헛수고였던 이유).
    require('../../../assets/home-bg/day4.jpg'), // 화창 — 페어웨이·연못·산·카트 (같은 장면 고해상 교체)
    require('../../../assets/home-bg/day5.jpg'), // 화창 — 카트길·연못·산 (2026-07-09 추가)
    require('../../../assets/home-bg/day6.jpg'), // 화창 — 바위산·페어웨이 (2026-07-09 추가)
  ],
  lateAfternoon: [ // 늦은 오후·황혼 (16~21시) — 골든아워·노을 (사용자 사진, 노을 더 받으면 보강)
    require('../../../assets/home-bg/lateAfternoon1.jpg'), // 황혼빛 — 따뜻한 빛·드라마틱 구름
    require('../../../assets/home-bg/lateAfternoon2.jpg'), // 골든아워 — 낮게 깔린 햇살·티잉 그라운드
  ],
  night: [ // 진짜 밤 (21~05시) — 밤골프장(조명 켜진 페어웨이)·자연 야경 (도시 야경 X)
    require('../../../assets/home-bg/night1.jpg'), // 맑은 밤 — 남색 하늘·산 실루엣·조명 페어웨이·벙커
    require('../../../assets/home-bg/night2.jpg'), // 맑은 밤 — 검은 하늘·조명 페어웨이·카트길 (2026-07-08 추가)
    require('../../../assets/home-bg/night3.jpg'), // 밤골프 — 조명 여러 개·그린·소나무·카트 (2026-07-08 추가)
    require('../../../assets/home-bg/night4.jpg'), // 늦은밤 — 노을 잔광·나무 실루엣·가로등 (고해상 세로, 확대 1.0. 2026-07-09)
    // 옛 폭풍 먹구름 밤 사진은 맑은 밤에 어색해 밤 비 전용으로 분리(아래 RAIN_IMAGES.night=rainNight.jpg). 2026-07-08
  ],
};

// 흐림(cloudy) 전용 사진 — '골프장이 잘 보이면서 구름 많은' 사진만. 날씨가 흐림이고 낮 시간대면 시간대 사진 대신 사용.
//   밤엔 낮 흐림 사진이 안 어울려 제외.
//   ★2026-07-08 cloudy1(하늘 비중 과다=구름 속 같음) 제거 → 코스가 시원하게 보이는 3장으로 교체.
//   ★2026-07-09 overcast1도 같은 이유로 제거(하늘 70%). 카톡 압축본이라 하늘을 잘라내면 흐려져 손댈 수 없었다.
const CLOUDY_IMAGES = [
  require('../../../assets/home-bg/overcast2.jpg'), // 흐림 — 연못·벙커·극적 구름(코스 시원)
  require('../../../assets/home-bg/cloudy2.jpg'),   // 구름많음 — 소나무·그린·산·밝은 구름
];

// 비(rain) 전용 사진 — 실제 궂은날 사진. 낮/밤 분기(밤엔 궂은 낮 사진이 안 어울림).
//   ★2026-07-08 신설: 예전엔 비에 전용 사진이 없어 맑은 낮 사진 + 초진한 오버레이만 덮어 답답했음.
//     사용자 큐레이션 사진으로 교체(오버레이도 아래 rain 톤에서 대폭 완화).
//   ★2026-07-09 비 전용 사진 신설(고해상 원본 → 세로 1080×2340, 확대 1.0).
//     예전엔 흐림 사진(overcast1 등)을 빌려 썼는데 하늘이 70%라 '하늘구름만' 보였음(테스터).
//     rainDay3은 빗방울 맺힌 유리창 너머 카트길 — 비 감성 전용.
//     (먹구름·산 사진 한 장은 '비 같지 않다'는 판단으로 제외 — 흐림에 가까웠음)
//
//   ★배경 사진 고를 때의 철칙 — 아래 OVERLAYS는 상단 0.86 / 34~60% 0.48 / 하단 0.82로 덮는다.
//     즉 사진이 실제로 보이는 구간은 화면 34~60%뿐이다. 코스(피사체)가 그 구간에 오도록
//     하늘을 45~52%까지 과감히 덜어내야 한다. 하늘이 상반부를 차지하면 아무리 예쁜 사진도
//     '하늘구름만' 보인다(2026-07-09 테스터). 하늘 30% 컷으로는 부족했다.
const RAIN_IMAGES = {
  day: [ // 낮·아침·늦오후 비
    require('../../../assets/home-bg/rainDay1.jpg'), // 비 — 젖은 페어웨이·소나무·카트길
    require('../../../assets/home-bg/rainDay3.jpg'), // 비 — 빗방울 맺힌 유리창 너머 카트길
    require('../../../assets/home-bg/rainDay4.jpg'), // 비 — 극적 먹구름·넓은 페어웨이
  ],
  night: [ // 밤 비
    require('../../../assets/home-bg/rainNight.jpg'), // 야간 비 — 먹구름·조명 페어웨이 (하늘 25% 덜어 코스 확보)
  ],
};

// 겨울 누런잔디(휴면 잔디) — 겨울철에만 낮·늦오후 사진을 이걸로 교체(여름에 누런잔디가 뜨면 어색). 봄~가을엔 미사용.
//   아침안개·밤은 계절 영향 작아 그대로 둠. 잔디 누레지는 11~3월에만 노출(아래 isWinter).
const WINTER_IMAGES = [
  require('../../../assets/home-bg/winter1.jpg'), // 겨울 맑음 — 누런 페어웨이·파란 하늘·산
  require('../../../assets/home-bg/winter2.jpg'), // 겨울 낮 — 누런 페어웨이·능선
  require('../../../assets/home-bg/winter3.jpg'), // 겨울 황혼 — 따뜻한 빛·누런잔디·산
];
// 겨울철(누런잔디 시즌) — 월 기준 11~3월. 이 기간 day·lateAfternoon만 winter 풀 사용(여름엔 안 뜸). 범위는 필요시 조정.
function isWinter(d = new Date()) {
  const m = d.getMonth();      // 0=1월
  return m >= 10 || m <= 2;    // 11·12·1·2·3월
}

// 가을 단풍 — 단풍철(10~11월) '맑은 낮'에만 낮 사진을 이걸로 교체. 겨울(누런잔디)보다 앞서므로 11월엔 가을이 우세.
//   맑은 낮 단풍 사진뿐이라 밤·늦오후·궂은날엔 미적용(그땐 시간대/날씨 풀). 범위는 필요시 조정.
const AUTUMN_IMAGES = [
  require('../../../assets/home-bg/autumn1.jpg'), // 가을 맑음 — 주황 단풍나무·억새·연못·파란 하늘
  require('../../../assets/home-bg/autumn2.jpg'), // 가을 맑음 — 새빨간 단풍나무·페어웨이·파란 하늘
];
// 단풍철 — 월 기준 10~11월. 이 기간 낮(day)만 autumn 풀 사용.
function isAutumn(d = new Date()) {
  const m = d.getMonth();      // 0=1월
  return m === 9 || m === 10;  // 10·11월
}

// 날씨별 그라데이션 오버레이 — 위/아래(글씨 영역)는 진하게, 가운데는 옅게.
//  맑음: 초록 다크톤 / 흐림: 회색 (사진 채도·밝기 죽임) / 비: 더 어두운 청회색
const OVERLAYS = {
  clear:  ['rgba(8,24,14,0.86)',  'rgba(8,24,14,0.40)',  'rgba(8,24,14,0.46)',  'rgba(8,24,14,0.74)'],
  partly: ['rgba(24,34,30,0.82)', 'rgba(24,34,30,0.40)', 'rgba(24,34,30,0.45)', 'rgba(24,34,30,0.72)'], // 구름많음 ⛅ — clear(초록)와 cloudy(회색) 사이. 색은 회녹, 가운데 투명도는 clear급(0.40)으로 사진 밝게 비침
  cloudy: ['rgba(42,46,50,0.80)', 'rgba(42,46,50,0.42)', 'rgba(42,46,50,0.46)', 'rgba(42,46,50,0.74)'], // 옅게(2026-06-14) — 구름 낀 날 회색이 과해 사진이 묻혀 뿌옇던 것 완화. 가운데를 확 낮춰 사진 비치게, 상·하단만 글씨 가독 위해 유지(clear 수준 곡선)
  rain:   ['rgba(16,24,34,0.86)', 'rgba(16,24,34,0.48)', 'rgba(16,24,34,0.52)', 'rgba(16,24,34,0.82)'], // 완화(2026-07-08) — 전용 궂은날 사진 신설로 사진이 비치게. 청회색 톤은 유지, 가운데만 확 낮춤(0.72→0.48). 상·하단은 글씨 가독 유지
};

function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9)  return 'morning';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 21) return 'lateAfternoon'; // 황혼·노을 21시까지
  return 'night';                                 // 21~05 진짜 밤
}

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 겨울이면 낮·늦오후는 winter 풀(누런잔디). 그 외 시간대(아침안개·밤)·비겨울은 시간대 풀.
function winterApplies(b) {
  return isWinter() && (b === 'day' || b === 'lateAfternoon');
}
// 단풍철이면 낮은 autumn 풀. 겨울보다 먼저 판정(11월은 가을 우세).
function autumnApplies(b) {
  return isAutumn() && b === 'day';
}
function pickImage() {
  const b = timeBucket();
  if (autumnApplies(b)) return pickFrom(AUTUMN_IMAGES);
  return winterApplies(b) ? pickFrom(WINTER_IMAGES) : pickFrom(TIME_IMAGES[b] || TIME_IMAGES.day);
}

// 헤더 날씨 아이콘 → 배경 톤. 헤더(icon)와 배경(tone)을 '같은 아이콘'에서 도출해 둘이 절대 어긋나지 않게 한다.
//  ☁️ 흐림(SKY=4)만 회색 cloudy / 🌧🌨❄🌦 비·눈 rain / ☀️·⛅·🌤️(맑음·구름많음)은 밝게 clear.
//  ⛅ 구름많음은 해가 우세 — 예전엔 'cloudy'로 묶여 헤더는 ⛅인데 배경만 회색('맑은데 이미지 흐림')으로 보이던 것 바로잡음.
function toneFromIcon(icon) {
  const s = String(icon || '');
  if (s.includes('☁')) return 'cloudy';            // ☁️(U+2601) 흐림 — 회색
  if (/🌧|🌨|❄|🌦|⛈|☔/u.test(s)) return 'rain';   // 비·눈·소나기
  if (s.includes('⛅')) return 'partly';            // ⛅(U+26C5) 구름많음 — 맑음과 흐림 사이 중간 톤
  return 'clear';                                  // ☀️ 🌤️ 맑음
}

// 현재 날씨 (30분 캐시) — 위치 권한 없으면 맑음.
// 반환: { weather: clear|cloudy|rain|wind, icon: 이모지 }
// 홈 배경 톤(weather) + 홈 헤더 이모지(icon)가 같은 캐시를 공유하고,
// 날씨 상세 팝업이 새로 받은 값(cacheCurrentWx)으로 갱신해 둘이 항상 일치한다.
const WX_KEY = '@dg_bg_currentwx_v4'; // v4 — 톤을 아이콘에서 도출(구름많음 ⛅=맑게). 옛 v3 캐시(구름많음=cloudy) 무효화
const WX_TTL = 30 * 60 * 1000;
const WX_FALLBACK = { weather: 'clear', icon: '☀️' };

export async function getCurrentWx() {
  try {
    const raw = await AsyncStorage.getItem(WX_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && Date.now() - c.ts < WX_TTL) return { weather: c.weather, icon: c.icon || '☀️' };
    }
  } catch {}
  try {
    const loc = await getCurrentLocation();
    if (!loc) return WX_FALLBACK;
    const f = await getShortForecast(loc.lat, loc.lng);
    const icon = f?.current?.icon || '☀️';   // 상세탭과 동일한 skyToIcon 결과
    const weather = toneFromIcon(icon);       // 톤은 아이콘에서 도출 — 헤더와 항상 일치
    AsyncStorage.setItem(WX_KEY, JSON.stringify({ weather, icon, ts: Date.now() })).catch(() => {});
    return { weather, icon };
  } catch (e) {
    return WX_FALLBACK;
  }
}

// 배경 톤 등 분류 문자열만 필요할 때 (하위호환)
export async function getCurrentWxClass() {
  return (await getCurrentWx()).weather;
}

// 날씨 상세 팝업이 '현재 위치'로 새로 받은 forecast.current를 홈 공유 캐시에 반영 —
// 팝업을 닫고 홈으로 돌아오면 헤더 이모지·배경 톤이 방금 본 값과 일치한다.
export function cacheCurrentWx(current) {
  if (!current) return;
  const icon = current.icon || '☀️';
  const payload = { weather: toneFromIcon(icon), icon, ts: Date.now() };
  AsyncStorage.setItem(WX_KEY, JSON.stringify(payload)).catch(() => {});
}

export function HomeBgSlider() {
  // 두 겹 크로스페이드 — 카테고리(시간대/날씨)가 바뀌어 사진을 교체할 때, 하드컷('휙') 대신
  //   위 레이어(새 사진)를 투명→불투명으로 페이드해 아래 레이어(옛 사진) 위로 부드럽게 겹쳐 전환.
  const [layers, setLayers] = useState(() => ({ top: pickImage(), bottom: null }));
  const curRef = useRef(layers.top);          // 현재(위) 사진 — 최신값 추적(effect 클로저 stale 방지)
  const fade = useRef(new Animated.Value(1)).current; // 위 레이어 opacity
  const [weather, setWeather] = useState('clear');
  // 현재 표시 사진의 '카테고리'(시간대 morning/day/lateAfternoon/night, 흐림 'cloudy', 비 'rain-day/night', 겨울 'winter').
  //   같은 카테고리면 사진 유지 — 매 포그라운드 복귀마다 랜덤 재추출하면 불필요한 크로스페이드가 계속 튐.
  const catRef = useRef(
    autumnApplies(timeBucket()) ? 'autumn' : winterApplies(timeBucket()) ? 'winter' : timeBucket()
  );

  useEffect(() => {
    let cancelled = false;
    // 새 사진으로 크로스페이드 전환
    const swapImage = (next) => {
      const old = curRef.current;
      if (old === next) return;
      curRef.current = next;
      fade.stopAnimation();
      fade.setValue(0);
      setLayers({ top: next, bottom: old });
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true })
        .start(({ finished }) => {
          // 페이드 완료 시 아래 레이어 제거(더 최근 전환이 끼어들었으면 건드리지 않음)
          if (finished && !cancelled) setLayers((l) => (l.top === next ? { top: next, bottom: null } : l));
        });
    };
    const refresh = async () => {
      const b = timeBucket();
      const w = await getCurrentWxClass();
      if (cancelled) return;
      const tone = (w === 'rain' || w === 'cloudy' || w === 'partly') ? w : 'clear';
      setWeather(tone);
      // 사진 풀 선택(우선순위): 비 > 흐림(낮) > 가을(단풍철 맑은 낮) > 겨울(낮·늦오후 누런잔디) > 시간대.
      //   구름많음 ⛅(partly)은 해가 우세라 전용 사진 없이 밝은 시간대 사진 유지.
      //   가을 단풍 사진은 '맑은 낮'뿐이라 clear/partly 낮에만(비·흐림은 위에서 이미 걸러짐).
      const isNight = b === 'night';
      let cat, pool;
      if (tone === 'rain') {
        cat = isNight ? 'rain-night' : 'rain-day';
        pool = isNight ? RAIN_IMAGES.night : RAIN_IMAGES.day;
      } else if (tone === 'cloudy' && !isNight) {
        cat = 'cloudy'; pool = CLOUDY_IMAGES;
      } else if (autumnApplies(b)) {
        cat = 'autumn'; pool = AUTUMN_IMAGES;
      } else if (winterApplies(b)) {
        cat = 'winter'; pool = WINTER_IMAGES;
      } else {
        cat = b; pool = TIME_IMAGES[b] || TIME_IMAGES.day;
      }
      if (cat !== catRef.current) {
        catRef.current = cat;
        swapImage(pickFrom(pool));
      }
    };
    refresh();
    // 앱이 포그라운드로 돌아올 때마다 — 현재 시간대·날씨로 갱신
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  return (
    // pointerEvents="none" — 전체화면 배경이라 확대(디스플레이 줌) 시 scene이 탭바 영역까지 커지면 이 배경이
    //   하단 탭바를 덮어 터치를 흡수, 안드 탭바가 무반응이 됨. 배경은 터치 대상이 아니므로 터치를 통과시킴(2026-06-24).
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {/* 아래 레이어 — 페이드 진행 중에만 존재(옛 사진). 위 레이어가 다 덮이면 제거됨 */}
      {layers.bottom != null && (
        <Image source={layers.bottom} fadeDuration={0} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      )}
      {/* 위 레이어 — 새 사진, opacity 0→1 페이드 */}
      <Animated.Image source={layers.top} fadeDuration={0}
        style={[StyleSheet.absoluteFillObject, { opacity: fade }]} resizeMode="cover" />
      <LinearGradient
        style={StyleSheet.absoluteFillObject}
        colors={OVERLAYS[weather] || OVERLAYS.clear}
        locations={[0, 0.34, 0.6, 1]}
      />
    </View>
  );
}
