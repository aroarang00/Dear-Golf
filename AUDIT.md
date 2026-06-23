# 전체 감사 리포트 — 2026-06-23 (크루 세션 후)

브랜치 `feat/crew-space`. 자동검사 + 코드리뷰(에이전트 3) 결과. **아직 아무것도 수정/삭제 안 함** — 확인 후 진행용.

---

## ✅ 1. 검증 결과 (전부 통과 — 빌드 가능 상태)

| 검사 | 결과 |
|---|---|
| **문법** (src .js 199개 babel 파싱) | ✅ 전부 OK |
| **Android 번들** (`expo export`) | ✅ exit 0, 에러·경고 0, 9.7MB Hermes 번들 정상 생성 |
| **네이티브 설정** (`npm run check:native`) | ✅ 통과 (카카오 iOS/Android 콜백 등록됨) |
| **호환성** (reanimated4/gesture/keyboard/file-system) | ✅ HIGH·MED 없음 (아래 §4) |
| eslint | 미설정 (프로젝트에 없음) |

→ **지금 상태로 빌드해도 번들·호환성 문제는 없음.** 아래 버그들은 런타임 동작/엣지케이스라 빌드는 통과합니다.

---

## 🐞 2. 진단된 문제점 (우선순위순)

### HIGH — 빌드 전/후 처리 권장
**H1. `functions/index.js` `onCrewDeleted` — 게시물 많은 크루에서 타임아웃·고아 데이터 위험**
- 현재: posts를 `for` 루프로 **순차** 삭제(각 post마다 comments fetch+삭제 + Storage 삭제를 await). 100개 게시물×미디어면 함수 타임아웃(기본 60s) 초과 → 일부 posts/comments/Storage 미디어가 **정리 안 된 채 남음**(재시도 없음).
- 영향: 보통 크루(게시물 적음)는 정상. **활발한 크루**일 때만 위험.
- 수정안: ① Firestore 측은 `db.recursiveDelete(db.doc('crews/'+crewId))`로 교체 ② Storage 삭제는 chunk 10개씩 `Promise.all` 병렬 ③ 함수에 `timeoutSeconds`·`memory` 상향. (CF 재배포 필요 — 앱 빌드와 무관)

### MED — 동작 엣지케이스
**M1. 내가 올린 글이 목록 '새 글 갯수' 배지에 카운트됨** (`CrewListScreen.js` newCount / `crews.js:137`)
- `addCrewPost`가 `lastPostBy`를 기록("내 글 제외" 의도)하지만, `newCount = postCount - seen`이 **`lastPostBy`를 안 읽음**. 그래서 내가 앨범 안에서 글 올리면 목록 복귀 시 내 글이 새 글로 잠깐 뜸(다시 열기 전까지).
- 수정안: 글 작성 성공 후 `markCrewSeen` 호출, 또는 목록에서 `lastPostBy === currentUid`면 배지 억제. (이미 써둔 `lastPostBy` 활용)

**M2. `DraggableRows` 드래그 중 Firestore 스냅샷 도착하면 드래그가 끊길 수 있음**
- `Gesture.Pan()`·`commit`이 매 렌더 재생성 → 드래그 중 실시간 업데이트(새 글로 `_ts` 변동 등)가 오면 `GestureDetector`에 새 제스처가 들어가 진행 중 팬이 드롭될 수 있음.
- 수정안: `commit`은 `useCallback`, `drag`는 `useMemo`로 안정화 + `activeId`가 set인 동안 `items` 변경 무시(이미 position 재동기화는 막아둠 — items도 동일 처리).

**M3. 드래그 도중 크루 추가/삭제되면 순서 저장이 틀어질 수 있음** (`DraggableRows.js`)
- 드래그 중 `items` 집합이 바뀌면 `count`(prop)와 `positions`(shared) 키가 어긋나 `commit`에서 새 크루가 `pos[a] ?? 0` → 0번(맨 위)로 튐.
- 수정안: 드래그 중 items 변경 defer + `commit`에서 pos에 없는 id는 0이 아니라 **끝에 append**.

**M4. `CrewAlbumScreen` resolve effect가 `namesFallback`(crewDoc.names) 의존성 누락 → 폴백 이름 stale**
- 멤버/작성자 집합이 안 바뀌고 `crewDoc.names`만 갱신되면 표시 이름이 안 바뀜. 저빈도지만 실재.
- 수정안: deps에 names 시그니처 추가.

**M5. `CrewMembersScreen` 마지막-멤버 경고가 로컬 `members.length` 기반(레이스)**
- 동시에 다른 멤버가 나가면 경고 문구가 실제와 어긋날 수 있음. **삭제 자체는 CF(memberUids→[])가 보장**하므로 데이터는 안전, 문구만 오해 소지. (수용 가능 / 코멘트 권장)

