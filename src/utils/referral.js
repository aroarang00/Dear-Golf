import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// 초대 코드(레퍼럴) — 잠복 배포 1단계: 코드 생성·검증·추천인 '기록'만. 보상 지급은 CF(추후 배포)가
//   referredBy 기록을 소급 처리한다 ([[referral-reward-implementation-plan]] — 클라=기록만, 지급=서버).
//   데이터: users/{uid}.refCode(내 코드) · users/{uid}.referredBy(내가 입력한 추천인 코드, set-once)
//          refCodes/{code} = { uid, createdAt } 역참조(코드→초대자, create-only 규칙)

// 코드 문자셋 — 혼동 문자(I·O·0·1) 제외. 규칙의 형식 검증(^[A-HJ-NP-Z2-9]{6}$)과 반드시 일치.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// 입력 정규화 — 대문자화 + 공백·하이픈 등 잡문자 제거 (카톡 복붙 관대 처리)
export function normalizeRefCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 내 초대 코드 보장 — 있으면 반환, 없으면 생성. refCodes가 진실원(코드→uid 해석은 CF가 이걸로).
//   충돌 처리: refCodes/{code}가 이미 있으면 규칙상 update 거부 → 새 코드로 재시도.
//   refCodes 성공 후 users.refCode 저장 실패 시 고아 refCodes 문서가 남을 수 있으나 무해(다음 호출이 새 코드 발급).
export async function ensureMyRefCode(uid) {
  if (!uid) return null;
  try {
    const uref = doc(db, 'users', uid);
    const snap = await getDoc(uref);
    const existing = snap.exists() ? snap.data().refCode : null;
    if (existing) return existing;
    for (let i = 0; i < 5; i++) {
      const code = genCode();
      try {
        await setDoc(doc(db, 'refCodes', code), { uid, createdAt: serverTimestamp() });
      } catch (e) { continue; } // 코드 충돌(이미 존재 → update 거부) — 재시도
      await setDoc(uref, { uid, refCode: code, updatedAt: serverTimestamp() }, { merge: true });
      return code;
    }
  } catch (e) {
    if (__DEV__) console.warn('[referral] ensureMyRefCode', e?.code, e?.message);
  }
  return null;
}

// 추천인 코드 검증 — { ok, code, inviterUid } 또는 { ok:false, reason: 'format'|'notfound'|'self' }
export async function validateRefCode(rawCode, myUid) {
  const code = normalizeRefCode(rawCode);
  if (!CODE_RE.test(code)) return { ok: false, reason: 'format' };
  const snap = await getDoc(doc(db, 'refCodes', code));
  if (!snap.exists()) return { ok: false, reason: 'notfound' };
  const inviterUid = snap.data().uid;
  if (myUid && inviterUid === myUid) return { ok: false, reason: 'self' };
  return { ok: true, code, inviterUid };
}

// 추천인 기록 — 신규 가입 온보딩에서 1회(set-once, 규칙이 사후 변조 차단). 성공 여부만 반환.
//   유효하지 않은 코드는 조용히 무시(잠복 단계 — 지급 CF 배포 시 입력 시점 피드백 UI 추가 예정).
//   자기초대·중복 지급 등 최종 판정은 CF 몫 — 여기 검증은 오타 걸러주는 편의일 뿐.
export async function saveReferredBy(uid, rawCode) {
  if (!uid || !rawCode) return false;
  try {
    const v = await validateRefCode(rawCode, uid);
    if (!v.ok) return false;
    const uref = doc(db, 'users', uid);
    const snap = await getDoc(uref);
    if (snap.exists() && snap.data().referredBy) return false; // 이미 기록됨 — set-once
    await setDoc(uref, { uid, referredBy: v.code, referredAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[referral] saveReferredBy', e?.code, e?.message);
    return false;
  }
}
