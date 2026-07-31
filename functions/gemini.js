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

// ★스코어카드 추론 예산 — 요금 노브. 생각 토큰도 '출력'으로 청구되므로 여기가 스코어카드 원가의 대부분이다.
//   2026-07-26에 2048로 올렸던 이유는 "PAR 행 읽기 + 파대비→실타수 계산 + 합=총타 자체검증"이었는데,
//   2026-07-31 개편으로 그 계산·검증이 전부 코드(assembleScorecard)로 옮겨갔다. 지금 AI가 하는 일은
//   '보이는 숫자를 그대로 옮겨 적기'뿐이라 추론이 필요한 근거가 사라졌다.
//   ※너나픽 실측: 전사(轉寫) 작업에서 생각 토큰은 정확도에 도움이 안 됐고 오히려 '없는 내용을 채우는'
//     압력으로 작용했다(LOW로 내리자 원문 충실도가 올라감). [[project-nunapick-gemini-cost]]
//   ★2026-07-31 실측: input=1454 answer=844 thinking=1664 billedOutput=2508 → 청구 출력의 66%가 생각.
//     입력은 사진 2장인데도 1,454뿐이라 해상도를 낮춰봐야 의미 없다. 돈은 전부 출력에서 나간다.
//     → 0으로 내림(청구 출력 2508→844 예상, 약 66% 절감 + 응답도 빨라짐).
//     되돌리려면 이 값만 2048로. 정확도가 떨어지면 notes/low(parSumTarget·parNine 검산)가 바로 잡아낸다.
const SCORECARD_THINKING = 0;
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
// ★요금은 '출력 토큰'이 대부분이고, 모델의 생각(thinking) 토큰도 출력으로 청구된다.
//   그런데 candidatesTokenCount는 답변 텍스트만 세서 생각 토큰이 안 잡힌다 — 너나픽에선 이걸 몰라
//   실제의 1/4로 추산해 "이 정도면 요금 안 나온다"는 잘못된 결론까지 갔다([[project-nunapick-gemini-cost]]).
//   그래서 청구 기준인 billedOutput(= 답변 + 생각)을 함수별로 남긴다. 로그만 남기므로 비용·성능 영향 없음.
function logUsage(label, json) {
  try {
    const u = json?.usageMetadata || {};
    const input = u.promptTokenCount || 0;
    const answer = u.candidatesTokenCount || 0;
    // thoughtsTokenCount는 SDK 타입엔 없어도 API는 실제로 내려준다. 없으면 total에서 역산.
    const thinking = u.thoughtsTokenCount ?? Math.max(0, (u.totalTokenCount || 0) - input - answer);
    logger.info('[gemini] usage', { fn: label, input, answer, thinking, billedOutput: answer + thinking });
  } catch (e) { /* 로깅 실패가 기능을 막지 않는다 */ }
}

