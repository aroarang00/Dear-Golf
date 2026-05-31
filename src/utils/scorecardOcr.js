import * as ImagePicker from 'expo-image-picker';
import { compressImage } from './imageCompress';

// =============================================================
// 스코어카드 OCR — 본인 스코어(숫자 18홀)만 추출. ([[project_scorecard_ocr]])
//
// ⚠️ recognizeScorecard는 현재 STUB(mock 데이터). 실제 인식은 출시 시점에 연결:
//    @react-native-ml-kit/text-recognition (온디바이스·무료) → parseScorecardText로 표 파싱.
//    ML Kit는 네이티브 모듈 → 설치 시 EAS 재빌드 필요(JS-only 아님).
//
// 정책:
//  - 본인 스코어만, 숫자만. 본명·동반자 매핑/저장 X (PIPA).
//  - 동반자가 같이 나온 표는 OCR이 행(플레이어)별로 파싱 → 사용자가 본인 행 직접 선택.
//    (닉네임 변경하는 사용자가 있어 자동 이름매칭은 부정확)
//  - 추출 결과는 자동 확정 X → 사용자 확인·수정 필수 (다이어리 오염 방지).
// =============================================================

export const HOLE_COUNT = 18;
export const emptyHoles = () => Array(HOLE_COUNT).fill(null);
export const sumHoles = (holes) =>
  (holes || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

// 홀별 스코어 vs 홀별 par → 타입별 개수 (이글·버디·파·보기·더블+). par 없으면 null.
// 버디 자동 입력에 사용 (birdie = score-par == -1). [[project_scorecard_ocr]]
export function scoreBreakdown(holeScores, holePars) {
  if (!Array.isArray(holeScores) || !Array.isArray(holePars)) return null;
  const b = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  for (let i = 0; i < HOLE_COUNT; i++) {
    const s = holeScores[i], p = holePars[i];
    if (!Number.isFinite(s) || !Number.isFinite(p)) continue;
    const d = s - p;
    if (d <= -2) b.eagle++;
    else if (d === -1) b.birdie++;
    else if (d === 0) b.par++;
    else if (d === 1) b.bogey++;
    else b.double++; // +2 이상 (더블보기 이상 통합)
  }
  return b;
}

// 사진 선택 — source: 'gallery' | 'camera'.
// 갤러리(카톡 공유 사진) 권장 — 디지털 스크린샷이라 인식률 높음. 촬영도 허용.
// 인식 정확도 위해 긴 변 1600px로 리사이즈. 반환: { uri } 또는 null(취소·권한거부).
export async function pickScorecardImage(source = 'gallery') {
  let result;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1,
    });
  }
  if (result.canceled || !result.assets?.length) return null;
  const uri = await compressImage(result.assets[0].uri, { maxWidth: 1600, quality: 0.92 });
  return { uri };
}

// 스코어카드 인식 → 행(플레이어)별 18홀 숫자.
// 반환: { stub?: true, rows: [{ label, holes: number[18], total }] }
//   - label: 화면에서 행 구분용으로만 표시 (읽힌 이름 등). 저장하지 않음.
//   - 1행이면 자동 사용, 여러 행이면 사용자가 본인 행 선택.
//
// ⚠️ STUB: 지금은 고정 mock 반환. 출시 시 아래 ML Kit 흐름으로 교체.
export async function recognizeScorecard(uri) {
  // TODO(출시): 실제 OCR 연결 + EAS 재빌드
  //   import TextRecognition from '@react-native-ml-kit/text-recognition';
  //   const { blocks } = await TextRecognition.recognize(uri);
  //   const rows = parseScorecardText(blocks);
  //   return { rows };
  const mock = [
    { label: '1번째 줄', holes: [4, 5, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 5, 4, 4, 4] },
    { label: '2번째 줄', holes: [5, 4, 5, 4, 4, 4, 5, 4, 4, 5, 4, 4, 4, 5, 4, 5, 4, 5] },
  ];
  // par 행 mock (스텁) — 실제는 parseScorecardText가 스코어카드 par 행에서 추출. 버디 자동집계용.
  const pars = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 5, 3, 4];
  return { stub: true, rows: mock.map(r => ({ ...r, total: sumHoles(r.holes) })), pars };
}

// OCR 텍스트 블록 → 행별 18홀 파싱 (스마트스코어 포맷 기준).
// TODO(출시): 좌표/줄 기반 표 매핑 구현. 현재는 스켈레톤.
//  1) 숫자만으로 이뤄진 줄 후보 추출
//  2) 18개(또는 전반 9 + 후반 9) 시퀀스로 그룹핑
//  3) 각 행을 { label(읽힌 이름, 표시용), holes:number[18], total } 로 구성
export function parseScorecardText(blocks) {
  return [];
}
