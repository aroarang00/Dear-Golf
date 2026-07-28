import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, Linking, ActivityIndicator, Platform, Keyboard } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { C, F, fs } from '../constants/colors';
import { AttentionMotion } from './common/AttentionMotion'; // '함께 식사하기' 살랑 모션(결정 전만)
import { Icon } from './common/Icon'; // 커스텀 아이콘 — 식사 🍲 → bowl
import { searchNearbyRestaurants, searchRestaurantsByKeyword, coord2region } from '../utils/kakao';
import { getSavedRestaurants, addSavedRestaurant } from '../utils/savedRestaurants';
import { RestaurantSaveModal } from './RestaurantSaveModal';   // 저장 모달 — 코스 맛집 탭과 같은 것(메모까지 동일)
import { naverFoodListUrl } from '../utils/naverMap';   // 구장 주변 맛집 '리스트'로 열기
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { searchGolfCourses, getGolfCourses } from '../utils/golfCourses';
import { findCourseByName } from '../utils/courseNameKey';   // 일정 구장명 → 우리 DB 구장명(서랍 키 일치)
import {
  proposeMeal, updateMealNote, deleteMeal,
  subscribeMealForSchedule, subscribeIncomingMeals,
} from '../utils/mealSuggestions';
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadRoundup } from '../utils/roundup';
import { friendDisplayName } from '../utils/friendGroups';   // 별명(customName) 우선 이름 해석
import { showAppAlert, AppAlertHost } from './AppAlert';      // 앱 커스텀 알럿(시스템 다이얼로그 대신)
import { loadPrivateProfile } from '../utils/privateProfile'; // 저장된 목적지(집·회사) 좌표
import { destinationBadge } from '../utils/mealDirection'; // 목적지 방향/길목 뱃지
import { RestaurantDetailSheet } from './RestaurantDetailSheet'; // 앱 내 식당 상세(카카오 place 웹뷰)

// 라운딩 코스 좌표 해석 — ①일정에 박힌 좌표(전파·모집은 계정독립 courseX/Y 보유) ②courseId(userCourses) ③이름검색 순.
//   기존엔 ①을 안 써서 courseId 없는 전파/모집 일정에서 '구장 못 찾음'이 잦았음. 주변 맛집 검색용.
async function resolveCoord(schedule) {
  if (Number.isFinite(schedule?.courseX) && Number.isFinite(schedule?.courseY)) {
    return { x: schedule.courseX, y: schedule.courseY };   // x=경도, y=위도 (카카오 규약)
  }
  try {
    if (schedule?.courseId) {
      const c = await findUserCourseById(schedule.courseId);
      if (c) {
        const withCoord = (Number.isFinite(c.x) && Number.isFinite(c.y)) ? c : await ensureCourseCoord(c);
        if (withCoord && Number.isFinite(withCoord.x)) return { x: withCoord.x, y: withCoord.y };
      }
    }
    if (schedule?.course) {
      const results = await searchGolfCourses(schedule.course);
      if (results?.[0] && Number.isFinite(results[0].x)) return { x: results[0].x, y: results[0].y };
    }
  } catch { /* 좌표 못 구하면 검색만 비활성 */ }
  return null;
}

