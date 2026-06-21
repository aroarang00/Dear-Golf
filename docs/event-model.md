# 단체 라운딩 — 이벤트(우산) + 조(組) 모델 설계 스케치

> 작성 2026-06-22. 상태: 방향 확정 / 구현 전(스케치).
> 배경: 디데이 카드(교통·날씨·식사·체크인) 동선을 단체(다중 팀)까지 확장.
> 라운지 단체 모집은 `teams`(정원=teams×4)만 있고 **조 배정·조별 티오프가 없음**(RoundupDetail.js 주석에 명시) → 이를 닫는 것이 1차 목표.

## 1. 핵심 원칙
- **한 문서에 다 욱여넣지 않는다.** 단체 = 여러 **조(4인)**, 조마다 티오프가 다름.
- **조 = 기존 `scheduleGroups`(전파 일정) 그대로 재사용.** 배열 토글·수락/탈퇴 규칙을 새로 안 만든다.
- 그 위에 **얇은 이벤트 우산** 1겹만 추가해 조들을 묶는다.
- 개인 경험(자기 조 카드)은 그대로. 교통·날씨·체크인은 1인/구장 단위라 자동 확장.

## 1.5 진입점 — 2가지, 동일 모델로 수렴 (필수 요건)
단체/전파는 **두 곳**에서 시작되며 **같은 (이벤트 + 조) 구조**를 만든다:
1. **라운지 단체 모집 확정** — `teams=N` 모집 → 확정 시 조 편성 → 이벤트 생성. organizerUid = roundup.authorUid.
2. **홈 · 일정 캘린더의 일정 전파** — 내 일정에서 친구 초대(현행 `shareScheduleToFriends`). organizerUid = 일정 소유자(ownerUid).

**승격 규칙 (둘 다 동일):**
- 조 **0~1개** = 현행 4인 전파 그대로 — `scheduleGroups` 1건, **이벤트 미생성**(하위호환).
- 조 **2개 이상** = **`scheduleEvents` 우산 생성** + 조별 `scheduleGroups`.

즉 "4인 친구 일정"과 "단체"의 차이는 **단지 조가 1개냐 N개냐**. 진입점이 라운지든 전파든 **같은 코어**로 떨어진다. 차이는 트리거 UI와 organizerUid 출처뿐.

→ 라운지 확정 / 전파 인원이 4 초과되거나 사용자가 "여러 조로 나누기"를 택하면 **조 편성 시트 → 이벤트 승격**. 그 외(≤4)는 현행 경로 무변경.

## 2. 데이터 모델

### `scheduleEvents/{eventId}` (신규 — 얇은 우산)
```
organizerUid            // 주최자(총무/간사) — 단일 수정 권한
title                   // "○○동호회 정기전"
course, courseId, courseX/Y, courseLoc, courseKakaoId
date                    // 보통 같은 날 1개
roundupId | null        // 라운지에서 왔으면 연결
teams: [                // 조 배열
  { idx, teeTime|null, groupId, memberUids:[≤4] }   // teeTime 미정 허용
]
participantUids: [...]  // 전체(읽기 권한·쿼리용)
meal: {                 // 이벤트 식사(전체 회식) — 주최자 지정, 1곳. 없으면 null
  place:{name,x,y,kakaoId,loc}, note, decidedBy, decidedAt
} | null
createdAt, updatedAt
```

### 조(組) = 기존 `scheduleGroups/{groupId}`
- 변경 없음. 각 조 = 4인 그룹(memberUids ≤4 + 그 조의 time).
- 이벤트는 `teams[i].groupId`로 참조.

### 참가자 일정 = 기존 `schedules/{id}` (per-user)
- 추가 필드: `eventId`, `groupId`(=내 조), `time`(=내 조 티오프).
- **규칙 영향 0** — schedules는 오너 기반(필드 허용목록 없음, firestore.rules:67~73).
- → 각자 D-day 카드 = 자기 조 카드(자기 티오프). 카드 코드 거의 그대로.

> 신규 저장소는 `scheduleEvents` 하나. 나머지는 전부 재사용 + 필드 추가.

