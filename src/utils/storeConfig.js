import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// 홈 스토어 광고 원격 로드 — Firestore `config/storeAds` 문서의 { ads: [{ tag, title, img, url }] }.
//   콘솔에서 문서만 고치면 앱 업데이트 없이 광고 게시·교체·내림(빈 배열)이 즉시 반영.
//   실패·문서 없음 = 빈 배열(광고 미노출) — 홈은 광고 없는 기존 모습 그대로 동작.
// 필드 타입 강제 — 콘솔에서 손으로 고치는 문서라 오타·타입 실수(숫자, 맵 등)가 언제든 올 수 있음.
//   문자열 아니면 버리고, 링크·이미지는 https만 허용(이상한 스킴으로 openURL 방지). 어떤 값이 와도 렌더 크래시 0.
const str = (v) => (typeof v === 'string' ? v : '');
const httpsUrl = (v) => (typeof v === 'string' && /^https:\/\//i.test(v.trim()) ? v.trim() : '');

export async function loadStoreAds() {
  try {
    const snap = await getDoc(doc(db, 'config', 'storeAds'));
    const ads = snap.exists() ? snap.data()?.ads : null;
    if (!Array.isArray(ads)) return [];
    return ads
      .filter((a) => a && typeof a === 'object' && typeof a.title === 'string' && a.title.trim())
      .slice(0, 2)
      .map((a) => ({ tag: str(a.tag).trim(), title: a.title.trim(), img: httpsUrl(a.img), url: httpsUrl(a.url) }));
  } catch (e) {
    if (__DEV__) console.warn('[storeConfig] loadStoreAds fail', e?.code, e?.message);
    return [];
  }
}
