# Firestore 컬렉션 설계

명칭 통일 기준(2026-05): 골퍼 = `user`, 라운딩 1회 기록 = `round`.
구 `diaries`와 친구 `feed`는 **`rounds` 하나로 통합** — `ownerUid`로만 구분.

## 컬렉션 개요

| 컬렉션 | 역할 | 상태 |
|---|---|---|
| `users/{uid}` | 골퍼 프로필(명함). MY 탭 = 친구 프로필, 동일 스키마 | 신규 |
| `rounds/{roundId}` | 라운딩 1회 기록. 내 다이어리 = 친구 feed | 신규 |
| `friendships/{pairId}` | 친구 관계(신청·수락) | 신규 |
| `roundups/{postId}` | 라운딩 모집글 | 신규 |
| `roundupNotifications/{notiId}` | 모집 알림 | 신규 |
| `courseComments/{commentId}` | 골퍼 코멘트 | **운영 중** |
| `top100Courses/{courseId}` | 100대 코스 | **운영 중**(읽기 전용) |

> `schedules`(일정)·`userCourses`(추가 코스)는 현재 AsyncStorage 보관 — 추후 같은 owner-only 패턴으로 추가 가능. 현재 보안 규칙은 기본 거부.

---

## `users/{uid}`

문서 ID = Auth UID. MY 탭 명함과 친구 프로필 명함이 **같은 문서**를 렌더링한다.

| 필드 | 타입 | 비고 |
|---|---|---|
| `uid` | string | Auth UID (문서 ID와 동일) |
| `displayName` | string | 닉네임 |
| `avatarUrl` | string? | 프로필 사진 |
| `kakaoId` | string? | 카카오 연동 ID |
| `kakaoLinked` | boolean | 카카오 연동 여부 |
| `avgScore` | number? | 평균 타수 (skill 매칭·핸디 근거) |
| `avgScoreManual` | boolean? | true=직접 입력, false=rounds 자동 계산 |
| `lifeBest` | number? | 라이프 베스트 |
| `mannerScore` | number | 매너 점수 (기본 70) |
| `hostedCount` / `attendedCount` | number | 주최·참여 횟수 |
| `isRestricted` | boolean | 이용 제한 여부 |
| `ageGroup` | `'20s'~'60+'` | 모집 필터용 |
| `gender` | `'male'\|'female'` | 모집 companion 매칭용 |
| `blockedUsers` | string[] | 차단 uid 배열 |
| `blockCountToday` / `blockCountDate` | number / string? | 차단 한도(5/일) 카운터 |
| `lastNicknameChange` | timestamp? | 닉네임 변경 쿨다운 |
| `roundupMatch` | map? | 맞춤 모집 조건 |
| `createdAt` / `updatedAt` | timestamp | |

> 신뢰 등급·매너 등급은 **저장하지 않음** — `hostedCount`/`mannerScore`에서 클라이언트가 파생(`getTrustGrade`/`getMannerGrade`).
> 전화번호 등 민감 정보는 이 문서에 두지 말 것(읽기가 로그인 사용자 전체에 열려 있음).

---

## `rounds/{roundId}`

라운딩 1회 기록. 구 `diaries` + 친구 `feed`의 통합. `ownerUid`로 소유자 식별.

| 필드 | 타입 | 비고 |
|---|---|---|
| `ownerUid` | string | 기록 소유자 uid — **보안 규칙 핵심 키** |
| `visibility` | `'friends'\|'private'` | 친구 공개 / 나만 보기 |
| `date` / `day` | string | `YYYY.MM.DD` / 요일 |
| `course` | string | 골프장명 |
| `courseId` | string? | 코스 식별자 (코스 상세 연결) |
| `score` / `par` | number | 타수 / 파 (72) |
| `memo` | string | 한줄 메모 |
| `detailMemo` | string? | 상세 메모 |
| `weather` | string? | 그날 날씨 |
| `starRating` | number? | 별점 |
| `tags` | string[] | 코스 태그 |
| `cost` | map? | 골프 가계부 항목 |
| `photos` | string[] | 사진 — 현재 로컬 URI. Storage 이관은 별도 작업 |
| `companions` | `{name,isMe}[]` | 동반자 |
| `special` | string? | 홀인원·이글·알바트로스 등 (있으면 명예의 전당) |
| `specialHole/Par/Dist/Ball/Memo` | — | 특별한 순간 상세 |
| `createdAt` / `updatedAt` | timestamp | |

> **명예의 전당(특별한 순간)** 은 별도 컬렉션이 아니라 `rounds` 중 `special != null` 또는 `score <= 79`(퍼스트 싱글)인 것의 파생 뷰.
> 마이그레이션: AsyncStorage(`@dg_diaries`) → `rounds` 이전 시 각 문서에 `ownerUid`·`visibility` 필수 주입.

---

## `friendships/{pairId}`

친구 관계. **문서 ID는 두 uid를 정렬해 합친 `pairId`** — `(작은uid)_(큰uid)`.
이렇게 해야 보안 규칙이 ID를 계산해 친구 여부를 조회(`areFriends`)할 수 있다.

