// =============================================================
// API 키 · 시크릿 — 프로젝트 루트 .env 파일에서 로드
//  - Expo는 EXPO_PUBLIC_ 접두사 변수만 process.env에 주입한다.
//    (접두사 없는 변수는 번들에서 undefined)
//  - .env는 .gitignore 처리됨 — 키 이름 목록은 .env.example 참고
//  - .env 수정 후에는 expo 개발 서버를 재시작해야 반영됨
//  ※ 주의: EXPO_PUBLIC_ 변수도 빌드 결과(JS 번들)에 인라인되므로
//    완전한 비밀 유지는 불가. 쿼터·과금 키는 서버 프록시가 정석.
// =============================================================

// 카카오 디벨로퍼스 (https://developers.kakao.com/console/app)
export const KAKAO_REST_API_KEY   = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;   // REST API — 로그인 OAuth

// 티맵모빌리티 (https://openapi.sk.com) — 자동차 경로안내(실시간 교통). 교통탭 추천 출발시간 계산(TMap 우선·카카오 폴백)
export const TMAP_APP_KEY    = process.env.EXPO_PUBLIC_TMAP_APP_KEY;
export const TMAP_ROUTES_URL = 'https://apis.openapi.sk.com/tmap/routes';

// Firebase — 골퍼 코멘트 공유 백엔드 (Firestore + 익명 인증)
//  - apiKey는 클라이언트 노출되어도 무방 (보안은 Firestore 규칙으로 처리)
export const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// 네이버 클라우드 플랫폼 — Maps Static Map API (정적 지도 이미지)
//  - 인증: x-ncp-apigw-api-key-id / x-ncp-apigw-api-key 헤더
export const NAVER_MAP_CLIENT_ID     = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID;
export const NAVER_MAP_CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_SECRET;

// 공공데이터포털(data.go.kr) 일반 인증키 — 활용신청한 모든 서비스 공용
//  - 기상청 단기예보 / 중기예보 / 생활기상지수(자외선), 한국환경공단 미세먼지
export const KMA_SERVICE_KEY = process.env.EXPO_PUBLIC_KMA_SERVICE_KEY;

export const KMA_SHORT_URL    = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
export const KMA_MID_URL      = 'https://apis.data.go.kr/1360000/MidFcstInfoService';
export const KMA_LIVING_URL   = 'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5';
export const AIRKOREA_URL     = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';

// OpenWeatherMap — 해외 골프장 날씨 (기상청은 국내 전용이라 해외용 별도)
export const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
export const OPENWEATHER_URL     = 'https://api.openweathermap.org/data/2.5';

// =============================================================
// 기상청 LCC DFS 좌표 변환 (위경도 → 격자 nx, ny)
// 단기예보에서 사용
// =============================================================
export function dfsXyConv(lat, lng) {
  const RE = 6371.00877;     // 지구 반경(km)
  const GRID = 5.0;          // 격자 간격(km)
  const SLAT1 = 30.0;        // 투영 위도1
  const SLAT2 = 60.0;        // 투영 위도2
  const OLON = 126.0;        // 기준점 경도
  const OLAT = 38.0;         // 기준점 위도
  const XO = 43;             // 기준점 X좌표
  const YO = 136;            // 기준점 Y좌표
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI)  theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// =============================================================
// 위치(주소 문자열) → 중기예보 지역 코드 매핑
//  land: 육상예보 광역코드 (getMidLandFcst)
//  temp: 중기기온예보 지점코드 (getMidTa)
// =============================================================
export function locToMidRegion(loc) {
  const s = loc || '';
  if (/서울/.test(s))                                    return { land: '11B00000', temp: '11B10101' };
  if (/인천/.test(s))                                    return { land: '11B00000', temp: '11B20201' };
  if (/경기/.test(s))                                    return { land: '11B00000', temp: '11B20601' };
  if (/강원특별자치도|강원/.test(s)) {
    if (/강릉|동해|속초|삼척|양양|고성/.test(s))         return { land: '11D20000', temp: '11D20501' };
    return                                                       { land: '11D10000', temp: '11D10301' };
  }
  if (/충북|충청북도/.test(s))                            return { land: '11C10000', temp: '11C10301' };
  if (/대전|세종|충남|충청남도/.test(s))                  return { land: '11C20000', temp: '11C20401' };
  if (/전북|전라북도/.test(s))                            return { land: '11F10000', temp: '11F10201' };
  if (/광주|전남|전라남도/.test(s))                       return { land: '11F20000', temp: '11F20501' };
  if (/대구|경북|경상북도/.test(s))                       return { land: '11H10000', temp: '11H10701' };
  if (/부산|울산|경남|경상남도/.test(s))                  return { land: '11H20000', temp: '11H20201' };
  if (/제주/.test(s))                                    return { land: '11G00000', temp: '11G00201' };
  return                                                         { land: '11B00000', temp: '11B10101' };
}

// =============================================================
// 주소 → 자외선지수 areaNo (행정구역 10자리)
// 시도 단위 매핑 (시군구 단위까진 정확도가 의미 없어서 생략)
// =============================================================
export function locToAreaNo(loc) {
  const s = loc || '';
  if (/서울/.test(s))                   return '1100000000';
  if (/부산/.test(s))                   return '2600000000';
  if (/대구/.test(s))                   return '2700000000';
  if (/인천/.test(s))                   return '2800000000';
  if (/광주/.test(s))                   return '2900000000';
  if (/대전/.test(s))                   return '3000000000';
  if (/울산/.test(s))                   return '3100000000';
  if (/세종/.test(s))                   return '3600000000';
  if (/경기/.test(s))                   return '4100000000';
  if (/강원특별자치도|강원/.test(s))    return '5100000000';
  if (/충북|충청북/.test(s))            return '4300000000';
  if (/충남|충청남/.test(s))            return '4400000000';
  if (/전북|전라북/.test(s))            return '4500000000';
  if (/전남|전라남/.test(s))            return '4600000000';
  if (/경북|경상북/.test(s))            return '4700000000';
  if (/경남|경상남/.test(s))            return '4800000000';
  if (/제주/.test(s))                   return '5000000000';
  return '1100000000'; // 기본: 서울
}

// =============================================================
// 주소 → 미세먼지 sidoName (에어코리아 시도 약칭)
// =============================================================
export function locToSidoName(loc) {
  const s = loc || '';
  if (/서울/.test(s))                   return '서울';
  if (/부산/.test(s))                   return '부산';
  if (/대구/.test(s))                   return '대구';
  if (/인천/.test(s))                   return '인천';
  if (/광주/.test(s))                   return '광주';
  if (/대전/.test(s))                   return '대전';
  if (/울산/.test(s))                   return '울산';
  if (/세종/.test(s))                   return '세종';
  if (/경기/.test(s))                   return '경기';
  if (/강원특별자치도|강원/.test(s))    return '강원';
  if (/충북|충청북/.test(s))            return '충북';
  if (/충남|충청남/.test(s))            return '충남';
  if (/전북|전라북/.test(s))            return '전북';
  if (/전남|전라남/.test(s))            return '전남';
  if (/경북|경상북/.test(s))            return '경북';
  if (/경남|경상남/.test(s))            return '경남';
  if (/제주/.test(s))                   return '제주';
  return '전국';
}
