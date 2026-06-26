import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShortForecast } from '../../utils/kma';
import { getCurrentLocation } from '../../utils/location';

// =============================================================
// 홈 배경 — 시간대별 골프장 사진(직접 검증한 큐레이션) + 날씨별 화면 톤.
//  · 사진: 시간대(아침/낮/늦은오후/밤)에 맞춰 교체
//  · 날씨: 비/흐림이면 화면을 어둡고 회색톤으로 덮음 (Unsplash에 비 오는
//          골프장 사진이 거의 없어, 사진 교체 대신 톤으로 날씨 분위기를 냄)
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
    require('../../../assets/home-bg/day4.jpg'), // 화창 — 페어웨이·연못·산·카트
  ],
  lateAfternoon: [ // 늦은 오후·황혼 (16~21시) — 골든아워·노을 (사용자 사진, 노을 더 받으면 보강)
    require('../../../assets/home-bg/lateAfternoon1.jpg'), // 황혼빛 — 따뜻한 빛·드라마틱 구름
    require('../../../assets/home-bg/lateAfternoon2.jpg'), // 골든아워 — 낮게 깔린 햇살·티잉 그라운드
  ],
  night: [ // 진짜 밤 (21~05시) — 밤골프장(조명 켜진 페어웨이)·자연 야경 (도시 야경 X)
    require('../../../assets/home-bg/night1.jpg'), // 맑은 밤 — 남색 하늘·산 실루엣·조명 페어웨이·벙커
    require('../../../assets/home-bg/night2.jpg'), // 어스름 — 조명 켜진 페어웨이·산
  ],
};

// 흐림(cloudy) 전용 사진 — 실제 구름 낀 골프장(회색 하늘). 날씨가 흐림이고 낮 시간대면 시간대 사진 대신 사용
//   (톤 오버레이로만 표현하던 것 보강, 사용자 사진 2026-06-14). 밤엔 낮 흐림 사진이 안 어울려 제외. 비(rain)는 사진 없어 톤만(현행).
const CLOUDY_IMAGES = [
  require('../../../assets/home-bg/cloudy1.jpg'),
];

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

// 날씨별 그라데이션 오버레이 — 위/아래(글씨 영역)는 진하게, 가운데는 옅게.
//  맑음: 초록 다크톤 / 흐림: 회색 (사진 채도·밝기 죽임) / 비: 더 어두운 청회색
const OVERLAYS = {
  clear:  ['rgba(8,24,14,0.86)',  'rgba(8,24,14,0.40)',  'rgba(8,24,14,0.46)',  'rgba(8,24,14,0.74)'],
  partly: ['rgba(24,34,30,0.82)', 'rgba(24,34,30,0.40)', 'rgba(24,34,30,0.45)', 'rgba(24,34,30,0.72)'], // 구름많음 ⛅ — clear(초록)와 cloudy(회색) 사이. 색은 회녹, 가운데 투명도는 clear급(0.40)으로 사진 밝게 비침
  cloudy: ['rgba(42,46,50,0.80)', 'rgba(42,46,50,0.42)', 'rgba(42,46,50,0.46)', 'rgba(42,46,50,0.74)'], // 옅게(2026-06-14) — 구름 낀 날 회색이 과해 사진이 묻혀 뿌옇던 것 완화. 가운데를 확 낮춰 사진 비치게, 상·하단만 글씨 가독 위해 유지(clear 수준 곡선)
  rain:   ['rgba(16,24,34,0.95)', 'rgba(16,24,34,0.72)', 'rgba(16,24,34,0.76)', 'rgba(16,24,34,0.91)'],
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
function pickImage() {
  const b = timeBucket();
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
  const [imageUri, setImageUri] = useState(pickImage);
  const [weather, setWeather] = useState('clear');
  // 현재 표시 사진의 '카테고리'(시간대 morning/day/lateAfternoon/night 또는 흐림 'cloudy') — 같은 카테고리면 사진 유지.
  // (매 포그라운드 복귀마다 랜덤 재추출하면 안드 <Image> 크로스페이드로 두 사진이 겹쳐 보임)
  const catRef = useRef(winterApplies(timeBucket()) ? 'winter' : timeBucket());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const b = timeBucket();
      const w = await getCurrentWxClass();
      if (cancelled) return;
      const tone = (w === 'rain' || w === 'cloudy' || w === 'partly') ? w : 'clear';
      setWeather(tone);
      // 흐림(☁️)이고 낮 시간대면 실제 흐림 사진, 아니면 시간대 사진(구름많음 ⛅은 밝은 시간대 사진 유지).
      //   카테고리(시간대/흐림)가 바뀔 때만 교체(깜빡임 제거)
      const useCloudy = tone === 'cloudy' && b !== 'night';
      const useWinter = !useCloudy && winterApplies(b);   // 겨울 낮·늦오후 — 누런잔디(흐림이 우선)
      const cat = useCloudy ? 'cloudy' : useWinter ? 'winter' : b;
      if (cat !== catRef.current) {
        catRef.current = cat;
        setImageUri(useCloudy ? pickFrom(CLOUDY_IMAGES) : useWinter ? pickFrom(WINTER_IMAGES) : pickFrom(TIME_IMAGES[b] || TIME_IMAGES.day));
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
      <Image source={imageUri} fadeDuration={0} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <LinearGradient
        style={StyleSheet.absoluteFillObject}
        colors={OVERLAYS[weather] || OVERLAYS.clear}
        locations={[0, 0.34, 0.6, 1]}
      />
    </View>
  );
}
