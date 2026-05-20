# Firestore 스키마

## `users/{uid}`

| 필드 | 타입 | 비고 |
|---|---|---|
| `uid` | string | Auth UID |
| `displayName` | string | 표시 이름 |
| `kakaoId` | string? | 카카오 로그인 연동 ID |
| `mannerScore` | number | 매너 점수 (기본 70) |
| `hostedCount` | number | 주최 횟수 |
| `attendedCount` | number | 참여 횟수 |
| `isRestricted` | boolean | 이용 제한 여부 |
| **`ageGroup`** | `'20s' \| '30s' \| '40s' \| '50s' \| '60+'` | 본인 연령대 — 모집 필터 매칭용 |
| **`gender`** | `'male' \| 'female'` | 본인 성별 — 모집의 companion 매칭용 |
| **`avgScore`** | number? | 평균 타수 — skill 필터 매칭용 (다이어리 평균 자동 계산도 가능) |
| `avgScoreManual` | boolean? | true면 사용자가 직접 입력한 값, false면 다이어리 자동 계산 |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Skill 매핑 (avgScore → skill key):**
- `avgScore <= 80`  → `pro`
- `80 < avgScore <= 90` → `mid`
- `90 < avgScore <= 100` → `high`
- `avgScore > 100` → `beginner`

---

## `roundups/{postId}`

라운딩 모집글.

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | string | 문서 ID |
| `authorUid` | string | 주최자 uid (`users/{uid}` 참조) |
| `authorName` | string | 표시명 (denormalized) |
| `type` | `'fixed' \| 'open'` | 확정형 / 오픈형 |
| `course` | string? | 골프장명 (fixed만) |
| `courseKakaoId` | string? | 카카오 장소 ID |
| `date` | string? | `YYYY.MM.DD` (fixed만) |
| `day` | string? | 요일 한글 (fixed만) |
| `time` | string? | `HH:MM` (fixed만) |
| `teams` | number | 단체면 2~4, 개별이면 1 |
| `capacity` | number | 총 모집 인원 (`teams * 4` 또는 개별 인원) |
| `joined` | number? | 개별 모집 현재 인원 |
| `teamJoined` | number[]? | 단체 모집 팀별 인원 배열 |
| `participantUids` | string[] | 참여 확정된 사용자 uid 배열 (보안 규칙·정원 카운트용) |
| `waitlistUids` | string[] | 대기자 uid 배열 (순번 = 인덱스) |
| `scope` | `'all' \| 'friends' \| 'select'` | 공개범위 |
| `scopeAllowedUids` | string[]? | `scope === 'select'`일 때 노출 허용 uid 목록 |
| `closed` | boolean | 모집 마감 여부 |
| `word` | string | 한마디 |
| `kakaoOpenChatUrl` | string? | 카카오톡 오픈채팅 URL — 주최자 입력 |
| **`ageGroups`** | `('20s' \| '30s' \| '40s' \| '50s' \| '60+' \| 'any')[]` | 동반자 연령대 조건 (중복). `['any']`는 상관없음 |
| **`companion`** | `'any' \| 'male' \| 'female' \| 'couple' \| 'mixed'` | 동반자 구성 |
| **`skill`** | `'any' \| 'pro' \| 'mid' \| 'high' \| 'beginner'` | 실력 (평균 타수 기준) |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**필터 매칭 규칙 (클라이언트에서 신청 가능 여부 판단 시):**
- `ageGroups`에 `'any'` 포함 또는 신청자 `users.ageGroup`이 배열에 포함되면 통과
- `companion === 'any'` → 통과
- `companion === 'male' | 'female'` → 신청자 `gender`와 일치해야 통과
- `companion === 'couple'` → 두 명이 함께 신청 시 통과 (또는 단순 안내 라벨로만 쓰는 정책)
- `companion === 'mixed'` → 남녀 혼성 모집 (제한 없이 안내성)
- `skill === 'any'` → 통과
- 그 외 `skill`은 신청자 `avgScore`를 위 매핑으로 변환해 일치하면 통과

조건 불일치 시 — 강제 차단 vs. 경고만 노출 후 신청 허용 — 두 정책 중 정해야 함. 현재 클라이언트는 **경고만** 표시 추천 (운영 초기엔 마찰 적게).

---

## `roundupNotifications/{notiId}`

(이미 더미로 존재. 정식 정의는 모집 Firestore 연동 시.)

신청자 신뢰도 표시용 denormalized 필드:
- `actor` (이름), `actorHostedCount`, `actorMannerScore`

---

## Indexes (예상)

- `roundups` where `scope == 'all'` orderBy `createdAt desc`
- `roundups` where `participantUids array-contains <uid>` orderBy `date asc`
- `roundups` where `authorUid == <uid>` orderBy `createdAt desc`
- `roundups` where `ageGroups array-contains-any <[user.ageGroup, 'any']>` + 다른 필터 조합 — Firestore의 array-contains-any 제약(쿼리 1개당 1번)으로 클라이언트 필터링과 혼용 권장