### LOW — 폴리시/마이너
- **L1.** `CrewComposeScreen` `openCrop`: 원격 사진 다운로드 실패 시 https uri로 그냥 진행 → iOS서 크롭 저장 실패. 실패하면 토스트 띄우고 크롭 중단 권장.
- **L2.** `CrewAlbumScreen` 공지 "더보기"가 글자수(>45)로 판단 → 46자 한 줄도 무의미한 더보기 노출. `onTextLayout` 기반 권장.
- **L3.** `useScreenBack`: BackHandler+onRequestClose 이중발화는 핸들러 멱등 전제. 현재 크루 핸들러 전부 멱등(setState만)이라 안전. 향후 비멱등(예: API호출) onBack 추가 시 주의 — 코멘트만.
- **L4.** `crews.js:13` 주석 `media:[{url,...}]` → 실제는 `uri`. 코스메틱.

---

## 🧹 3. 죽은 코드 (확인 후 삭제) — grep으로 0 참조 검증됨

### 미사용 파일 (크루와 무관, 이전부터 방치)
| 파일 | 판단 |
|---|---|
| `src/components/RoundupShareCardWide.js` | 삭제 후보 (0 import) |
| `src/components/common/LightHeader.js` | 삭제 후보 (0 import) |
| `src/utils/friendsRegistry.js` | 삭제 후보 (export 5개 전부 0 참조) |
| `src/components/RoundCardBig.js` | ⚠️ **보류** — 파일 내 주석에 "미등록(파일 보존)"이라 **의도적 보존**. 삭제 말 것 |

### `src/utils/crews.js` 미사용 export
| export | 판단 |
|---|---|
| `subscribeCrewPost` (단일 게시물 구독, line ~164) | 삭제 후보 — 상세화면 폐지로 더 안 씀 |
| `MAX_CREWS` (line 20·84) | 삭제 후보 (0 참조) |
| `myCrewCount` (line 79) | 삭제 후보 (0 참조) |

> 확인 후 삭제 명령 (RoundCardBig 제외):
> ```
> git rm src/components/RoundupShareCardWide.js src/components/common/LightHeader.js src/utils/friendsRegistry.js
> ```
> `crews.js` 3개 export는 함수 본문째 수동 삭제(파일은 유지).

### 크루 6개 파일 내 미사용 import/변수
- 없음. (CrewAlbumScreen/CrewListScreen/CrewComposeScreen/CrewMembersScreen/DraggableRows/useScreenBack 전부 깨끗)
- `useAndroidBack`은 **살아있음** — DM·다이어리·친구 등 8개 파일에서 여전히 사용. 삭제 금지.

---

## 🔧 4. 호환성 (결론: 문제 없음)

- **New Architecture 켜짐** (`app.config.js` `newArchEnabled: true`) — reanimated 4 전제조건 충족.
- `react-native-worklets` 0.5.1 설치 + babel plugin `react-native-worklets/plugin` 적용됨 (reanimated 4 필수 세팅 정확).
- reanimated 4.1.7 / gesture-handler 2.28 / keyboard-controller 1.18.5 / expo-file-system 19 `/legacy` / image-manipulator 14 — 사용 API 전부 유효, **재빌드 필요 없음**.
- LOW 2건(둘 다 SDK54서 정상 동작, 나중에 JS만 교체):
  - `expo-image-manipulator` `manipulateAsync`/`SaveFormat` — deprecated(동작함). 향후 `ImageManipulator.manipulate()` 컨텍스트 API로 이전 권장.
  - `expo-file-system/legacy` — SDK54 의도된 마이그레이션 경로(정상). 새 File API로 나중에 이전 가능.

---

## 📋 5. 일어나서 할 일 (제안 순서)
1. 이 리포트 훑기.
2. **죽은 코드** §3 — 의도 확인 후 삭제(RoundCardBig 제외). 빌드엔 영향 없음.
3. **M1(내 글 배지)·M4(stale 이름)** — 빠른 수정이면 빌드 전 처리. 원하면 내가 바로 고침.
4. **H1(CF 타임아웃)** — 앱 빌드와 무관(CF 재배포). 활발한 크루 쓰기 전 처리 권장.
5. **빌드** — 번들·호환성 통과 상태라 바로 EAS 빌드 가능.

> 정리 부산물 `.audit-dist/`, `.audit-bundle.log`는 삭제해 둠. 이 `AUDIT.md`도 확인 후 지우면 됨.
