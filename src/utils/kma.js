import {
  KMA_SERVICE_KEY, KMA_SHORT_URL, KMA_MID_URL, KMA_LIVING_URL,
  dfsXyConv, locToMidRegion, locToAreaNo,
} from '../constants/api';
import { WEEKDAYS } from '../constants/data';

const pad = (n) => String(n).padStart(2, '0');

// =============================================================
// 발표 시각 계산
// =============================================================
// 단기예보 base_time: 02 05 08 11 14 17 20 23 (KST). 발표 후 ~10분 이후 조회 가능.
function getShortBaseDateTime(now = new Date()) {
  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = now.getHours();
  const m = now.getMinutes();
  // 발표 후 10분 안전 마진
  const safeH = m < 10 ? h - 1 : h;
  let bt = baseTimes.filter(t => t <= safeH).pop();
  const d = new Date(now);
  if (bt === undefined) {
    // 02시 이전이면 어제 23시 발표
    d.setDate(d.getDate() - 1);
    bt = 23;
  }
  const base_date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const base_time = `${pad(bt)}00`;
  return { base_date, base_time };
}

// 중기예보 tmFc: 매일 06, 18시 발표. tmFc=YYYYMMDDHHMM
// 18시 발표는 wf5*부터만 제공(D+4 누락) → 06시 발표를 우선 사용.
// dayShift: 발표일이 오늘 기준 며칠 전인지 (필드 N 보정에 사용)
function getMidTmFc(now = new Date()) {
  const d = new Date(now);
  const hh = d.getHours();
  let fcH, dayShift;
  if (hh >= 6) { fcH = 6; dayShift = 0; }
  else { d.setDate(d.getDate() - 1); fcH = 18; dayShift = 1; }
  const tmFc = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(fcH)}00`;
  return { tmFc, dayShift };
}

// =============================================================
// 공통 fetch (실패 시 null 반환)
// 모바일 네트워크에서 KMA 응답이 종종 느리거나 끊김 — timeout + 재시도로 보강
// =============================================================
async function fetchJson(url, { timeoutMs = 8000, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[kma] HTTP ${res.status} (attempt ${attempt + 1})`, url, '→', body.slice(0, 200));
        if (attempt < retries) continue; // 일시적 5xx 재시도
        return null;
      }
      const text = await res.text();
      try { return JSON.parse(text); } catch {
        console.warn('[kma] non-JSON response:', text.slice(0, 200));
        return null;
      }
    } catch (e) {
      if (timer) clearTimeout(timer);
      const reason = e?.name === 'AbortError' ? `timeout(${timeoutMs}ms)` : e?.message;
      console.warn(`[kma] fetch failed (attempt ${attempt + 1}):`, reason);
      if (attempt < retries) continue; // 타임아웃·네트워크 오류 재시도
      return null;
    }
  }
  return null;
}

const keyParam = () => `serviceKey=${encodeURIComponent(KMA_SERVICE_KEY)}`;

