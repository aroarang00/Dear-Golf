// =============================================================
// 일회성 — 기존(옛) 영상 일괄 faststart 리먹스 ([[video-playback-faststart]])
//
// faststartVideo 트리거는 '새로 올라오는' 영상만 처리한다. 트리거 배포 전에 이미
// 올라가 있던 옛 영상들은 그대로 느리므로, 이 HTTP 함수를 1회 호출해 일괄 처리한다.
//
// 사용: GET https://asia-northeast3-dear-golf.cloudfunctions.net/batchFaststart?key=<KEY>
//   - key 불일치면 403. (영상 리먹스만 하는 저위험 작업이지만 무단 호출 방지)
//   - 이미 처리된 것(faststart='done')·이미지·대용량은 스킵(멱등) → 여러 번 호출해도 안전.
//   - 한 번에 PER_RUN개까지 처리, remaining>0이면 다시 호출해 이어감(타임아웃 보호).
//   - 작업 끝나면 index.js의 export를 주석 처리 + functions:delete로 제거(상시 노출 X).
// =============================================================

const { onRequest } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { logger } = require('firebase-functions');
const { remuxStorageFile, BUCKET, VIDEO_PREFIXES } = require('./videoFaststart');

const KEY = 'dg-faststart-backfill-2k6j9x';   // 호출 가드(소스에 박힘 — 저위험 1회성)
const PER_RUN = 60;                            // 한 호출당 처리 상한(540s 안에 들도록)

exports.batchFaststart = onRequest(
  { region: 'asia-northeast3', memory: '1GiB', timeoutSeconds: 540, cpu: 1, concurrency: 1 },
  async (req, res) => {
    if ((req.query.key || '') !== KEY) { res.status(403).send('forbidden'); return; }
    const bucket = getStorage().bucket(BUCKET);
    let done = 0, failed = 0, skipped = 0, remaining = 0, processed = 0;
    try {
      const files = [];
      for (const prefix of VIDEO_PREFIXES) {
        const [list] = await bucket.getFiles({ prefix });
        files.push(...list);
      }
      for (const file of files) {
        const md = file.metadata || {};
        const contentType = md.contentType || '';
        const custom = md.metadata || {};
        if (!contentType.startsWith('video/')) continue;        // 이미지 등 스킵
        if (custom.faststart === 'done') { skipped++; continue; } // 이미 처리됨
        if (processed >= PER_RUN) { remaining++; continue; }      // 이번 회차 상한 — 다음 호출로
        processed++;
        const r = await remuxStorageFile(bucket, file.name, { contentType, size: md.size || 0, customMeta: custom });
        if (r === 'done') done++; else if (r === 'fail') failed++; else skipped++;
      }
      logger.info('[batchFaststart] result', JSON.stringify({ done, failed, skipped, remaining }));
      res.json({ ok: true, done, failed, skipped, remaining, hint: remaining > 0 ? '남음 — 같은 URL 다시 호출' : '완료' });
    } catch (e) {
      logger.error('[batchFaststart] fail', e?.message);
      res.status(500).json({ ok: false, error: e?.message, done, failed });
    }
  },
);
