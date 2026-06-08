# 친구 그룹 + 친구 별명 — 설계 문서 (v1)

> 작성 2026-06-08. 코드 착수 전 설계안. 관련 메모리: friend-feed-design, roundup-visibility-design, profile-diary-split, block-nickname, dm-design.

## 1. 목표 & 범위

친구를 **그룹**으로 묶어, 피드/라운지 글의 **공개 범위를 그룹 단위로** 좁힐 수 있게 한다. 클럽/소모임(권한·채팅) 같은 무거운 구조는 도입하지 않는다. 친구 **별명(customName)** 도 함께.

**v1 범위 (출시 전):**
- 기본 그룹 **2개 제공**: `가까운 친구`, `라운딩 멤버` (구조는 일반형 → 추후 N개 확장)
- **피드 먼저**, 그다음 라운지
- 친구 별명(customName)
- 공개범위·그룹소속·별명은 **전부 본인만** 보는 private 데이터 (친구에게 절대 노출 X)

**v1 공개 범위 선택지 (글 작성 시):**
```
친구 전체        ← 현행 'friends' 동작 유지 (동적: 현재 모든 친구)
가까운 친구       ← 기본 그룹 1 (단일 유지, 인스타 Close Friends식)
라운딩 멤버       ← 기본 그룹 2 (추후 커스텀 이름으로 여러 그룹 쪼개기)
나만 보기        ← 현행 'private'
```

**출시 후(별도):** 그룹 생성/삭제/이름변경(특히 '라운딩 멤버' 쪼개기), 라운지 그룹 공개.

## 2. 확정된 결정

| 항목 | 결정 |
|---|---|
| 그룹 방식 | B안 — 기본 2그룹 제공, 구조는 일반형(N개 확장 대비) |
| 다중 소속 | **허용** — 한 친구가 여러 그룹 동시 소속 가능 |
| 공개범위 해석 | **스냅샷 `audienceUids`** (작성 시점 그룹 멤버 uid 고정). 동적 재계산 X |
| '친구 전체'만 예외 | 동적 유지(나중에 추가된 친구도 과거 '친구 전체' 글 봄). audienceUids 미사용 |
| 프라이버시 | 그룹 정의·소속·별명·공개범위 = **owner-only**. 친구는 자기 소속/별명 모름 |
| 별명(customName) | 그룹과 같은 private 메타에 같이 저장 |
| 순서 | 피드 → 라운지 |

## 3. Firestore 스키마

### 3.1 친구 메타 (owner-only 서브컬렉션 — ★프라이버시 확정)

⚠️ **`users/{uid}` 문서 필드로 두면 안 됨** — 현 규칙 `match /users/{uid} { allow read: if isSignedIn() }`(line 44-45)이라 **로그인한 아무나** users 문서 전체를 read 가능(공개 명함이라 의도된 개방). friendMeta를 필드로 넣으면 별명·소속이 전부 샌다.

**확정 저장 위치: `users/{myUid}/private/friendData` (단일 문서)** — 서브컬렉션은 부모 규칙 상속 안 됨 → owner-only 별도 규칙으로 완전 비공개.

```jsonc
// users/{myUid}/private/friendData
{
  // 내가 정의한 그룹 목록 (일반형 — id+이름, 추후 N개 확장)
  "friendGroups": [
    { "id": "close",    "name": "가까운 친구", "order": 0 },
    { "id": "rounding", "name": "라운딩 멤버", "order": 1 }
  ],
  // 친구별 내 private 메타 (별명 + 소속 그룹). 친구 uid → 메타
  "friendMeta": {
    "<friendUid>":  { "customName": "정해인(동창)", "groupIds": ["close"] },
    "<friendUid2>": { "groupIds": ["rounding"] }
  }
}
```

- `friendGroups`: 신규/최초 접근 시 위 2개로 **lazy seed**. id는 안정 키(이름 바뀌어도 id 유지 → 글의 audienceGroupIds 안 깨짐).
- `friendMeta`: 기본 빈 객체. 미지정 친구는 메타 없음(= '친구 전체'에만 포함).
- **단일 문서** 채택: 공개범위 해석 시 **1 read**로 전체 친구 그룹 파악 → resolution 간단. 수백 명까지 1MB 여유. (대량 시 friendMeta만 별도 분할은 추후)

