# 확대(디스플레이 줌)·접근성 대응 — 레이아웃 견고화 감사/계획

> 2026-06-22. 배경: iPhone 16 테스터(디스플레이 확대 ON)에서 홈 코스 코멘트 박스 하단 잘림·DM 버튼 우측 쏠림·비율 깨짐. 중장년 골퍼 사용자층이 확대를 자주 써서 **앱 퀄리티 문제** → 전 화면 견고화 필요.

## 메커니즘(정확히)
- **디스플레이 확대(iOS Display Zoom / 안드 화면 크기)** = 앱이 받는 **논리 해상도(pt)가 작아짐**(예: 852pt 높이 → ~693pt). 고정 pt 레이아웃 합계는 그대로라 줄어든 화면을 **넘쳐서 하단 잘림**.
  - 해결: 화면이 **세로 스크롤** 되거나, **고정 높이가 유연**(축소 가능)해야 함.
  - ⚠️ `lineHeight: 21` → `fs(21)` 변경은 **확대엔 무효**(둘 다 pt, 같이 줄어듦). 그건 *글꼴 확대(Dynamic Type/allowFontScaling)* 용 별개 이슈.
- **글꼴 확대(Dynamic Type)** = `allowFontScaling`(기본 true)로 폰트만 커짐. fs()는 정적이라 Dynamic Type에 반응 안 함 → 폰트만 커지고 lineHeight·박스 고정이면 클리핑. (별도 레버: allowFontScaling 정책 결정 필요)

→ **이번 보고 케이스는 디스플레이 확대** = 스크롤/유연 높이가 핵심.

## 우선 수정(확대에 실제 영향) — High
- **홈 루트가 세로 스크롤 아님** (`HomeScreen.js` 헤더 + `flex:1` 스페이서 + `bottomArea`, 바닥 고정) → 줄면 하단 카드/메모 컷. **핵심.**
- **`homeS.js:10 CARD_H` 고정 높이** (mainCard·subCard·D-0 전폭 카드 inline) → 줄어든 화면서 과대. 유연화 필요.
- **`homeS.js:36/49 memoCard·commentCard` `overflow:'hidden'`** → 넘침 컷.

## 화면별 점검(감사) — 우선순위순
- **HomeScreen** (High) — 위 3건.
- **DiaryAddModal / ScheduleModal / 각종 Modal·시트** — 내부 ScrollView 있는지, maxHeight + 스크롤 보장. 모달은 보통 스크롤 있어 상대적 안전(확인 필요).
- **DiaryDetail·FriendProfile·GuideScreen** — 대체로 ScrollView 기반(확인).
- **카드형 고정높이**: `dS.js:72 photoBottomOverlay height:50`, `dS.js:61 hofCell minHeight:64`, `trS.js:42/49/51 버튼 height:44` 등 — 콘텐츠 텍스트 들어가는 곳만 minHeight/패딩화.
- **헤더 절대/고정 위치**: DM 버튼·설정 아이콘 등 → flex 기반(폭 줄어도 안 쏠리게).

## 접근법(중요)
1. **화면별로**, **정상(기본) 표시 깨지지 않게** 하면서 **확대 시 스크롤/축소**되도록.
2. **확대 켠 기기로 검증 필수** — JS 레이아웃이라 dev(Metro)에서 디스플레이 확대 ON 기기로 Fast Refresh 확인 가능(EAS 리빌드 없이도 됨). 최종은 TestFlight 빌드로 재확인.
3. **단계(Pass)별** 진행 — 한 번에 전부 블라인드 수정 금지(정상 레이아웃 회귀 위험).

## 단계 계획
- **Pass 1 — 홈**: bottomArea를 줄어든 높이에 맞게(세로 스크롤 가능 또는 카드/메모 높이 유연화) + DM 버튼 flex. 확대 ON 검증.
- **Pass 2 — 모달/시트**: 전수 ScrollView·maxHeight 보장.
- **Pass 3 — 카드 고정높이/헤더 절대위치** 일괄 유연화.
- **Pass 4 — (정책) allowFontScaling** — 글꼴 확대까지 대응할지 결정(접근성 vs 레이아웃).

## 미결 결정
- 홈 바닥고정 디자인 유지하면서 스크롤 도입 방식(스페이서+ScrollView) vs 카드 높이를 가용공간 비례로 축소 — Pass 1에서 택1.
- allowFontScaling 정책(글꼴 확대 사용자 대응 범위).
