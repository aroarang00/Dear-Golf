// =============================================================
// Gemini Flash 프록시 — 구조화 추출(onCall)
//
// 앱 → extractReservation → Gemini Flash(멀티모달) → 앱.
// API 키는 CF Secret(GEMINI_API_KEY)에만 보관(앱·코드 노출 금지 [[api-key-security]]).
//
// 용도(디어골프): 예약 문자/캡처에서 구장·코스·날짜·시간·인원 추출 → 예정 라운딩 자동입력.
//   (너나픽 캡처 '분류'는 Claude, 디어골프 숫자/텍스트 '추출'은 Gemini Flash로 역할 분리 — 비용 40배↓)
//
// Secret 등록(최초 1회, 터미널에서):
//   firebase functions:secrets:set GEMINI_API_KEY   (Google AI Studio 발급 키 붙여넣기)
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// 구조화 추출용 — 저렴하고 빠름. 스크린샷 텍스트 추출엔 충분(정확도 부족 시 상위 모델로 올림).
const MODEL = 'gemini-2.5-flash';
// ★Vertex AI express 엔드포인트 사용 — AI Studio가 발급하는 새 API 키('AQ.' 형식, 서비스계정 연결형)는
//   org 정책(iam.managed.disableServiceAccountApiKeyCreation)상 apiTargets가 aiplatform으로만 제한됨.
//   그래서 generativelanguage.googleapis.com(구 Gemini Developer API)로는 막히고, aiplatform으로만 호출 가능.
//   인증은 ?key= 쿼리 대신 x-goog-api-key 헤더로(express 모드).
const GEMINI_URL = (model) =>
  `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`;

// per-uid 레이트리밋 — 유료 API를 루프로 남용하면 비용 폭증. 롤링 1시간 창 uid당 상한.
//   저장은 geminiUsage/{uid}(CF만 접근 — 규칙 기본 deny). App Check 없이 비용 상한만 거는 경량 방어.
async function checkRateLimit(uid, limit) {
  const db = getFirestore();
  const WINDOW_MS = 60 * 60 * 1000;
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const ref = db.doc(`geminiUsage/${uid}`);
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : null;
      if (!d || now - (d.windowStart || 0) > WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }
      if ((d.count || 0) >= limit) return false;
      tx.update(ref, { count: FieldValue.increment(1) });
      return true;
    });
  } catch (e) {
    logger.warn('[gemini] ratelimit check fail (allowing)', e?.message);
    return true;   // 레이트리밋 저장소 오류는 막지 않음(가용성 우선)
  }
}