async function callGemini({ key, parts, schema, temperature = 0, thinkingBudget = 0, label = '' }) {
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
  logUsage(label, json);   // 실패(빈 응답)해도 토큰은 청구되므로 파싱보다 먼저 남긴다
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
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: RESERVATION_SCHEMA, label: 'reservation' });

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
// 출력: { ok, found, pars:number[18], players:[{ name, scores:number[18], total }], lowConfidence, notes[] }
//   ★동반자 함께 나온 표는 플레이어(행) 전부 반환 → 클라 검토 모달에서 본인 행 선택.
//
// ★★설계 전면 개편(2026-07-31) — AI는 '보이는 대로 읽기'만, 병합·환산·검증은 코드가 산술로 한다.
//   기존엔 AI에게 ①전/후반 조각 병합 ②파대비→실타수 환산 ③합계 자체검증을 전부 시켰는데,
//   스마트스코어 태블릿 카드는 한 줄 안에 단위가 섞여 있어(홀칸=파대비, 전반/후반칸=파대비 합, 합계칸=실타수)
//   AI가 반복해서 틀렸다. 특히 조각 2장은 둘 다 홀 번호가 '1~9'라 어느 쪽이 전반인지 이미지만으론 알 수 없어,
//   순서가 뒤집히면 총타(108)만 맞고 홀별 18개가 통째로 어긋났다(사용자 제보 2026-07-31, 선샤인/네스트 카드).
//   → 순서도 단위도 전부 '산술'로 결정된다. 실제 카드로 검증한 식:
//       조각의 홀 합 == 그 줄의 '전반' 칸  →  그 조각이 전반   (후반도 같은 방식)
//       18홀 합 + par 합 == '합계' 칸       →  파대비 표기      (18홀 합 == 합계 칸이면 실타수)
//     [[project_scorecard_ai]]의 교훈("판별은 AI가 아니라 인쇄 총계와의 산술 교차검증으로")을 병합·순서까지 확장.
//   ※과거 폐기된 접근 ①(서버 parRelative 플래그)이 실패한 이유는 '파 홀 0'과 '못 읽은 홀 0'을 구분 못 해서였다.
//     지금은 못 읽은 칸을 0이 아니라 99(CELL_MISSING)로 받으므로 0 = 진짜 파. 그 근본 결함이 사라졌다.
const SCORECARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: '골프 스코어카드나 스코어 화면(스마트스코어 태블릿 등)으로 보이면 true' },
    cards: {
      type: 'ARRAY',
      description: '이미지 1장당 표 1개. 준 이미지 순서 그대로.',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING', description: '표 왼쪽 위 코스명/제목(예: 선샤인, 네스트, OUT, IN). 없으면 빈 문자열' },
          holeNumbers: {
            type: 'ARRAY',
            description: '점수 칸이 있는 홀의 번호를 왼쪽부터 그대로. 보통 [1,2,…,9] 또는 [1,2,…,18], 후반 화면이면 [10,…,18].',
            items: { type: 'INTEGER' },
          },
          pars: {
            type: 'ARRAY',
            description: 'PAR 행 칸에 적힌 글자를 "그대로" 문자열로, holeNumbers와 같은 순서·같은 개수로. '
              + '★한 칸에 "Par/HDCP"가 같이 적혀 있으면 자르지 말고 "4/7"처럼 슬래시째로 담아라(어느 쪽이 파인지는 내가 고른다). '
              + '파만 적힌 칸이면 "4"처럼. PAR 행이 없으면 빈 배열 [].',
            items: { type: 'STRING' },
          },
          players: {
            type: 'ARRAY',
            description: '점수 행(사람)마다 하나. 표에 4명이면 4개 전부(대표 1명만 고르지 말 것).',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: '그 행의 이름(표에 있으면). 없으면 빈 문자열' },
                cells: {
                  type: 'ARRAY',
                  description: '홀 칸에 적힌 숫자를 계산하지 말고 그대로. 파 대비 표기면 0·-1·2를 그대로 담아라. 빈칸이거나 가려서 못 읽은 칸은 99.',
                  items: { type: 'INTEGER' },
                },
                frontSub: { type: 'INTEGER', description: "'전반'(OUT) 칸에 적힌 값 그대로. 없으면 0" },
                backSub: { type: 'INTEGER', description: "'후반'(IN) 칸에 적힌 값 그대로. 없으면 0" },
                total: { type: 'INTEGER', description: "'합계'(TOTAL/총타) 칸에 적힌 값 그대로. 없으면 0" },
              },
              required: ['name', 'cells', 'frontSub', 'backSub', 'total'],
            },
          },
        },
        required: ['label', 'holeNumbers', 'pars', 'players'],
      },
    },
  },
  required: ['found', 'cards'],
};

// ── 스코어카드 조립(산술) ───────────────────────────────────────
// AI가 '보이는 대로' 읽어온 카드들을 18홀 실타수로 조립한다. 여기엔 추측이 없다 — 전부 검산이다.
const HOLES = 18;
const CELL_MISSING = 99;                       // AI가 '못 읽은 칸'에 넣는 값(0=파와 구분하기 위함)
const SUB_TOL = 1;                             // 소계/총계 대조 허용 오차(칸 하나 오독 여유)

