# Firestore 규칙 대조표 (firestore.rules)

규칙을 바꾸기 전 이 표와 먼저 대조해 모순/false-denial을 점검한다.
(`me` = `request.auth.uid`, 모든 경로 **로그인 필수**, 미명시 경로는 **기본 거부**.)
회귀 테스트: `test/rules/firestore-rules.test.mjs` (CI: `.github/workflows/firestore-rules.yml`).

## 일정·동반자 핵심

| 컬렉션 | read | create | update | delete |
|---|---|---|---|---|
| **schedules** | 본인(ownerUid) | 본인 | 본인 (ownerUid 변조X) | 본인 |
| **scheduleGroups** | member·audience (+신규 get) | initiator, member=[me]·declined=[] | ①초대: **member or initiator** → audience/names 추가·declined 제거만 ②내용: member or initiator → time/members/booker/subCourse ③수락: audience가 member 자기토글 ④거절: audience가 declined 자기토글 ⑤탈퇴: member가 자기 member제거+declined추가 | initiator |
| **mealSuggestions** | author·audience·(모집 참여자) | author, decided=true | 장소·메모: author or hostUid / 이탈: audience 자기제거 | author or hostUid |
| **roundScoreShares** | author·audience | author, responded=[] | audience가 responded 자기토글 | author |

## 모집·친구·소셜

| 컬렉션 | read | create | update | delete |
|---|---|---|---|---|
| **roundups** | all공개·author·(friends&친구)·(select&audience)·참여자 | author, scope∈friends/select | author(전체) / 참여자(participant·waitlist·joined·closed→false 자기토글) / likedBy 자기토글 | author |
| ┗ comments | 로그인 누구나 | author, body≤300 | pinned/pinnedAt만 | author |
| **roundupApplications** | applicant·author (+신규 get) | applicant, pending, ID일치 | 주최자(→accept/reject)·신청자(→cancel)·신청자(재신청→pending) | ✕(CF) |
| **friendships** | 당사자 (+신규 get) | requester, pending, pairId일치 | recipient가 pending→accepted | 당사자 누구나 |
| **roundupNotifications** | recipient | actor 본인, recipient≠me | recipient가 read만 | recipient |
| **courseComments** | 로그인 누구나 | author, likes=0 | author(전체)·좋아요(likedBy 토글+likes±1) | author |
| **courseRatings** | 로그인 누구나 | 본인, ID일치, 점수1~5 | 본인, 점수검증 | 본인 |

## DM

| 컬렉션 | read | create | update | delete |
|---|---|---|---|---|
| **conversations** | 참여자 (+신규 get) | 참여자2명, pairId, **친구** | 메타(lastMessage…): 참여자&친구&**비차단** / 읽음(lastRead·unread)·타이핑·clearedAt: 본인 키만 | ✕ |
| ┗ messages | 참여자 | sender 본인&참여자&**친구&비차단**, body≤2000, replyTo검증 | reactions 본인 키만(친구&비차단) | sender 본인 |

## 신고·규제·기타 (대부분 작성 후 변조·삭제 불가 = CF만)

| 컬렉션 | read | create | update/delete |
|---|---|---|---|
| **users** | 로그인 누구나 | 본인(uid일치) | update=본인 / delete=본인 · `private/*`=본인만 |
| **rounds** | 본인·(friends&친구)·(group&audience) | 본인, visibility∈friends/group/private | 본인(전체)·좋아요 자기토글 / delete=본인 |
| **mannerEvaluations** | evaluator 본인 (+신규 get) | evaluator, target≠me, ID일치 | **둘 다 ✕** |
| **noshowReports** | reporter·reported | reporter, pending_grace_period | 신고자취소·피신고자소명만 / delete ✕ |
| **content_reports / reports** | reporter 본인 | reporter, target≠me | **둘 다 ✕** |
| **locationAccessLogs** | owner | owner | update ✕ / delete=owner |
| **banned_users** | 로그인 누구나 | 본인 sub일치 | **둘 다 ✕** |
| **top100Courses / golfCourses** | 로그인 누구나 | — | **write 전부 ✕**(관리자 시딩) |

## 반복 패턴 (헷갈릴 때 체크포인트)
- **`selfMembershipToggled(field)`**: 배열에서 *내 uid만* 추가/제거했는지 — participant/member/likedBy/responded 등.
- **`changedKeysWithin([...])`**: 그 write가 *허용 키만* 건드렸는지 — 한 write에 다른 키 섞이면 거부(예: 초대+인원증가 동시 ✕ → 분리 write로).
- **`resource == null` get 가드**: 결정적 ID 문서(scheduleGroups·friendships·roundupApplications·conversations·mannerEvaluations·content_reports…)는 *존재확인 get* 허용.
- **문서 간 조회**(`areFriends`[friendships], `dmBlockedBetween`[users.blockedUids], 식사→모집 참여자, DM replyTo 원본): 읽기 비용·결합도↑. **array-contains 쿼리엔 `areFriends`를 쓰지 말 것**(쿼리 통째 거부 유발).

## 설계 방침 (2026-06-20)
새 규칙은 촘촘하게 막아 합법 동작을 깨거나 false-denial·복잡도 위험이 생기면 **그 위험을 안고 만들지 말고 조건을 완화해 우회**한다. 신뢰 친구·저위험 협업 기능은 완화·허용 우선. 단 진짜 민감한 것(banned_users·reports·정지·매너평가 변조·결제)은 그대로 명확히 차단(에러 없이).
