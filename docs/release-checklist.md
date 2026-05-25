# Dear Golf — 출시 전 체크리스트 (사용자 직접 작업)

**최종 업데이트**: 2026-05-24
**자동화 가능한 작업은 코드·메모리에 모두 적용됨.** 이 문서는 사용자가 직접 진행해야 할 외부 작업 정리.

---

## 0. 시급도 표시

- 🔴 출시 전 필수
- 🟡 출시 즈음 / 출시 직후
- 🟢 출시 후 점진 개선

---

## A. 빌드·검증 (즉시 진행 가능)

### 안드로이드
- [ ] 🔴 EAS Android preview 빌드 완료 대기 (`bjj4hqnnd` 진행 중)
- [ ] 🔴 빌드 완료 후 테스터에게 APK 전달 → 실기기 검증

### iOS
- [ ] 🔴 EAS iOS production 빌드 완료 대기 (`30b6e728-e65c-42e6-9956-df4d292a1802` 진행 중)
- [ ] 🔴 TestFlight 업로드: `npx eas-cli submit --platform ios --latest`
  - 첫 submit이면 App Store Connect API Key 등록 prompt
- [ ] 🔴 TestFlight 베타 테스터 추가 + 실기기 검증

### 실기기 검증 체크리스트 (빌드 받은 후)
- [ ] 폰트 (한글 굵기 정상, 시스템 글꼴 크기 변경에도 고정)
- [ ] 매너 등급 4단계 표시 (매너왕·좋음·보통·주의)
- [ ] 모집 취소 라벨 (임박/5일/7일/7일 이전)
- [ ] 다이어리 사진 10장 한도 + UI 잔여 표시
- [ ] 카카오 단톡방 버튼 — 전체공개 모집은 숨김, 친구공개·친구지정만 표시
- [ ] 안드로이드 뒤로가기 — 오버레이부터 닫힘 (alert·시트·picker)
- [ ] 갤러리 저장 (특별한 순간 카드 → 사진첩)
- [ ] 사진첩 권한 거부 시 안내
- [ ] 모집 자동 일정 등록 시 알람도 자동 예약
- [ ] **카카오 로그인** (이번 빌드는 EAS env 적용됨)
- [ ] **날씨·지도·골프장 검색** (네이버·KMA·카카오 API)

---

## B. 보안·키 관리 (출시 전 필수) 🔴

### 완료된 항목 ✅
- [x] 14개 EAS env vars 등록 (3개 환경 모두)
- [x] NAVER_MAP_CLIENT_SECRET 접두사 수정 (EXPO_PUBLIC_ 추가)
- [x] Unsplash 본인 명의 키 발급·교체

### 남은 작업
- [ ] 🔴 **Firebase App Check 활성화** — Android(Play Integrity) + iOS(App Attest)
  - Firebase 콘솔 → App Check 메뉴
  - 디어골프 앱만 Firebase API 호출 가능하게
- [ ] 🔴 **Firestore Security Rules 점검·강화**
  - `firestore.rules` 파일 검토
  - 모든 컬렉션 read/write 권한 명시
  - 출시 전 변호사 검토와 함께
- [ ] 🔴 **Firestore `top100Courses` write 규칙 닫기**
  - 시딩 완료 후 write 권한 제거
  - 콘솔 → Firestore → Rules에서 수정
- [ ] 🟡 **app.json → app.config.js 분리** (카카오 키 env로)
  - 현재 `app.json:66`에 `kakaoAppKey` 평문 하드코딩
  - 선택 (다른 앱들도 흔히 하드코딩)
- [ ] 🟡 **EAS env visibility를 sensitive로 변경**
  - 현재 plain text로 등록됨
  - 웹 콘솔에서 각 변수 → Edit → Visibility → Sensitive
  - 빌드 로그·콘솔에서 마스킹됨

### 시크릿 노출 사후 조치
- [ ] 🔴 채팅에서 노출된 시크릿 키는 재발급 (이미 완료된 항목이지만 다시 확인)

---

## C. 약관·법적 (변호사 검토 후) 🔴

### 변호사 발송 패키지
- [x] 변호사 검토 종합 문서 작성 완료: `docs/legal-review-summary.md`
- [ ] 🔴 **변호사 선임**
- [ ] 🔴 **변호사에게 발송**: `docs/legal-review-summary.md` + 기존 `docs/PRIVACY.md`
- [ ] 🔴 변호사 검토 결과 받기 (예상 1-2주)

### 변호사 검토 후 작성
- [ ] 🔴 **이용약관** 작성
- [ ] 🔴 **개인정보처리방침** 전면 개정 (`docs/PRIVACY.md` — 현재 옛 정책 기반)
- [ ] 🔴 **커뮤니티 가이드라인** 작성

### 약관 UI 적용 (Phase 2 백엔드 작업과 함께)
- [ ] 🔴 온보딩 동의 화면 UI (이용약관·개인정보·마케팅·만 19세)
- [ ] 🔴 마이페이지 → 설정 → 약관 및 정책 메뉴
- [ ] 🔴 App Store/Google Play 등록 시 개인정보처리방침 URL 입력

---

## D. 기능 보강 (출시 전 필수) 🔴

### 아이대리 연동
- [ ] 🔴 **아이대리 측과 협의** — 연동 방식 결정 (tel:/API/외부 웹)
- [ ] 🔴 협의 결과대로 코드 적용 (`WeatherTransportPopup`의 아이대리 버튼)
- 참조 메모리: `project_idaeri`