const sumFinite = (arr) => (arr || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
const countFinite = (arr) => (arr || []).filter(n => Number.isFinite(n)).length;
const padTo = (arr, n) => { const o = new Array(n).fill(null); (arr || []).forEach((v, i) => { if (i < n) o[i] = v; }); return o; };
const normName = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();

// AI 원본 → 정규화된 카드. 값 범위 밖·99는 null(못 읽음)로.
function normalizeCard(c, index) {
  const cell = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === CELL_MISSING || n < -9 || n > 20) return null;
    return n;
  };
  // ★파 칸 파싱은 코드가 한다 — "4/7"(Par/HDCP)에서 앞 숫자가 파다. 이걸 AI에게 시켰더니
  //   뒤의 HDCP를 파로 집어와 파4가 파3이 되는 일이 있었다(선샤인 전반 파합 33, 사용자 제보 2026-07-31).
  //   슬래시가 있으면 무조건 앞쪽, 없으면 첫 숫자. 3~5 밖이면 못 읽은 칸으로 둔다.
  const par = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const head = s.split('/')[0];
    const m = head.match(/\d+/);
    const n = m ? parseInt(m[0], 10) : NaN;
    return (n >= 3 && n <= 5) ? n : null;
  };
  const holeNumbers = (Array.isArray(c?.holeNumbers) ? c.holeNumbers : [])
    .map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= HOLES);
  const players = (Array.isArray(c?.players) ? c.players : []).map(p => ({
    name: (p?.name || '').toString().trim(),
    cells: (Array.isArray(p?.cells) ? p.cells : []).map(cell),
    frontSub: Number(p?.frontSub) || 0,
    backSub: Number(p?.backSub) || 0,
    total: Number(p?.total) || 0,
  })).filter(p => countFinite(p.cells) > 0);          // 숫자 하나도 못 읽은 유령 행 제거
  const pars = (Array.isArray(c?.pars) ? c.pars : []).map(par);
  // 이 표가 담은 홀 수 — 홀번호·par·점수칸 중 가장 긴 것(9=조각, 18=완결 카드)
  const size = Math.min(HOLES, Math.max(
    holeNumbers.length, pars.length, ...players.map(p => p.cells.length), 0));
  return { index, label: (c?.label || '').toString().trim(), holeNumbers, pars, players, size };
}

// ★조각 2장의 전/후반 순서 결정 — 이미지만 봐선 알 수 없다(둘 다 홀번호가 1~9). 산술로 정한다.
//   근거: 태블릿은 각 줄에 '전반'·'후반' 소계를 같이 찍어준다. 그 조각의 홀 합과 일치하는 쪽이 그 조각의 정체.
//   반환: { front, back, sure } — sure=false면 이미지 순서로 가정(클라에 저신뢰 표시).
function orderFragments(a, b) {
  const votes = (card) => {
    let f = 0, k = 0;
    for (const p of card.players) {
      const s = sumFinite(p.cells);
      if (countFinite(p.cells) < card.size) continue;           // 다 못 읽은 줄은 투표 제외
      if (p.frontSub && Math.abs(s - p.frontSub) <= SUB_TOL) f++;
      if (p.backSub && Math.abs(s - p.backSub) <= SUB_TOL) k++;
    }
    return { f, k };
  };
  const va = votes(a), vb = votes(b);
  if (va.f > va.k && vb.k >= vb.f) return { front: a, back: b, sure: true };
  if (va.k > va.f && vb.f >= vb.k) return { front: b, back: a, sure: true };
  // 소계로 못 가리면 홀 번호(10~18이 찍힌 화면이면 후반)
  const maxHole = (c) => (c.holeNumbers.length ? Math.max(...c.holeNumbers) : 0);
  const ma = maxHole(a), mb = maxHole(b);
  if (ma > 9 && mb > 0 && mb <= 9) return { front: b, back: a, sure: true };
  if (mb > 9 && ma > 0 && ma <= 9) return { front: a, back: b, sure: true };
  return { front: a, back: b, sure: false };                    // 최후: 사용자가 고른 순서를 믿되 저신뢰
}

