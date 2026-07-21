import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { searchGolfCoursesLocal, getGolfCourses } from './golfCourses'; // 별도 운영 코스 해소 + 구장명 DB 정규화
import { findCourseByName } from './courseNameKey';   // 구장 이름 → 우리 DB 구장 매칭(공용 규칙)

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
    teeTimeNote: (data?.teeTimeNote || '').trim(),   // 단체 여러 티타임 요약 — 있으면 한마디/메모에 프리필
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

// 별도 운영 코스 해소 — AI가 '라비에벨'+세부'올드코스'로 쪼갰지만 DB엔 '라비에벨CC 올드코스'가 별도 구장이면,
//   세부코스를 구장명으로 합치고 세부코스는 비운다. in/out·레이크 같은 진짜 세부코스는 합친 이름이 DB에 없어 그대로 유지.
async function resolveSeparateCourse(result) {
  const cn = (result.courseName || '').trim();
  const sc = (result.subCourse || '').trim();
  if (!cn || !sc) return result;
  try {
    const hits = await searchGolfCoursesLocal(`${cn} ${sc}`);
    if (hits && hits.length) {
      const topName = (hits[0].name || '').replace(/\s+/g, '');
      const scKey = sc.replace(/\s+/g, '').replace(/코스$/, '');   // '올드코스'→'올드'
      // 합친 검색의 최상위 DB 구장 이름에 세부코스 토큰이 실제로 들어있을 때만 별도 코스로 판단(오합치 방지)
      if (scKey && topName.includes(scKey)) {
        return { ...result, courseName: hits[0].name, subCourse: '' };
      }
    }
  } catch (e) { /* DB 미로드 등 — 원본 유지 */ }
  return result;
}

// 구장명을 코스 DB 표기로 맞춤 — AI는 문자에 적힌 대로 읽어오는데(예: '힐마루골프앤리조트포천'),
//   DB 이름('힐마루골프앤리조트')과 다르면 그 일정에 딸린 것들이 서로 다른 구장으로 갈린다.
//   실제로 함께식사에서 저장한 맛집이 코스 화면 맛집에 안 보이는 문제가 났다(2026-07-22).
//   같은 구장이라고 확신될 때만(courseNameKey 규칙) DB 이름으로 바꾼다 — 아니면 사용자가 본 대로 둔다.
//   ★검색(searchGolfCoursesLocal)이 아니라 목록을 직접 훑는다 — 검색은 'DB 이름이 검색어를 포함'하는
//    방향만 찾아서, 검색어가 더 긴 이 경우('…리조트포천'으로 '…리조트'를 찾기)엔 0건이 나온다.
async function canonicalizeCourseName(result) {
  const cn = (result.courseName || '').trim();
  if (!cn) return result;
  try {
    const all = await getGolfCourses();
    const hit = findCourseByName(all, cn);
    if (hit && hit.name && hit.name !== cn) return { ...result, courseName: hit.name };
  } catch (e) { /* DB 미로드 — 원본 유지 */ }
  return result;
}

// 추출 결과 후처리 파이프라인 — ①별도 운영 코스 합치기 ②구장명 DB 표기로 정규화
async function refineCourse(result) {
  return await canonicalizeCourseName(await resolveSeparateCourse(result));
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
    return await refineCourse(normalize(res?.data));
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
    return await refineCourse(normalize(res?.data));
  } catch (e) {
    if (__DEV__) console.warn('[reservationParse] text', e?.code || '', e?.message);
    return { error: e?.message || '예약 정보를 읽지 못했어요. 다시 시도해주세요.', code: e?.code };
  }
}