// Gemini generateContent 호출 — parts(텍스트/이미지 혼합) + responseSchema로 JSON 강제.
//   parts: [{ text }] | [{ inlineData: { mimeType, data(base64) } }] ... 순서대로 전달.
//   반환: 파싱된 객체(모델이 responseSchema에 맞춰 JSON 문자열을 냄).
async function callGemini({ key, parts, schema, temperature = 0, thinkingBudget = 0 }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
      // 2.5 Flash는 기본 'thinking'(추론)이 켜져 있어 지연이 큼. 스코어/예약 추출은 추론이 거의 불필요해
      //   thinkingBudget:0으로 끄면 응답이 크게 빨라짐. 인식 정확도가 떨어지면 값을 올려 재조정.
      thinkingConfig: { thinkingBudget },
    },
  };
  let res;
  try {
    res = await fetch(GEMINI_URL(MODEL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.error('[gemini] network fail', e?.message);
    throw new HttpsError('unavailable', 'AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('[gemini] non-ok', res.status, text.slice(0, 500));
    // 429 = 쿼터 초과(무료 등급 분당 한도 등) — 사용자에겐 잠시 후 재시도로 안내
    throw new HttpsError(res.status === 429 ? 'resource-exhausted' : 'internal',
      res.status === 429 ? 'AI 사용량이 잠시 많아요. 잠시 후 다시 시도해주세요.' : 'AI 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
  }
  const json = await res.json().catch(() => null);
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    logger.warn('[gemini] empty candidate', JSON.stringify(json?.promptFeedback || {}).slice(0, 300));
    throw new HttpsError('internal', 'AI가 내용을 읽지 못했어요. 더 선명한 캡처로 다시 시도해주세요.');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn('[gemini] json parse fail', raw.slice(0, 300));
    throw new HttpsError('internal', 'AI 응답을 해석하지 못했어요. 다시 시도해주세요.');
  }
}

// ── 예약 정보 추출 ─────────────────────────────────────────────
// 입력: { imageBase64?, format?, text? } — 예약 캡처(이미지) 또는 붙여넣은 예약 문자(텍스트). 최소 하나.
// 출력: { ok, found, courseName, subCourse, date(YYYY.MM.DD|''), time(HH:MM|''), members(int|null), teeTimeNote }
const RESERVATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '골프 예약 정보로 보이는 내용을 찾았으면 true' },
    courseName: { type: 'STRING', description: '골프장(구장) 이름. 지점명 포함. 없으면 빈 문자열' },
    subCourse: { type: 'STRING', description: '세부 코스명(예: 레이크, 동코스, A→B). 여러 팀·티타임이면 가장 이른 티타임의 코스. 없으면 빈 문자열' },
    date: { type: 'STRING', description: '라운딩 날짜 YYYY.MM.DD. 연도 없으면 오늘 이후 가장 가까운 날로. 없으면 빈 문자열' },
    time: { type: 'STRING', description: '티오프 시각 HH:MM(24시간). 여러 팀·티타임이면 가장 이른 시각. 없으면 빈 문자열' },
    booker: { type: 'STRING', description: '예약자(예약한 사람) 이름. 없으면 빈 문자열' },
    members: { type: 'INTEGER', description: '예약 인원 수(1~4). 명시 안 됐으면 0' },
    teeTimeNote: { type: 'STRING', description: '단체 예약처럼 티타임이 2개 이상이면 전체 목록을 한 줄로: "07:00 레이크 / 07:08 밸리 / 07:16 레이크"(코스가 있으면 시각 뒤에). 티타임이 하나뿐이면 빈 문자열.' },
  },
  required: ['found', 'courseName', 'subCourse', 'date', 'time', 'booker', 'members', 'teeTimeNote'],
};

exports.extractReservation = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.');

    const { imageBase64, format = 'jpg', text } = request.data || {};
    const hasImage = imageBase64 && typeof imageBase64 === 'string';
    const hasText = text && typeof text === 'string' && text.trim().length > 0;
    if (!hasImage && !hasText) {
      throw new HttpsError('invalid-argument', '예약 캡처나 문자 내용이 필요해요.');
    }
    if (hasImage && imageBase64.length > 8 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', '이미지가 너무 커요. 다시 시도해주세요.');
    }
    if (hasText && text.length > 4000) {
      throw new HttpsError('invalid-argument', '문자 내용이 너무 길어요.');
    }

    const uid = request.auth.uid;
    if (!(await checkRateLimit(uid, 40))) {
      logger.warn('[gemini] reservation ratelimit exceeded', { uid });
      throw new HttpsError('resource-exhausted', '자동입력을 너무 많이 요청했어요. 잠시 후 다시 시도해주세요.');
    }

    // 서버 오늘 날짜(KST) — 연도 없는 예약("7/25")을 오늘 이후로 추정하도록 프롬프트에 제공.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`;

    const prompt =
      `너는 한국 골프장 예약 확인 문자/캡처에서 정보를 뽑는 도우미야. 오늘은 ${todayStr}(KST)야.\n` +
      `주어진 내용에서 아래를 정확히 추출해 JSON으로만 답해:\n` +
      `- courseName: 골프장(구장) 이름. "OO CC 스타점"처럼 지점명이 있으면 함께.\n` +
      `- subCourse: 골프장 안의 세부 코스명(레이크/A코스/in·out 등). 없으면 빈 문자열.\n` +
      `  단, 올드/듄스/뉴/노스/사우스코스처럼 별도로 운영되는 코스명은 세부코스가 아니라 courseName에 포함해(예: '라비에벨 올드코스'), subCourse는 비워.\n` +
      `- date: 라운딩(플레이) 날짜를 YYYY.MM.DD로. 연도가 안 적혀 있으면 오늘 이후 가장 가까운 날짜의 연도로.\n` +
      `- time: 티오프(첫 홀) 시각을 HH:MM 24시간제로. "오전 7시"→07:00, "오후 1시반"→13:30. 단체 예약처럼 티타임이 여러 개면 '가장 이른' 시각.\n` +
      `- booker: 예약자(예약한 사람) 이름. "예약자: 홍길동"처럼 적혀 있으면 그 이름. 없으면 빈 문자열.\n` +
      `- members: 예약 인원 수(보통 1~4). 안 적혀 있으면 0.\n` +
      `- teeTimeNote: 티타임이 2개 이상이면(단체·여러 팀) 전체를 한 줄 목록으로 "07:00 레이크 / 07:08 밸리 / 07:16 레이크"처럼(각 시각 뒤에 코스가 있으면 붙여). subCourse·time은 이 중 가장 이른 것으로. 티타임이 하나면 빈 문자열.\n` +
      `골프 예약 내용이 아니면 found=false, 나머지는 빈 값/0으로.`;

    const parts = [{ text: prompt }];
    if (hasText) parts.push({ text: `\n[예약 내용]\n${text.trim()}` });
    if (hasImage) parts.push({ inlineData: { mimeType: format === 'png' ? 'image/png' : 'image/jpeg', data: imageBase64 } });

    logger.info('[gemini] reservation req', { uid, img: !!hasImage, txt: !!hasText });
    // .trim() — Secret 등록 시 붙었을 수 있는 공백/개행 제거(query param에 들어가면 인증 깨짐 방지)
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: RESERVATION_SCHEMA });

    logger.info('[gemini] reservation ok', { uid, found: !!out?.found });
    return {
      ok: true,
      found: !!out?.found,
      courseName: (out?.courseName || '').trim(),
      subCourse: (out?.subCourse || '').trim(),
      date: (out?.date || '').trim(),
      time: (out?.time || '').trim(),
      booker: (out?.booker || '').trim(),
      members: Number.isFinite(out?.members) && out.members > 0 ? out.members : null,
      teeTimeNote: (out?.teeTimeNote || '').trim(),   // 단체 여러 티타임 요약(한마디/메모용). 하나면 ''
    };
  }
);