// =============================================================
// 단기예보 (D-0 ~ D-3) — 격자 nx,ny 필요
// 반환: { current: {temp, sky, pop, wind, humidity, ...}, hourly: [...], daily: [...] }
// =============================================================
export async function getShortForecast(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  // 위치정보법 제16조 제2항 — 이용·제공사실 자동 기록
  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'kma', purpose: '단기예보 조회', method: 'send' });
  } catch {}
  const { nx, ny } = dfsXyConv(lat, lng);
  const { base_date, base_time } = getShortBaseDateTime();
  const url = `${KMA_SHORT_URL}/getVilageFcst?${keyParam()}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
  const data = await fetchJson(url);
  const items = data?.response?.body?.items?.item;
  if (!items) return null;

  // category별 그룹핑: { fcstDate, fcstTime, category, fcstValue }
  // 일별·시간별 정리
  const byKey = {}; // 'YYYYMMDD_HHMM' -> {category: value}
  for (const it of items) {
    const k = `${it.fcstDate}_${it.fcstTime}`;
    if (!byKey[k]) byKey[k] = { fcstDate: it.fcstDate, fcstTime: it.fcstTime };
    byKey[k][it.category] = it.fcstValue;
  }
  const slots = Object.values(byKey).sort((a, b) => (a.fcstDate + a.fcstTime).localeCompare(b.fcstDate + b.fcstTime));

  // 현재(가장 가까운 시각) — SKY 카테고리가 있는 슬롯 우선 (부분 슬롯 방어)
  const now = new Date();
  const nowKey = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}00`;
  const future = slots.filter(s => (s.fcstDate + s.fcstTime) >= nowKey);
  let current = future.find(s => s.SKY !== undefined) || future[0] || slots[0];

  // 날짜별 시간 슬롯 — 6/9/12/15/18/21시 추출용
  const slotsByDate = {};
  for (const s of slots) {
    if (!slotsByDate[s.fcstDate]) slotsByDate[s.fcstDate] = [];
    slotsByDate[s.fcstDate].push(s);
  }

  // 일별 (최저/최고) — TMN/TMX 없는 날은 TMP min/max로 폴백 (오늘 오후엔 TMN/TMX 미발표)
  const dayMap = {};
  for (const s of slots) {
    const d = s.fcstDate;
    if (!dayMap[d]) dayMap[d] = { date: d, tmin: null, tmax: null, tmpMin: null, tmpMax: null, sky: s.SKY, pty: s.PTY, pop: 0 };
    if (s.TMN !== undefined) dayMap[d].tmin = parseFloat(s.TMN);
    if (s.TMX !== undefined) dayMap[d].tmax = parseFloat(s.TMX);
    if (s.POP !== undefined) dayMap[d].pop = Math.max(dayMap[d].pop, parseFloat(s.POP) || 0);
    if (s.TMP !== undefined) {
      const tmp = parseFloat(s.TMP);
      if (Number.isFinite(tmp)) {
        if (dayMap[d].tmpMin === null || tmp < dayMap[d].tmpMin) dayMap[d].tmpMin = tmp;
        if (dayMap[d].tmpMax === null || tmp > dayMap[d].tmpMax) dayMap[d].tmpMax = tmp;
      }
    }
    // 정오 기준 sky 우선
    if (s.fcstTime === '1200' && s.SKY !== undefined) dayMap[d].sky = s.SKY;
    if (s.fcstTime === '1200' && s.PTY !== undefined) dayMap[d].pty = s.PTY;
  }
  const daily = Object.values(dayMap).map(d => ({
    date: `${d.date.slice(0,4)}.${d.date.slice(4,6)}.${d.date.slice(6,8)}`,
    tmin: d.tmin !== null ? d.tmin : d.tmpMin,
    tmax: d.tmax !== null ? d.tmax : d.tmpMax,
    sky: skyToText(d.sky, d.pty),
    icon: skyToIcon(d.sky, d.pty),
    pop: d.pop,
  }));

  return {
    current: {
      temp: current ? parseFloat(current.TMP) : null,
      sky: current ? skyToText(current.SKY, current.PTY) : null,
      icon: current ? skyToIcon(current.SKY, current.PTY) : null,
      pop: current ? parseFloat(current.POP || 0) : 0,
      humidity: current ? parseFloat(current.REH || 0) : 0,
      windSpeed: current ? parseFloat(current.WSD || 0) : 0,
    },
    daily,
    slotsByDate,
    raw: slots,
  };
}

// 라운딩 컨디션 6시간대(6/9/12/15/18/21시) 추출.
// dateStr: 'YYYYMMDD'. 없거나 범위 밖이면 [] 반환.
export function pickHourSlots(slotsByDate, dateStr) {
  const slots = slotsByDate?.[dateStr] || [];
  if (!slots.length) return [];
  const TARGET_HOURS = [6, 9, 12, 15, 18, 21];
  return TARGET_HOURS.map(h => {
    const slot = slots.find(s => parseInt(s.fcstTime, 10) === h * 100);
    if (!slot) return null;
    return {
      time: h < 12 ? `오전 ${h}시` : h === 12 ? '오후 12시' : `오후 ${h - 12}시`,
      hour: h,
      icon: skyToIcon(slot.SKY, slot.PTY),
      sky: skyToText(slot.SKY, slot.PTY),
      temp: parseFloat(slot.TMP),
      wind: parseFloat(slot.WSD || 0),
      rain: parseFloat(slot.POP || 0),
      humidity: parseFloat(slot.REH || 0), // 체감온도 산출용
    };
  }).filter(Boolean);
}