## 3. 권한 모델 (단체 = 주최자 단일 수정)
| 대상 | 권한 |
|---|---|
| 이벤트 레벨(조 배정·조별 티오프·구장·날짜·전체회식) | **주최자(organizerUid)만** |
| 참가자 본인 참가 취소 | **셀프 유지**(조용히 탈퇴, 기존과 동일) — 사람 가두지 않음 |
| 조 내부 내용(시간 등) | v1: 기존 4인 모델 그대로(편집 blast radius=그 조 4명). 후속에 주최자 잠금 옵션 |
| 조 내부 식사(옵션) | 조 단위 기존 식사 모델(조원 누구나) — 후순위 |

- 기존 4인 친구 일정은 **계속 "전원 동등"** 유지. `eventId` 유무로 두 모델 공존.

## 4. 식사 / 체크인 / 교통 레벨
| 항목 | 레벨 / 주체 |
|---|---|
| **식사(회식)** | **이벤트 레벨, 주최자가 1곳** (기본). 조별 식사는 옵션·후순위 |
| **체크인 카드** | **조 레벨** — 조마다 티오프·예약(booker)이 달라 각 조 카드에 그 조 예약자 |
| 교통·날씨 | 개인/구장 단위(그대로) |

→ **식사는 위로(이벤트·주최자), 체크인은 아래로(조).** 조별 식사 총대 공백 걱정 제거.

## 5. 핵심 플로우 (두 진입점 → 공통 조 편성 → 조별 카드)

### 5-A. 라운지 단체 확정
1. 모집(teams=N) → 참가자 flat 수집(현행 유지).
2. **[확정] 시: 조 편성 시트**(자동분할+수동이동, 조별 티오프 미정 허용).
3. 공통 코어(CF)로 생성.

### 5-B. 홈 · 일정 캘린더 전파
1. 내 일정 → 친구 초대(현행). **≤4면 현행 그대로(단일 조, 이벤트 없음).**
2. 5인 초과 / "여러 조로 나누기" 선택 시 → **같은 조 편성 시트** 진입.
3. 공통 코어(CF)로 승격(이벤트+조 생성).

### 공통 결과
- 서버(CF) 트랜잭션: event 1 + scheduleGroups N + 참가자별 schedule(자기 조 groupId·eventId·teeTime).
- 각자 **자기 조 카드** 노출. eventId 있으면 `단체 ○○ · N조` 배지.

## 6. Cloud Function (생성·수정은 서버에서)
> 이유: 조 생성 규칙 `memberUids == [내uid]`(firestore.rules:164)에 막혀, 주최자가 "자기가 없는 조"를 클라에서 못 만든다. **CF(Admin)로 처리 → 규칙을 느슨하게 풀 필요 없음(규칙 표면 안 늘어남).** roundup.js:21 "정원 처리 CF 이관 권장"과도 일치.

```
// ★공통 코어 — 라운지/전파 둘 다 이걸 부른다(중복 로직 없음)
createGroupEvent({
  source: 'roundup' | 'schedule',   // 진입점
  sourceId,                          // roundupId 또는 ownerSchedule id
  organizerUid,                      // roundup=author / schedule=ownerUid (CF가 source로 검증)
  course, courseId, courseX/Y, date, title,
  teams: [{ teeTime|null, memberUids:[≤4] }],
})
  // 권한: source='roundup' → caller==roundup.authorUid
  //       source='schedule' → caller==schedule.ownerUid
  // 트랜잭션: scheduleEvents 생성 + 조별 scheduleGroups 생성
  //          + 참가자별 schedules upsert(eventId·groupId·teeTime)
  // 알림: 참가자별 1푸시(자기 조·티오프)

updateEventTeams({ eventId, teams })   // 주최자만 — 조/시간 재배정
setEventMeal({ eventId, place, note }) // 주최자만 — 전체 회식 지정
```
- 라운지 확정은 `createGroupEvent({source:'roundup', ...})`, 전파 승격은 `({source:'schedule', ...})`로 **동일 코어 호출**. 진입점별 래퍼만 얇게.

