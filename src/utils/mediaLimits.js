import * as FileSystem from 'expo-file-system/legacy';

// =============================================================
// 영상 업로드 용량 상한 — storage.rules와 일치시킨다.
// =============================================================
// 규칙(storage.rules)이 영상을 rounds(다이어리·크루) 100MB / dmImages 80MB로 제한한다.
// 초과 영상은 업로드가 규칙에서 거절되므로, 픽 시점에 미리 걸러 "왜 안 되는지" 안내한다.
// 특히 안드로이드는 picker가 영상을 재인코딩하지 않아(iOS는 720p export) 원본 4K/HEVC가 그대로 들어와
// 30초라도 100MB를 넘길 수 있다 — 이게 업로드 시 힙 OOM 크래시의 원인이었다([[video-upload-oom]]).
export const VIDEO_MAX_MB = { rounds: 100, dm: 80 };

// 영상 파일 크기(바이트). picker asset의 fileSize를 우선 쓰고, 없으면 파일을 조회한다. 못 구하면 null.
async function videoBytes(uri, knownSize) {
  if (Number.isFinite(knownSize) && knownSize > 0) return knownSize;
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info?.exists && Number.isFinite(info.size) ? info.size : null;
  } catch {
    return null;
  }
}

// 상한 초과 여부. 반환 { over, sizeMB }. 크기를 못 구하면 over=false(통과) — 업로드 단계 규칙이 최종 방어라
//   여기서 과잉 차단하지 않는다. knownSize: ImagePicker asset.fileSize(있으면 파일조회 생략).
export async function isVideoOverLimit(uri, limitMB, knownSize) {
  const bytes = await videoBytes(uri, knownSize);
  if (bytes == null) return { over: false, sizeMB: null };
  return { over: bytes >= limitMB * 1024 * 1024, sizeMB: Math.round(bytes / (1024 * 1024)) };
}
