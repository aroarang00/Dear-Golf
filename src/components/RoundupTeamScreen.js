import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller'; // Modal 안 입력칸 키보드 가림 방지(iOS·안드)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { loadRoundup, updateRoundupTeamPlan } from '../utils/roundup';
import { showToast } from './AppToast';
import { showAppAlert } from './AppAlert';

// 단체팀 화면 — 세부코스(+) 안에 티오프(+)=조. 골프장 예약 구조(코스→티오프)와 일치, 묶임/갈림 자연 표현.
//  맨 위 구장·날짜 히어로 + 주최자 메모(공지). 데이터는 모집글 teamPlan에만 저장(신규 컬렉션·CF·규칙 0).
//  주최자 편집(+참여자 읽기). ([[event-model]] 간소화안)
const MEMO_MAX = 200;
const newFlight = (tee = '') => ({ tee, note: '' });
const newGroup = (tee = '') => ({ course: '', flights: [newFlight(tee)] });

export function RoundupTeamScreen({ visible, roundupId, onClose }) {
  const insets = useSafeAreaInsets();
  const myUid = useCurrentUid();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);   // [{ course, flights:[{tee,note}] }]
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !roundupId) return;
    let alive = true;
    setLoading(true);
    loadRoundup(roundupId).then((p) => {
      if (!alive) return;
      setPost(p);
      const existing = Array.isArray(p?.teamPlan) ? p.teamPlan : [];
      setGroups(existing.length
        ? existing.map((g) => ({ course: g?.course || '', flights: (Array.isArray(g?.flights) && g.flights.length ? g.flights : [newFlight()]).map((f) => ({ tee: f?.tee || '', note: f?.note || '' })) }))
        : [newGroup(p?.time || '')]);
      setMemo(p?.teamNotice || '');
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, roundupId]);

  const isHost = !!post && !!myUid && post.authorUid === myUid;
  const memberCount = (post?.participantUids?.length) || 0;

  const setCourse = (gi, v) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, course: v } : g)));
  const setFlight = (gi, fi, key, v) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: g.flights.map((f, j) => (j === fi ? { ...f, [key]: v } : f)) } : g)));
  const addFlight = (gi) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: [...g.flights, newFlight()] } : g)));
  const removeFlight = (gi, fi) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: g.flights.filter((_, j) => j !== fi) } : g)).filter((g) => g.flights.length > 0));
  const addGroup = () => setGroups((p) => [...p, newGroup()]);
  const removeGroup = (gi) => setGroups((p) => (p.length > 1 ? p.filter((_, i) => i !== gi) : p));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateRoundupTeamPlan(roundupId, { teamPlan: groups, teamNotice: memo });
      showToast('단체팀 정보를 저장했어요');
      onClose?.();
    } catch (e) {
      if (__DEV__) console.warn('[teamScreen] save fail', e?.message);
      showAppAlert('저장에 실패했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
            <Text style={{ fontSize: fs(23), color: C.charcoal }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginLeft: 4 }}>단체팀</Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.burgundy} /></View>
        ) : !post ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>모집 정보를 불러오지 못했어요.</Text>
          </View>
        ) : (
          <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled" bottomOffset={24} showsVerticalScrollIndicator={false}>

            {/* ── 히어로: 구장 · 날짜 (가장 중요) ── */}
            <View style={{ backgroundColor: C.navy, borderRadius: 16, padding: 18 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff' }} numberOfLines={2}>{post.course || '라운딩'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Icon name="calendar" size={fs(15)} color={C.butter} strokeWidth={1.8} />
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14.5), color: C.butter }}>{post.date || '날짜 미정'} {post.day || ''}</Text>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: 'rgba(255,255,255,0.7)', marginLeft: 6 }}>· 참여 {memberCount}명</Text>
              </View>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 8, lineHeight: 17 }}>
              첫 티오프 전에 다 모여요 — 카드·알람은 첫 티오프 기준이에요.
            </Text>

            {/* ── 주최자 메모(공지) + 글자수 ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 5 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>📌 주최자 메모</Text>
              {isHost && <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: memo.length >= MEMO_MAX ? C.burgundy : C.warmGray }}>{memo.length}/{MEMO_MAX}</Text>}
            </View>
            {isHost ? (
              <TextInput value={memo} onChangeText={setMemo} multiline maxLength={MEMO_MAX}
                placeholder="전체 공지 — 집결 장소·시간, 회비, 준비물 등" placeholderTextColor={C.warmGrayLight}
                style={[INP, { minHeight: 64, textAlignVertical: 'top' }]} />
            ) : (
              <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, padding: 13, backgroundColor: '#F5ECD6' }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: memo ? C.charcoal : C.warmGray, lineHeight: 21 }}>{memo || '아직 공지가 없어요'}</Text>
              </View>
            )}

            {/* ── 세부코스 묶음 → 티오프(조). 조 번호는 전체 순서대로 자동 ── */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginTop: 22, marginBottom: 2 }}>조 편성 · 티오프</Text>
            {groups.map((g, gi) => {
              const baseNo = groups.slice(0, gi).reduce((n, gg) => n + (gg.flights?.length || 0), 0);
              return (
              <View key={gi} style={{ marginTop: 10, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 14, backgroundColor: C.bgSecondary, overflow: 'hidden' }}>
                {/* 세부코스 헤더 — 연한 띠로 구분 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#EDF1F4', borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <Icon name="flag" size={fs(16)} color={C.navy} strokeWidth={1.9} />
                  {isHost ? (
                    <TextInput value={g.course} onChangeText={(v) => setCourse(gi, v)} placeholder="세부코스 (예: 동코스)" placeholderTextColor={C.warmGrayLight}
                      maxLength={20} style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.navy, padding: 0 }} />
                  ) : (
                    <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.navy }}>{g.course || '세부코스 미정'}</Text>
                  )}
                  {isHost && groups.length > 1 && (
                    <TouchableOpacity onPress={() => removeGroup(gi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: fs(15), color: C.warmGray }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 티오프(조)들 */}
                {g.flights.map((f, fi) => {
                  const teamNo = baseNo + fi + 1;
                  return (
                  <View key={fi} style={{ flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: fi === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                    {/* 조 배지 — 구분되는 알약 */}
                    <View style={{ alignItems: 'center', marginRight: 11, paddingTop: 1 }}>
                      <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 34, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#fff' }}>{teamNo}조</Text>
                      </View>
                      {isHost && g.flights.length > 1 && (
                        <TouchableOpacity onPress={() => removeFlight(gi, fi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 6 }}>
                          <Text style={{ fontSize: fs(13), color: C.warmGray }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* 시간 + 멤버 */}
                    <View style={{ flex: 1 }}>
                      {isHost ? (
                        <>
                          <TextInput value={f.tee} onChangeText={(v) => setFlight(gi, fi, 'tee', v)} placeholder="티오프 (예: 07:00)" placeholderTextColor={C.warmGrayLight}
                            maxLength={5} keyboardType="numbers-and-punctuation" style={[INP, { paddingVertical: Platform.OS === 'android' ? 6 : 8 }]} />
                          <TextInput value={f.note} onChangeText={(v) => setFlight(gi, fi, 'note', v)} multiline
                            placeholder="멤버 (예: 홍길동·김철수·이영희·박민수)" placeholderTextColor={C.warmGrayLight}
                            style={[INP, { marginTop: 7, minHeight: 40, textAlignVertical: 'top' }]} />
                        </>
                      ) : (
                        <>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>{f.tee || '시간 미정'}</Text>
                          <Text style={{ marginTop: 5, fontFamily: F.sysM, fontSize: fs(14), color: f.note ? C.charcoal : C.warmGray, lineHeight: 21 }}>{f.note || '조 편성 미정'}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  );
                })}

                {isHost && (
                  <TouchableOpacity onPress={() => addFlight(gi)} activeOpacity={0.7} style={{ paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.navy }}>＋ 티오프(조) 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
              );
            })}

            {isHost && (
              <TouchableOpacity onPress={addGroup} activeOpacity={0.7} style={{ marginTop: 10, borderWidth: 1, borderColor: C.navy, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.navy }}>＋ 세부코스 추가</Text>
              </TouchableOpacity>
            )}

            {isHost && (
              <TouchableOpacity onPress={save} activeOpacity={0.85} disabled={saving}
                style={{ marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: C.burgundy, opacity: saving ? 0.6 : 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{saving ? '저장 중…' : '저장'}</Text>
              </TouchableOpacity>
            )}
          </KeyboardAwareScrollView>
        )}
      </View>
      </KeyboardProvider>
    </Modal>
  );
}

const INP = { borderWidth: 1, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 8 : 11, fontFamily: F.sysM, fontSize: fs(15), color: C.charcoal, backgroundColor: C.bgPrimary };
