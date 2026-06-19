import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { C, F, fs } from '../constants/colors';
import { searchNearbyRestaurants, searchRestaurantsByKeyword } from '../utils/kakao';
import { getSavedRestaurants } from '../utils/savedRestaurants';
import { naverSearchUrl } from '../utils/naverMap';   // 식당 '상세'를 네이버로(맛집 더보기와 통일)
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { searchGolfCourses } from '../utils/golfCourses';
import {
  proposeMeal, updateMealNote, deleteMeal,
  subscribeMealForSchedule, subscribeIncomingMeals,
} from '../utils/mealSuggestions';
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadRoundup } from '../utils/roundup';
import { friendDisplayName } from '../utils/friendGroups';   // 별명(customName) 우선 이름 해석
import { showAppAlert, AppAlertHost } from './AppAlert';      // 앱 커스텀 알럿(시스템 다이얼로그 대신)

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
export function MealDecisionBar({ schedule, uid, nickname, active, autoOpen, onAutoOpened, flex = 1, block = false, triggerless = false, friendMeta = {} }) {
  const insets = useSafeAreaInsets();
  const [mine1, setMine1] = useState(null);       // 총대 본인 슬롯1 문서
  const [mine2, setMine2] = useState(null);       // 총대 본인 슬롯2 문서
  const [incoming, setIncoming] = useState([]);   // 동반자로 받은 제안(양 슬롯)
  const [open, setOpen] = useState(false);
  const [coord, setCoord] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pickSlot, setPickSlot] = useState(null); // 1|2 = 그 슬롯 식당 고르는 중. null = 카드만.
  const [memo, setMemo] = useState('');           // 고르는 중인 슬롯의 메모 입력
  const [memoEdit, setMemoEdit] = useState(null); // { slot, text } = 결정된 슬롯 메모만 수정 중
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);

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
  const findIncoming = (s) => incoming.find(m => m.date === schedule?.date && m.course === schedule?.course && (m.slot || 1) === s) || null;
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
      const cc = coord || await resolveCoord(schedule);
      if (!coord) setCoord(cc);
      // 저장 맛집(코스별)은 최상단 + 표식, 주변 검색결과에서 중복 제거 — 단골/미리 점찍은 곳 먼저.
      const saved = await getSavedRestaurants(schedule?.course).catch(() => []);
      // 반경 점진 확장 — 3km에 결과 적으면(시골 구장) 8km→15km로 넓혀 충분히 모음(최대 20km는 카카오 한도).
      let nearby = [];
      if (cc) {
        for (const r of [3000, 8000, 20000]) {   // 20km = 카카오 반경 최대 — 외진 구장도 최대한 끌어옴
          nearby = await searchNearbyRestaurants(cc.y, cc.x, r).catch(() => []);
          if (nearby.length >= 6) break;
        }
      }
      const savedMarked = (saved || []).map(s => ({ ...s, _saved: true }));
      const savedKeys = new Set((saved || []).map(s => s.kakaoId || s.name));
      setList([...savedMarked, ...nearby.filter(r => !savedKeys.has(r.kakaoId || r.name))]);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };
  // 식당 고르기 시작 — 해당 슬롯으로 picking 진입. 변경이면 기존 메모 프리필.
  const startPick = (slot, existing) => { setPickSlot(slot); setMemo(existing?.note || ''); setKw(''); setMemoEdit(null); };
  const openSheet = () => { setOpen(true); setKw(''); setMemoEdit(null); setPickSlot(meal1 ? null : 1); setMemo(''); if (!coord) loadNearby(); };
  // 푸시 탭으로 진입 시 시트 자동 오픈(푸시→길찾기 한 동선). 한 번 열고 부모 신호 리셋.
  useEffect(() => {
    if (autoOpen && active && !open) { openSheet(); onAutoOpened && onAutoOpened(); }
  }, [autoOpen, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const q = kw.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      try { setList(await searchRestaurantsByKeyword(q, coord?.y, coord?.x)); } catch { /* noop */ }
    }, 350);
    return () => clearTimeout(t);
  }, [kw, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 식당 선택 → 확인창 거쳐 결정/변경. ★확인 시에만 Firestore 기록(=동반자 푸시) — 둘러보다 실수·이랬다저랬다 연타로
  //   푸시가 도배되던 문제 방지 + 취소 경로 제공(사용자 2026-06-19).
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

  // 카드 버튼 라벨 — 0곳/1곳(이름)/2곳
  const btnLabel = decidedCount === 0
    ? '🍲 함께 식사'
    : decidedCount === 2
      ? '🍲 식사 2곳 ✓'
      : `🍲 ${(meal1 || meal2)?.place?.name || '결정됨'} ✓`;
  // 박스 모드(홈 D-0 카드) 라벨 — 아이콘·텍스트·› 분리 렌더
  const blockLabel = decidedCount === 0
    ? '함께 식사하기'
    : decidedCount === 2
      ? '식사 2곳 결정'
      : `${(meal1 || meal2)?.place?.name || '식사'} 결정`;

  // 결정된 식사 한 칸 — 장소·메모·길찾기 + (총대) 변경·메모수정
  const renderMealCard = (meal, slot) => {
    const pl = meal.place;
    const author = canEditMeal(meal);
    const editing = memoEdit?.slot === slot;
    return (
      <View key={slot} style={{ marginHorizontal: 18, marginBottom: 10, padding: 14, borderRadius: 12, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
        {/* 헤더 — 식사 슬롯(2곳일 때) + 누가 정했는지(별명 우선). 잘 보이게 카드 최상단. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {decidedCount === 2 && (
            <View style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter, letterSpacing: 0.3 }}>식사 {slot}</Text>
            </View>
          )}
          <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: C.warmGray }} numberOfLines={1}>
            🍴 {meal.authorUid === uid ? '내가 정함' : `${friendDisplayName(friendMeta, meal.authorUid, meal.authorName || '동반자')}님이 정함`}
          </Text>
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>{pl?.name}</Text>
        {!!pl?.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>{pl.loc}</Text>}
        {/* 메모 — 보기(있을 때) / 총대는 수정 가능 */}
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <TextInput value={memoEdit.text} onChangeText={(t) => setMemoEdit(e => ({ ...e, text: t }))}
              placeholder="메모 (예: 아침 9시까지)" placeholderTextColor={C.warmGrayLight}
              style={{ flex: 1, backgroundColor: C.bgPrimary, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.sys, fontSize: fs(12.5), color: C.charcoal, borderWidth: 0.5, borderColor: C.hairline }} />
            <TouchableOpacity onPress={saveMemo} activeOpacity={0.85} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>저장</Text>
            </TouchableOpacity>
          </View>
        ) : !!meal.note ? (
          // 메모 하이라이트 — 버터색 스티키노트 박스로 부각(카드 위에서 또렷). 📌 + 볼드.
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(245,230,168,0.6)',
            borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 0.5, borderColor: 'rgba(160,130,30,0.3)' }}>
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
            <TouchableOpacity onPress={() => startPick(slot, meal)} activeOpacity={0.8}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.2, borderColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.burgundy }}>다른 곳으로 변경</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMemoEdit({ slot, text: meal.note || '' })} activeOpacity={0.8}
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
      <View style={{ marginHorizontal: 10, marginBottom: 10, paddingTop: 10, paddingBottom: 6, borderRadius: 12,
        backgroundColor: 'rgba(245,230,168,0.12)', borderWidth: 0.5, borderColor: 'rgba(160,130,30,0.18)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 6 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, flex: 1 }}>{title}</Text>
          {/* 항상 취소 가능 — 이미 정한 게 있으면 카드로 돌아가고(닫기), 첫 결정 중이면 시트를 닫음(취소). */}
          <TouchableOpacity onPress={() => { setPickSlot(null); setMemo(''); setKw(''); if (decidedCount === 0) setOpen(false); }}
            activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray }}>{decidedCount > 0 ? '닫기' : '취소'}</Text>
          </TouchableOpacity>
        </View>
        {/* 메모 입력(선택) — 고른 식당에 함께 저장 */}
        <View style={{ paddingHorizontal: 18, marginBottom: 6 }}>
          <TextInput value={memo} onChangeText={setMemo} placeholder="메모 (선택 · 예: 아침 9시까지 모여요)" placeholderTextColor={C.warmGrayLight}
            style={{ backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.sys, fontSize: fs(12.5), color: C.charcoal }} />
        </View>
        <View style={{ paddingHorizontal: 18, marginBottom: 6 }}>
          <TextInput value={kw} onChangeText={setKw} placeholder="식당 이름으로 검색" placeholderTextColor={C.warmGrayLight}
            style={{ backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} />
        </View>
        {/* 클럽하우스 원탭 — 구장 식당에서 먹는 흔한 케이스. 구장 좌표로 바로 지정(길찾기=구장). 좌표 없으면 지정만 되고 길찾기 비활성. */}
        <TouchableOpacity onPress={() => propose({ name: '클럽하우스', loc: schedule?.course || '', x: coord?.x, y: coord?.y })} disabled={busy} activeOpacity={0.85}
          style={{ marginHorizontal: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.burgundy, backgroundColor: 'rgba(107,30,42,0.05)', opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontSize: fs(14) }}>🏌️</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy }}>클럽하우스에서 식사</Text>
        </TouchableOpacity>
        <View style={{ paddingBottom: 6 }}>
          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.burgundy} /></View>
          ) : list.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 24, textAlign: 'center', paddingHorizontal: 18 }}>
              {coord ? '주변 식당을 찾지 못했어요 — 이름으로 검색해보세요' : '코스 위치를 찾지 못해 검색만 가능해요'}
            </Text>
          ) : (
            list.map((r) => (
              <View key={r.kakaoId || r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 18, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>{r._saved ? '⭐ ' : ''}{r.name}</Text>
                  {/* 주소(loc)는 어차피 잘려 의미 적고 '상세'로 충분 → 종류·거리만 표기. */}
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }} numberOfLines={1}>
                    {r.type}{r.distance ? ` · ${r.distance >= 1000 ? (r.distance / 1000).toFixed(1) + 'km' : r.distance + 'm'}` : ''}
                  </Text>
                </View>
                {/* 상세 — 네이버 지도 검색(맛집 더보기와 통일). 카카오 url 대신 이름+지역으로 네이버 검색. */}
                <TouchableOpacity onPress={() => Linking.openURL(naverSearchUrl(r.name, r.loc)).catch(() => {})} activeOpacity={0.7} style={{ paddingHorizontal: 8, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, textDecorationLine: 'underline' }}>상세</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => propose(r)} disabled={busy} activeOpacity={0.85}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: C.burgundy, opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>여기로 정하기</Text>
                </TouchableOpacity>
              </View>
            ))
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
        <TouchableOpacity onPress={openSheet} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11,
            backgroundColor: decidedCount ? C.charcoal : '#D8CC9E', // 미결정=차분한 버터(강도 낮춤), 결정=차콜
            borderTopWidth: 1, borderTopColor: decidedCount ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 }}>
          <Text style={{ fontSize: fs(18), includeFontPadding: false }}>🍲</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: decidedCount ? C.butter : C.charcoal, marginLeft: 6, includeFontPadding: false, flexShrink: 1 }} numberOfLines={1}>{blockLabel}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: decidedCount ? 'rgba(245,230,168,0.55)' : 'rgba(61,57,53,0.5)', marginLeft: 7, includeFontPadding: false }}>›</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={openSheet} activeOpacity={0.8}
          style={{ flex, backgroundColor: decidedCount ? 'rgba(245,230,168,0.18)' : 'rgba(255,255,255,0.1)',
            borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: decidedCount ? C.butter : '#fff' }} numberOfLines={1}>{btnLabel}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
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
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>🍲 함께 식사</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {schedule?.course}{schedule?.date ? ` · ${schedule.date}` : ''}{schedule?.time ? ` · ${schedule.time}` : ''}
              </Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: C.warmGray, marginTop: 6 }} numberOfLines={2}>
                {(meal1 || meal2)
                  ? '💡 변경은 정한 사람만 할 수 있어요.'
                  : '💡 먼저 정하는 분이 식사 장소를 정해요.'}
              </Text>
            </View>

            <KeyboardAwareScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" bottomOffset={24}>
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
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingHorizontal: 18, marginBottom: 6 }}>
                  이 라운딩에 친구 동반자가 없어요. 일정 동반자에 친구를 넣으면 함께 정할 수 있어요.
                </Text>
              )}

              {/* 최초 결정(슬롯1) 또는 슬롯2 추가. ★슬롯1 미정이면 pickSlot 타이밍과 무관하게 항상 picker 노출 —
                  시트가 열렸는데 pickSlot이 null로 남아 '안내 문구만' 뜨던 버그 방지(특히 캘린더 autoOpen 경로). */}
              {((!meal1 && pickSlot !== 2) || (pickSlot === 2 && !meal2)) && renderPicker()}
            </KeyboardAwareScrollView>
          </View>
        </View>
        {/* 이 시트(Modal) 안의 AppAlert 호스트 — 확인/취소창이 시트 위에 정상 노출(루트 호스트는 모달 뒤로 깔림). 모달 닫히면 자동 복귀. */}
        <AppAlertHost />
        </KeyboardProvider>
      </Modal>
    </>
  );
}
