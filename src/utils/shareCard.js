// 카드 이미지 공유·저장 — 라운딩 카드·결산 카드·여권 요약이 같은 캡처 경로를 쓴다([[record-share-redesign]] 2026-10-10).
//   반환은 {ok, cancelled, alert} — 호출 쪽은 alert가 있으면 그대로 OverlayAlert에 넣는다(문구 중복 방지).
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// 캡처 — pixelRatio 3(카드폭 320 → 960px). 텍스트 많은 카드도 선명.
const capture = (ref) => captureRef(ref, { format: 'png', quality: 1, pixelRatio: 3 });

// 갤러리 저장(사진첩 권한 writeOnly — 안드13+ 읽기권한 불요·Play 정책, iOS는 addOnly)
export async function saveCardToGallery(ref) {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      return { ok: false, alert: { title: '사진첩 권한이 필요해요', message: '이미지를 저장하려면 사진첩 접근 권한이 필요해요. 설정 > Dear Golf에서 허용해주세요.', buttons: [{ text: '확인' }] } };
    }
    const uri = await capture(ref);
    await MediaLibrary.saveToLibraryAsync(uri);
    return { ok: true, alert: { title: '갤러리에 저장됐어요', message: '원하는 앱(카카오톡·인스타 등)에서 갤러리 사진으로 공유해보세요.', buttons: [{ text: '확인' }] } };
  } catch (e) {
    return { ok: false, alert: { title: '저장에 실패했어요', message: e?.message || '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] } };
  }
}

// OS 공유 시트(카톡·인스타·메시지). 공유 시트가 없는 환경이면 갤러리 저장으로 폴백. 사용자 취소는 에러가 아니다.
export async function shareCardImage(ref, { dialogTitle = '카드 공유' } = {}) {
  try {
    const uri = await capture(ref);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
      return { ok: true };
    }
    return saveCardToGallery(ref);
  } catch (e) {
    if (e?.message && /cancel/i.test(e.message)) return { ok: false, cancelled: true };
    return { ok: false, alert: { title: '공유에 실패했어요', message: e?.message || '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] } };
  }
}
