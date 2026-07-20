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
async function callGemini({ key, parts, schema, temperature = 0 }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
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
// 출력: { ok, found, holes:[{hole,par,score}], total, players }
const SCORECARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '골프 스코어카드나 스코어 화면(스마트스코어 태블릿 등)으로 보이면 true' },
    holes: {
      type: 'ARRAY',
      description: '홀별 정보. 인식된 홀만. 전반/후반이 나뉜 두 장이어도 1~18로 합침.',
      items: {
        type: 'OBJECT',
        properties: {
          hole: { type: 'INTEGER', description: '홀 번호 1~18' },
          par: { type: 'INTEGER', description: '그 홀 파(보통 3~5). 표에 없으면 0' },
          score: { type: 'INTEGER', description: '플레이어의 그 홀 타수. 없으면 0' },
        },
        required: ['hole', 'par', 'score'],
      },
    },
    total: { type: 'INTEGER', description: '총 타수(18홀 합). 표에 합계 칸이 있으면 그 값 우선, 없으면 홀 합. 없으면 0' },
    players: { type: 'INTEGER', description: '점수 행(플레이어)이 여럿이면 그 수, 하나면 1' },
  },
  required: ['found', 'holes', 'total', 'players'],
};

exports.extractScorecard = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: 'asia-northeast3',
    memory: '512MiB',   // 이미지 최대 2장
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.');

    const imgs = Array.isArray(request.data?.images) ? request.data.images : [];
    const valid = imgs.filter(im => im && typeof im.data === 'string' && im.data.length > 0).slice(0, 2);
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
      `너는 골프 스코어카드 또는 스코어 화면(스마트스코어 태블릿 등) 이미지에서 홀별 점수를 뽑는 도우미야.\n` +
      `주어진 이미지(1~2장, 전반=1~9홀 / 후반=10~18홀로 나뉘어 올 수 있음)를 읽고 JSON으로만 답해:\n` +
      `- holes: 각 홀 { hole(1~18), par(표에 있으면 그 값, 없으면 0), score(플레이어 타수, 없으면 0) }. 두 장이면 1~18로 합쳐.\n` +
      `- total: 총 타수(18홀 합). 표에 합계 칸이 있으면 그 값을 우선.\n` +
      `- players: 점수 행(플레이어)이 여러 명이면 그 수, 한 명이면 1.\n` +
      `점수 행이 여러 명이면 가장 위(또는 대표) 한 명의 점수를 holes에 넣어. 스코어 표가 아니면 found=false, holes=[].`;

    const parts = [{ text: prompt }];
    valid.forEach((im, i) => {
      if (valid.length === 2) parts.push({ text: `\n[${i === 0 ? '전반(1~9홀)' : '후반(10~18홀)'} 이미지]` });
      parts.push({ inlineData: { mimeType: im.format === 'png' ? 'image/png' : 'image/jpeg', data: im.data } });
    });

    logger.info('[gemini] scorecard req', { uid, imgs: valid.length });
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: SCORECARD_SCHEMA });

    // 정규화 — 홀 1~18, par 3~5만, score 1~20만(오인식 방어).
    const holes = (Array.isArray(out?.holes) ? out.holes : [])
      .map(h => ({ hole: Number(h?.hole), par: Number(h?.par), score: Number(h?.score) }))
      .filter(h => Number.isFinite(h.hole) && h.hole >= 1 && h.hole <= 18)
      .map(h => ({
        hole: h.hole,
        par: (h.par >= 3 && h.par <= 5) ? h.par : 0,
        score: (h.score >= 1 && h.score <= 20) ? h.score : 0,
      }));

    logger.info('[gemini] scorecard ok', { uid, found: !!out?.found, holes: holes.length });
    return {
      ok: true,
      found: !!out?.found,
      holes,
      total: Number.isFinite(out?.total) && out.total > 0 ? out.total : 0,
      players: Number.isFinite(out?.players) && out.players > 0 ? out.players : 1,
    };
  }
);

// 공용 헬퍼 — 스코어카드 2장 병합 등 후속 Gemini 기능에서 재사용
exports._callGemini = callGemini;
exports._checkRateLimit = checkRateLimit;
exports._GEMINI_API_KEY = GEMINI_API_KEY;