// ── 스코어카드 추출 ─────────────────────────────────────────────
// 입력: { images: [{ data(base64), format? }] } — 스코어카드/스마트스코어 태블릿 사진 1~2장(전반/후반).
//   CLOVA OCR(PAR 표 필수·태블릿 전후반 분리 못 읽음)을 Gemini 비전으로 대체 — PAR 없어도, 태블릿 두 장도 병합.
// 출력: { ok, found, pars:number[18], players:[{ name, holes:number[18], total }] }
//   ★동반자 함께 나온 표는 플레이어(행) 전부 반환 → 클라 검토 모달에서 본인 행 선택.
const SCORECARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '골프 스코어카드나 스코어 화면(스마트스코어 태블릿 등)으로 보이면 true' },
    pars: {
      type: 'ARRAY',
      description: '1홀~18홀 파를 순서대로 18개(모든 플레이어 공통). PAR 행이 없으면 빈 배열 [].',
      items: { type: 'INTEGER' },
    },
    players: {
      type: 'ARRAY',
      description: '점수 행(플레이어)마다 하나. 동반자가 함께 나온 표면 모든 행을 담음(대표 1명만 고르지 말 것). 한 명이면 1개.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '플레이어 이름/구분(표에 있으면). 없으면 빈 문자열' },
          scores: { type: 'ARRAY', description: '1홀~18홀 타수를 순서대로 18개. 없는 홀은 0.', items: { type: 'INTEGER' } },
          total: { type: 'INTEGER', description: '그 플레이어 총타. 없으면 0' },
        },
        required: ['name', 'scores', 'total'],
      },
    },
  },
  required: ['found', 'pars', 'players'],
};