// SKY: 1맑음 3구름많음 4흐림 / PTY: 0없음 1비 2비/눈 3눈 4소나기
function skyToText(sky, pty) {
  if (pty === '1' || pty === 1) return '비';
  if (pty === '2' || pty === 2) return '비/눈';
  if (pty === '3' || pty === 3) return '눈';
  if (pty === '4' || pty === 4) return '소나기';
  if (sky === '1' || sky === 1) return '맑음';
  if (sky === '3' || sky === 3) return '구름많음';
  if (sky === '4' || sky === 4) return '흐림';
  return '';
}
function skyToIcon(sky, pty) {
  if (pty === '1' || pty === 1) return '🌧️';
  if (pty === '2' || pty === 2) return '🌨️';
  if (pty === '3' || pty === 3) return '❄️';
  if (pty === '4' || pty === 4) return '🌦️';
  if (sky === '1' || sky === 1) return '☀️';
  if (sky === '3' || sky === 3) return '⛅';
  if (sky === '4' || sky === 4) return '☁️';
  return '🌤️';
}

// =============================================================
// 중기예보 (D-3 ~ D-10) — 지역코드 + 발표시각 필요
// 반환: [{ dayOffset, sky, icon, rnSt, tmin, tmax }]
// dayOffset: 3 ~ 10 (오늘 기준)
// =============================================================
export async function getMidForecast(loc) {
  const region = locToMidRegion(loc);
  const { tmFc, dayShift } = getMidTmFc();

  const landUrl = `${KMA_MID_URL}/getMidLandFcst?${keyParam()}&pageNo=1&numOfRows=10&dataType=JSON&regId=${region.land}&tmFc=${tmFc}`;
  const taUrl   = `${KMA_MID_URL}/getMidTa?${keyParam()}&pageNo=1&numOfRows=10&dataType=JSON&regId=${region.temp}&tmFc=${tmFc}`;

  const [landData, taData] = await Promise.all([fetchJson(landUrl), fetchJson(taUrl)]);
  const land = landData?.response?.body?.items?.item?.[0];
  const ta   = taData?.response?.body?.items?.item?.[0];
  if (!land || !ta) return [];

  // dayOffset: 오늘 기준 며칠 후인지. KMA 필드명 N = dayOffset + dayShift (발표일 기준).
  const out = [];
  for (let dayOffset = 3; dayOffset <= 10; dayOffset++) {
    const N = dayOffset + dayShift;
    if (N > 10) break; // KMA는 wf10/taMax10까지만 제공
    const wfAm = land[`wf${N}Am`];
    const wfPm = land[`wf${N}Pm`];
    const wf   = land[`wf${N}`] || wfAm || wfPm;
    const rnStAm = land[`rnSt${N}Am`];
    const rnStPm = land[`rnSt${N}Pm`];
    const rnSt = Math.max(parseFloat(rnStAm) || 0, parseFloat(rnStPm) || 0);
    const tmin = parseFloat(ta[`taMin${N}`]);
    const tmax = parseFloat(ta[`taMax${N}`]);
    const sky = wf || '';
    out.push({
      dayOffset,
      sky,
      icon: midWfToIcon(sky),
      rnSt,
      tmin: isNaN(tmin) ? null : tmin,
      tmax: isNaN(tmax) ? null : tmax,
    });
  }
  return out;
}