## 7. 보안 규칙 초안
### 신규 — `scheduleEvents` (단순 오너, 배열 교차검증 없음)
```
match /scheduleEvents/{eventId} {
  allow read:   if signedIn() &&
                (auth.uid == resource.data.organizerUid ||
                 auth.uid in resource.data.participantUids);
  allow create, update, delete: if signedIn() &&
                request.resource.data.organizerUid == auth.uid &&
                resource.data.organizerUid == auth.uid;   // (create는 request 측만)
  // 단, 실제 생성/조배정은 CF(Admin)로 — 클라 직접쓰기는 메타 정도로 최소화
}
```
### 영향 점검
| 대상 | 규칙 작업 |
|---|---|
| schedules (eventId 등) | 없음 (오너 기반) |
| 조 = scheduleGroups | 없음 (재사용) |
| scheduleEvents | 단순 오너 규칙 1세트 추가 |
| 조 생성(주최자) | CF 처리 → 클라 규칙 추가 불필요 |

### 안전장치
- 새 `scheduleEvents` 규칙 → **GitHub Actions 규칙 회귀 테스트** 케이스 추가 후 머지(로컬 Java 없음).
- 배포 전 **실데이터로 합법 동작 false-denial 선제 점검**.

## 8. UI 변경점
- **조 편성 시트**(확정 시): 자동분할 + 수동 이동 + 조별 티오프 입력.
- **D-day 카드**: `단체 ○○ · N조` 배지(eventId), time=내 조 티오프(기존 필드 그대로).
- **이벤트 식사**: 기존 식사 UI를 "이벤트 회식" 모드로 재사용(주최자 지정, audience=전체).
- **조직자 오버뷰**(Phase 2): 전 조 시간·인원·식사/체크인 상태 한눈에.

## 9. 단계별 로드맵
- **Phase 0** — 스키마/필드(`scheduleEvents`, `eventId`) + **공통 코어 CF `createGroupEvent`** + 조 편성 시트(공용 컴포넌트).
- **Phase 1 ★** — 두 진입점 연결: (a) 라운지 확정 → 조 편성, (b) 홈·캘린더 전파 5인+ → 조 편성. 둘 다 공통 코어 호출. *gap 닫는 최고가치.*
- **Phase 2** — 조직자 오버뷰.
- **Phase 3** — 횡단(전체 공지·단체 회식 고도화·조 재배정).
- **Phase 4** — 라운지 밖 수동 단체 생성 + 공동 주최자/위임.

## 10. 확정된 결정
1. 카드는 **티오프(조)별 생성** — 기존 4인 모델 재사용.
2. 단체화 = **얇은 이벤트 우산** + 조들 묶기(한 문서에 안 넣음).
3. **주최자 단일 수정**(이벤트 레벨). 참가 취소는 셀프, 조 식사/체크인은 조 단위.
4. **식사=이벤트(주최자 1곳 회식)**, **체크인=조별**.
5. 조 편성 티오프 **미정 허용**(예약 확정 후 입력), 조 인원 **≤4 가변**.
6. 생성/조배정은 **CF(서버)** — 규칙 단순 유지.
7. 시작은 **Phase 1**부터.
8. **두 진입점(라운지 확정 / 홈·캘린더 전파) 모두 동일 모델**로 수렴 — 공통 코어 `createGroupEvent` 사용. 조 ≤1=현행, 2+=이벤트 승격.

## 11. 리스크 & 완화
- 주최자 단일점 → 후속 공동 주최자/위임(Phase 4).
- 조 내용 desync(조원이 조 시간 수정) → v1 허용(blast radius=4), 필요시 주최자 잠금.
- 알림 스팸 → "내 조 변경 시 그 조만" 팬아웃, 전체 공지는 집계.
- 규칙 false-denial → CI 테스트 + 실데이터 선제 점검.

## 12. 미해결 / 후속 논의
- 체크인 booker: 조별 예약자 입력 UX(단일 예약 vs 조별).
- 조별 식사 옵션의 진입점(필요 시).
- 단체 취소(주최자 전체 취소) 알림 정책.
