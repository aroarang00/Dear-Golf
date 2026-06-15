# 동반자(Companion) 기능 설계 노트 / 프리모템

> 목적: 동반자 기능을 **데이터 정합성 사고 없이** 올리기 위한 사전 설계.
> 방금 마친 "일정·캘린더·모집·라운딩 기록 정합성 정리"(커밋 `0b42173`, `055abe5`) 위에 쌓는다.
> 관련 메모리: data-integrity-principles, roundup-schedule-sync, round-score-autofill,
> diary-companion-matching, friend-add-feature, users-doc-uid-required.

---

## 1. 한 줄 요약 / 위험 등급

동반자는 본질이 **여러 계정 사이의 데이터 전파**다. 단일 사용자 안의 일정↔기록↔캘린더 연결
(방금 고친 것)의 **곱하기 버전**이라, 같은 종류의 버그(중복·desync·고아·식별자 어긋남)가
사람 수만큼 곱해진다. → **순진하게(클라가 양쪽 쓰기) 붙이면 재발 거의 확정. 고위험.**

핵심 한 문장: **"cross-user 쓰기는 클라이언트가 하지 않는다. Cloud Functions(서버 권위)만 한다."**

---

## 2. 현재 상태 (사실)

- **일정(schedules)**: `companions: [{ name, friendUid? }]`
  - 친구 선택 → `{name, friendUid}`, 자유 입력 → `{name}` (ScheduleModal에서 캡처)
  - 동반자 doc은 **작성자(ownerUid) 일정에만** 저장됨. 동반자 계정엔 전파 X.
- **라운딩 기록(rounds)**: `companions: [{ name, isMe, friendUid? }]`
  - ✅ **friendUid 캡처됨** (Phase A, 2026-06-16 `176459b`). DiaryAddModal '친구에서 선택' → friendUid 저장.
    일정과 대칭 완료. DiaryDetail은 friendUid→별명(friendMeta) 해석으로 표시.
- **모집 확정 → 일정**: 작성자/참여자 각 클라가 자기 일정 1회 생성(생성만, 갱신 없음).
  멱등 가드 추가됨(roundupId). 동반자 일정 전파는 **미구현**.
- **전파/자동완성**: 전부 미구현. round-score-autofill(한 명 입력→전원 자동완성)은 Phase 3 예정.

---

## 3. 기능 스코프 (무엇을 "동반자 기능"이라 부르나)

3단계로 나눠 생각한다. 위로 갈수록 cross-user 전파가 깊어지고 위험이 커진다.

- **L0 — 표시만 (현재)**: 동반자 이름을 내 일정·기록에 라벨로 보관. 전파 없음. (저위험)
- **L1 — 연결/매칭**: 동반자가 디어골프 유저면 friendUid로 묶어 프로필·매칭에 활용
  (diary-companion-matching). 읽기 위주. (중위험)
- **L2 — 전파/자동완성**: 한 명이 만든 일정·기록을 **동반자 계정에도** 반영
  (일정 자동 추가, 스코어 전원 자동완성). **쓰기 cross-user**. (고위험 — 본 노트의 주 대상)

---

## 4. 설계 원칙 (재발 방지 4대 방어선)

1. **서버 권위 전파 (Cloud Functions only)**
   - 동반자 계정에 일정/기록을 쓰는 건 **반드시 CF**. 각 클라가 상대 데이터를 추측 쓰기 금지.
   - 클라는 "초대/제안"만 남기고, 수락·생성·전파는 CF가 트랜잭션으로 처리.
2. **멱등 키 (idempotency key)**
   - 모든 전파 산출물에 결정적 키. 예: 일정 `propagationId = {sourceScheduleId}:{recipientUid}`,
     기록 `roundLink = {sourceRoundId}:{recipientUid}`. 재시도·중복 이벤트에도 1건만.
3. **단일 소스 + 1:1 매칭 재사용**
   - 캘린더는 SchedulesContext 단일화 그대로 (전파로 생긴 일정도 add를 거치면 캘린더 자동).
   - 일정↔기록 1:1 매칭(scheduleId 우선 + dangling은 course+date)도 그대로 재사용.
4. **수락 게이트 (동의 없는 강제 쓰기 금지)**
   - 남이 내 계정에 기록/일정을 **수락 없이** 만들지 못한다. 항상 수신자 수락 후 생성.
   - 프라이버시·오기록·분쟁(legal-risk-first) 방지.

---

## 5. 전파 시나리오별 설계

### 5-1. 일정 동반자 지정 → 동반자 일정 생성 (L2)
- 클라: 일정 저장 시 `companions[].friendUid` 보존(이미 됨).
- CF(onScheduleWrite 또는 명시 호출): friendUid 동반자에게 **초대 알림** 생성.
  수락 시 CF가 수신자 일정 생성(멱등 키 `srcSchedId:recipUid`, ownerUid=수신자, `sourceScheduleId` 보존).
- 취소/날짜변경: 원본 변경 시 CF가 전파본도 갱신/철회 (멱등 키로 찾아 1:1).

### 5-2. 스코어 한 명 입력 → 전원 자동완성 (L2, round-score-autofill)
- 입력자: round 저장 + `companions[].friendUid` 필요(← **현재 rounds엔 friendUid 없음. 추가 필요**).
- CF: friendUid 동반자에게 "기록 공유" 제안. 수락 시 **수신자 본인 기록 생성**
  (자기 스코어만 자기 값으로, 멱등 키 `srcRoundId:recipUid`).
- 절대 금지: 수락 없이 남의 기록 자동 생성. 잘못된 스코어 강제 기록 = 신뢰 붕괴.

