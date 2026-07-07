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
