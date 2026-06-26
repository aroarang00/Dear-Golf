// =============================================================
// §G 영상 faststart 리먹스 ([[video-playback-faststart]])
//
// 문제: 업로드된 영상의 moov atom(색인)이 파일 뒤쪽이면, 플레이어가 재생 전에
//   파일을 많이 받아야 색인을 찾아 '뜸 들이다 재생'(특히 안드 업로드·옛 영상).
// 해법: Storage onFinalize 트리거 → ffmpeg로 moov만 앞으로(-movflags +faststart).
//   ★재인코딩 없음(-c copy) → 화질 그대로, 수 초, 비용 작음. iOS·안드·옛 영상 전부 동일 효과.
//
// 안전장치:
//   - 비디오(video/*) + rounds/·dmImages/ 경로만. 그 외(아바타·이미지)는 스킵.
//   - 다운로드 토큰 보존 → 게시물에 박힌 https URL 그대로 유지(끊김 0).
//   - 무한루프 가드: 리먹스 결과 재업로드가 또 트리거되므로 custom metadata faststart='done'으로 스킵.
//   - 크기 가드: /tmp(RAM)·메모리 보호 위해 일정 용량 초과는 스킵(720p export는 작아 실질 영향 0).
//
// remuxStorageFile은 트리거와 일회성 일괄(batchFaststart)이 공유하는 코어.
// =============================================================

const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { getStorage } = require('firebase-admin/storage');
const { logger } = require('firebase-functions');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const os = require('os');
const path = require('path');
const fs = require('fs');

const BUCKET = 'dear-golf.firebasestorage.app';
const MAX_BYTES = 80 * 1024 * 1024;   // 초과 시 스킵(OOM 방지). storage.rules는 100MB 허용이나 720p는 보통 ≪.
const VIDEO_PREFIXES = ['rounds/', 'dmImages/'];

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`))));
  });
}

// 한 파일을 faststart로 리먹스. 반환: 'done' | 'skip' | 'fail'. 트리거·일괄 공용.
//   customMeta = 객체의 custom metadata(다운로드 토큰·faststart 표식 포함).
async function remuxStorageFile(bucket, filePath, { contentType = '', size = 0, customMeta = {} } = {}) {
  if (!contentType.startsWith('video/')) return 'skip';
  if (!VIDEO_PREFIXES.some((p) => filePath.startsWith(p))) return 'skip';
  if (customMeta.faststart === 'done') return 'skip';
  if (Number(size) > MAX_BYTES) { logger.warn('[faststart] skip(large)', filePath, size); return 'skip'; }

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(os.tmpdir(), `fs_in_${stamp}`);
  const tmpOut = path.join(os.tmpdir(), `fs_out_${stamp}.mp4`);
  try {
    await bucket.file(filePath).download({ destination: tmpIn });
    // moov만 앞으로(재인코딩 X). mov(quicktime)도 mp4 컨테이너로 remux되며 화질·코덱 보존.
    await runFfmpeg(['-y', '-i', tmpIn, '-c', 'copy', '-movflags', '+faststart', tmpOut]);
    // 토큰 보존 — 기존 다운로드 토큰을 그대로 유지해 게시물 URL이 안 깨지게.
    const token = customMeta.firebaseStorageDownloadTokens;
    await bucket.upload(tmpOut, {
      destination: filePath,
      resumable: false,
      metadata: {
        contentType,   // video/* 유지 → storage.rules 매칭·플레이어 인식
        metadata: {
          ...customMeta,
          faststart: 'done',                                  // 재트리거 스킵 표식
          ...(token ? { firebaseStorageDownloadTokens: token } : {}),
        },
      },
    });
    logger.info('[faststart] remuxed', filePath);
    return 'done';
  } catch (e) {
    // 실패해도 원본은 그대로 남아 재생은 됨(느릴 뿐). 데이터 손실 없음.
    logger.error('[faststart] fail', filePath, e?.message);
    return 'fail';
  } finally {
    for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch (_) {} }
  }
}

exports.faststartVideo = onObjectFinalized(
  { bucket: BUCKET, region: 'asia-northeast3', memory: '1GiB', timeoutSeconds: 300, cpu: 1, concurrency: 1, retry: false },
  async (event) => {
    const obj = event.data;
    if (!obj?.name) return;
    await remuxStorageFile(getStorage().bucket(obj.bucket || BUCKET), obj.name, {
      contentType: obj.contentType || '',
      size: obj.size || 0,
      customMeta: obj.metadata || {},
    });
  },
);

exports.remuxStorageFile = remuxStorageFile;
exports.BUCKET = BUCKET;
exports.VIDEO_PREFIXES = VIDEO_PREFIXES;
