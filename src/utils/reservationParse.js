import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// =============================================================
// 예약 자동입력 — 예약 문자/캡처에서 구장·코스·날짜·시간·인원 추출. ([[schedule-ocr-autofill]])
//
// Gemini Flash(멀티모달) 프록시(extractReservation, CF). 키는 CF Secret에만([[api-key-security]]).
// 스코어카드와 달리 CLOVA 없이 Gemini가 캡처를 직접 읽어 JSON으로 반환.
//
// 정책: 추출값은 자동 확정 X → 폼에 프리필만, 사용자 확인·수정 필수(오입력 방지).
// =============================================================

// 예약 캡처 선택 — 'gallery'(문자·카톡 예약 캡처 권장) | 'camera'.
// 반환: { uri } | { denied:true } | null(취소).
export async function pickReservationImage(source = 'gallery') {
  let result;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { denied: true };
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { denied: true };
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
  }
  if (result.canceled || !result.assets?.length) return null;
  return { uri: result.assets[0].uri };
}

// 추출 결과 정규화 — 날짜 YYYY.MM.DD, 시간 HH:MM, 인원 1~4로 보정.
function normalize(data) {
  const out = {
    found: !!data?.found,
    courseName: (data?.courseName || '').trim(),
    subCourse: (data?.subCourse || '').trim(),
    booker: (data?.booker || '').trim(),
    date: '',
    time: '',
    members: null,
  };
  // 날짜 — 구분자 무엇이든 YYYY.MM.DD로. 유효 범위만 통과(엉뚱한 값 프리필 방지).
  const dm = (data?.date || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (dm) {
    const y = +dm[1], mo = +dm[2], d = +dm[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      out.date = `${y}.${String(mo).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
    }
  }
  // 시간 — HH:MM. 24시간제 범위만.
  const tm = (data?.time || '').match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    const h = +tm[1], mi = +tm[2];
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) out.time = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  if (Number.isFinite(data?.members) && data.members >= 1 && data.members <= 4) out.members = data.members;
  return out;
}

// 예약 캡처(uri) 추출 — 리사이즈(≤1400px)·JPEG base64로 압축 후 CF 호출.
//   스크린샷 텍스트라 원본 해상도까진 불필요 → 업로드·비용 절감. 반환: normalize 결과 또는 { error }.
export async function extractFromImage(uri) {
  try {
    const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1400 } }], {
      compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    const callable = httpsCallable(functions, 'extractReservation');
    const res = await callable({ imageBase64: img.base64, format: 'jpg' });
    return normalize(res?.data);
  } catch (e) {
    if (__DEV__) console.warn('[reservationParse] image', e?.code || '', e?.message);
    return { error: e?.message || '예약 정보를 읽지 못했어요. 다시 시도해주세요.', code: e?.code };
  }
}

// 붙여넣은 예약 문자(text) 추출 — 이미지 없이 텍스트만.
export async function extractFromText(text) {
  try {
    const callable = httpsCallable(functions, 'extractReservation');
    const res = await callable({ text: (text || '').slice(0, 4000) });
    return normalize(res?.data);
  } catch (e) {
    if (__DEV__) console.warn('[reservationParse] text', e?.code || '', e?.message);
    return { error: e?.message || '예약 정보를 읽지 못했어요. 다시 시도해주세요.', code: e?.code };
  }
}
