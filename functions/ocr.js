// =============================================================
// 스코어카드 OCR — 네이버 CLOVA OCR 프록시 (onCall)
//
// 앱 → recognizeScorecard → CLOVA OCR → 앱.
// Secret Key·Invoke URL은 CF Secret에만 보관(앱·코드에 노출 금지 [[api-key-security]]).
// 결과는 글자별 텍스트+좌표만 추려 반환 → 앱이 행/열 매핑으로 본인 스코어 추출 [[scorecard-ocr]].
//
// Secret 등록(최초 1회, 터미널에서):
//   firebase functions:secrets:set CLOVA_OCR_SECRET   (CLOVA Secret Key 붙여넣기)
//   firebase functions:secrets:set CLOVA_OCR_URL      (APIGW Invoke URL 붙여넣기)
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');   // per-uid 레이트리밋 저장
const { logger } = require('firebase-functions');

const CLOVA_OCR_SECRET = defineSecret('CLOVA_OCR_SECRET');
const CLOVA_OCR_URL = defineSecret('CLOVA_OCR_URL');

// Node 20 내장 global fetch 사용(별도 패키지 불필요).
exports.recognizeScorecard = onCall(
  {
    secrets: [CLOVA_OCR_SECRET, CLOVA_OCR_URL],
    region: 'asia-northeast3',   // 서울 — 앱은 getFunctions(app, 'asia-northeast3')로 호출
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    // 1. 인증 필수 — 로그인 사용자만(익명 포함). 비로그인 남용 차단.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요해요.');
    }

    // 2. 입력 검증
    const { imageBase64, format = 'jpg' } = request.data || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new HttpsError('invalid-argument', '이미지 데이터가 없어요.');
    }
    // base64 길이 ≈ 원본*1.33. 약 8MB 상한(압축 후 1200px JPEG면 충분히 작음 [[image-compression]]).
    if (imageBase64.length > 8 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', '이미지가 너무 커요. 다시 찍어주세요.');
    }

    // 3. per-uid 레이트리밋 — 인증돼 있어도 유료 CLOVA OCR을 루프로 남용하면 비용 폭증.
    //    롤링 1시간 창에 uid당 RATE_LIMIT회 초과 시 차단(정상=라운드당 수회라 한참 못 미침).
    //    저장은 ocrUsage/{uid}(CF만 접근 — 규칙 기본 deny). App Check 없이 비용 상한만 거는 경량 방어.
    const uid = request.auth.uid;
    const db = getFirestore();
    const RATE_LIMIT = 30;
    const WINDOW_MS = 60 * 60 * 1000;
    const now = Date.now();
    let allowed = true;
    try {
      allowed = await db.runTransaction(async (tx) => {
        const ref = db.doc(`ocrUsage/${uid}`);
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : null;
        if (!d || now - (d.windowStart || 0) > WINDOW_MS) {
          tx.set(ref, { windowStart: now, count: 1 });
          return true;
        }
        if ((d.count || 0) >= RATE_LIMIT) return false;
        tx.update(ref, { count: FieldValue.increment(1) });
        return true;
      });
    } catch (e) {
      // 레이트리밋 저장소 오류는 OCR을 막지 않음(가용성 우선) — 로그만
      logger.warn('[ocr] ratelimit check fail (allowing)', e?.message);
      allowed = true;
    }
    if (!allowed) {
      logger.warn('[ocr] ratelimit exceeded', { uid });
      throw new HttpsError('resource-exhausted', '스코어카드 인식을 너무 많이 요청했어요. 잠시 후 다시 시도해주세요.');
    }

    // 4. CLOVA OCR 호출
    const body = {
      version: 'V2',
      requestId: `score-${uid}-${Date.now()}`,
      timestamp: Date.now(),
      images: [{ format, name: 'scorecard', data: imageBase64 }],
    };

    logger.info('[ocr] req', { format, b64len: imageBase64.length });   // 비민감 정보만(URL·base64 머리 로깅 제거)

    let res;
    try {
      res = await fetch(CLOVA_OCR_URL.value(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OCR-SECRET': CLOVA_OCR_SECRET.value(),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      logger.error('[ocr] network fail', e?.message);
      throw new HttpsError('unavailable', 'OCR 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('[ocr] clova non-ok', res.status, text.slice(0, 500));
      throw new HttpsError('internal', 'OCR 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
    }

    // 5. 결과 정리 — 텍스트 + 신뢰도 + 좌표만 (원본 응답 전체 X)
    const json = await res.json().catch(() => null);
    const fields = json?.images?.[0]?.fields || [];
    const result = fields.map((f) => ({
      text: f.inferText,
      confidence: f.inferConfidence,
      vertices: f.boundingPoly?.vertices || [],   // [{x,y}...] — 앱에서 행/열 매핑용
    }));

    logger.info('[ocr] ok', { uid: request.auth.uid, count: result.length });
    return { ok: true, fields: result };
  }
);