exports.extractScorecard = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: 'asia-northeast3',
    memory: '512MiB',   // 이미지 최대 4장(전체 카드 팀별)
    timeoutSeconds: 90,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.');

    const imgs = Array.isArray(request.data?.images) ? request.data.images : [];
    const valid = imgs.filter(im => im && typeof im.data === 'string' && im.data.length > 0).slice(0, 4);
    if (!valid.length) throw new HttpsError('invalid-argument', '스코어카드 사진이 필요해요.');
    for (const im of valid) {
      if (im.data.length > 8 * 1024 * 1024) throw new HttpsError('invalid-argument', '이미지가 너무 커요. 다시 시도해주세요.');
    }

    const uid = request.auth.uid;
    if (!(await checkRateLimit(uid, 40))) {
      logger.warn('[gemini] scorecard ratelimit exceeded', { uid });
      throw new HttpsError('resource-exhausted', '자동인식을 너무 많이 요청했어요. 잠시 후 다시 시도해주세요.');
    }

    const prompt =
      `너는 골프 스코어카드/스코어 화면 이미지에서 홀별 점수를 뽑는 도우미야. 이미지가 1~4장 올 수 있어.\n` +
      `각 이미지를 보고 유형을 스스로 판별해서, 나온 모든 사람의 1~18홀 점수를 뽑아 JSON으로만 답해.\n` +
      `[이미지 유형 판별]\n` +
      `- 한 이미지에 1~9홀만(또는 10~18홀만) 점수가 있으면 = 한 라운드의 '조각'(스마트스코어 태블릿 전반/후반). 같은 사람들의 전반+후반을 짝지어 1~18홀로 합쳐.\n` +
      `- 한 이미지에 18홀이 다 있으면 = '완결 카드'. 그 카드의 모든 플레이어를 각각 뽑아. 서로 다른 완결 카드는 보통 다른 팀이니, 사람을 겹치지 말고 전부 나열해(예: 4장이면 최대 16명).\n` +
      `[출력]\n` +
      `- pars: 1홀~18홀 파 18개 배열(모든 플레이어 공통, 같은 코스 기준). PAR 행이 없으면 빈 배열 [].\n` +
      `- players: 사람마다 하나씩. { name(이름/구분, 없으면 ''), scores(1~18홀 타수 18개, 없는 홀 0), total(총타, 없으면 0) }.\n` +
      `  ★한 표에 여러 명(4명 등)이면 전원을 players에 담아 — 대표 한 명만 고르지 마. 사용자가 나중에 본인 행을 고른다.\n` +
      `스코어 표가 전혀 아니면 found=false, players=[].`;

    const parts = [{ text: prompt }];
    valid.forEach((im, i) => {
      parts.push({ text: `\n[이미지 ${i + 1}]` });
      parts.push({ inlineData: { mimeType: im.format === 'png' ? 'image/png' : 'image/jpeg', data: im.data } });
    });

    logger.info('[gemini] scorecard req', { uid, imgs: valid.length });
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: SCORECARD_SCHEMA });

    // 18칸 정규화 — 순서대로 채우고 범위 밖(par 3~5·score 1~20 아님)은 0.
    const to18 = (arr, min, max) => {
      const o = Array(18).fill(0);
      (Array.isArray(arr) ? arr : []).forEach((n, i) => {
        const v = Number(n);
        if (i < 18 && Number.isFinite(v) && v >= min && v <= max) o[i] = v;
      });
      return o;
    };
    const pars = to18(out?.pars, 3, 5);
    const players = (Array.isArray(out?.players) ? out.players : []).map(p => {
      const scores = to18(p?.scores, 1, 20);
      const sum = scores.reduce((s, n) => s + n, 0);
      return {
        name: (p?.name || '').toString().trim(),
        scores,
        total: (Number.isFinite(p?.total) && p.total > 0) ? p.total : sum,
      };
    }).filter(p => p.scores.some(n => n > 0));   // 점수 하나도 없는 유령 행 제거

    logger.info('[gemini] scorecard ok', { uid, found: !!out?.found, players: players.length });
    return { ok: true, found: !!out?.found, pars, players };
  }
);

// ── 골프 지출 추출 ─────────────────────────────────────────────
// 입력: { text?, imageBase64?, format? } — 카드결제 문자/영수증 캡처/사용자가 적은 한 줄. 최소 하나.
// 출력: { ok, found, amount(int), category('membership'|'equipment'|'etc'), date(YYYY.MM.DD|''), memo }
//   가계부 '직접 지출' 자동입력용(golfExpenses). 클라는 프리필만 받고 사용자가 확인·수정 후 저장.
const EXPENSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '골프 관련 지출 정보를 찾았으면 true' },
    amount: { type: 'INTEGER', description: '지출/결제 금액(원). 숫자만(콤마·원 제거). 여러 금액이면 결제 총액. 없으면 0' },
    category: { type: 'STRING', enum: ['membership', 'equipment', 'etc'],
      description: 'membership=모임·동호회 회비, equipment=클럽·골프백·거리측정기 등 장비, etc=의류·볼·장갑·소품·그 외. 애매하면 etc' },
    date: { type: 'STRING', description: '지출 날짜 YYYY.MM.DD. 카드 승인일시가 있으면 그 날짜, "어제/지난주 토요일" 등 상대표현은 오늘 기준 계산. 없으면 빈 문자열' },
    memo: { type: 'STRING', description: '품목이나 상호를 20자 이내로 짧게(예: "타이틀리스트 볼", "OO골프 월회비"). 없으면 빈 문자열' },
  },
  required: ['found', 'amount', 'category', 'date', 'memo'],
};

