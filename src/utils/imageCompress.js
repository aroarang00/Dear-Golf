import * as ImageManipulator from 'expo-image-manipulator';

// 사진 압축·리사이즈 — 모든 사진 업로드 진입점이 이 함수를 통과해야 한다.
// 정책 ([[image-compression]]): 1200px width + 80% JPEG.
// - 카톡·인스타도 동일 수준으로 압축해 보내는 업계 표준
// - 핵심 이유: 로딩 속도 (1~3MB → 150~300KB)
// - 부수 효과: Firebase Storage 비용·egress 80~90% 절감
// - EXIF GPS 좌표는 manipulateAsync가 자동 제거 (별도 작업 불필요)

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_QUALITY = 0.8;

// 이미지 URI 한 장 압축. 실패 시 원본 uri 폴백 (사용자가 사진을 잃지 않도록).
// opts.maxWidth: 기본 1200. 프로필 같은 작은 표시 영역은 600 같은 더 작은 값도 가능.
// opts.quality:  기본 0.8.
// opts.format:   기본 JPEG. 'png'면 투명도 보존 — 모서리 둥근 공유 카드를 JPEG로 굳히면 투명부가
//                흰색으로 채워져(어두운 격식 카드 하단에 '하얀 티') 보기 싫음. 평면 벡터 카드는 PNG로.
export async function compressImage(uri, opts = {}) {
  if (!uri || typeof uri !== 'string') return uri;
  // 원격 URL은 압축 대상 아님 (이미 서버에서 처리됐거나 우리 통제 밖)
  if (uri.startsWith('http')) return uri;
  const maxWidth = opts.maxWidth || DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const format = opts.format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format },   // PNG는 무손실이라 compress 무시(투명도 보존)
    );
    return result.uri;
  } catch (e) {
    console.warn('[imageCompress] 압축 실패, 원본 사용', e?.message);
    return uri;
  }
}

// ImagePicker 결과 배열(문자열·{uri,type:'video'} 객체 혼합) 일괄 압축.
// 비디오는 통과 (image manipulator는 이미지만 지원).
export async function compressMedia(items) {
  if (!Array.isArray(items)) return items;
  return Promise.all(items.map(async (it) => {
    if (typeof it === 'string') return compressImage(it);
    if (it && typeof it === 'object' && it.uri) {
      if (it.type === 'video') return it;
      return { ...it, uri: await compressImage(it.uri) };
    }
    return it;
  }));
}