### deargolf.app 도메인
- [ ] 🔴 **Firebase Hosting 배포**: `firebase deploy --only hosting`
- [ ] 🔴 Firebase 콘솔에서 `deargolf.app` 커스텀 도메인 연결
- [ ] 🟡 출시 후 `hosting/index.html`의 `APP_STORE_URL`을 실제 App ID로 교체
  - 현재: `https://apps.apple.com/kr/app/dear-golf` (placeholder)
  - 실제: `https://apps.apple.com/kr/app/id{APP_ID}`

### 갤러리 저장 (이미 코드 작업 완료)
- [x] `react-native-view-shot` + `expo-media-library` 패키지 설치
- [x] 코드 작성 완료
- [ ] 🔴 빌드 후 실기기 검증

---

## E. 스토어 등록·배포 (출시 시) 🔴

### Google Play
- [ ] 🔴 Google Play Console 앱 등록
- [ ] 🔴 **카카오 콘솔에 Google Play 앱 서명 키 해시 등록**
  - 현재 EAS 키스토어 해시만 등록됨
  - Google Play Console → Setup → App Integrity → App Signing Key Certificate에서 SHA-1 가져오기
  - 카카오 디벨로퍼스 → 앱 설정 → 플랫폼 → Android 키해시 추가
  - 참조 메모리: `project_kakao_store_keyhash`
- [ ] 🔴 Play Store 앱 정보 (스크린샷·설명·아이콘 등)
- [ ] 🔴 Play Store 정책 검토 통과
- [ ] 🔴 Google Play 출시

### App Store
- [ ] 🔴 App Store Connect 앱 등록
- [ ] 🔴 App Store 앱 정보 (스크린샷·설명·아이콘 등)
- [ ] 🔴 App Store 심사 통과 (Apple Guidelines 1.2 UGC 정책 — 신고 기능 필수, [[content-report-policy]] + [[report-block-policy]] 적용 필요)
- [ ] 🔴 App Store 출시

### 출시 후
- [ ] 🟡 `hosting/index.html`의 APP_STORE_URL을 실제 App ID로 교체 + 재배포

---

## F. 출시 후 모니터링 (출시 직후~1개월) 🟡

- [ ] 🟡 EAS env vars 사용량 모니터링
- [ ] 🟡 Firebase 사용량·비용 모니터링 (Blaze plan 시)
- [ ] 🟡 카카오 API 쿼터 모니터링
- [ ] 🟡 KMA API 쿼터 모니터링
- [ ] 🟡 사용자 신고 큐 처리 (deargolf.official@gmail.com)
- [ ] 🟡 안드로이드 ANR/크래시 모니터링 (Play Console)
- [ ] 🟡 iOS 크래시 모니터링 (Xcode Organizer 또는 Firebase Crashlytics)
- [ ] 🟡 사용자 피드백 수집

---

## G. Phase 2 백엔드 작업 (출시 후 본격, 8-12주) 🟢

**상세는 메모리 `project_phase2_master_plan` 참조.**

### 마일스톤 요약
- **M1: 인프라 셋업** (1-2주) — Cloud Functions·FCM·Firestore 컬렉션·카카오 OIDC·App Check
- **M2: 자동 처리** (2-3주) — 12개월 롤링 카운트·정지 자동 해제·매너 평가 집계·대기자 승격
- **M3: 신고·이의제기** (1-2주) — 사용자 신고 + 콘텐츠 신고 + 이메일 큐
- **M4: UI 적용** (2-3주) — 마이페이지·신고하기·이의제기·게스트·댓글
- **M5: 데이터 관리 + 탈퇴** (1주) — 자동 삭제·banned_users·재가입 차단
- **M6: 알림 시스템** (1주) — 알림 분류·푸시 거부 보완·마케팅 푸시

### Phase 2 진입 시 첫 단계
1. Firebase Blaze plan 업그레이드
2. `firebase init functions` (TypeScript)
3. Firestore Security Rules 점검·강화
4. App Check 활성화
5. 카카오 OIDC 연동

---

## H. 출시 후 점진 개선 🟢

- [ ] 🟢 카카오 직접 공유 SDK 연동 (특별한 순간 외부 공유 강화)
- [ ] 🟢 디퍼드 딥링크 (Branch 등) — 초대받은 친구 자동 연결
- [ ] 🟢 네이버 캘린더 연동 (현재 기기 캘린더만)
- [ ] 🟢 스코어카드 OCR (사진 자동 인식)
- [ ] 🟢 골프장 예약처 안내 통합 (현재 네이버 위임)
- [ ] 🟢 다이어리 신고 누적 시 관리자 페이지 구축
- [ ] 🟢 마케팅 푸시 시스템

---

## 빠른 시작 — 가장 시급한 5개 🔥

1. 🔴 **빌드 검증** (안드로이드 APK + iOS TestFlight 받아 실기기 테스트)
2. 🔴 **변호사 선임 + 발송** (`docs/legal-review-summary.md`)
3. 🔴 **아이대리 협의**
4. 🔴 **Firebase App Check + Security Rules 강화**
5. 🔴 **Firestore top100Courses write 규칙 닫기**

---

## 참조 메모리 인덱스

법적·정책: `legal-terms-todo`, `legal-disclosure-locations`, `legal-risk-first`, `data-retention`, `age-policy`, `account-deletion`
운영: `roundup-penalty-policy`, `report-block-policy`, `content-report-policy`, `notification-policy`
백엔드: `phase2-master-plan`, `trust-grade-phase2`
보안: `api_key_security`, `kakao_store_keyhash`
출시 관련: `idaeri`, `friend_invite`, `share_moment`, `data_migration`, `android_back`, `top100_courses`, `dead_code_cleanup`
