// =============================================================
// Expo 푸시 발송 — index.js(트리거)와 recapPush.js(스케줄)가 같이 쓰는 한 곳.
//   (2026-10-11 index.js에서 분리 — 월 결산 푸시가 같은 발송·죽은 토큰 정리를 쓰기 위해. 동작 변경 0)
// =============================================================
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const db = getFirestore();

// ownerUid — 이 토큰의 주인. DeviceNotRegistered(앱 삭제·토큰 만료) 티켓이 오면 그 토큰을 정리해
//   다음부터 헛발송을 막고 '테스터별 안 옴'을 진단 가능하게 한다(주면 정리, 없으면 로깅만).
async function sendExpoPush(token, title, body, data = {}, ownerUid = null) {
  if (!token) return;
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        channelId: 'default',   // Android — 클라가 만든 고중요도 채널로 라우팅(heads-up·소리)
        priority: 'high',       // 도즈/저전력에서도 지연 없이(FCM high priority)
      }),
    });
    if (!res.ok) {
      logger.warn('[push] expo api non-ok', res.status);
      return;
    }
    // 티켓 검사 — 200이어도 개별 티켓에 DeviceNotRegistered 등 오류가 담김. 무시하면 조용한 미수신 진단 불가.
    const json = await res.json().catch(() => null);
    const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
    if (ticket && ticket.status === 'error') {
      logger.warn('[push] ticket error', ticket.message || '', ticket.details?.error || '');
      // 죽은 토큰 정리 — 더는 유효하지 않은 토큰은 users 문서에서 제거(다음 발송부터 스킵)
      if (ownerUid && ticket.details?.error === 'DeviceNotRegistered') {
        await db.doc(`users/${ownerUid}`).update({ pushToken: FieldValue.delete() }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn('[push] send fail', e?.message);
  }
}

module.exports = { sendExpoPush };
