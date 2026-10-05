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
  return (await compressImageWithSize(uri, opts)).uri;
}

// 같은 압축 + 결과 치수({ uri, width, height }). 치수는 manipulateAsync 결과에 공짜로 들어 있다.
//   ★사진 비율(ar=가로/세로)을 저장 데이터에 함께 실어 두기 위함(2026-10-05): 피드 카드 틀(4:3·1:1·4:5)을
//   사진 로드 '전'에 정하지 못하면 ①기본 4:3으로 그렸다가 틀이 바뀌며 카드가 접혔다 펼쳐지고 ②안드(Glide)가
//   작은 틀 크기로 디코드한 비트맵이 늘어나 뿌옇게 보인다. 원격 URL·실패 시 치수 없음(width/height null).
export async function compressImageWithSize(uri, opts = {}) {
  if (!uri || typeof uri !== 'string') return { uri, width: null, height: null };
  // 원격 URL은 압축 대상 아님 (이미 서버에서 처리됐거나 우리 통제 밖)
  if (uri.startsWith('http')) return { uri, width: null, height: null };
  const maxWidth = opts.maxWidth || DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const format = opts.format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format },   // PNG는 무손실이라 compress 무시(투명도 보존)
    );
    return { uri: result.uri, width: result.width || null, height: result.height || null };
  } catch (e) {
    console.warn('[imageCompress] 압축 실패, 원본 사용', e?.message);
    return { uri, width: null, height: null };
  }
}

// 가로/세로 비율 — 치수 없으면 null
export const ratioOf = (w, h) => (w > 0 && h > 0 ? w / h : null);

// ImagePicker 결과 배열(문자열·{uri,type:'video'} 객체 혼합) 일괄 압축.
// 비디오는 통과 (image manipulator는 이미지만 지원).
// ★사진은 비율(ar)을 알게 되면 객체({ uri, ar })로 돌려준다(2026-10-05) — 문자열 사진도 객체로 승격.
//   사진 객체는 {uri, focus}로 이미 1급 데이터라 모든 소비처가 객체를 처리한다. persistPhotos·uploadRoundMedia는
//   {...rest, uri}로 메타를 보존하므로 ar이 로컬(dgphoto:)→원격(https)까지 그대로 따라간다.
export async function compressMedia(items) {
  if (!Array.isArray(items)) return items;
  return Promise.all(items.map(async (it) => {
    if (typeof it === 'string') {
      const r = await compressImageWithSize(it);
      const ar = ratioOf(r.width, r.height);
      return ar ? { uri: r.uri, ar } : r.uri;
    }
    if (it && typeof it === 'object' && it.uri) {
      if (it.type === 'video') return it;
      const r = await compressImageWithSize(it.uri);
      const ar = ratioOf(r.width, r.height);
      return ar ? { ...it, uri: r.uri, ar } : { ...it, uri: r.uri };
    }
    return it;
  }));
}
