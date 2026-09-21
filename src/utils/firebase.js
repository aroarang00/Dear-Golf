import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import * as fbAuth from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '../constants/api';

const app = initializeApp(FIREBASE_CONFIG);

export const db = getFirestore(app);

// Cloud Functions — onCall(스코어카드 OCR 등). 배포 리전(asia-northeast3/서울)과 일치해야 호출됨.
export const functions = getFunctions(app, 'asia-northeast3');
export const storage = getStorage(app);   // Firebase Storage — 아바타 사진 업로드·친구 공개(https URL)

// 익명 로그인 — 영구 persistence로 uid를 기기별로 유지해야 '내 코멘트'·좋아요 식별이 가능.
// Metro는 firebase/auth의 react-native 빌드를 골라 getReactNativePersistence를 제공.
let auth;
try {
  // ★firebase/auth는 플랫폼(RN/web)에 따라 export가 갈리는 조건부 패키지라, 정적 분석이 RN 빌드의
  //   getReactNativePersistence를 못 본다(ESLint import/namespace 오탐). 아래 typeof 가드가 실체다.
  // eslint-disable-next-line import/namespace
  if (typeof fbAuth.getReactNativePersistence === 'function') {
    auth = fbAuth.initializeAuth(app, {
      // eslint-disable-next-line import/namespace
      persistence: fbAuth.getReactNativePersistence(AsyncStorage),
    });
  } else {
    auth = fbAuth.getAuth(app);
  }
} catch (e) {
  // 이미 초기화됐거나 persistence 미지원 — 기본 auth로 폴백
  auth = fbAuth.getAuth(app);
}
export { auth };

// 앱 시작 시 인증 준비. authReady는 uid(또는 실패 시 null)로 resolve.
// 첫 onAuthStateChanged로 복원된 세션을 확인 — persist된 유저(카카오/익명)가 있으면
// 그대로 쓰고, 없을 때만 익명 로그인. (무조건 signInAnonymously 호출하면 복원된
// 카카오 세션을 덮어써 uid가 유실되던 버그 수정 — docs/kakao-firebase-auth.md 설계 유지)
export const authReady = new Promise((resolve) => {
  const unsub = fbAuth.onAuthStateChanged(auth, (user) => {
    unsub();
    if (user) {
      resolve(user.uid);
    } else {
      fbAuth.signInAnonymously(auth)
        .then((cred) => resolve(cred.user.uid))
        .catch((e) => {
          console.warn('[firebase] 익명 로그인 실패', e?.message);
          resolve(null);
        });
    }
  });
});

// 현재 uid — 로그인 완료 전 호출되면 authReady를 기다린다.
export async function getUid() {
  return auth.currentUser?.uid || (await authReady);
}

// ★목록 읽기는 이걸로 — getDocs는 오프라인이면 실패 대신 '캐시'를 돌려준다(SDK 설계: source=default는
//   서버에 못 닿으면 로컬 캐시로 폴백하고 에러를 내지 않는다). RN + JS SDK는 영구 persistence가 없어
//   캐시가 늘 비어 있으므로 → 빈 배열이 돌아오고, 호출부는 '데이터 없음'으로 오인·loadFailed도 안 잡힌다.
//   갤럭시 유저 "입력한 일정·기록이 다 사라져 보인다" 반복 제보(2026-09-21)의 원인. 특히 화면 포커스 재조회가
//   빈 캐시를 받아 멀쩡히 보이던 목록을 []로 덮어쓰고 있었다.
//   → 캐시에서 온 빈 결과는 '실패'로 던져 호출부가 기존 데이터를 유지하고 재시도 안내를 띄우게 한다.
//   (캐시에서 온 비어 있지 않은 결과는 그대로 — 같은 세션에서 받아둔 실데이터라 보여도 된다.)
export async function getDocsOnline(q) {
  const snap = await getDocs(q);
  if (snap.metadata?.fromCache && snap.empty) {
    const e = new Error('offline-empty-cache');
    e.code = 'unavailable';
    throw e;
  }
  return snap;
}
