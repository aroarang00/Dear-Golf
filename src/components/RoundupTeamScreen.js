import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller'; // Modal 안 입력칸 키보드 가림 방지(iOS·안드)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { updateRoundupTeamPlan } from '../utils/roundup';
import { getSubCoursesForCourse } from '../utils/golfCourses';   // 세부코스 칩 제안(시드된 구장)
import { SubCourseChips } from './common/SubCourseChips';
import { anonNick } from '../utils/anonNick';
import { showToast } from './AppToast';

// 단체팀 화면 — 세부코스(+) 안에 티오프(+)=조. 골프장 예약 구조(코스→티오프)와 일치, 묶임/갈림 자연 표현.
//  맨 위 구장·날짜 히어로 + 주최자 메모(공지) + 참여자 칩(누가 있는지). 데이터는 모집글 teamPlan에만 저장(신규 컬렉션·CF·규칙 0).
//  주최자는 헤더 '수정'으로 편집모드 전환해야만 편집 가능(평소 보기). 참여자는 항상 읽기. ([[event-model]] 간소화안)
const MEMO_MAX = 200;
const newFlight = (tee = '') => ({ tee, note: '' });
const newGroup = (tee = '') => ({ course: '', flights: [newFlight(tee)] });
// 티오프 시각에 분 더하기 — "07:00"+7 → "07:07". 파싱 실패 시 빈 문자열. 24시 넘으면 wrap.
const addMin = (t, m) => {
  const [h, mm] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(mm)) return '';
  const total = (((h * 60 + mm + m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function RoundupTeamScreen({ visible, roundupId, onClose }) {
  const insets = useSafeAreaInsets();
  const myUid = useCurrentUid();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);   // [{ course, flights:[{tee,note}] }]
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);    // 보기 ↔ 수정 (호스트만 전환)
  const [memberNames, setMemberNames] = useState({}); // uid→닉네임 (참여자 칩)
  const [memberReal, setMemberReal] = useState({});   // uid→본명(있을 때만, 호스트 전용 — 칩 표시·조배정 매칭)
  const [subCourseOpts, setSubCourseOpts] = useState([]); // 구장의 세부코스 칩 제안(시드된 구장만)
  // 모집 구장(courseKakaoId)의 세부코스 칩 로드 — 시드된 구장만(없으면 []=칩 미표시, 자유입력 유지)
  useEffect(() => {
    const kid = post?.courseKakaoId;
    if (!kid) { setSubCourseOpts([]); return; }
    let alive = true;
    getSubCoursesForCourse(kid).then(o => { if (alive) setSubCourseOpts(o); }).catch(() => {});
    return () => { alive = false; };
  }, [post?.courseKakaoId]);

  // 모집 실시간 구독 — 참여자(결원·충원)를 즉시 반영. teamPlan·메모는 첫 로드 때만 채워 편집 중 덮어쓰기 방지.
  useEffect(() => {
    if (!visible || !roundupId) return;
    let first = true;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'roundups', roundupId), (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const p = { id: snap.id, ...snap.data() };
      setPost(p);
      if (first) {
        const existing = Array.isArray(p?.teamPlan) ? p.teamPlan : [];
        setGroups(existing.length
          ? existing.map((g) => ({ course: g?.course || '', flights: (Array.isArray(g?.flights) && g.flights.length ? g.flights : [newFlight()]).map((f) => ({ tee: f?.tee || '', note: f?.note || '' })) }))
          : [newGroup(p?.time || '')]);
        setMemo(p?.teamNotice || '');
        first = false;
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [visible, roundupId]);

  // 닫히면 수정모드 해제 — 다음 진입은 항상 보기 모드부터.
  useEffect(() => { if (!visible) setEditMode(false); }, [visible]);

  // 참여자 이름 — 닉네임(표시) + 본명(호스트 전용: 조편성은 본명으로 적는 게 일반이라 칩·배정매칭에 본명 우선).
  //   같은 users 문서에서 realName도 함께 읽음(추가 읽기 없음). 본명은 호스트 시야에서만 사용(동반자엔 닉네임 유지).
  useEffect(() => {
    const uids = post?.participantUids;
    if (!Array.isArray(uids) || !uids.length) { setMemberNames({}); setMemberReal({}); return; }
    let alive = true;
    Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))
      .then((s) => { const d = s.exists() ? s.data() : null; return [u, (d && d.nickname) || '골퍼', (d && d.realName ? String(d.realName).trim() : '')]; })
      .catch(() => [u, '골퍼', ''])))
      .then((rows) => {
        if (!alive) return;
        setMemberNames(Object.fromEntries(rows.map(([u, nick]) => [u, nick])));
        setMemberReal(Object.fromEntries(rows.map(([u, , real]) => [u, real])));
      });
    return () => { alive = false; };
  }, [post?.participantUids]);

  const isHost = !!post && !!myUid && post.authorUid === myUid;
  const canEdit = isHost && editMode;   // 실제 편집 허용 — 호스트 + 수정모드일 때만
  const memberCount = (post?.participantUids?.length) || 0;
  // 미배정 자동 경고 제거(2026-06-27) — 멤버칸이 자유 텍스트라 이름 글자 매칭 휴리스틱은 닉네임만 있거나 표기가
  //   다른 사람을 '미배정'으로 오판해 역효과. 완료는 주최자가 '편성 완료' 버튼으로 명시(teamPlanDone)하므로 불필요.

  const setCourse = (gi, v) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, course: v } : g)));
  const setFlight = (gi, fi, key, v) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: g.flights.map((f, j) => (j === fi ? { ...f, [key]: v } : f)) } : g)));
  const addFlight = (gi) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: [...g.flights, newFlight()] } : g)));
  const removeFlight = (gi, fi) => setGroups((p) => p.map((g, i) => (i === gi ? { ...g, flights: g.flights.filter((_, j) => j !== fi) } : g)).filter((g) => g.flights.length > 0));
  // 세부코스 추가 — 기본 티오프는 첫 조 시각으로(같은 시간대 라운딩이 흔함). 거기서 +7/+8분으로 조정.
  const addGroup = () => setGroups((p) => [...p, newGroup(p[0]?.flights?.[0]?.tee || post?.time || '')]);
  const removeGroup = (gi) => setGroups((p) => (p.length > 1 ? p.filter((_, i) => i !== gi) : p));
  // 전체 순서상 직전 조의 티오프 — +7/+8분 자동입력 기준. 첫 조(직전 없음)면 빈 문자열.
  const prevTee = (gi, fi) => {
    if (fi > 0) return groups[gi]?.flights[fi - 1]?.tee || '';
    for (let i = gi - 1; i >= 0; i--) {
      const fl = groups[i]?.flights;
      if (fl && fl.length) return fl[fl.length - 1].tee || '';
    }
    return '';
  };

  // 편성 완료 — 주최자가 명시(teamPlanDone=true). 미배정은 위 호박색 배너가 사전 경고하므로 별도 확인창 없이 바로 완료.
  //   (이 화면엔 AppAlertHost가 없어 showAppAlert가 안 떠 버튼이 안 먹던 버그 → toast로 통일.)
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateRoundupTeamPlan(roundupId, { teamPlan: groups, teamNotice: memo, teamPlanDone: true });
      showToast('편성 완료 🎉');
      setEditMode(false);   // 완료 후 보기 모드로
    } catch (e) {
      if (__DEV__) console.warn('[teamScreen] save fail', e?.message);
      showToast('저장에 실패했어요 · 잠시 후 다시 시도해 주세요');
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
          <View style={{ flex: 1 }} />
          {/* 편성 완료 배지 — 주최자가 '편성 완료'를 누르면 표시(보기 모드). 호스트·동반자 공통으로 '확정됨' 신호 */}
          {!!post?.teamPlanDone && !editMode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F0E0', borderWidth: 0.5, borderColor: '#9BB87E', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#5E7E42' }}>✓ 편성 완료</Text>
            </View>
          )}
          {/* 수정 모드 토글 — 호스트만. 평소 '수정'(네이비), 수정 중 '보기'로 빠져나감 */}
          {isHost && !loading && !!post && (
            <TouchableOpacity onPress={() => setEditMode((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 9, backgroundColor: editMode ? C.bgSecondary : C.navy, borderWidth: editMode ? 0.5 : 0, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: editMode ? C.charcoal : '#fff' }}>{editMode ? '보기' : '수정'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.burgundy} /></View>
        ) : !post ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>모집 정보를 불러오지 못했어요.</Text>
          </View>
        ) : (
          <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" bottomOffset={24} showsVerticalScrollIndicator={false}>

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

            {/* ── 참여자 칩 — 호스트·동반자 모두 '누가 빠지고 들어왔는지' 확인. 충원·결원 실시간 반영(조 자동배정은 안 함).
                 익명 참여자는 호스트엔 실명, 동반자 시야엔 랜덤닉으로 마스킹(호스트·본인 식별은 유지). ([[roundup-anonymous-participation]]) ── */}
            {memberCount > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginBottom: 7 }}>참여자 {memberCount}명</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {post.participantUids.map((u) => {
                    const masked = !isHost && u !== post.authorUid && Array.isArray(post.anonymousUids) && post.anonymousUids.includes(u);
                    // 호스트 시야엔 본명 우선(조편성 이름과 일치 → 식별 쉬움), 동반자 시야엔 닉네임(본명 미노출).
                    const nm = masked ? anonNick(u, post.id) : ((isHost && memberReal[u]) ? memberReal[u] : (memberNames[u] || '골퍼'));
                    return (
                      <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, justifyContent: 'center' }}>
                        {/* iOS는 이모지 닉네임이면 라인박스가 비대칭으로 커져 세로 치우침 → 고정 lineHeight로 박스 일정화·중앙 정렬(안드는 정상이라 미적용) */}
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal, textAlign: 'center', ...(Platform.OS === 'ios' ? { lineHeight: fs(19) } : null) }}>{nm}{u === myUid ? ' (나)' : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── 주최자 메모(공지) + 글자수 ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 5 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>📌 주최자 메모</Text>
              {canEdit && <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: memo.length >= MEMO_MAX ? C.burgundy : C.warmGray }}>{memo.length}/{MEMO_MAX}</Text>}
            </View>
            {canEdit ? (
              <TextInput value={memo} onChangeText={setMemo} multiline maxLength={MEMO_MAX}
                placeholder="전체 공지 — 집결 장소·시간, 회비, 준비물 등" placeholderTextColor={C.warmGrayLight}
                style={[INP, { minHeight: 64, textAlignVertical: 'top' }]} />
            ) : (
              <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, padding: 13, backgroundColor: '#F5ECD6' }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(15), color: memo ? C.charcoal : C.warmGray, lineHeight: 22 }}>{memo || '아직 공지가 없어요'}</Text>
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
                  {canEdit ? (
                    <TextInput value={g.course} onChangeText={(v) => setCourse(gi, v)} placeholder="세부코스 직접 입력 (예: 동코스)" placeholderTextColor={C.warmGrayLight}
                      maxLength={20} style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.navy, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.warmGrayLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: Platform.OS === 'android' ? 5 : 7 }} />
                  ) : (
                    <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.navy }}>{g.course || '세부코스 미정'}</Text>
                  )}
                  {canEdit && groups.length > 1 && (
                    <TouchableOpacity onPress={() => removeGroup(gi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: fs(15), color: C.warmGray }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 세부코스 칩 제안 — 시드된 구장만(없으면 미표시). 탭하면 이 조의 세부코스 채움 */}
                {canEdit && subCourseOpts.length > 0 && (
                  <View style={{ paddingHorizontal: 13, paddingTop: 8 }}>
                    <SubCourseChips options={subCourseOpts} value={g.course} onPick={(v) => setCourse(gi, v)} />
                  </View>
                )}

                {/* 티오프(조)들 */}
                {g.flights.map((f, fi) => {
                  const teamNo = baseNo + fi + 1;
                  const base = prevTee(gi, fi);   // 직전 조 티오프 — +7/+8분 자동입력 기준
                  return (
                  <View key={fi} style={{ flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: fi === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                    {/* 조 배지 — 구분되는 알약 */}
                    <View style={{ alignItems: 'center', marginRight: 11, paddingTop: 1 }}>
                      <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 34, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#fff' }}>{teamNo}조</Text>
                      </View>
                      {canEdit && g.flights.length > 1 && (
                        <TouchableOpacity onPress={() => removeFlight(gi, fi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 6 }}>
                          <Text style={{ fontSize: fs(13), color: C.warmGray }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* 시간 + 멤버 */}
                    <View style={{ flex: 1 }}>
                      {canEdit ? (
                        <>
                          <TextInput value={f.tee} onChangeText={(v) => setFlight(gi, fi, 'tee', v)} placeholder="티오프 (예: 07:00)" placeholderTextColor={C.warmGrayLight}
                            maxLength={5} keyboardType="numbers-and-punctuation" style={[INP, { paddingVertical: Platform.OS === 'android' ? 6 : 8 }]} />
                          {/* 직전 조 기준 +7/+8분 자동입력 — 골프 티오프 간격. 첫 조(기준 없음)엔 안 보임 */}
                          {!!base && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <TouchableOpacity onPress={() => setFlight(gi, fi, 'tee', addMin(base, 7))} style={TEE_BTN}>
                                <Text style={TEE_BTN_TXT}>＋7분</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setFlight(gi, fi, 'tee', addMin(base, 8))} style={TEE_BTN}>
                                <Text style={TEE_BTN_TXT}>＋8분</Text>
                              </TouchableOpacity>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>직전 조 {base} 기준</Text>
                            </View>
                          )}
                          <TextInput value={f.note} onChangeText={(v) => setFlight(gi, fi, 'note', v)} multiline
                            placeholder="멤버 이름 직접 입력 (예: 홍길동·김철수·이영희·박민수)" placeholderTextColor={C.warmGrayLight}
                            style={[INP, { marginTop: 7, minHeight: 40, textAlignVertical: 'top' }]} />
                        </>
                      ) : (
                        <>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>{f.tee || '시간 미정'}</Text>
                          <Text style={{ marginTop: 5, fontFamily: F.sysM, fontSize: fs(15), color: f.note ? C.charcoal : C.warmGray, lineHeight: 22 }}>{f.note || '조 편성 미정'}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  );
                })}

                {canEdit && (
                  <TouchableOpacity onPress={() => addFlight(gi)} activeOpacity={0.7} style={{ paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.navy }}>＋ 티오프(조) 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
              );
            })}

            {canEdit && (
              <TouchableOpacity onPress={addGroup} activeOpacity={0.7} style={{ marginTop: 10, borderWidth: 1, borderColor: C.navy, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.navy }}>＋ 세부코스 추가</Text>
              </TouchableOpacity>
            )}

            {canEdit && (
              <TouchableOpacity onPress={save} activeOpacity={0.85} disabled={saving}
                style={{ marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: C.burgundy, opacity: saving ? 0.6 : 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{saving ? '완료 중…' : '편성 완료'}</Text>
              </TouchableOpacity>
            )}

            {/* 호스트인데 보기 모드 — '수정'으로 전환하라는 힌트 (편집 UI 숨겨져 혼란 방지) */}
            {isHost && !editMode && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, textAlign: 'center', marginTop: 18 }}>
                편집하려면 오른쪽 위 ‘수정’을 눌러주세요.
              </Text>
            )}
          </KeyboardAwareScrollView>
        )}
      </View>
      </KeyboardProvider>
    </Modal>
  );
}

// 입력칸 — 흰 배경 + 또렷한 테두리로 '입력칸'임이 분명하게(시트=크림/카드=흰색 양쪽에서 구분되게 테두리는 진하게)
const INP = { borderWidth: 1, borderColor: C.warmGrayLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 8 : 11, fontFamily: F.sysM, fontSize: fs(15), color: C.charcoal, backgroundColor: '#FFFFFF' };
const TEE_BTN = { borderWidth: 1, borderColor: C.navy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 };
const TEE_BTN_TXT = { fontFamily: F.sysSb, fontSize: fs(12), color: C.navy };