// 전·후반 조각의 같은 사람 짝짓기 — 이름 우선, 이름이 없거나 안 맞으면 줄 순서.
function pairPlayers(front, back) {
  const pairs = [];
  const used = new Set();
  front.players.forEach((fp, i) => {
    let bi = -1;
    if (normName(fp.name)) {
      bi = back.players.findIndex((bp, k) => !used.has(k) && normName(bp.name) === normName(fp.name));
    }
    if (bi < 0 && back.players[i] && !used.has(i)) bi = i;      // 이름 매칭 실패 → 같은 줄 순서
    if (bi >= 0) used.add(bi);
    pairs.push({ name: fp.name || (bi >= 0 ? back.players[bi].name : ''), f: fp, b: bi >= 0 ? back.players[bi] : null });
  });
  back.players.forEach((bp, k) => { if (!used.has(k)) pairs.push({ name: bp.name, f: null, b: bp }); });
  return pairs;
}

// ★파대비 표기냐 실제 타수냐 — 인쇄된 합계/소계와의 산술 교차검증으로만 판정한다(생김새 추측 금지).
//   실타수 카드는 par 합(~72)을 더해야 합계가 맞는 일이 산술적으로 불가능해서 오판되지 않는다.
function decideMode(cells, pars, printedTotal, subTotal) {
  const cSum = sumFinite(cells);
  const pSum = sumFinite(cells.map((c, i) => (Number.isFinite(c) ? pars[i] : null)));  // 읽힌 홀의 par만
  const check = (target) => {
    if (!target) return null;
    if (Math.abs(cSum - target) <= SUB_TOL) return 'actual';
    if (pSum && Math.abs(cSum + pSum - target) <= SUB_TOL) return 'relative';
    return null;
  };
  const byTotal = countFinite(cells) === HOLES ? check(printedTotal) : null;   // 18홀 다 읽었을 때만 총계와 대조
  if (byTotal) return { mode: byTotal, sure: true };
  // ★0이나 음수 칸이 있으면 파대비가 확정 — 실제 타수엔 0타·마이너스 타가 없다.
  //   이 판정을 소계(subTotal) 대조보다 '먼저' 해야 한다. 파대비 카드는 홀 칸 합이 곧 전반+후반 소계라
  //   check(subTotal)이 늘 'actual'을 돌려주기 때문(같은 단위끼리 비교하니 당연히 맞는다).
  //   파 행이 크게 깨져 byTotal이 실패하면 그 'actual'이 채택돼, 파대비 숫자가 타수로 박히고
  //   홀별이 통째로 망가졌다(황지현 108 → 홀합 36). 테스트로 잡음(2026-07-31).
  if (cells.some(c => Number.isFinite(c) && c <= 0)) return { mode: 'relative', sure: true };
  const bySub = check(subTotal);
  if (bySub) return { mode: bySub, sure: true };
  return { mode: 'actual', sure: false };                                      // 전부 양수 → 실타수로 보되 저신뢰
}