// 함께 식사 — 카드 버튼(귀가교통 옆) + 팝업. ([[afterround-meal-decision]])
//  D-0 종일 노출(전/후 무관). 총대가 식사 최대 2곳(슬롯 1·2) 선착순 결정, 각 슬롯에 메모(예: "아침 9시까지").
//  슬롯 데이터=결정적 ID 2개(meal_{key}·meal_{key}_2). 동반자는 audienceUids로 발견·길찾기.
// triggerless=true: 트리거 버튼 없이 시트(Modal)만 렌더 — 부모가 autoOpen으로 연다(일정캘린더처럼 일정 시트의 '함께 식사' 행에서 호출).
export function MealDecisionBar({ schedule, uid, nickname, active, autoOpen, onAutoOpened, onClose, flex = 1, block = false, triggerless = false, friendMeta = {} }) {
  const insets = useSafeAreaInsets();
  const [mine1, setMine1] = useState(null);       // 총대 본인 슬롯1 문서
  const [mine2, setMine2] = useState(null);       // 총대 본인 슬롯2 문서
  const [incoming, setIncoming] = useState([]);   // 동반자로 받은 제안(양 슬롯)
  const [open, setOpen] = useState(false);
  // 시트 닫힘(열림→닫힘)을 부모에 통지 — 일정 시트에서 연 경우(triggerless) 부모가 그 일정 시트를 다시 열어 복귀.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (prevOpenRef.current && !open) onClose && onClose();
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [coord, setCoord] = useState(null);
  const [dest, setDest] = useState(null);   // 목적지(집 우선, 없으면 회사) { x, y, region } — 귀가 동선 방향 뱃지용
  const [list, setList] = useState([]);
  const [detailPlace, setDetailPlace] = useState(null);   // 인앱 상세 시트 대상 식당
  const [detailBadge, setDetailBadge] = useState(null);   // 상세 시트 헤더에 표시할 방향 뱃지 { text, fg }
  const [saveSeed, setSaveSeed] = useState(null);         // 맛집 저장 모달 대상(코스 맛집과 같은 저장소·같은 모달)
  // 저장 맛집 서랍 키 — 일정에 적힌 구장명이 우리 DB 표기와 다를 수 있어(예약 문자 AI 등록 등)
  //   DB 이름으로 맞춘 뒤 읽고 쓴다. 코스 화면은 DB 이름을 쓰므로, 이걸 맞춰야 두 화면이 같은 서랍을 본다
  //   (2026-07-22: '힐마루골프앤리조트포천'으로 저장돼 코스 맛집에 안 보이던 문제).
  const [courseKeyName, setCourseKeyName] = useState(schedule?.course || '');
  useEffect(() => {
    let alive = true;
    const raw = schedule?.course || '';
    setCourseKeyName(raw);
    if (!raw) return;
    getGolfCourses().then(all => {
      if (!alive) return;
      const hit = findCourseByName(all, raw);
      if (hit?.name) setCourseKeyName(hit.name);
    }).catch(() => {});
    return () => { alive = false; };
  }, [schedule?.course]);
  // 저장된 목적지 로드 — 라운딩 후 귀가 동선 기준. 집(departure) 우선, 없으면 회사(work).
  useEffect(() => {
    if (!uid) { setDest(null); return; }
    let alive = true;
    loadPrivateProfile(uid).then(p => {
      if (!alive || !p) return;
      const hasHome = p.departureCoord && Number.isFinite(p.departureCoord.x);
      const coord = hasHome ? p.departureCoord : (p.workCoord && Number.isFinite(p.workCoord.x) ? p.workCoord : null);
      // label = 방향 뱃지 기준 표기('집'/'그외 장소'). 앱이 목적지를 추정하므로 지역명 대신 기준을 드러낸다(사용자 2026-07-23).
      setDest(coord ? { x: coord.x, y: coord.y, label: hasHome ? '집' : '그외 장소' } : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);
  const [loading, setLoading] = useState(false);
  const [pickSlot, setPickSlot] = useState(null); // 1|2 = 그 슬롯 식당 고르는 중. null = 카드만.
  const [memo, setMemo] = useState('');           // 고르는 중인 슬롯의 메모 입력
  const [memoEdit, setMemoEdit] = useState(null); // { slot, text } = 결정된 슬롯 메모만 수정 중
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);   // 시트 스크롤뷰 — 변경 패널 열릴 때 화면 안으로 끌어오기
  const pickerYRef = useRef(0);     // 현재 열린 식당 고르기 패널의 스크롤 내 y (onLayout로 갱신)

  const [hostUid, setHostUid] = useState(null); // 단체모집 주최자 uid — 변경 권한 확장(정한 사람 + 주최자)
  const [roundupMembers, setRoundupMembers] = useState([]); // 라운지 모집 참여자(participantUids) — audience 소스
  const [members, setMembers] = useState([]); // 전파 일정 그룹의 라운딩 인원(수락자+초대받은 전원) — audience 소스(companions보다 신뢰)
  // ★공유 키 — 전파 일정은 groupId로 모든 참여자가 같은 meal 문서에 수렴(사용자별 schedule.id 발산 방지).
  const mealKey = schedule?.groupId || schedule?.roundupId || schedule?.id;
  useEffect(() => {
    if (!active || !mealKey) { setMine1(null); return; }
    return subscribeMealForSchedule(mealKey, setMine1, 1);
  }, [active, mealKey]);
  useEffect(() => {
    if (!active || !mealKey) { setMine2(null); return; }
    return subscribeMealForSchedule(mealKey, setMine2, 2);
  }, [active, mealKey]);
  useEffect(() => {
    if (!active || !uid) { setIncoming([]); return; }
    return subscribeIncomingMeals(uid, setIncoming);
  }, [active, uid]);
  // 전파 일정이면 그룹의 '라운딩 인원'을 audience 소스로 — memberUids(수락자)뿐 아니라 audienceUids(초대받은 전원)도 포함.
  //   아직 일정을 수락하지 않은 동반자에게도 제안이 가야 하므로. 자기 제외는 audienceUids 계산에서.
  useEffect(() => {
    if (!active || !schedule?.groupId) { setMembers([]); return; }
    let alive = true;
    getScheduleGroup(schedule.groupId)
      .then(g => { if (alive) setMembers([
        ...(Array.isArray(g?.memberUids) ? g.memberUids : []),
        ...(Array.isArray(g?.audienceUids) ? g.audienceUids : []),
      ]); })
      .catch(() => {});
    return () => { alive = false; };
  }, [active, schedule?.groupId]);
  // 라운지 모집 일정이면 주최자(authorUid)·참여자(participantUids) 해석 — 변경 권한 확장 + audience(참여자 전원).
  useEffect(() => {
    if (!active || !schedule?.roundupId) { setHostUid(null); setRoundupMembers([]); return; }
    let alive = true;
    loadRoundup(schedule.roundupId).then(r => {
      if (!alive) return;
      setHostUid(r?.authorUid || null);
      setRoundupMembers(Array.isArray(r?.participantUids) ? r.participantUids : []);
    }).catch(() => {});
    return () => { alive = false; };
  }, [active, schedule?.roundupId]);
  // 일정이 바뀌면(삭제·재생성·다른 라운딩) 캐시된 좌표·식당 리스트 초기화 — 옛 코스 식당이 남아 보이던 버그 방지.
  // 일정 바뀜 또는 같은 일정의 구장만 변경(같은 id) 시 캐시 좌표·맛집 리스트 초기화 — 옛 구장 주변 맛집이 남아 보이던 버그 방지.
  useEffect(() => { setCoord(null); setList([]); setKw(''); setPickSlot(null); setMemo(''); setMemoEdit(null); }, [schedule?.id, schedule?.courseId, schedule?.course]);

  // 슬롯별 식사 — 본인 문서(mine) 우선, 없으면 동반자로 받은 것(date+course+slot 매칭, cross-user 안전).
  // 동반자로 받은 식사 매칭 — ★전파/모집 일정(키 수렴)은 scheduleId(=mealKey)로 '정확' 매칭.
  //   기존엔 date+course로만 매칭해, 삭제된 옛 일정의 같은 날·구장 식사를 엉뚱하게 끌어오던 버그(사용자 2026-06-19).
  //   개인 일정(동반자 공유)은 키가 사람마다 달라(수렴 X) date+course 폴백 유지.
  const findIncoming = (s) => {
    if (schedule?.groupId || schedule?.roundupId) {
      return incoming.find(m => m.scheduleId === mealKey && (m.slot || 1) === s) || null;
    }
    return incoming.find(m => m.date === schedule?.date && m.course === schedule?.course && (m.slot || 1) === s) || null;
  };
  const meal1 = mine1 || findIncoming(1);
  const meal2 = mine2 || findIncoming(2);
  const decidedCount = (meal1 ? 1 : 0) + (meal2 ? 1 : 0);
  // 변경 권한 = 정한 사람(author) 또는 단체모집 주최자(doc.hostUid). 규칙(firestore.rules)과 동일 기준.
  const canEditMeal = (m) => !!m && (m.authorUid === uid || (!!m.hostUid && m.hostUid === uid));

  // audience = 전파 일정이면 그룹 멤버(나 제외), 아니면 일정의 친구 동반자(friendUid). 그룹 멤버가 신뢰도 높음.
  const audienceUids = useMemo(() => {
    if (schedule?.groupId && members.length) {
      return [...new Set(members.filter(u => u && u !== uid))];
    }
    // 라운지 모집 — 참여자 전원(주최자 포함)이 audience. 친구 동반자가 아니어도 식사 공유·길찾기 받게.
    if (schedule?.roundupId && roundupMembers.length) {
      return [...new Set(roundupMembers.filter(u => u && u !== uid))];
    }
    return [...new Set((schedule?.companions || []).map(c => c?.friendUid).filter(Boolean))];
  }, [schedule, members, roundupMembers, uid]);

  const loadNearby = async () => {
    setLoading(true);
    try {
      // 좌표해석 1회 재시도 — 콜드스타트 때 마스터 캐시 워밍 전이라 첫 호출이 null로 끝나
      //   '처음엔 빈 리스트, 다시 열면 됨'이던 레이스 방어. 둘째 시도엔 캐시가 차 있어 즉시 풀림.
      let cc = coord || await resolveCoord(schedule);
      if (!cc && !coord) cc = await resolveCoord(schedule);
      if (!coord) setCoord(cc);
      // 저장 맛집(코스별)은 최상단 + 표식, 주변 검색결과에서 중복 제거 — 단골/미리 점찍은 곳 먼저.
      const saved = await getSavedRestaurants(courseKeyName || schedule?.course).catch(() => []);
      // 반경 점진 확장 — 3km에 결과 적으면(시골 구장) 8km→20km로 넓혀 충분히 모음(최대 20km는 카카오 한도).
      //   maxPages=3: 카카오 페이지당 15개 한도 → 최대 45개('리스트가 몇 개 안 나온다' 피드백 2026-07-10).
      //   break 기준도 6→15로 — 시골 구장에서 6개로 만족하고 멈추지 않게.
      let nearby = [];
      if (cc) {
        for (const r of [3000, 8000, 20000]) {   // 20km = 카카오 반경 최대 — 외진 구장도 최대한 끌어옴
          nearby = await searchNearbyRestaurants(cc.y, cc.x, r, 3).catch(() => []);
          if (nearby.length >= 15) break;
        }
      }
      const savedMarked = (saved || []).map(s => ({ ...s, _saved: true }));
      const savedKeys = new Set((saved || []).map(s => s.kakaoId || s.name));
      setList([...savedMarked, ...nearby.filter(r => !savedKeys.has(r.kakaoId || r.name))]);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };
  // 빈 결과/로딩 실패 재시도 — 콜드스타트 좌표 레이스나 카카오 일시 오류로 리스트가 비는 경우.
  //   키워드가 있으면 키워드 재검색, 없으면 주변(좌표 재해석 포함) 다시 로드.
  const retryLoad = () => {
    const q = kw.trim();
    if (q) {
      setLoading(true);
      searchRestaurantsByKeyword(q, coord?.y, coord?.x).then(setList).catch(() => {}).finally(() => setLoading(false));
    } else {
      loadNearby();
    }
  };
  // 식당 고르기 시작 — 해당 슬롯으로 picking 진입. 변경이면 기존 메모 프리필.
  const startPick = (slot, existing) => { setPickSlot(slot); setMemo(existing?.note || ''); setKw(''); setMemoEdit(null); };
  // ★pickSlot=null로 연다 — 시트는 항상 결정 카드(또는 미정이면 482줄이 picker)만 보여주고,
  //   '식사 변경' 패널은 오직 '다른 곳으로 변경' 버튼으로만 펼쳐지게. (meal1 구독 로딩 레이스로 pickSlot이 1로 굳어
  //   식사1 아래 변경패널이 멋대로 펼쳐지고 식사2 카드가 밀려 안 보이던 버그 방지. 사용자 2026-06-27)
  const openSheet = () => { setOpen(true); setKw(''); setMemoEdit(null); setPickSlot(null); setMemo(''); if (!coord) loadNearby(); };
  // 푸시 탭으로 진입 시 시트 자동 오픈(푸시→길찾기 한 동선). 한 번 열고 부모 신호 리셋.
  useEffect(() => {
    if (autoOpen && active && !open) { openSheet(); onAutoOpened && onAutoOpened(); }
  }, [autoOpen, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // 변경/추가 패널이 열리면 그 위치로 스크롤 — 식사 2곳일 때 패널이 화면 밖(아래)에서 열려
  //   '버튼이 안 먹는 것처럼' 보이던 문제 해결(사용자 2026-06-20). onLayout(pickerYRef)이 채워진 뒤 스크롤.
  useEffect(() => {
    if (!open || pickSlot === null) return;
    const t = setTimeout(() => {
      const y = Math.max(0, (pickerYRef.current || 0) - 72); // 위에 살짝 여백(바뀌는 카드 헤더가 보이게)
      scrollRef.current?.scrollTo?.({ y, animated: true });
    }, 240);
    return () => clearTimeout(t);
  }, [pickSlot, open]);

  useEffect(() => {
    if (!open) return;
    const q = kw.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      setLoading(true); // 스피너 — 자동검색이 도는지 안 보여 '검색이 되는 건지 모르겠다' 피드백(2026-07-05)
      try { setList(await searchRestaurantsByKeyword(q, coord?.y, coord?.x)); } catch { /* noop */ }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [kw, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 검색 버튼 — 자동검색과 동일 로직을 즉시 실행 + 키보드 내림(결과가 보이게). 버튼 없이는
  //   검색이 실행된 건지 알 수 없다는 피드백(2026-07-05). 빈 입력이면 무시.
  const runSearch = () => {
    const q = kw.trim();
    if (!q) return;
    Keyboard.dismiss();
    setLoading(true);
    searchRestaurantsByKeyword(q, coord?.y, coord?.x).then(setList).catch(() => {}).finally(() => setLoading(false));
  };

  // 식당 선택 → 확인창 거쳐 결정/변경. ★확인 시에만 Firestore 기록(=동반자 푸시) — 둘러보다 실수·이랬다저랬다 연타로
  //   푸시가 도배되던 문제 방지 + 취소 경로 제공(사용자 2026-06-19).
  // 인앱 상세 열기 — url 없으면 kakaoId로 카카오 place URL 생성(결정된 식당은 저장 필드가 최소).
  const openDetail = (pl) => {
    if (!pl) return;
    const withUrl = pl.url ? pl : (pl.kakaoId ? { ...pl, url: `https://place.map.kakao.com/${pl.kakaoId}` } : pl);
    const b = destinationBadge(coord, dest, dest?.label, pl);
    const fg = b && (b.tone === 'good' ? '#3C7D4F' : b.tone === 'mild' ? '#8B6914' : '#9A6A55');
    setDetailPlace(withUrl);
    setDetailBadge(b ? { text: b.text, fg } : null);
  };

  const propose = (pl) => {
    if (busy || !uid || !pl?.name) return;
    showAppAlert('식사 장소 정하기', `${pl.name}(으)로 정할게요.\n동반자에게 알림이 가요.`, [
      { text: '취소', style: 'cancel' },
      { text: '정하기', onPress: () => commitMeal(pl) },
    ]);
  };
  // 실제 결정/변경 — proposeMeal 기록(생성=결정 / 작성자·주최자 변경). 여기서만 푸시 발생.
  const commitMeal = async (pl) => {
    const slot = pickSlot || 1;
    if (busy || !uid || !pl?.name) return;
    setBusy(true);
    try {
      // 라운지 모집인데 주최자(host)·참여자(audience)가 아직 비동기로 안 풀렸으면 여기서 확정 —
      //   null/빈 audience로 저장돼 주최자 오버라이드·참여자 공유가 막히는 레이스 방지.
      let host = hostUid;
      let aud = audienceUids;
      if (schedule?.roundupId && (!host || !roundupMembers.length)) {
        try {
          const r0 = await loadRoundup(schedule.roundupId);
          host = host || r0?.authorUid || null; if (host) setHostUid(host);
          const pm = Array.isArray(r0?.participantUids) ? r0.participantUids : [];
          if (pm.length) { aud = [...new Set(pm.filter(u => u && u !== uid))]; setRoundupMembers(pm); }
        } catch { /* 못 구하면 현재 값으로 진행 */ }
      }
      const r = await proposeMeal({ authorUid: uid, authorName: nickname || '', schedule, place: pl, note: memo || '', audienceUids: aud, slot, hostUid: host });
      if (r?.taken) {
        showAppAlert('이미 정해졌어요', `${r.by ? r.by + '님이 ' : ''}식사 장소를 먼저 정했어요.\n변경은 정한 사람이나 주최자만 할 수 있어요.`);
      } else {
        setKw(''); setPickSlot(null); setMemo('');
      }
    } catch (e) { if (__DEV__) console.warn('[meal] propose', e?.message); }
    finally { setBusy(false); }
  };
  // 메모만 저장(장소 변경 없음) — 총대 전용.
  const saveMemo = async () => {
    if (!memoEdit) return;
    await updateMealNote(mealKey, memoEdit.slot, memoEdit.text);
    setMemoEdit(null);
  };
  // 식사 결정 취소 — 문서 삭제(조용히, 푸시 X). 작성자/주최자만(canEditMeal). 동반자에겐 알림 안 감(스팸 방지).
  const cancelMeal = (m, slot) => {
    showAppAlert('식사 취소', `${m?.place?.name || '식사'} 결정을 취소할까요?\n동반자에겐 알림이 가지 않아요.`, [
      { text: '닫기', style: 'cancel' },
      { text: '취소하기', style: 'destructive', onPress: async () => {
        try { await deleteMeal(mealKey, slot); } catch (e) { if (__DEV__) console.warn('[meal] cancel', e?.message); }
      } },
    ]);
  };
  const openNav = (pl, provider) => {
    if (!pl || !Number.isFinite(pl.x) || !Number.isFinite(pl.y)) return;
    const name = encodeURIComponent(pl.name || '식당');
    if (provider === 'tmap') Linking.openURL(`tmap://route?goalx=${pl.x}&goaly=${pl.y}&goalname=${name}`).catch(() => Linking.openURL('https://tmap.life'));
    else Linking.openURL(`nmap://route/car?dlat=${pl.y}&dlng=${pl.x}&dname=${name}&appname=app.deargolf`).catch(() => Linking.openURL('https://map.naver.com/'));
  };

  if (!active) return null;

  // 표시용 식당명 — '○○클럽하우스'처럼 구장명이 붙어 길게 저장된 건 그냥 '클럽하우스'로(라벨 가독성)
  const shortPlaceName = (name) => (name && name.includes('클럽하우스') ? '클럽하우스' : name);
  const decidedPlaceName = shortPlaceName((meal1 || meal2)?.place?.name);
  // 카드 버튼 라벨 — 0곳/1곳(이름)/2곳
  const btnLabel = decidedCount === 0
    ? '함께 식사'
    : decidedCount === 2
      ? '식사 2곳 ✓'
      : `${decidedPlaceName || '결정됨'} ✓`;
  // 박스 모드(홈 D-0 카드) 라벨 — 아이콘·텍스트·› 분리 렌더
  // 홈 카드 버튼은 폭이 좁아 지점명(~점)까지 떼서 간결하게 — '수라면가 대부도점' → '수라면가' (사용자 2026-07-07)
  const briefName = (() => { const s = decidedPlaceName; if (!s) return s; const m = s.match(/^(.+?)\s+\S*점$/); return m ? m[1] : s; })();
  const blockLabel = decidedCount === 0
    ? '함께 식사하기'
    : decidedCount === 2
      ? '식사 2곳 결정'
      : `${briefName || '식사'} ✓`;

  // 결정된 식사 한 칸 — 장소·메모·길찾기 + (총대) 변경·메모수정
  const renderMealCard = (meal, slot) => {
    const pl = meal.place;
    const author = canEditMeal(meal);
    const editing = memoEdit?.slot === slot;
    return (
      <View key={slot} style={{ marginHorizontal: 18, marginBottom: 10, padding: 14, borderRadius: 12, backgroundColor: C.bgSecondary }}>
        {/* 식사 슬롯(2곳일 때)만 최상단 작은 배지 — '누가 정함'은 식당명 옆으로 내려 한 줄 절약. */}
        {decidedCount === 2 && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter, letterSpacing: 0.3 }}>식사 {slot}</Text>
          </View>
        )}
        {/* 식당명(탭→앱 내 상세) + 누가 정했는지(별명 우선) 같은 줄 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => openDetail(pl)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, flexShrink: 1 }} numberOfLines={1}>{shortPlaceName(pl?.name)}</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.warmGrayLight }}>›</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, flexShrink: 0 }} numberOfLines={1}>
            🍴 {meal.authorUid === uid ? '내가 정함' : `${friendDisplayName(friendMeta, meal.authorUid, meal.authorName || '동반자')}님`}
          </Text>
        </View>
        {!!pl?.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>{pl.loc}</Text>}
        <TouchableOpacity onPress={() => openDetail(pl)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>메뉴·리뷰·사진 보기 ›</Text>
        </TouchableOpacity>
        {/* 메모 — 보기(있을 때) / 총대는 수정 가능 */}
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <AppTextInput value={memoEdit.text} onChangeText={(t) => setMemoEdit(e => ({ ...e, text: t }))}
              placeholder="메모 (예: 아침 9시까지)" placeholderTextColor={C.warmGrayLight}
              style={{ flex: 1, backgroundColor: C.bgPrimary, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.sys, fontSize: fs(12.5), color: C.charcoal }} />
            <TouchableOpacity onPress={saveMemo} activeOpacity={0.85} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>저장</Text>
            </TouchableOpacity>
          </View>
        ) : !!meal.note ? (
          // 메모 하이라이트 — 버터색 스티키노트 박스로 부각(카드 위에서 또렷). 📌 + 볼드.
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(245,230,168,0.6)',
            borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ fontSize: fs(12.5) }}>📌</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginLeft: 6, flex: 1 }} numberOfLines={2}>{meal.note}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity onPress={() => openNav(pl, 'naver')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#2DB400' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>네이버 길찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openNav(pl, 'tmap')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: C.charcoal }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>티맵 길찾기</Text>
          </TouchableOpacity>
        </View>
        {/* 총대/주최자만 — 변경(장소 다시) / 메모 수정 / 식사 취소(결정 삭제, 조용히) */}
        {author && !editing && (
          <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {/* 변경 — 작동 중(이 슬롯 고르는 중)이면 채움+'변경 중 ▾'로 토글 표시. 다시 누르면 닫힘(사용자가 상태를 바로 인지). */}
            <TouchableOpacity onPress={() => (pickSlot === slot ? (setPickSlot(null), setMemo('')) : startPick(slot, meal))} activeOpacity={0.8}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.2, borderColor: C.burgundy,
                backgroundColor: pickSlot === slot ? C.burgundy : 'transparent' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: pickSlot === slot ? C.butter : C.burgundy }}>{pickSlot === slot ? '변경 중 ▾' : '다른 곳으로 변경'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMemoEdit({ slot, text: meal.note || '' }); if (pickSlot === slot) { setPickSlot(null); setMemo(''); } }} activeOpacity={0.8}
              style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.2, borderColor: C.navy }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.navy }}>{meal.note ? '메모 수정' : '메모'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => cancelMeal(meal, slot)} activeOpacity={0.7}
            style={{ marginTop: 8, alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>식사 취소</Text>
          </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  // 식당 고르기 패널 — 변경/추가/최초결정 공용. ★바뀌는 카드 '바로 아래'에 인라인으로 렌더해
  //   '버튼이 안 먹는 것처럼' 보이던 문제 해결(예전엔 시트 맨 아래에만 떠서 변화가 안 보였음). 사용자 2026-06-19.
  const renderPicker = () => {
    const changing = (pickSlot === 1 && meal1) || (pickSlot === 2 && meal2);
    const title = changing ? '식사 변경' : (pickSlot === 2 ? '식사 2 정하기' : '식사 정하기');
    return (
      <View onLayout={(e) => { pickerYRef.current = e.nativeEvent.layout.y; }}
        style={{ marginHorizontal: 10, marginBottom: 10, paddingTop: 10, paddingBottom: 6, borderRadius: 12,
        backgroundColor: 'rgba(245,230,168,0.12)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 6 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal, flex: 1 }}>{title}</Text>
          {/* 항상 취소 가능 — 이미 정한 게 있으면 카드로 돌아가고(닫기), 첫 결정 중이면 시트를 닫음(취소). */}
          <TouchableOpacity onPress={() => { setPickSlot(null); setMemo(''); setKw(''); if (decidedCount === 0) setOpen(false); }}
            activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray }}>{decidedCount > 0 ? '닫기' : '취소'}</Text>
          </TouchableOpacity>
        </View>
        {/* 검색 — 맨 위 + 돋보기 + 검색 버튼. 메모칸과 같은 회색 민무늬라 '검색 기능이 없는 줄' 알았고,
            버튼이 없어 검색 실행 여부도 알 수 없다는 피드백(2026-07-05) → 흰 배경·테두리로 구분 + 명시 버튼(코스맛집 검색줄과 동일 문법). */}
        <View style={{ paddingHorizontal: 18, marginBottom: 7, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingLeft: 12, height: 44 }}>
            <Icon name="search" size={fs(16)} color={C.warmGray} />
            <AppTextInput value={kw} returnKeyType="search" onSubmitEditing={runSearch}
              onChangeText={(t) => { const hadQ = kw.trim(); setKw(t); if (hadQ && !t.trim()) loadNearby(); }}
              placeholder="식당 이름으로 검색" placeholderTextColor={C.warmGrayLight}
              style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 0, fontFamily: F.sys, fontSize: fs(14), color: C.charcoal }} />
            {kw.length > 0 && (
              <TouchableOpacity onPress={() => { setKw(''); loadNearby(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingRight: 10 }}>
                <Text style={{ color: C.warmGray, fontSize: fs(13) }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={runSearch} activeOpacity={0.85} disabled={!kw.trim()}
            style={{ backgroundColor: kw.trim() ? C.burgundy : C.hairline, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: kw.trim() ? C.butter : C.warmGrayLight }}>검색</Text>
          </TouchableOpacity>
        </View>
        {/* 메모 입력(선택) — 고른 식당에 함께 저장. 흰 바탕 + 골드 테두리 + 펜 아이콘으로 검색칸(회색 헤어라인)과 구분.
            버터색 채움은 버터 톤 패널 바탕에 묻혀서 테두리 방식으로(피드백 2026-07-05). */}
        <View style={{ paddingHorizontal: 18, marginBottom: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(160,130,30,0.5)', borderRadius: 10, paddingLeft: 12, height: 44 }}>
            <Icon name="pen" size={fs(15)} color="rgba(140,110,25,0.9)" />
            <AppTextInput value={memo} onChangeText={setMemo} placeholder="메모 (예: 9시까지 모여요)" placeholderTextColor={C.warmGrayLight}
              style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 0, fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }} />
          </View>
        </View>
        {/* 클럽하우스 원탭 — 구장 식당에서 먹는 흔한 케이스. 구장 좌표로 바로 지정(길찾기=구장). 좌표 없으면 지정만 되고 길찾기 비활성.
            슬림 알약(왼쪽 정렬) — 큰 풀폭 버튼이 메모보다 커서 위계가 뒤집혀 보인다는 피드백(2026-07-05). */}
        <View style={{ paddingHorizontal: 18, marginBottom: 10, flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => propose({ name: '클럽하우스', loc: schedule?.course || '', x: coord?.x, y: coord?.y })} disabled={busy} activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7,
              borderRadius: 16, backgroundColor: 'rgba(107,30,42,0.05)', opacity: busy ? 0.6 : 1 }}>
            <Icon name="clubhouse" size={fs(15)} color={C.burgundy} />
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.burgundy }}>클럽하우스에서 식사</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingBottom: 6 }}>
          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.burgundy} /></View>
          ) : list.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center', paddingHorizontal: 18 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', lineHeight: fs(19) }}>
                {kw.trim() ? `'${kw.trim()}' 검색 결과가 없어요\n카카오맵에 없는 식당은 이름 그대로 정할 수 있어요`
                  : coord ? '주변 식당을 찾지 못했어요\n이름으로 검색해보세요' : '코스 위치를 찾지 못해\n이름으로만 검색할 수 있어요'}
              </Text>
              {/* 카카오맵에 없는 식당(네이버엔 있는 시골 맛집 등) — 이름 그대로 지정 경로(테스터 2026-07-05).
                  클럽하우스 지정과 같은 방식: 좌표가 없어 길찾기만 비활성, 이름·메모는 동반자에게 그대로 전달. */}
              {kw.trim() ? (
                <TouchableOpacity onPress={() => propose({ name: kw.trim(), loc: schedule?.course || '' })} disabled={busy} activeOpacity={0.85}
                  style={{ marginTop: 12, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9, backgroundColor: C.burgundy, opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.butter }}>'{kw.trim()}' 이대로 정하기</Text>
                </TouchableOpacity>
              ) : (
              /* 다시 시도 — 좌표/리스트 로딩이 일시 실패(콜드스타트·카카오 오류)했을 때 재시도 경로 제공 */
              <TouchableOpacity onPress={retryLoad} activeOpacity={0.8}
                style={{ marginTop: 12, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: C.burgundy }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.burgundy }}>↻ 다시 시도</Text>
              </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
            {/* 검색 결과 헤더 — 아래 리스트가 '검색 결과'로 바뀌었음을 명시(주변 리스트와 구분) */}
            {kw.trim().length > 0 && (
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy, paddingHorizontal: 18, paddingBottom: 4 }}>
                '{kw.trim()}' 검색 결과 {list.length}곳
              </Text>
            )}
            {list.map((r) => {
              // 목적지(집/직장) 방향 뱃지 — 길목(그린)/우회(앰버)/반대(뮤트). dest·coord 있을 때만.
              const badge = destinationBadge(coord, dest, dest?.label, r);
              const bt = badge && (badge.tone === 'good' ? { bg: 'rgba(94,139,96,0.15)', fg: '#3C7D4F' }
                : badge.tone === 'mild' ? { bg: 'rgba(139,105,20,0.13)', fg: '#8B6914' } : { bg: 'rgba(150,90,70,0.12)', fg: '#9A6A55' });
              return (
              <View key={r.kakaoId || r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 18, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => { setDetailPlace(r); setDetailBadge(badge && bt ? { text: badge.text, fg: bt.fg } : null); }}>
                  {/* 저장 표식은 우측 별 아이콘이 대신하므로 이름 앞 ⭐은 뺀다(같은 신호 중복 + 유니코드 이모지 금지) */}
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>{r.name}</Text>
                  {/* 주소(loc)는 어차피 잘려 의미 적고 '상세'로 충분 → 종류·거리만 표기. */}
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>
                    {r.type}{r.distance ? ` · ${r.distance >= 1000 ? (r.distance / 1000).toFixed(1) + 'km' : r.distance + 'm'}` : ''}
                  </Text>
                  {/* 방향 뱃지 + 저장 칩 한 줄 — 저장은 오른쪽 버튼 줄(상세·정하기)에서 빼 여기로.
                      별 아이콘은 '이미 저장됨'처럼 읽혀 헷갈린다는 피드백(2026-07-22) → 코스 맛집 탭과 같은
                      「+ 저장 / 저장됨」 칩으로 통일. 두 화면이 같은 저장소를 쓰므로 표기도 같아야 한다. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    {badge && (
                      <View style={{ backgroundColor: bt.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: bt.fg }}>{badge.text}</Text>
                      </View>
                    )}
                    {/* 저장 전 = 「+ 저장」 칩(누를 수 있음) / 저장 후 = 별(상태 표시, 누를 일 없음).
                        '저장됨' 글자칩은 버튼처럼 보여 헷갈린다는 피드백(2026-07-22) → 상태는 별로. */}
                    {r._saved ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Icon name="star" size={fs(13)} color="#C9A84C" strokeWidth={1.9} />
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: '#8B6914' }}>저장</Text>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setSaveSeed(r)} activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        style={{ borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3,
                          backgroundColor: '#FFFDF5' }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: '#5A4A00' }}>+ 저장</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
                {/* 상세 — 앱 내 카카오 place 웹뷰(사진·평점·리뷰). 밖으로 안 나감. */}
                <TouchableOpacity onPress={() => { setDetailPlace(r); setDetailBadge(badge && bt ? { text: badge.text, fg: bt.fg } : null); }} activeOpacity={0.7} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.burgundy, textDecorationLine: 'underline' }}>상세</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => propose(r)} disabled={busy} activeOpacity={0.85}
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9, backgroundColor: C.burgundy, opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>정하기</Text>
                </TouchableOpacity>
              </View>
            ); })}
            </>
          )}
          {/* 구장 주변 맛집을 네이버에서 통째로 — 카카오맵에 없는 시골 맛집 보완(빈 결과에도 노출).
              GuideScreen '맛집 더보기'와 동일 검색식(구장명+시군+맛집). courseLoc 없는 옛 일정은 구장명만으로 검색. */}
          {!loading && !!schedule?.course && (
            <TouchableOpacity onPress={async () => {
              // 좌표를 읍/면/동으로 역지오코딩해 '지역명 맛집' 검색(구장명 넣으면 골프장으로 빠짐, 좌표URL은 안드에서 GPS로 샘).
              const region = (coord && Number.isFinite(coord.x)) ? await coord2region(coord.x, coord.y) : '';
              Linking.openURL(naverFoodListUrl(region || schedule.courseLoc, schedule.course)).catch(() => {});
            }}
              activeOpacity={0.7} style={{ alignSelf: 'center', marginTop: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray, textDecorationLine: 'underline' }} numberOfLines={1}>
                {schedule.course} 주변 맛집 네이버에서 보기
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      {triggerless ? null : block ? (
        // 박스 모드(홈 D-0 카드) — 불투명 솔리드 채움(진짜 버튼) + 그림자. 불투명이라 Android '뿌연 팔각형' 아티팩트 없음([[dm-button]]).
        //   미결정=버터(브랜드 CTA), 결정=차콜+버터글씨. 상단 하이라이트로 솟은 느낌.
        // 결정 전엔 살랑살랑(float)로 주목 유도, 결정되면(✓) 정지 — 코스 헤더 버튼과 같은 톤 ([[attention-motion]])
        <AttentionMotion type="float" axis="x" distance={7} bidir={Platform.OS === 'ios'} enabled={decidedCount === 0} style={{ borderRadius: 12 }}>
        <TouchableOpacity onPress={openSheet} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
            backgroundColor: decidedCount ? C.charcoal : '#D8CC9E', // 미결정=차분한 버터(강도 낮춤), 결정=차콜
            borderTopWidth: 1, borderTopColor: decidedCount ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 }}>
          <Icon name="bowl" size={fs(21)} color={decidedCount ? C.butter : C.charcoal} />
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: decidedCount ? C.butter : C.charcoal, marginLeft: 6, includeFontPadding: false, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{blockLabel}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: decidedCount ? 'rgba(245,230,168,0.55)' : 'rgba(61,57,53,0.5)', marginLeft: 7, includeFontPadding: false }}>›</Text>
        </TouchableOpacity>
        </AttentionMotion>
      ) : (
        <TouchableOpacity onPress={openSheet} activeOpacity={0.8}
          style={{ flex, backgroundColor: decidedCount ? 'rgba(245,230,168,0.18)' : 'rgba(255,255,255,0.1)',
            borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon name="bowl" size={fs(17)} color={decidedCount ? C.butter : '#fff'} />
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: decidedCount ? C.butter : '#fff' }} numberOfLines={1}>{btnLabel}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => {
        // ★안드 뒤로가기 — 식당 상세(오버레이)가 열려 있으면 시트 전체가 아니라 상세부터 닫아 리스트로 돌아간다.
        //   (상세는 네이티브 Modal이 아니라 오버레이라, 백이 이 Modal onRequestClose로 새어 시트가 통째로 닫혀
        //   일정시트로 튀던 것 방지 — 사용자 2026-07-28)
        if (detailPlace) { setDetailPlace(null); return; }
        setOpen(false);
      }}>
        {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 키보드 회피는 자체 Provider 필요(ScheduleModal과 동일) */}
        <KeyboardProvider>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: 20 + insets.bottom, maxHeight: '82%' }}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline }} />
            </View>
            <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name="bowl" size={fs(24)} color={C.charcoal} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: C.charcoal }}>함께 식사</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {schedule?.course}{schedule?.date ? ` · ${schedule.date}` : ''}{schedule?.time ? ` · ${schedule.time}` : ''}
              </Text>
              {/* 안내문 — 본문(회색)과 구분되게 네이비 색으로(박스 없이). 한 줄로 짧게. */}
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.navy, marginTop: 7, lineHeight: fs(18) }} numberOfLines={2}>
                {(meal1 || meal2)
                  ? (schedule?.roundupId
                      ? '💡 변경은 정한 사람·모집 주최자만 가능'
                      : '💡 변경은 정한 사람만 가능')
                  : '💡 먼저 정하는 분이 식사 장소를 정해요'}
              </Text>
            </View>

            <KeyboardAwareScrollView ref={scrollRef} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" bottomOffset={24}>
              {/* 결정된 식사 칸들 — 변경 중이면 그 칸 '바로 아래'에 식당 고르기 패널 인라인(시트 맨 아래가 아니라). */}
              {meal1 && renderMealCard(meal1, 1)}
              {meal1 && pickSlot === 1 && renderPicker()}
              {meal2 && renderMealCard(meal2, 2)}
              {meal2 && pickSlot === 2 && renderPicker()}

              {/* + 식사 추가 — 첫 식사 있고 둘째 없을 때(고르는 중 아님). 라운딩 전/후 2끼. */}
              {meal1 && !meal2 && pickSlot === null && (
                <TouchableOpacity onPress={() => startPick(2, null)} activeOpacity={0.85}
                  style={{ marginHorizontal: 18, marginBottom: 10, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>+ 식사 추가 (전/후 2끼)</Text>
                </TouchableOpacity>
              )}

              {audienceUids.length === 0 && !meal1 && (
                <View style={{ marginHorizontal: 18, marginBottom: 8, backgroundColor: C.bgSecondary, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, lineHeight: fs(18) }}>
                    친구 동반자가 없어요. 일정에 친구를 넣으면 함께 정할 수 있어요.
                  </Text>
                </View>
              )}

              {/* 최초 결정(슬롯1) 또는 슬롯2 추가. ★슬롯1 미정이면 pickSlot 타이밍과 무관하게 항상 picker 노출 —
                  시트가 열렸는데 pickSlot이 null로 남아 '안내 문구만' 뜨던 버그 방지(특히 캘린더 autoOpen 경로). */}
              {((!meal1 && pickSlot !== 2) || (pickSlot === 2 && !meal2)) && renderPicker()}
            </KeyboardAwareScrollView>
          </View>
          {/* 앱 내 식당 상세 — ★함께 식사는 이미 Modal 시트라, 상세를 또 네이티브 Modal로 띄우면 iOS가 '모달 위 모달'을 안 그려 먹통.
              asOverlay로 이 시트 위에 겹쳐 연다. 이 flex:1 View 안에 둬야 화면을 꽉 채워 덮는다. */}
          <RestaurantDetailSheet
            asOverlay
            visible={!!detailPlace}
            place={detailPlace}
            badge={detailBadge}
            onClose={() => setDetailPlace(null)}
            onDecide={() => { const p = detailPlace; setDetailPlace(null); if (p) propose(p); }}
            onNav={() => { if (detailPlace) openNav(detailPlace, 'naver'); }}
          />
        </View>
        {/* 이 시트(Modal) 안의 AppAlert 호스트 — 확인/취소창이 시트 위에 정상 노출(루트 호스트는 모달 뒤로 깔림). 모달 닫히면 자동 복귀. */}
        <AppAlertHost />
        </KeyboardProvider>
      </Modal>
      {/* 앱 내 식당 상세 — 탭하면 카카오 place 웹뷰(밖으로 안 나감). 정하기·길찾기·전화 */}
      {/* 맛집 저장 — 구장 이름 기준 저장소라 저장 즉시 코스 화면 '내가 저장한 맛집'에도 나타난다.
          목록의 _saved 표식은 다시 열 때 갱신되므로, 저장 후 이 화면에서도 '저장됨'으로 바뀌게 즉시 반영한다. */}
      <RestaurantSaveModal
        visible={!!saveSeed}
        seed={saveSeed}
        courseName={courseKeyName || schedule?.course}
        onClose={() => setSaveSeed(null)}
        onSave={async (rest) => {
          const key = saveSeed?.kakaoId || saveSeed?.name;
          try {
            const ck = courseKeyName || schedule?.course;
            if (ck) await addSavedRestaurant(ck, { ...saveSeed, ...rest });
            setList(prev => prev.map(x => ((x.kakaoId || x.name) === key ? { ...x, _saved: true } : x)));
          } catch { /* 저장 실패는 조용히 — 다시 시도하면 됨 */ }
          setSaveSeed(null);
        }}
      />
    </>
  );
}
