import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { searchNearbyRestaurants, searchRestaurantsByKeyword } from '../utils/kakao';
import { getSavedRestaurants } from '../utils/savedRestaurants';
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { searchGolfCourses } from '../utils/golfCourses';
import {
  proposeMeal, toggleAgreeMeal, decideMeal,
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

// 뒤풀이 결정 — 카드 버튼(귀가교통·맛집 옆) + 팝업. ([[afterround-meal-decision]])
//  active=오늘/종료 라운딩일 때만 버튼 노출. 탭하면 팝업: 검색·제안 → 동의 → 결정 → 네이버·티맵 길찾기.
//  총대 1명 제안(meal_{scheduleId} 단일 문서) → 동반자 👍. 동반자는 audienceUids로 발견.
export function MealDecisionBar({ schedule, uid, nickname, active }) {
  const insets = useSafeAreaInsets();
  const [mine, setMine] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [open, setOpen] = useState(false);
  const [coord, setCoord] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false); // '다른 곳 고르기' — 제안 있어도 리스트 보기
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);

  const [members, setMembers] = useState([]); // 전파 일정 그룹의 라운딩 인원(수락자+초대받은 전원) — audience 소스(companions보다 신뢰)
  // ★공유 키 — 전파 일정은 groupId로 모든 참여자가 같은 meal 문서에 수렴(사용자별 schedule.id 발산 방지).
  const mealKey = schedule?.groupId || schedule?.id;
  useEffect(() => {
    if (!active || !mealKey) { setMine(null); return; }
    return subscribeMealForSchedule(mealKey, setMine);
  }, [active, mealKey]);
  useEffect(() => {
    if (!active || !uid) { setIncoming([]); return; }
    return subscribeIncomingMeals(uid, setIncoming);
  }, [active, uid]);
  // 전파 일정이면 그룹의 '라운딩 인원'을 audience 소스로 — memberUids(수락자)뿐 아니라 audienceUids(초대받은 전원)도 포함.
  //   아직 일정을 수락하지 않은 동반자에게도 뒤풀이 제안이 가야 하므로(주최자 schedule.companions 누락과도 무관). 자기 제외는 audienceUids 계산에서.
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
  // 일정이 바뀌면(삭제·재생성·다른 라운딩) 캐시된 좌표·식당 리스트 초기화 — 옛 코스의 식당 리스트가 남아 보이던 버그 방지.
  useEffect(() => { setCoord(null); setList([]); setKw(''); setPicking(false); }, [schedule?.id]);

  const meal = mine || incoming.find(m => m.date === schedule?.date && m.course === schedule?.course) || null;
  const isAuthor = !!meal && meal.authorUid === uid;
  const agreedN = meal?.agreedUids?.length || 0;
  const iAgreed = !!meal && (meal.agreedUids || []).includes(uid);
  const place = meal?.place;

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
      // 저장 맛집(코스별)은 최상단 + 표식, 주변 검색결과에서 중복 제거 — 단골/미리 점찍은 곳 먼저 보이게.
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
  const openSheet = () => { setOpen(true); setKw(''); setPicking(false); if (!coord) loadNearby(); };

  useEffect(() => {
    if (!open) return;
    const q = kw.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      try { setList(await searchRestaurantsByKeyword(q, coord?.y, coord?.x)); } catch { /* noop */ }
    }, 350);
    return () => clearTimeout(t);
  }, [kw, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const propose = async (pl) => {
    if (busy || !uid || !pl?.name) return;
    setBusy(true);
    try {
      await proposeMeal({ authorUid: uid, authorName: nickname || '', schedule, place: pl, note: '', audienceUids });
      setKw(''); setPicking(false);
    } catch (e) { if (__DEV__) console.warn('[meal] propose', e?.message); }
    finally { setBusy(false); }
  };
  const agree = async () => {
    if (busy || !meal || !uid) return;
    setBusy(true);
    try { await toggleAgreeMeal(meal.id, uid, !iAgreed); } catch { /* noop */ } finally { setBusy(false); }
  };
  const decide = async () => {
    if (busy || !meal || !uid) return;
    setBusy(true);
    try { await decideMeal(meal.id, uid); } catch { /* noop */ } finally { setBusy(false); }
  };
  const openNav = (provider) => {
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.y)) return;
    const name = encodeURIComponent(place.name || '식당');
    if (provider === 'tmap') Linking.openURL(`tmap://route?goalx=${place.x}&goaly=${place.y}&goalname=${name}`).catch(() => Linking.openURL('https://tmap.life'));
    else Linking.openURL(`nmap://route/car?dlat=${place.y}&dlng=${place.x}&dname=${name}&appname=app.deargolf`).catch(() => Linking.openURL('https://map.naver.com/'));
  };

  if (!active) return null;

  // 카드 버튼 라벨 — 귀가교통·맛집 버튼과 동일 톤(반투명·한 줄)
  const btnLabel = !meal ? '🍴 뒤풀이' : meal.decided ? `🍴 ${place?.name || '결정됨'} ✓` : `🍴 ${place?.name || '정하는 중'}`;
  const showList = !meal || picking;

  return (
    <>
      <TouchableOpacity onPress={openSheet} activeOpacity={0.8}
        style={{ flex: 1, backgroundColor: meal?.decided ? 'rgba(245,230,168,0.18)' : 'rgba(255,255,255,0.1)',
          borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: meal?.decided ? C.butter : '#fff' }} numberOfLines={1}>{btnLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: 20 + insets.bottom, maxHeight: '82%' }}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline }} />
            </View>
            <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>🍴 오늘 뒤풀이</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {schedule?.course}{schedule?.date ? ` · ${schedule.date}` : ''}
              </Text>
            </View>

            {/* 결정됨 — 길찾기 */}
            {meal?.decided && (
              <View style={{ marginHorizontal: 18, marginBottom: 10, padding: 14, borderRadius: 12, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>📍 {place?.name} 로 결정</Text>
                {!!place?.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>{place.loc}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => openNav('naver')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#2DB400' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>네이버 길찾기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openNav('tmap')} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: C.charcoal }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>티맵 길찾기</Text>
                  </TouchableOpacity>
                </View>
                {/* 총대만 — 결정 후 변경(다른 곳 고르면 결정 풀리고 새 제안으로 덮어씀) */}
                {isAuthor && (
                  <TouchableOpacity onPress={() => setPicking(true)} activeOpacity={0.8}
                    style={{ marginTop: 10, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray }}>다시 정하기</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 제안 진행 중 — 동의/결정 */}
            {meal && !meal.decided && (
              <View style={{ marginHorizontal: 18, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>
                  제안: {place?.name} <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>· 동의 {agreedN}</Text>
                </Text>
                {!!place?.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 2 }} numberOfLines={1}>{place.loc}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {!isAuthor && (
                    <TouchableOpacity onPress={agree} disabled={busy} activeOpacity={0.85}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: iAgreed ? C.bgPrimary : C.burgundy, borderWidth: iAgreed ? 1 : 0, borderColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: iAgreed ? C.warmGray : C.butter }}>{iAgreed ? '동의 취소' : '👍 동의'}</Text>
                    </TouchableOpacity>
                  )}
                  {isAuthor && (
                    <TouchableOpacity onPress={decide} disabled={busy} activeOpacity={0.85}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: C.burgundy }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>여기로 결정</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setPicking(p => !p)} activeOpacity={0.85}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>{picking ? '닫기' : '다른 곳'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {audienceUids.length === 0 && !meal && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingHorizontal: 18, marginBottom: 6 }}>
                이 라운딩에 친구 동반자가 없어요. 일정 동반자에 친구를 넣으면 함께 정할 수 있어요.
              </Text>
            )}

            {/* 식당 리스트(없을 때 또는 '다른 곳') */}
            {showList && (
              <>
                <View style={{ paddingHorizontal: 18, marginBottom: 6 }}>
                  <TextInput value={kw} onChangeText={setKw} placeholder="식당 이름으로 검색" placeholderTextColor={C.warmGrayLight}
                    style={{ backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} />
                </View>
                <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
                  {loading ? (
                    <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.burgundy} /></View>
                  ) : list.length === 0 ? (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 24, textAlign: 'center' }}>
                      {coord ? '주변 식당을 찾지 못했어요 — 이름으로 검색해보세요' : '코스 위치를 찾지 못해 검색만 가능해요'}
                    </Text>
                  ) : (
                    list.map((r) => (
                      <View key={r.kakaoId || r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
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
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>제안</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
