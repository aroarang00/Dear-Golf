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

    // 3. CLOVA OCR 호출
    const body = {
      version: 'V2',
      requestId: `score-${request.auth.uid}-${Date.now()}`,
      timestamp: Date.now(),
      images: [{ format, name: 'scorecard', data: imageBase64 }],
    };

    // 진단 로그 (원인 확정용 — 확인 후 제거 예정): base64 길이·머리·URL 꼬리
    logger.info('[ocr] req', {
      format,
      b64len: imageBase64.length,
      b64head: imageBase64.slice(0, 16),
      urlTail: (CLOVA_OCR_URL.value() || '').slice(-22),
    });

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

    // 4. 결과 정리 — 텍스트 + 신뢰도 + 좌표만 (원본 응답 전체 X)
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