exports.extractExpense = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.');

    const { imageBase64, format = 'jpg', text } = request.data || {};
    const hasImage = imageBase64 && typeof imageBase64 === 'string';
    const hasText = text && typeof text === 'string' && text.trim().length > 0;
    if (!hasImage && !hasText) throw new HttpsError('invalid-argument', '카드 문자나 지출 내용이 필요해요.');
    if (hasImage && imageBase64.length > 8 * 1024 * 1024) throw new HttpsError('invalid-argument', '이미지가 너무 커요. 다시 시도해주세요.');
    if (hasText && text.length > 4000) throw new HttpsError('invalid-argument', '내용이 너무 길어요.');

    const uid = request.auth.uid;
    if (!(await checkRateLimit(uid, 40))) {
      logger.warn('[gemini] expense ratelimit exceeded', { uid });
      throw new HttpsError('resource-exhausted', '자동입력을 너무 많이 요청했어요. 잠시 후 다시 시도해주세요.');
    }

    // 서버 오늘 날짜(KST) — "어제/지난주" 상대표현·연도 없는 날짜를 오늘 기준으로 해석하도록 프롬프트에 제공.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`;

    const prompt =
      `너는 한국 골퍼의 '골프 관련 지출'을 카드결제 문자·영수증·또는 사용자가 적은 한 줄에서 뽑는 도우미야. 오늘은 ${todayStr}(KST)야.\n` +
      `주어진 내용에서 아래를 추출해 JSON으로만 답해:\n` +
      `- amount: 지출/결제 금액(원). 숫자만(콤마·'원' 제거). 여러 금액이 있으면 결제 총액. 없으면 0.\n` +
      `- category: membership=모임·동호회 회비, equipment=클럽·골프백·거리측정기 등 '장비', etc=의류·볼·장갑·소품·그 외. 애매하면 etc.\n` +
      `- date: 지출 날짜 YYYY.MM.DD. 카드 승인일시가 있으면 그 날짜. "어제/그제/지난주 토요일" 같은 상대표현은 오늘 기준으로 계산. 없으면 빈 문자열.\n` +
      `- memo: 품목이나 상호를 20자 이내로 짧게(예: "타이틀리스트 볼", "OO골프 월회비", "나이키 골프의류"). 없으면 빈 문자열.\n` +
      `골프와 무관한 지출로 보이면 found=false, amount=0.`;

    const parts = [{ text: prompt }];
    if (hasText) parts.push({ text: `\n[지출 내용]\n${text.trim()}` });
    if (hasImage) parts.push({ inlineData: { mimeType: format === 'png' ? 'image/png' : 'image/jpeg', data: imageBase64 } });

    logger.info('[gemini] expense req', { uid, img: !!hasImage, txt: !!hasText });
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: EXPENSE_SCHEMA });

    const CATS = ['membership', 'equipment', 'etc'];
    logger.info('[gemini] expense ok', { uid, found: !!out?.found });
    return {
      ok: true,
      found: !!out?.found,
      amount: Number.isFinite(out?.amount) && out.amount > 0 ? Math.round(out.amount) : 0,
      category: CATS.includes(out?.category) ? out.category : 'etc',
      date: (out?.date || '').trim(),
      memo: (out?.memo || '').toString().trim().slice(0, 50),
    };
  }
);

