import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import * as fbAuth from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '../constants/api';

const app = initializeApp(FIREBASE_CONFIG);

export const db = getFirestore(app);

// 익명 로그인 — 영구 persistence로 uid를 기기별로 유지해야 '내 코멘트'·좋아요 식별이 가능.
// Metro는 firebase/auth의 react-native 빌드를 골라 getReactNativePersistence를 제공.
let auth;
try {
  if (typeof fbAuth.getReactNativePersistence === 'function') {
    auth = fbAuth.initializeAuth(app, {
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

// 앱 시작 시 익명 로그인 1회. authReady는 uid(또는 실패 시 null)로 resolve.
export const authReady = new Promise((resolve) => {
  const unsub = fbAuth.onAuthStateChanged(auth, (user) => {
    if (user) { unsub(); resolve(user.uid); }
  });
  fbAuth.signInAnonymously(auth).catch((e) => {
    console.warn('[firebase] 익명 로그인 실패', e?.message);
    resolve(null);
  });
});

// 현재 uid — 로그인 완료 전 호출되면 authReady를 기다린다.
export async function getUid() {
  return auth.currentUser?.uid || (await authReady);
}
