// =============================================================
// 카카오 디벨로퍼스 REST API 키
// https://developers.kakao.com/console/app
// =============================================================
export const KAKAO_REST_API_KEY = 'edb7385e0d3233ccd44423118331345a';

// =============================================================
// 기상청(공공데이터포털) 일반 인증키
// https://www.data.go.kr/
//  - 단기예보: VilageFcstInfoService_2.0
//  - 중기예보: MidFcstInfoService
// =============================================================
export const KMA_SERVICE_KEY = '31659a77e32d5d3e729cce10c45734cde85e56b77e5c588ac8ecd282ac6667b4';

export const KMA_SHORT_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
export const KMA_MID_URL   = 'https://apis.data.go.kr/1360000/MidFcstInfoService';

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