### 3.2 글(rounds) — 공개범위 확장

`rounds/{roundId}` 의 `visibility` 를 3값으로 확장 + 그룹 필드 2개 추가:

```jsonc
visibility: "friends" | "group" | "private",   // 기존 friends/private + group 신규
audienceUids: ["<uid>", ...],      // visibility=='group'일 때만. 작성 시점 해석된 수신자(스냅샷)
audienceGroupIds: ["close", ...]   // 원본 선택(수정 복원용). 라운지 selectedUids/audienceUids 패턴과 동일
```

- `friends`(친구 전체): `audienceUids` **미사용**(동적).
- `group`: `audienceUids` = 선택한 그룹들에 속한 친구 uid 합집합(스냅샷) + `audienceGroupIds` = 원본 그룹 선택.
- `private`: 둘 다 미사용.
- 라운지(roundups)는 **이미 audienceUids 보유** → 그룹은 거기에 그대로 환원(작업 작음).

## 4. 공개범위 해석 & 피드 쿼리

### 4.1 작성 시점 해석 (audienceUids 스냅샷)

```
사용자가 'group' + 선택 groupIds=[G] 고름
 → audienceUids = [ friendUid | friendMeta[friendUid].groupIds ∩ G ≠ ∅ ]   (내 friendMeta에서 산출)
 → round.visibility='group', round.audienceUids=위 결과, round.audienceGroupIds=G
```
빈 그룹(멤버 0명) 선택 시: 경고("이 그룹에 친구가 없어요") 후 본인만 보게 되거나 작성 차단(택1, §10 오픈이슈).

### 4.2 피드 로드 (loadFriendRounds 개편)

현행: `ownerUid==friend AND visibility=='friends'` 단일 쿼리.

개편(뷰어 me 기준): **2쿼리 병합** (Firestore OR 미지원):
```
Q1: ownerUid==friend AND visibility=='friends'              (친구 전체 글)
Q2: ownerUid==friend AND audienceUids array-contains me     (나를 포함한 그룹 글)
→ 합치고 date desc 정렬 (중복 없음: friends엔 audienceUids 없음)
```
- private 글은 둘 다 안 잡힘 → 안전.
- 인덱스 추가: `(ownerUid ASC, audienceUids ARRAY_CONTAINS, date DESC)`. 기존 `(ownerUid, visibility, date)` 유지.
- 페이지네이션: 현재 피드는 무페이징 전체 로드라 2쿼리 병합 무리 없음. (추후 페이징 도입 시 재설계)

## 5. Firestore 보안 규칙 변경

### 5.1 rounds read
```
allow read: if isSignedIn() && (
  resource.data.ownerUid == request.auth.uid
  || (resource.data.visibility == 'friends' && areFriends(request.auth.uid, resource.data.ownerUid))
  || (resource.data.visibility == 'group'   && request.auth.uid in resource.data.audienceUids)
);
```
- group 글은 audienceUids(작성자가 자기 친구 중에서 산출)에 포함된 사람만 read. areFriends는 audienceUids ⊆ 친구라 사실상 내포되나, 명시적으로 `uid in audienceUids`로 충분.

### 5.2 rounds create/update
```
visibility in ['friends','group','private']
group이면: audienceUids is list (본인이 만든 목록), ownerUid==me
update 시 ownerUid 변조 금지(현행 유지). audienceUids는 작성자만 수정.
```

### 5.3 친구 메타 서브컬렉션 (owner-only) — ★확정
`match /users/{uid}` read가 전면 개방(line 44-45)이고 서브컬렉션엔 상속 안 되므로, friendData는 별도 서브컬렉션 + 신규 규칙:
```
match /users/{uid}/private/{docId} {
  allow read, write: if isOwner(uid);
}
```
친구·제3자 모두 read 불가 → 별명·소속·그룹정의 완전 비공개. (validate 후 배포)

## 6. 화면 흐름

### 6.1 친구에 그룹·별명 지정
- **진입**: FriendProfile ⋯ 메뉴 → "그룹·별명 설정" (기존 알림/숨기기/끊기/차단 옆).
- **UI**: 별명 입력(TextInput, 비우면 닉네임) + 그룹 토글(가까운 친구 / 라운딩 멤버, 다중선택).
- **저장**: `users/{myUid}.friendMeta[friendUid] = { customName, groupIds }` (merge). owner-only.