// =============================================================
// 자외선지수 (LivingWthrIdxServiceV5/getUVIdxV5)
// 매일 06시 발표, 3시간 간격으로 72시간까지 예보 (h0, h3, ..., h72)
// 반환: { uv: number, label: '낮음'|'보통'|'높음'|'매우높음'|'위험' } | null
// =============================================================
function getUVBaseTime(now = new Date()) {
  const d = new Date(now);
  // 06시 발표 → 07시 이전이면 어제 06시 사용
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}06`;
}

function uvLabel(v) {
  if (v <= 2) return '낮음';
  if (v <= 5) return '보통';
  if (v <= 7) return '높음';
  if (v <= 10) return '매우높음';
  return '위험';
}

export async function getUVIndex(loc) {
  const areaNo = locToAreaNo(loc);
  const time = getUVBaseTime();
  const url = `${KMA_LIVING_URL}/getUVIdxV5?${keyParam()}&pageNo=1&numOfRows=10&dataType=JSON&areaNo=${areaNo}&time=${time}`;
  const data = await fetchJson(url);
  const item = data?.response?.body?.items?.item?.[0];
  if (!item) return null;

  // 현재 시각의 base time 대비 offset 시간 → 3의 배수로 snap
  const baseDate = new Date();
  baseDate.setHours(6, 0, 0, 0);
  if (new Date().getHours() < 7) baseDate.setDate(baseDate.getDate() - 1);
  const offsetH = Math.round((Date.now() - baseDate.getTime()) / 3600000);
  const snapH = Math.max(0, Math.min(72, Math.round(offsetH / 3) * 3));

  // h{snapH}부터 가장 가까운 유효 값 찾기 (값이 빈 시간대 있을 수 있어)
  let value = NaN;
  for (let d = 0; d <= 6 && !Number.isFinite(value); d += 3) {
    const k1 = `h${snapH - d}`;
    const k2 = `h${snapH + d}`;
    if (item[k1] !== undefined && item[k1] !== '') value = parseFloat(item[k1]);
    if (!Number.isFinite(value) && item[k2] !== undefined && item[k2] !== '') value = parseFloat(item[k2]);
  }
  if (!Number.isFinite(value)) return null;
  return { uv: value, label: uvLabel(value) };
}

function midWfToIcon(wf) {
  if (!wf) return '🌤️';
  if (wf.includes('비/눈') || wf.includes('비/눈')) return '🌨️';
  if (wf.includes('소나기')) return '🌦️';
  if (wf.includes('비')) return '🌧️';
  if (wf.includes('눈')) return '❄️';
  if (wf.includes('흐림')) return '☁️';
  if (wf.includes('구름많음')) return '⛅';
  if (wf.includes('맑음')) return '☀️';
  return '🌤️';
}

// =============================================================
// 통합: D-3 이내는 단기, D-4~10은 중기로 10일치 예보
// loc: 주소(중기 지역 매핑용), lat/lng: 단기 격자 변환용
// 반환: { current, days: [{day, date, icon, sky, tmin, tmax, pop}] }
// =============================================================
export async function getCombinedForecast({ lat, lng, loc }) {
  const [short, mid] = await Promise.all([
    getShortForecast(lat, lng),
    getMidForecast(loc),
  ]);

  const out = {
    current: short?.current || null,
    slotsByDate: short?.slotsByDate || {},
    days: [],
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAYS_KO = WEEKDAYS;

  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const ds = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    const day = i === 0 ? '오늘' : i === 1 ? '내일' : DAYS_KO[d.getDay()];

    if (i <= 3) {
      const found = (short?.daily || []).find(x => x.date === ds);
      if (found) {
        out.days.push({ day, date: ds, ...found });
        continue;
      }
    }
    if (i >= 3) {
      const midItem = mid.find(x => x.dayOffset === i);
      if (midItem) {
        out.days.push({
          day, date: ds, icon: midItem.icon, sky: midItem.sky,
          tmin: midItem.tmin, tmax: midItem.tmax, pop: midItem.rnSt,
        });
        continue;
      }
    }
    out.days.push({ day, date: ds, icon: '🌤️', sky: '', tmin: null, tmax: null, pop: 0 });
  }

  return out;
}
