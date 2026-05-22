# 카카오 로그인 ↔ Firebase Auth 연동 설계

> 작성 2026-05-22. Firebase 연동 작업 시 이 문서를 보고 진행한다.

## 배경 / 목적

현재 Firebase Auth는 **익명 인증**만 쓴다. 익명 uid는 앱 재설치 시 바뀌므로,
`rounds`(라운딩 기록)·`friendships`(친구 그래프)를 익명 uid에 묶으면 재설치·기기
변경 때 데이터가 전부 유실된다.

→ **결정:** 카카오 로그인을 Firebase Auth와 `linkWithCredential`로 연결해
안정적인 사용자 식별 체계를 만든다. 익명 계정을 카카오 신원으로 "승격"시켜
**uid를 유지**하는 것이 핵심.

## 현재 상태 (연동 전)

| 파일 | 현재 동작 |
|---|---|
| `src/utils/kakaoAuth.js` | `@react-native-seoul/kakao-login`의 `login()`+`getProfile()` 호출. `{kakaoId, nickname, profileImageUrl}` 반환. **`idToken`은 받지만 버려짐** (`kakaoAuth.js:14`가 로그만 찍음) |
| `src/components/OnboardingKakao.js` | 로그인 성공 → `onKakaoSuccess()`로 프로필 prefill만 |
| `src/utils/firebase.js` | `signInAnonymously()`만. 카카오와 무관 |

→ 카카오 로그인은 닉네임·사진 자동완성용일 뿐, Firebase 신원과 분리돼 있다.
버려지는 `idToken`이 연동의 열쇠다.

## 핵심: Firebase에는 카카오 공급자가 없다

`linkWithCredential`은 `AuthCredential`을 받는데, Firebase Auth에는
Google/Apple/Facebook은 있어도 **카카오 기본 공급자가 없다.**

카카오로 `AuthCredential`을 만들려면 카카오를 **일반 OIDC(OpenID Connect)
공급자**로 등록해야 하고, 이 기능은 **Firebase Authentication with Identity
Platform**(업그레이드된 Auth)에 있다. 카카오는 OIDC를 지원하고, 쓰는 라이브러리도
이미 `idToken`을 주므로 이 방식이 성립한다 — 단 아래 콘솔 설정이 전제다.

---

## 1단계 — 콘솔 설정 순서 (코드 작성 전 필수)

이 3가지를 먼저 끝내야 코드가 동작한다.

### 1-1. Kakao Developers 콘솔
- 카카오 로그인 → **OpenID Connect 활성화 ON**
  - 이게 켜져야 `login()`이 유효한 `idToken`(JWT)을 발급한다.
- 카카오 로그인 → 보안 → **Client Secret 발급** (코드 받아둘 것)

### 1-2. Firebase 콘솔 — Identity Platform 업그레이드
- Authentication → **Identity Platform로 업그레이드**
- 일반 OIDC 공급자는 Identity Platform 기능. 무료 티어(월 활성 사용자 한도 내)로
  충분하며, 기존 익명 인증은 그대로 유지된다.

### 1-3. Firebase 콘솔 — OpenID Connect 공급자 추가
- Authentication → 로그인 방법 → 새 공급자 → OpenID Connect
- 입력값:

| 항목 | 값 |
|---|---|
| 공급자 ID | `oidc.kakao` |
| 발급기관(Issuer) | `https://kauth.kakao.com` |
| 클라이언트 ID | 카카오 앱 키 — **idToken의 `aud` 클레임과 일치해야 함** |
| 클라이언트 보안 비밀 | 1-1에서 발급한 Kakao Client Secret |
| 그랜트 방식 | ID 토큰 (모바일 SDK가 idToken을 직접 넘김) |

> 클라이언트 ID가 헷갈리면: 실제 발급된 idToken을 jwt.io로 디코드해 `aud` 값을
> 확인하고 그 값을 그대로 넣는다.

---

## 2단계 — 연동 흐름 (3가지 시나리오)

카카오 `login()`이 준 `idToken`으로:

```
const cred = new OAuthProvider('oidc.kakao').credential({ idToken });

① linkWithCredential(auth.currentUser, cred)        ← 첫 카카오 로그인
   → 익명 계정을 카카오 신원으로 '승격'. uid 그대로 유지!
   → 익명 uid에 쌓인 rounds·friendships 데이터 전부 보존 ✅

② catch 'auth/credential-already-in-use'             ← 재설치 / 기기 변경
   → signInWithCredential(auth, cred)
   → 이 카카오에 이미 있던 기존 Firebase 계정으로 전환.
   → 옛 uid의 클라우드 데이터 복구. 현재 익명 임시계정은 폐기.

③ catch 'auth/provider-already-linked'               ← 이미 연동됨
   → no-op
```

설계의 핵심은 **①에서 uid가 안 바뀐다**는 점. 온보딩에서 카카오를 받으면(현재 앱
구조가 그럼) 데이터가 없을 때 익명→카카오로 승격되므로 무손실이고, 이후 모든
`rounds`/`friendships`가 안정적인 uid에 묶인다.

