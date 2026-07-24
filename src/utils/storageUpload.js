import * as FileSystem from 'expo-file-system/legacy';
import { auth } from './firebase';
import { FIREBASE_CONFIG } from '../constants/api';

// =============================================================
// 큰 파일(영상) 스트리밍 업로드 — 디스크 → Firebase Storage, JS 힙을 안 거친다.
// =============================================================
// Firebase 웹 SDK의 uploadBytes는 Blob(=메모리)만 받는다. 큰 영상을 `fetch(uri).blob()`으로
// 올리면 RN BlobModule이 파일 전체를 힙 ByteBuffer로 할당하다 안드로이드에서 OOM 크래시가 난다
// (Sentry 2026-07-07: 124MB 단일 할당 실패, 힙 한계 256MB). expo-file-system의 uploadAsync는
// 네이티브가 파일을 스트리밍으로 전송하므로 용량과 무관하게 안전하다.
//
// 보안: firebasestorage REST 업로드 엔드포인트도 SDK와 동일하게 Storage 규칙을 강제한다.
//   Authorization: Firebase {idToken}으로 request.auth가 채워져 rounds/{uid} 등 본인 쓰기 규칙 통과.
// 업로드만 담당 — 다운로드 URL은 호출부가 getDownloadURL(ref(storage, path))로 받는다(SDK와 동일, Blob 안 씀).
export async function uploadLocalFileStreaming(storagePath, localUri, contentType) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('storage-upload: no auth token');
  const bucket = FIREBASE_CONFIG.storageBucket;
  if (!bucket) throw new Error('storage-upload: no bucket');
  // 단일요청 업로드 — name에 전체 경로(슬래시 인코딩). 응답은 객체 메타데이터 JSON.
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`
    + `?name=${encodeURIComponent(storagePath)}`;
  const res = await FileSystem.uploadAsync(url, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, // 파일 바이트를 그대로 본문으로 스트리밍
    headers: { Authorization: `Firebase ${token}`, 'Content-Type': contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`storage-upload HTTP ${res.status}: ${String(res.body || '').slice(0, 200)}`);
  }
}

// =============================================================
// 업로드 시한 — 저장 스피너가 무한히 도는 걸 막는다.
// =============================================================
// 네트워크가 '끊기지' 않고 '멈추기만' 하면 uploadBytes/uploadAsync는 거부도 완료도 하지 않는다.
//   그 사이 호출부는 await에 매달려 저장이 영영 안 끝난다(2026-07-25 스코어카드 저장 무한 실행 제보,
//   2026-07-05 iOS 영상 포스터 건도 같은 계열). 시한을 넘기면 '실패'로 떨어뜨려,
//   best-effort 경로는 로컬 참조를 유지하고(스위퍼가 나중에 재시도), 엄격 경로는 재시도 안내로 잇는다.
// ★새 업로드 경로를 만들 때, 사용자가 완료를 기다리며 화면이 잠기는 곳이면 반드시 이걸 통과시킬 것.
export const UPLOAD_TIMEOUT_PHOTO_MS = 30000;    // 압축 후 수백KB — 정상이면 몇 초
export const UPLOAD_TIMEOUT_VIDEO_MS = 180000;   // 원본 그대로라 크다. 스트리밍 업로드 여유분
export function withUploadTimeout(promise, ms = UPLOAD_TIMEOUT_PHOTO_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`upload timeout after ${ms}ms`)), ms);
    }),
  ]);
}