| 필드 | 타입 | 비고 |
|---|---|---|
| `users` | string[2] | 두 당사자 uid (정확히 2개) |
| `requesterUid` | string | 신청한 쪽 |
| `recipientUid` | string | 받은 쪽 |
| `status` | `'pending'\|'accepted'` | 수락 전/후 |
| `createdAt` / `updatedAt` | timestamp | |

흐름: 신청(`pending`) → 수신자가 수락(`accepted`). 거절·취소·끊기 = 문서 삭제.

---

## `roundups/{postId}`

라운딩 모집글. **공개범위 2단계** (`scope`).

| 필드 | 타입 | 비고 |
|---|---|---|
| `authorUid` / `authorName` | string | 주최자 uid / 표시명(denormalized) |
| `type` | `'fixed'\|'open'` | 확정형 / 오픈형 |
| `course` / `courseKakaoId` | string? | 골프장 (fixed) |
| `date` / `day` / `time` | string? | 일시 (fixed) |
| `teams` / `capacity` | number | 팀 수 / 총 정원 |
| `joined` / `teamJoined` | number / number[] | 현재 인원 |
| `participantUids` | string[] | 참여 확정 uid (정원·규칙용) |
| `waitlistUids` | string[] | 대기자 uid (순번=인덱스) |
| `scope` | `'all'\|'friends'` | **전체공개 / 친구공개** |
| `closed` | boolean | 마감 여부 |
| `word` | string | 한마디 |
| `kakaoOpenChatUrl` | string? | 오픈채팅 URL |
| `ageGroup` / `companion` / `skill` | string | 동반자 조건 필터 |
| `createdAt` / `updatedAt` | timestamp | |

> 기존 더미의 `scope:'select'`(특정인 지정)는 2단계 결정에 따라 **제거** — `DUMMY_POSTS`·`SCOPE_BADGE`에서 함께 정리 필요.

---

## `roundupNotifications/{notiId}`

| 필드 | 타입 | 비고 |
|---|---|---|
| `recipientUid` | string | 알림 받는 사람 — 보안 규칙 키 |
| `actorUid` / `actorName` | string | 알림 유발자 |
| `actorHostedCount` / `actorMannerScore` | number | 신뢰도 표시용 denormalize |
| `type` | string | apply/cancel/slotOpen/confirmed 등 |
| `postId` / `postTitle` | string | 대상 모집 |
| `status` | string? | apply의 pending 등 |
| `read` | boolean | 읽음 여부 |
| `createdAt` | timestamp | |

---

## `courseComments/{commentId}` (운영 중)

`{ courseId, text, authorUid, authorName, date, likes, likedBy[], createdAt }`
좋아요 토글 시 `likes`는 `likedBy.length`와 일치해야 함(규칙 강제).

## `top100Courses/{courseId}` (운영 중)

100대 코스. 시딩 완료 — 클라이언트 쓰기 차단(읽기 전용).

---

## 보안 규칙 요약 (`firestore.rules`)

| 컬렉션 | 읽기 | 쓰기 |
|---|---|---|
| `users` | 로그인 사용자 전체 | 본인 문서만 |
| `rounds` | 소유자 또는 (friends-공개 & 친구) | 소유자만(`ownerUid`) |
| `friendships` | 당사자 2명 | 신청=본인이 requester / 수락=수신자 / 삭제=당사자 |
| `roundups` | all=전체 / friends=친구·주최자 | 작성=주최자 / 수정=주최자(전체)+참여자(참여배열만) / 삭제=주최자 |
| `roundupNotifications` | 수신자 본인 | 생성=actor 본인 / 읽음처리=수신자 |
| `courseComments` | 로그인 사용자 전체 | 작성·삭제=작성자 / 좋아요=누구나(본인 토글만) |
| `top100Courses` | 로그인 사용자 전체 | 불가 |

**규칙은 필터가 아니다** — 목록 쿼리는 클라이언트가 직접 필터해야 통과:
- 내 기록: `rounds` where `ownerUid == 내uid`
- 친구 feed: `rounds` where `ownerUid == 친구uid` & `visibility == 'friends'`
- 전체 모집: `roundups` where `scope == 'all'`
- 친구 모집: `roundups` where `scope == 'friends'` & `authorUid == 친구uid`

## 한계 — Cloud Function 이관 권장

규칙만으로는 완전히 막지 못하는 부분:
- `roundups` 참여자 수정: "남의 uid를 건드리지 않음"까지는 보장 불가 → 정원 처리는 트랜잭션/Function로
- `roundupNotifications` 생성: 클라이언트 생성은 스팸 가능 → Function 생성으로

## 인덱스 (`firestore.indexes.json`)

복합 인덱스 5개: `rounds`(내 기록 / 친구 feed), `roundups`(전체 / 내 모집), `roundupNotifications`(알림함).
배포: `firebase deploy --only firestore:rules,firestore:indexes`