### 5-3. 수락/거절/탈퇴
- 거절: 전파본 생성 안 함(또는 철회). 원본은 그대로.
- 친구 끊기/탈퇴: friendUid 무효화 → 새 전파 중단. 기존 전파본은 각자 소유로 유지(고아 아님).

### 5-4. 취소 전파
- 원본 일정/기록 삭제 → CF가 멱등 키로 전파본 추적해 철회.
  단, **수신자가 이미 기록한 라운딩은 보호**(방금 D 정책과 동일: 기록 연결 시 자동 삭제 X).

---

## 6. 데이터 모델 변경 (예상)

- `rounds.companions`: `[{ name, isMe, friendUid? }]` — **friendUid 추가** (5-2 전제).
- 전파본 표식: 일정/기록에 `sourceScheduleId` / `sourceRoundId`, `propagatedBy(uid)` 필드.
- 멱등 보장용: 전파본 문서 ID에 멱등 키를 직접 사용(addDoc 랜덤 ID 대신 setDoc(결정적 ID)).
  → resource==null read 규칙 함정 주의(firestore-resource-null-pattern 메모리).

---

## 7. 프리모템 — "6개월 뒤 터졌다, 왜?" (예상 실패 + 차단책)

| 예상 실패 | 원인 | 차단책 |
|---|---|---|
| 동반자 일정/기록 중복 N개 | 클라 양쪽 쓰기 + 경합, 재시도 | CF 단일 처리 + 멱등 키 |
| 한쪽만 반영(desync) | 클라가 A는 쓰고 B 실패 | CF 트랜잭션(원자적) |
| 남이 내 계정에 멋대로 기록 | 수락 게이트 없음 | 수신자 수락 후에만 생성 |
| 취소했는데 동반자 일정 남음(고아) | 전파본 추적 불가 | sourceId + 멱등 키로 1:1 철회 |
| 잘못된 스코어가 전원에 박힘 | 입력자 값 그대로 복사 | 자기 스코어만, 수락 시 검토 |
| 친구 끊긴 뒤에도 전파 | friendUid 유효성 미검사 | 전파 직전 친구관계 재확인 |
| uid 흔들려 엉뚱한 계정에 전파 | 익명↔카카오 settle 전 실행 | uid 안정화 후에만(auth-relink) |

## 7-1. 신규 기능 7문항 체크리스트 (data-integrity-principles)
1. 동시·중복 실행에도 결과가 같은가? (멱등 키 O)
2. 부분 실패 시 비대칭이 남는가? (CF 트랜잭션으로 차단)
3. 누가 쓰기 권한? (CF·본인만, firestore.rules)
4. 취소·역연산이 1:1로 추적되나? (sourceId)
5. uid 불안정 구간에서 안전한가? (안정화 후 실행)
6. 수신자 동의가 전제인가? (수락 게이트)
7. 실패·이상을 관측하나? (CF 로그·모니터링)

---

## 8. 단계적 롤아웃 (안정화 우선)

- **Phase A (지금 가능)**: L0/L1 — friendUid 캡처를 rounds에도 통일, 표시·매칭만. 전파 없음.
- **Phase B (CF 인프라 후)**: L2 일정 전파 (수락 게이트 + 멱등). 1구장부터.
- **Phase C**: L2 스코어 자동완성. 가장 민감 → 마지막.
- 각 Phase: 정적 점검 → 에뮬레이터 → 2계정 E2E (verify-before-deploy).

---

## 9. 미해결 결정 사항 (구현 전 합의)

- [ ] 자동완성 범위: 일정만? 스코어까지? (B는 가능, C는 민감)
- [x] 비유저 동반자(이름만)는 표시만 유지로 확정? → **YES (2026-06-16). 초대는 friend-add 경로로 별도, 동반자 입력에선 라벨만.**
- [ ] 전파본을 수신자가 수정/삭제하면 원본과의 관계는? (독립 소유 권장)
- [ ] 친구 아닌 동반자(전화번호/이름만)도 초대 가능하게? (friend-add-feature와 정합)
- [ ] 모집(roundup) 동반자와 일정 동반자를 같은 모델로 통합할지

---

## 10. 착수 결정 (2026-06-16, 사용자 합의)

사용자 요청="친구끼리 스코어 공유"(= L2 5-2 = Phase C). 코드 실측 결과 전제 전무
(rounds friendUid 없음 · 전파 CF 없음 · uid 안정화 미완). 건너뛰기 불가라 **Phase A부터** 합의.

**✅ Phase A 완료 (2026-06-16, `176459b`)** — 캡처+표시 라벨, 전파 X:
   친구선택 friendUid 캡처(DiaryAddModal)·상세 별명 표시·friendMeta 신선도 수정 완료, 기기 검증됨.
   다음 착수 = Phase B(uid 안정화 검증 선행 → CF 일정 전파).

**Phase A 확정 범위 (캡처+표시 라벨만, 전파 X):**
1. DiaryAddModal 동반자 입력에 친구 선택 추가(ScheduleModal·FriendSelectModal 패턴 재사용)
   → `rounds.companions: [{name, isMe, friendUid?}]` (이름만 기록과 하위호환).
2. 기록 카드에 동반자 표시(라벨). 비유저 동반자는 이름만.
3. **"함께 라운딩 N회" 교집합 카운트는 보류** — friendUid 쌓이기 전이라 과소집계.
   캡처로 데이터 쌓인 뒤 별도로 켠다([[diary-companion-matching]]).
- 다음 단계: Phase B(CF 일정 전파+수락게이트) → Phase C(스코어 자동완성). B/C 착수 전 **uid 안정화 검증 필수**.

---

_작성 시점: 정합성 정리 직후. 구현은 본 노트 합의 → Phase A부터._