---

## 3단계 — 코드 변경 지점

| 파일 | 변경 |
|---|---|
| `kakaoAuth.js` | `loginWithKakao()` 반환값에 `idToken` 추가 (지금은 버려짐) |
| `kakaoAuth.js` 또는 `firebase.js` | **신규** `linkOrSignInWithKakao(idToken)` — ①②③ 분기 |
| `OnboardingKakao.js` | `loginWithKakao()` 성공 후 `linkOrSignInWithKakao()` 호출 |
| 연동 직후 | `users/{uid}` 문서 생성·동기화 (kakaoId, displayName 등) |
| `firebase.js` | `getUid()`는 ①에선 그대로, ②에선 새 uid — 호출부가 auth 변화에 반응하도록 보강 |

### 신규 함수 스케치

```js
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase';

export async function linkOrSignInWithKakao(kakaoIdToken) {
  const cred = new OAuthProvider('oidc.kakao').credential({ idToken: kakaoIdToken });
  try {
    const r = await linkWithCredential(auth.currentUser, cred);
    return { ok: true, mode: 'linked', uid: r.user.uid };       // ① uid 유지
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      const r = await signInWithCredential(auth, cred);
      return { ok: true, mode: 'existing', uid: r.user.uid };    // ② uid 변경
    }
    if (e.code === 'auth/provider-already-linked') {
      return { ok: true, mode: 'already', uid: auth.currentUser.uid };
    }
    return { ok: false, error: e.code || e.message };
  }
}
```

### `kakaoAuth.js` 변경

`loginWithKakao()`의 `login()` 결과에서 `token.idToken`을 반환값에 포함시킨다
(현재는 `hasIdToken` 로그만 찍고 버림).

---

## 주의할 난점 4가지 (구현 시 검증 필요)

### ① nonce
카카오 OIDC `idToken`에 `nonce` 클레임이 있으면 Firebase가
`provider.credential({ idToken, rawNonce })`로 `rawNonce`를 요구할 수 있다.
네이티브 SDK는 nonce 제어가 제한적이라 — **구현 시 가장 막힐 가능성이 높은 지점.**
`auth/missing-or-invalid-nonce` 류 에러가 나면 여기를 의심한다.

### ② aud 불일치
Firebase OIDC 공급자의 클라이언트 ID ≠ idToken의 `aud`면
`auth/invalid-credential`. 디버깅 시 idToken을 jwt.io로 디코드해 `aud`·`iss`를
확인하고 콘솔 설정과 맞춘다.

### ③ ②시나리오의 데이터 병합
사용자가 '나중에 하기'로 익명 사용하며 다이어리를 만든 뒤 연동했는데
`credential-already-in-use`가 나면, 데이터가 두 계정으로 갈라진다.
- 회피책: 온보딩 단계에서 카카오 연동을 권장(현재 앱 구조가 그러함) → 데이터 없을
  때 ①로 승격되어 안전.
- 늦은 연동 경로는 출시 1차에선 안내 문구로 처리. 자동 병합은 추후 과제.

### ④ ②시나리오의 uid 변경
`signInWithCredential` 후 uid가 바뀐다. 앱이 uid 기준 상태(Firestore 프로필·
`rounds` 등)를 **재로드**해야 한다. ①(link)은 uid 불변이라 재로드 불필요.

---

## 구현·검증 체크리스트

연동 작업 시 순서대로:

- [ ] 1단계 콘솔 설정 3가지 완료
- [ ] `kakaoAuth.js` — `loginWithKakao()`가 `idToken` 반환하도록 수정
- [ ] `linkOrSignInWithKakao()` 신규 작성
- [ ] `OnboardingKakao.js`에서 호출 연결
- [ ] 연동 직후 `users/{uid}` 문서 생성·동기화
- [ ] 테스트 ① — 신규 설치 → 카카오 로그인 → `mode: 'linked'`, uid 유지 확인
- [ ] 테스트 ② — 앱 삭제 후 재설치 → 카카오 로그인 → `mode: 'existing'`,
      옛 데이터 복구 확인
- [ ] 테스트 ③ — 이미 연동된 상태에서 재로그인 → `mode: 'already'`
- [ ] `userProfile.kakaoLinked`를 실제 Firebase 연동 여부와 일치시킴
- [ ] `account.js` 탈퇴 흐름 — `deleteUser`가 연동 계정도 정상 삭제하는지 확인

---

## 대안 — Custom Token 방식 (참고, 채택 안 함)

Identity Platform 업그레이드가 부담되면, Cloud Function이 카카오 토큰을 검증해
커스텀 토큰을 발급(`signInWithCustomToken`)하는 방식도 있다. 다만:
- `linkWithCredential`을 쓸 수 없다.
- 익명 uid 보존을 위해 Function이 `kakaoId → uid` 매핑을 직접 관리해야 한다.

결정한 `linkWithCredential` 방식(OIDC)과 다른 길이므로 채택하지 않는다.
이 문서의 설계는 OIDC 방식 기준이다.
