import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Linking, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { searchNearbyRestaurants, searchRestaurantsByKeyword } from '../utils/kakao';
import { getSavedRestaurants } from '../utils/savedRestaurants';
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { searchGolfCourses } from '../utils/golfCourses';
import {
  proposeMeal, updateMealNote,
  subscribeMealForSchedule, subscribeIncomingMeals,
} from '../utils/mealSuggestions';
import { getScheduleGroup } from '../utils/scheduleShares';

// 라운딩 코스 좌표 해석 — courseId(userCourses) 우선, 없으면 이름으로 골프장 검색. 주변 맛집 검색용.
async function resolveCoord(schedule) {
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
export function MealDecisionBar({ schedule, uid, nickname, active, autoOpen, onAutoOpened, flex = 1, block = false }) {
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

  const [members, setMembers] = useState([]); // 전파 일정 그룹의 라운딩 인원(수락자+초대받은 전원) — audience 소스(companions보다 신뢰)
  // ★공유 키 — 전파 일정은 groupId로 모든 참여자가 같은 meal 문서에 수렴(사용자별 schedule.id 발산 방지).
  const mealKey = schedule?.groupId || schedule?.id;
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
  // 일정이 바뀌면(삭제·재생성·다른 라운딩) 캐시된 좌표·식당 리스트 초기화 — 옛 코스 식당이 남아 보이던 버그 방지.
  useEffect(() => { setCoord(null); setList([]); setKw(''); setPickSlot(null); setMemo(''); setMemoEdit(null); }, [schedule?.id]);

  // 슬롯별 식사 — 본인 문서(mine) 우선, 없으면 동반자로 받은 것(date+course+slot 매칭, cross-user 안전).
  const findIncoming = (s) => incoming.find(m => m.date === schedule?.date && m.course === schedule?.course && (m.slot || 1) === s) || null;
  const meal1 = mine1 || findIncoming(1);
  const meal2 = mine2 || findIncoming(2);
  const decidedCount = (meal1 ? 1 : 0) + (meal2 ? 1 : 0);
  const isAuthorOf = (m) => !!m && m.authorUid === uid;

  // audience = 전파 일정이면 그룹 멤버(나 제외), 아니면 일정의 친구 동반자(friendUid). 그룹 멤버가 신뢰도 높음.
  const audienceUids = useMemo(() => {
    if (schedule?.groupId && members.length) {
      return [...new Set(members.filter(u => u && u !== uid))];
    }
    return [...new Set((schedule?.companions || []).map(c => c?.friendUid).filter(Boolean))];
  }, [schedule, members, uid]);

  const loadNearby = async () => {
    setLoading(true);
    try {
      const cc = coord || await resolveCoord(schedule);
      if (!coord) setCoord(cc);
      // 저장 맛집(코스별)은 최상단 + 표식, 주변 검색결과에서 중복 제거 — 단골/미리 점찍은 곳 먼저.
      const [saved, nearby] = await Promise.all([
        getSavedRestaurants(schedule?.course).catch(() => []),
        cc ? searchNearbyRestaurants(cc.y, cc.x, 3000).catch(() => []) : Promise.resolve([]),
      ]);
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

  // 제안 = 결정 — 고르면 picking 슬롯에 바로 확정(+메모). 선착순: 이미 누가 정했으면 안내만(덮어쓰기 X). 총대 본인이면 변경.
  const propose = async (pl) => {
    const slot = pickSlot || 1;
    if (busy || !uid || !pl?.name) return;
    setBusy(true);
    try {
      const r = await proposeMeal({ authorUid: uid, authorName: nickname || '', schedule, place: pl, note: memo || '', audienceUids, slot });
      if (r?.taken) {
        Alert.alert('이미 정해졌어요', `${r.by ? r.by + '님이 ' : ''}식사 장소를 먼저 정했어요.\n변경은 정한 사람만 할 수 있어요.`);
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
    const author = isAuthorOf(meal);
    const editing = memoEdit?.slot === slot;
    return (
      <View key={slot} style={{ marginHorizontal: 18, marginBottom: 10, padding: 14, borderRadius: 12, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
        {decidedCount === 2 && (
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.warmGray, marginBottom: 4 }}>식사 {slot}</Text>
        )}
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>📍 {pl?.name} 로 결정</Text>
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
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.charcoal, marginTop: 6 }}>💬 {meal.note}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity onPress={() => openNav(pl, 'naver')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#2DB400' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>네이버 길찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openNav(pl, 'tmap')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: C.charcoal }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>티맵 길찾기</Text>
          </TouchableOpacity>
        </View>
        {/* 총대만 — 변경(장소 다시) / 메모 수정 */}
        {author && !editing && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity onPress={() => startPick(slot, meal)} activeOpacity={0.8}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray }}>다른 곳으로 변경</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMemoEdit({ slot, text: meal.note || '' })} activeOpacity={0.8}
              style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray }}>{meal.note ? '메모 수정' : '메모'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      {block ? (
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
                {schedule?.course}{schedule?.date ? ` · ${schedule.date}` : ''}
              </Text>
            </View>

            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
              {/* 결정된 식사 칸들 */}
              {meal1 && renderMealCard(meal1, 1)}
              {meal2 && renderMealCard(meal2, 2)}

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

              {/* 식당 고르기(picking) — 슬롯1 최초이거나 변경/추가 진행 중 */}
              {pickSlot !== null && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 6 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, flex: 1 }}>
                      {pickSlot === 2 ? '식사 2 정하기' : (meal1 ? '식사 변경' : '식사 정하기')}
                    </Text>
                    {meal1 && (
                      <TouchableOpacity onPress={() => { setPickSlot(null); setMemo(''); }} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray }}>닫기</Text>
                      </TouchableOpacity>
                    )}
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
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }} numberOfLines={1}>
                              {r.type}{r.distance ? ` · ${r.distance >= 1000 ? (r.distance / 1000).toFixed(1) + 'km' : r.distance + 'm'}` : ''}{r.loc ? ` · ${r.loc}` : ''}
                            </Text>
                          </View>
                          {r.url ? (
                            <TouchableOpacity onPress={() => Linking.openURL(r.url).catch(() => {})} activeOpacity={0.7} style={{ paddingHorizontal: 8, paddingVertical: 7 }}>
                              <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, textDecorationLine: 'underline' }}>상세</Text>
                            </TouchableOpacity>
                          ) : null}
                          <TouchableOpacity onPress={() => propose(r)} disabled={busy} activeOpacity={0.85}
                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: C.burgundy, opacity: busy ? 0.6 : 1 }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>여기로 정하기</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