// 정규화된 카드들 → { pars18, players[], lowConfidence, notes[] }
function assembleScorecard(rawCards) {
  const cards = (Array.isArray(rawCards) ? rawCards : []).map(normalizeCard).filter(c => c.players.length && c.size > 0);
  const notes = [];
  let low = false;
  if (!cards.length) return { pars: new Array(HOLES).fill(0), players: [], lowConfidence: true, notes };

  // 18홀 완결 카드는 그 자체로 한 덩어리, 9홀 조각은 둘씩 짝지어 병합
  const complete = cards.filter(c => c.size >= 16);
  const frags = cards.filter(c => c.size < 16);
  const blocks = [];                     // { pars:[18], entries:[{name, cells:[18], printedTotal, subTotal}] }

  for (const c of complete) {
    blocks.push({
      pars: padTo(c.pars, HOLES),
      entries: c.players.map(p => ({
        name: p.name, cells: padTo(p.cells, HOLES), printedTotal: p.total,
        subTotal: (p.frontSub && p.backSub) ? p.frontSub + p.backSub : 0,
      })),
    });
  }
  for (let i = 0; i < frags.length; i += 2) {
    const a = frags[i], b = frags[i + 1];
    if (!b) {                            // 한 장만(전반만 찍은 경우) — 읽은 9홀만 앞에 채움
      notes.push('half');
      low = true;
      blocks.push({
        pars: padTo(a.pars, HOLES),
        entries: a.players.map(p => ({
          name: p.name, cells: padTo(p.cells, HOLES), printedTotal: p.total, subTotal: p.frontSub || p.backSub || 0,
        })),
      });
      continue;
    }
    const { front, back, sure } = orderFragments(a, b);
    if (!sure) { notes.push('order'); low = true; }
    const pars18 = [...padTo(front.pars, 9), ...padTo(back.pars, 9)];
    const entries = pairPlayers(front, back).map(pr => ({
      name: pr.name,
      cells: [...padTo(pr.f?.cells, 9), ...padTo(pr.b?.cells, 9)],
      // 합계 칸은 두 화면 모두 같은 '한 라운드 총타'를 찍어준다 — 있는 쪽을 쓴다.
      printedTotal: pr.f?.total || pr.b?.total || 0,
      subTotal: 0,
      subs: { front: pr.f?.frontSub || pr.b?.frontSub || 0, back: pr.f?.backSub || pr.b?.backSub || 0 },
    }));
    blocks.push({ pars: pars18, entries });
  }

  // par는 카드 공통 — 홀별로 가장 먼저 읽힌 값 사용
  const pars18 = new Array(HOLES).fill(null);
  for (const bl of blocks) bl.pars.forEach((p, i) => { if (pars18[i] == null && Number.isFinite(p)) pars18[i] = p; });
  if (countFinite(pars18) < HOLES) { notes.push('par'); }

  // ★한 나인의 파 합은 골프장 구조상 34~37을 벗어나지 않는다(보통 36). 33 같은 값이 나오면
  //   그 아홉 홀의 파 행을 잘못 읽은 것이다 — 사용자가 직접 눈으로 알아채기 전에 앱이 먼저 알아야 한다
  //   (선샤인 전반 파합 33, 사용자 제보 2026-07-31).
  const nineSum = (a, b) => pars18.slice(a, b).reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
  const parNine = [nineSum(0, 9), nineSum(9, 18)];
  if (countFinite(pars18) === HOLES && parNine.some(v => v < 34 || v > 37)) { notes.push('par9'); low = true; }

  const players = [];
  const parTargets = [];   // 카드에서 산술로 역산한 '진짜 파 합' — 파 행을 안 믿고 검산하는 기준
  for (const bl of blocks) {
    for (const e of bl.entries) {
      const pars = bl.pars.map((p, i) => (Number.isFinite(p) ? p : pars18[i]));
      const subTotal = e.subTotal || ((e.subs?.front && e.subs?.back) ? e.subs.front + e.subs.back : 0);
      const { mode, sure } = decideMode(e.cells, pars, e.printedTotal, subTotal);
      if (!sure) low = true;
      // 파대비 카드는 printedTotal = 파대비합 + 파합 → 파 행을 한 글자도 안 읽고 '파 합'을 역산할 수 있다.
      //   파 행이 통째로 깨져도 이 값은 멀쩡하다(합계·홀 칸은 크게 인쇄돼 잘 읽히므로).
      if (mode === 'relative' && e.printedTotal > 0 && countFinite(e.cells) === HOLES) {
        const t = e.printedTotal - sumFinite(e.cells);
        if (t >= 60 && t <= 80) parTargets.push(t);
      }
      const scores = e.cells.map((c, i) => {
        if (!Number.isFinite(c)) return 0;                       // 못 읽은 홀 = 0(클라 검토표에서 직접 입력)
        const v = mode === 'actual' ? c : (Number.isFinite(pars[i]) ? pars[i] + c : null);
        return (Number.isFinite(v) && v >= 1 && v <= 20) ? v : 0; // par 없어 환산 못 하면 0
      });
      const scoreSum = sumFinite(scores);
      const full = countFinite(scores.map(v => (v > 0 ? v : null))) === HOLES;
      // ★총타는 '카드에 인쇄된 합계'를 최우선으로 믿는다 — 파 행에 기대지 않는다.
      //   카드에서 합계는 가장 크고 선명한 숫자고, PAR 행은 상단 어두운 띠의 작은 글씨라 가장 안 읽힌다.
      //   예전엔 total을 홀 합으로 계산해서, 파 한 칸을 잘못 읽으면 그 파를 쓰는 전원의 총타가
      //   똑같이 어긋났다(사용자 제보 2026-07-31). 가장 못 믿을 값에 가장 중요한 결과를 매달고 있던 셈.
      //   홀별은 여전히 파가 필요하지만, 그건 홀별만의 문제로 격리된다.
      const total = e.printedTotal > 0 ? e.printedTotal : scoreSum;
      if (full && e.printedTotal > 0 && scoreSum !== e.printedTotal) { low = true; notes.push('total'); }
      if (!full) low = true;
      // ★printedTotal(카드에 인쇄된 총타)을 함께 내려보낸다 — 홀 합과 어긋날 때 검토 화면이
      //   "카드엔 100타인데 홀 합은 99타"라고 숫자로 짚어주기 위함.
      //   파대비 카드에서 PAR 한 칸을 1 잘못 읽으면 그 par를 쓰는 전원이 똑같이 1타씩 어긋나는데,
      //   예전엔 이 값이 없어 사용자에게 그냥 99타로 보였다(사용자 제보 2026-07-31, 힐마루 안드).
      players.push({ name: e.name, scores, total, printedTotal: e.printedTotal > 0 ? e.printedTotal : 0 });
    }
  }

  // 역산한 파 합 — 여러 사람에게서 나온 값 중 최빈값(한 사람 오독에 흔들리지 않게)
  let parSumTarget = 0;
  if (parTargets.length) {
    const cnt = new Map();
    for (const t of parTargets) cnt.set(t, (cnt.get(t) || 0) + 1);
    parSumTarget = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const parSumRead = sumFinite(pars18);
  // 읽은 파 합이 역산값과 다르면 파 행이 틀린 것 — 총타는 이미 카드 합계를 쓰므로 홀별만의 문제다.
  if (parSumTarget && countFinite(pars18) === HOLES && parSumRead !== parSumTarget) {
    if (!notes.includes('par9')) notes.push('parsum');
    low = true;
  }

  return {
    pars: pars18.map(p => (Number.isFinite(p) ? p : 0)),
    players, lowConfidence: low, notes: [...new Set(notes)],
    parSum: parSumRead,          // 카드에서 읽어낸 파 합
    parSumTarget,                // 산술로 역산한 '맞는' 파 합(0=역산 불가)
    parNine,                     // [전반, 후반] 파 합 — 어느 아홉 홀이 깨졌는지 짚어주기 위해
  };
}

// 테스트 훅 — 실제 카드 숫자로 조립 산술을 검증할 때 쓴다(배포되는 함수 아님, onCall이 아니라 순수 함수).
exports._assembleScorecard = assembleScorecard;

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

    // ★프롬프트 원칙 — '읽기'만 시키고 '계산'은 절대 시키지 않는다.
    //   병합·파대비 환산·합계 검증은 CF 코드(assembleScorecard)가 산술로 한다. AI에게 계산을 맡겼을 때
    //   반복해서 틀렸던 이력이 있다([[project_scorecard_ai]] 폐기된 접근 ①②).
    const prompt =
      `너는 골프 스코어카드/스코어 화면 이미지를 '보이는 그대로' 옮겨 적는 도우미야. 이미지가 1~4장 올 수 있어.\n` +
      `★가장 중요한 규칙: 절대 계산하지 마라. 더하지도, 빼지도, 파를 더해 환산하지도 마라. 화면에 인쇄된 숫자를 그 칸 그대로 옮겨 적기만 해라. 계산은 내가 따로 한다.\n` +
      `이미지 1장당 cards 항목 1개를, 준 순서 그대로 만들어 JSON으로만 답해.\n` +
      `[각 카드에서 읽을 것]\n` +
      `- label: 표 왼쪽 위 코스명/제목(예: 선샤인, 네스트, OUT, IN). 없으면 ''.\n` +
      `- holeNumbers: 점수 칸 위에 적힌 홀 번호를 왼쪽부터 그대로(예: 1~9만 있으면 [1,…,9]). 화면에 1~9로 적혀 있으면 그게 후반 같아 보여도 [1,…,9]로 적어라 — 순서는 내가 정한다.\n` +
      `- pars: PAR(파) 행을 holeNumbers와 같은 개수로. "4/7"처럼 par/HDCP가 붙어 있으면 앞의 par만(4). PAR 행은 대부분 있으니 꼭 찾아라. 정말 없으면 [].\n` +
      `[각 사람(점수 행)에서 읽을 것]\n` +
      `- cells: 홀 칸의 숫자를 계산 없이 그대로. 파 대비 표기(파=0, 언더 −1, 오버 +2)면 0·-1·2를 그대로 담아라. ★절대 파를 더하지 마라.\n` +
      `- 빈칸이거나 손·그림자·반사에 가려 확신할 수 없는 칸은 추측하지 말고 99를 넣어라(99 = 못 읽음).\n` +
      `- frontSub/backSub/total: '전반'·'후반'·'합계' 칸에 적힌 값을 각각 그대로. 그 칸이 없으면 0.\n` +
      `  ※이 세 칸은 단위가 서로 다를 수 있다(전반·후반은 파대비 합, 합계는 실제 총타 등). 맞추려 하지 말고 보이는 대로만 적어라.\n` +
      `- ★한 표에 여러 명(4명 등)이면 전원을 players에 담아 — 대표 한 명만 고르지 마. 사용자가 나중에 본인 행을 고른다.\n` +
      `스코어 표가 전혀 아니면 found=false, cards=[].`;

    const parts = [{ text: prompt }];
    valid.forEach((im, i) => {
      parts.push({ text: `\n[이미지 ${i + 1}]` });
      parts.push({ inlineData: { mimeType: im.format === 'png' ? 'image/png' : 'image/jpeg', data: im.data } });
    });

    logger.info('[gemini] scorecard req', { uid, imgs: valid.length });
    // 스코어카드는 추론을 켠다(thinkingBudget>0) — PAR 행 읽기 + 파대비→실타수 계산 + '합=총타' 자체검증에 필요.
    //   추출은 예약/지출보다 정확도가 중요해 속도(수 초)보다 정확도 우선. 느리면 값 하향(정확도 트레이드오프).
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: SCORECARD_SCHEMA, thinkingBudget: SCORECARD_THINKING, label: 'scorecard' });

    // ★조립 — 여기서 전/후반 순서와 파대비/실타수를 '산술'로 결정한다(위 assembleScorecard 주석 참고).
    const { pars, players, lowConfidence, notes, parSum, parSumTarget, parNine } = assembleScorecard(out?.cards);

    logger.info('[gemini] scorecard ok', {
      uid, found: !!out?.found, cards: (out?.cards || []).length,
      players: players.length, low: lowConfidence, notes: notes.join(','),
      parSum, parSumTarget, parNine: (parNine || []).join('/'),
    });
    return { ok: true, found: !!out?.found, pars, players, lowConfidence, notes, parSum, parSumTarget, parNine };
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
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: EXPENSE_SCHEMA, label: 'expense' });

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
    const out = await callGemini({ key: (GEMINI_API_KEY.value() || '').trim(), parts, schema: SETTLEMENT_SCHEMA, label: 'settlement' });

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