### 6.2 글 작성 공개범위 (DiaryAddModal)
- 현행 visibility(friends/private) 선택 UI를 4선택지로 확장: 친구 전체 / 가까운 친구 / 라운딩 멤버 / 나만 보기.
- 그룹 선택 시 §4.1로 audienceUids 산출해 createRound에 전달.
- 수정 시 audienceGroupIds로 원래 선택 복원(라운지 패턴).

### 6.3 그룹 관리 (이름변경/생성)
- MyPage → 설정 → "친구 그룹 관리". v1은 기본 2개 **이름 변경**만 노출. 생성/삭제/쪼개기는 출시 후.

## 7. 친구 별명 (customName) 표시

- 헬퍼 `friendDisplayName(friendUid)` = `friendMeta[uid]?.customName || nickname`.
- **적용 범위(v1)**: 친구 맥락 화면 — FriendsTab 목록, FriendProfile 헤더, 친구 피드 카드, 동반자 선택(친구 부분).
- **제외**: 라운지 공개 노출(닉네임/마스킹 본명 정책 유지 [[realname-policy]]), 남이 보는 내 명함.
- customName은 내 private 라벨이라 **상대·제3자에겐 절대 안 보임**.

## 8. 마이그레이션

- 기존 `rounds`(visibility friends/private): **변경 없음**. 'friends' = '친구 전체'로 그대로 의미 유지.
- `friendGroups`: 최초 접근 시 lazy seed(2개). 기존 사용자도 자동.
- `friendMeta`: 빈 상태 시작 → 모든 친구 미그룹 = 현행과 동일(친구 전체만 보임).
- **파괴적 마이그레이션 없음.** 점진 적용.

## 9. 단계별 구현 계획 (피드 먼저, 단계 커밋)

| Phase | 내용 | 비고 |
|---|---|---|
| **A. 메타·UI 기반** | friendGroups seed + friendMeta(별명·그룹) 저장 + customName 표시 헬퍼·적용 + FriendProfile "그룹·별명 설정" editor + owner-only 규칙 | 공개범위 동작 X, 데이터·UI만. 회귀 적음 |
| **B. 피드 공개범위 동작** | rounds visibility 'group' + createRound/updateRound audienceUids 산출 + DiaryAddModal 4선택지 + loadFriendRounds 2쿼리 병합 + rounds 규칙·인덱스 배포 | 피드 실제 동작. 규칙·인덱스 배포 필수 |
| **C. 라운지 그룹 공개** | roundup 작성에 그룹 선택 → audienceUids(기존 필드 재사용) | 라운지는 audienceUids 보유라 작업 작음 |
| **D. 출시 후** | 그룹 생성/삭제/쪼개기(N개), '라운딩 멤버' 커스텀 분할 | v1 제외 |

각 Phase는 [[feedback-verify-before-deploy]] 따라 정적점검→커밋, 규칙은 validate 후 배포. 거대 혼합 커밋 금지.

## 10. 리스크 & 오픈 이슈 (착수 전 확정)

1. ~~users 문서 read 프라이버시~~ ✅**해결(2026-06-08)** — users read 전면 개방 확인(line 44-45, 공개 명함이라 의도). friendData를 `users/{uid}/private/friendData` owner-only 서브컬렉션으로 확정(§3.1·§5.3). 친구·아무에게도 안 샘.
2. **빈 그룹 글 작성** — 선택 그룹에 친구 0명일 때: 작성 차단 vs 본인만 보기 vs 경고 후 진행. (권장: 경고 + 본인만)
3. **2쿼리 병합 페이징** — 현재 무페이징이라 OK. 추후 피드 페이징 도입 시 재설계 필요.
4. **friendMeta map 크기** — 수백 명까진 OK. 그 이상이면 서브컬렉션.
5. **customName 적용 범위 경계** — 라운지/명함엔 미적용(닉네임·마스킹 유지) 재확인.
6. **그룹 삭제 시 글 처리(출시 후)** — 그룹 지워도 과거 글 audienceUids는 스냅샷이라 유지(안전). audienceGroupIds 깨진 참조만 무시.

---

### 다음 액션
§10-1(프라이버시) 해결됨 → friendData = `users/{uid}/private/friendData` owner-only 서브컬렉션 확정. **이 문서 OK면 Phase A 착수 가능.**