// ── 모임 정산 '걷기' 자동 계산 ────────────────────────────────
// ★extractExpense와 다른 점: 저기는 읽은 값을 '그대로' 채우면 끝이지만, 정산은 총무마다 요구가 다르다
//   (1/n·100원 올림·"김이사는 카트비 빼고"·"박부장이 그늘집 계산"). 그래서 금액 추출에서 그치지 않고
//   요구사항 문장까지 받아 사람별 금액을 AI가 계산해 돌려준다 (사용자 2026-07-22).
//   ※합계가 총액과 어긋나면 총무가 은행앱 대조에서 바로 신뢰를 잃으므로, 클라이언트에서 한 번 더 검산한다.
const SETTLEMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '금액 정보를 찾았으면 true' },
    total: { type: 'INTEGER', description: '걷을 총액(원). 숫자만. 없으면 0' },
    members: {
      type: 'ARRAY',
      description: '사람별 낼 금액. 참가자 명단이 주어지면 그 이름을 그대로 쓰고 순서도 유지한다',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '참가자 이름' },
          amount: { type: 'INTEGER', description: '이 사람이 낼 금액(원)' },
        },
        required: ['name', 'amount'],
      },
    },
    items: {
      type: 'ARRAY',
      description: '건별 내역. 결제가 여러 건이면 가맹점(상호)명과 금액을 그대로 옮긴다. 없으면 빈 배열',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING', description: '가게 상호명 그대로(예: "1차 복돌이식당", "2차 탑호프"). 20자 이내' },
          amount: { type: 'INTEGER', description: '그 건의 결제 금액(원)' },
        },
        required: ['label', 'amount'],
      },
    },
    account: { type: 'STRING', description: '입금 계좌가 있으면 "은행 계좌번호" 형태로 정리(예: "국민 123456-78-901234"). 없으면 빈 문자열' },
    accountName: { type: 'STRING', description: '예금주 이름. 없으면 빈 문자열' },
    note: { type: 'STRING', description: '계산 근거를 한 줄로(예: "총 998,000원을 4명 1/n, 100원 단위 올림"). 40자 이내' },
  },
  required: ['found', 'total', 'members', 'items', 'account', 'accountName', 'note'],
};

exports.extractSettlement = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.');

    const { imageBase64, images, format = 'jpg', text, names, instruction, kind } = request.data || {};
    // 1차·2차처럼 영수증이 여러 장인 경우가 흔하다(사용자 2026-07-22). 배열을 받되 3장으로 막는다 —
    //   스코어카드에서 3장 이상이면 오합산이 났던 전례가 있어([[project_scorecard_ai]]) 장수를 늘리지 않는다.
    const imgList = (Array.isArray(images) ? images : (imageBase64 ? [imageBase64] : []))
      .filter(s => s && typeof s === 'string')
      .slice(0, 3);
    const hasImage = imgList.length > 0;
    const hasText = text && typeof text === 'string' && text.trim().length > 0;
    const hasInstr = instruction && typeof instruction === 'string' && instruction.trim().length > 0;
    if (!hasImage && !hasText && !hasInstr) throw new HttpsError('invalid-argument', '금액이나 요구사항이 필요해요.');
    if (imgList.some(s => s.length > 8 * 1024 * 1024)) throw new HttpsError('invalid-argument', '이미지가 너무 커요. 다시 시도해주세요.');
    if (hasText && text.length > 4000) throw new HttpsError('invalid-argument', '내용이 너무 길어요.');

    const uid = request.auth.uid;
    if (!(await checkRateLimit(uid, 40))) {
      logger.warn('[gemini] settlement ratelimit exceeded', { uid });
      throw new HttpsError('resource-exhausted', '자동입력을 너무 많이 요청했어요. 잠시 후 다시 시도해주세요.');
    }

    const list = Array.isArray(names)
      ? names.map(n => String(n || '').trim()).filter(Boolean).slice(0, 40)
      : [];

    // ★선입금과 사후정산은 금액의 의미가 정반대다(사용자 2026-07-22).
    //   선입금 = "1인 15만원"처럼 단가가 먼저 정해지고 전원이 같은 금액을 낸다. 나누면 안 된다.
    //   식사정산 = 이미 나온 총액을 참석자끼리 나눈다.
    const isPrepay = kind === 'prepay';
    const modeRule = isPrepay
      ? `★이 정산은 '선입금'이다. 주어진 금액은 원칙적으로 '1인당 금액'이다.\n` +
        `  - 총액을 나누지 마라. 모든 참가자에게 같은 금액을 부과한다.\n` +
        `  - 예: "캐디피 15만" + 참가자 4명 → 각자 150000원, total=600000.\n` +
        `  - total은 (1인당 금액 × 인원수)로 계산한다.\n` +
        `  - 단 요구사항에 "총 80만원을 나눠서"처럼 총액을 나누라는 말이 명시되면 그때만 나눈다.\n` +
        `  - "누구는 제외/면제"라고 하면 그 사람만 빼고, 나머지 금액은 그대로 둔다(재배분 없음).\n`
      : `★이 정산은 사후 정산이다. 주어진 금액은 '총액'이고 참석자끼리 나눈다.\n` +
        `  - 특별한 요구가 없으면 인원수대로 균등 배분(1/n)한다.\n`;

    const prompt =
      `너는 한국 골프 모임 총무의 정산을 돕는 도우미야. 카드결제 문자·영수증·정산 메시지에서 금액을 읽고, ` +
      `총무의 요구사항대로 사람별로 낼 금액을 계산해 JSON으로만 답해.\n` +
      modeRule +
      `규칙:\n` +
      `- total: 걷을 총액(원). 위 모드 규칙에 따라 계산한다.\n` +
      `- members: 참가자 명단이 주어지면 그 이름을 그대로, 순서도 그대로 쓴다. 명단이 없으면 빈 배열.\n` +
      // ★나눈 끝자리는 버리지 말고 올린다(사용자 2026-07-22). 버리면 모자란 돈을 총무가 조용히 떠안는데,
      //   본인은 손해인 줄도 모르고 매번 몇백 원씩 낸다. 반올림은 답이 아니다 — 끝자리가 134면 반올림해도
      //   100으로 내려가 손해가 그대로다. 그래서 기본을 '올림'으로 둔다.
      `- ★나눈 금액이 100원 단위로 떨어지지 않으면 각자 금액을 100원 단위로 ★올림★한다(기본).\n` +
      `  예: 1인 35,134원 → 35,200원. 버리면 모자란 돈을 총무가 떠안게 되므로 올림이 기본이다.\n` +
      `  올림하면 전원이 똑같은 금액을 낸다. 사람마다 1원씩 다르게 만들지 마라.\n` +
      `- 단 요구사항에 "절사"·"버림"이라고 하면 그때만 버린다("백원 단위 절사"=100원 미만 버림,\n` +
      `  "천원 단위 절사"=1000원 미만 버림). "천원 단위로 올림"처럼 단위를 지정하면 그 단위로 올린다.\n` +
      (isPrepay
        ? `- "누구는 제외/면제"라고 하면 그 사람만 members에서 뺀다. 나머지 사람의 금액은 그대로다.\n` +
          `- "누구는 얼마 더/덜"이라고 하면 그 사람 금액만 조정한다. 나머지는 그대로다.\n` +
          `- 항목이 여러 개면(캐디피+참가비 등) 1인당 금액을 합산해 한 사람 몫을 만든다.\n`
        : `- "누구는 제외/빼기"라고 하면 그 사람은 members에서 빼고 나머지 인원으로 다시 나눈다.\n` +
          `- "누구는 얼마 더/덜"이라고 하면 그 사람 금액을 조정하고, 나머지가 남은 금액을 나눠 갖는다.\n` +
          `- "누구가 계산한다/냈다"고 하면 그 사람은 0원으로 두고 나머지가 나눈다.\n` +
          `- ★식사가 점심·저녁처럼 나뉘고 참석자가 다르면, 각 끼니의 금액을 그 끼니 참석자끼리 나눈 뒤\n` +
          `  사람별로 합산해 최종 금액을 낸다(예: 점심 12만을 3명, 저녁 20만을 5명 → 두 끼 다 먹은 사람은 합산).\n`) +
      `- 올림·절사·지정으로 사람별 합계가 total과 어긋나는 건 정상이다. 억지로 맞추지 마라.\n` +
      `- 금액은 원 단위 정수. 음수 금지.\n` +
      // ★상호를 '카드문자·영수증'에서만 찾게 했더니 요구사항 칸에 "1차 복돌이식당 21만"이라고 적어도
      //   내역이 안 나왔다(실사용 로그: txt=false·imgs=0·instr=true가 대부분 — 총무는 칸을 구분해 쓰지 않고
      //   눈앞의 큰 칸에 다 적는다). 어디에 적혔든 상호+금액 쌍이면 items로 뽑는다(사용자 2026-07-22).
      `- items: 결제 건마다 ★가게 상호명을 그대로★ 살려 적는다. 한 건뿐이어도 상호를 알면 적는다.\n` +
      `  ★출처를 가리지 마라 — [총무 요구사항]·[붙여넣은 내용]·영수증 어디에 적혀 있든 상관없다.\n` +
      `  요구사항에 "1차 복돌이식당 21만, 2차 탑호프 7만"처럼 적혀 있으면 그것도 items로 뽑는다.\n` +
      `  카드문자의 가맹점명, 영수증 상단 상호도 마찬가지다. 임의로 '식사'·'기타'로 바꾸지 마라.\n` +
      `  차수를 알 수 있으면 앞에 붙인다 — 예: "1차 복돌이식당" 156000, "2차 탑호프" 88000.\n` +
      `  ★여러 출처가 함께 오면 서로 다른 결제 건이다. 모두 items에 넣고 합산한다.\n` +
      `  단 같은 결제가 두 곳에 중복으로 나오면(상호·금액이 같음) 한 건으로만 센다.\n` +
      `  총무가 카톡 정산서에 "무엇에 얼마 썼는지" 그대로 올릴 근거다. 상호를 전혀 모르면 빈 배열.\n` +
      `- account/accountName: 계좌가 적혀 있으면(요구사항·붙여넣은 내용 어디든) 정리해서 채운다.\n` +
      `  은행명과 번호를 한 줄로.\n` +
      `- note: 어떻게 계산했는지 한 줄(40자 이내). 총무가 검산할 수 있게 근거를 적어라.\n` +
      `금액을 전혀 못 찾으면 found=false.`;

    const parts = [{ text: prompt }];
    if (list.length) parts.push({ text: `\n[참가자 ${list.length}명]\n${list.join(', ')}` });
    if (hasInstr) parts.push({ text: `\n[총무 요구사항]\n${instruction.trim().slice(0, 500)}` });
    if (hasText) parts.push({ text: `\n[붙여넣은 내용]\n${text.trim()}` });
    if (hasImage) {
      // 여러 장이면 각각이 별개 결제 건이다 — 합산해야지 한 장으로 착각하면 안 된다.
      parts.push({ text: `\n[영수증 ${imgList.length}장] 각 장이 별개 결제 건이다. 모두 합산해 total을 낸다.` });
      imgList.forEach(b64 => parts.push({
        inlineData: { mimeType: format === 'png' ? 'image/png' : 'image/jpeg', data: b64 },
      }));
    }

    logger.info('[gemini] settlement req', { uid, imgs: imgList.length, txt: !!hasText, instr: !!hasInstr, n: list.length });
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: SETTLEMENT_SCHEMA });

    const members = Array.isArray(out?.members)
      ? out.members
          .map(m => ({
            name: String(m?.name || '').trim().slice(0, 20),
            amount: Number.isFinite(m?.amount) && m.amount > 0 ? Math.round(m.amount) : 0,
          }))
          .filter(m => m.name)
          .slice(0, 40)
      : [];

    // items 개수까지 남긴다 — '내역이 안 나온다'는 제보가 왔을 때 AI가 못 뽑은 건지 클라가 흘린 건지
    //   로그만 보고 갈라야 한다(2026-07-22엔 못 갈라서 한참 헤맸다).
    logger.info('[gemini] settlement ok', {
      uid, found: !!out?.found, n: members.length, items: (Array.isArray(out?.items) ? out.items.length : 0),
    });
    return {
      ok: true,
      found: !!out?.found,
      total: Number.isFinite(out?.total) && out.total > 0 ? Math.round(out.total) : 0,
      members,
      items: Array.isArray(out?.items)
        ? out.items
            .map(i => ({
              label: String(i?.label || '').trim().slice(0, 20),
              amount: Number.isFinite(i?.amount) && i.amount > 0 ? Math.round(i.amount) : 0,
            }))
            .filter(i => i.label && i.amount > 0)
            .slice(0, 12)
        : [],
      account: (out?.account || '').toString().trim().slice(0, 60),
      accountName: (out?.accountName || '').toString().trim().slice(0, 20),
      note: (out?.note || '').toString().trim().slice(0, 60),
    };
  }
);

// 공용 헬퍼 — 스코어카드 2장 병합 등 후속 Gemini 기능에서 재사용
exports._callGemini = callGemini;
exports._checkRateLimit = checkRateLimit;
exports._GEMINI_API_KEY = GEMINI_API_KEY;
