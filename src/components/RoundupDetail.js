import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { SCOPE_BADGE, waitlistRespondHours, pickNames } from '../constants/roundup';
import { OverlayAlert } from './common/OverlayAlert';

// 참여자 아바타 색상
const AV = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B8B5E', fg: '#fff' },
  { bg: '#D9B8B8', fg: '#5C1E1E' },
];

const sectionLabel = { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5,
  marginHorizontal: 16, marginTop: 22, marginBottom: 8 };
const hintStyle = { fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 6, lineHeight: 16 };

function Badge({ bg, fg, text }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 10, color: fg, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// 참여자 / 빈 슬롯 한 줄
function SlotRow({ slot, idx }) {
  if (slot.open) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.warmGrayLight,
          borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: C.warmGrayLight }}>+</Text>
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>모집 중인 자리</Text>
      </View>
    );
  }
  const pal = AV[idx % AV.length];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pal.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 16, color: pal.fg, fontWeight: '700' }}>{slot.name.charAt(0)}</Text>
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{slot.name}</Text>
      {slot.host && (
        <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.butter, fontWeight: '700' }}>주최자</Text>
        </View>
      )}
      <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#3C7D4F', fontWeight: '600', marginLeft: 'auto' }}>참여 확정</Text>
    </View>
  );
}

// 대기자 한 줄
function WaitRow({ num, name, me }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <View style={{ minWidth: 44, alignItems: 'center', backgroundColor: '#F0E8D8', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#8B6914', fontWeight: '700' }}>대기 {num}번</Text>
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: me ? '700' : '600' }}>{name}</Text>
      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginLeft: 'auto' }}>대기 중</Text>
    </View>
  );
}

// 슬롯 배열 생성 — teamIdx가 null이면 개별 모집
function buildSlots(post, teamIdx) {
  if (teamIdx == null) {
    const cap = post.capacity || 4;
    const filled = post.joined || 0;
    const names = pickNames(post.id, filled);
    return Array.from({ length: cap }, (_, i) =>
      i < filled ? { name: i === 0 ? post.author : names[i], host: i === 0 } : { open: true });
  }
  const filled = post.teamJoined[teamIdx] || 0;
  const names = pickNames(post.id + ':' + teamIdx, filled);
  return Array.from({ length: 4 }, (_, i) => {
    if (i >= filled) return { open: true };
    const host = teamIdx === 0 && i === 0;
    return { name: host ? post.author : names[i], host };
  });
}

// 라운딩 모집 상세 화면
export function RoundupDetail({ post, visible, joined, waitlistNum, onClose, onJoin, onWaitlist }) {
  const [teamTab, setTeamTab] = useState(0);
  const [alert, setAlert] = useState(null);

  useEffect(() => { if (visible) setTeamTab(0); }, [visible]);

  if (!post) return null;

  const isTeam = post.teams > 1;
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const allFull = isTeam
    ? post.teamJoined.every(c => c >= 4)
    : (post.joined || 0) >= (post.capacity || 4);
  const isClosed = post.closed || allFull;
  const respondHours = waitlistRespondHours(post.date);
  const slots = buildSlots(post, isTeam ? teamTab : null);
  const waiters = pickNames(post.id + ':wait', post.waitlistCount || 0);

  const confirmJoin = () => setAlert({
    title: '이 라운딩에 참여할까요?',
    message: '참여하면 모집자와 다른 동반자에게 바로 표시돼요. 신중하게 선택해주세요.',
    buttons: [
      { text: '취소', style: 'cancel' },
      { text: '참여하기', onPress: onJoin },
    ],
  });
  const handleKakao = () => setAlert({
    title: '카카오톡 단체방',
    message: '참여자들과 함께할 카카오톡 단체방을 만들어요. (Firebase 연동 후 제공돼요)',
    buttons: [{ text: '확인' }],
  });

  // 참여 / 마감(대기) 버튼
  let actionBtn;
  if (joined) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
        backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
        <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy, fontWeight: '700' }}>참여 완료 ✓</Text>
      </View>
    );
  } else if (!isClosed) {
    actionBtn = (
      <TouchableOpacity activeOpacity={0.85} onPress={confirmJoin}
        style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: C.burgundy }}>
        <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '700' }}>참여하기</Text>
      </TouchableOpacity>
    );
  } else if (waitlistNum) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
          backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#8B6914', fontWeight: '700' }}>⏳ 대기 {waitlistNum}번</Text>
        </View>
        <Text style={hintStyle}>
          취소자 발생 시 푸시 알림을 보내드려요. {respondHours}시간 내 미응답 시 다음 대기자에게 넘어가요.
        </Text>
      </View>
    );
  } else {
    actionBtn = (
      <View>
        <TouchableOpacity activeOpacity={0.85} onPress={onWaitlist}
          style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.charcoal }}>
          <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '700' }}>
            대기 신청{post.waitlistCount > 0 ? ` (현재 ${post.waitlistCount}명 대기)` : ''}
          </Text>
        </TouchableOpacity>
        <Text style={hintStyle}>
          마감된 모집이에요. 대기 신청하면 취소자 발생 시 알림을 받고 {respondHours}시간 내 응답하면 합류돼요.
        </Text>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>모집 상세</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
            {/* 1. 모집글 정보 */}
            <View style={{ backgroundColor: C.bgSecondary, marginHorizontal: 16, marginTop: 16, marginBottom: 4, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <Badge bg={post.type === 'fixed' ? C.charcoal : '#6B8B5E'} fg="#fff" text={post.type === 'fixed' ? '확정형' : '오픈형'} />
                {isTeam && <Badge bg={C.navy} fg={C.butter} text={`단체 ${post.teams}팀`} />}
                <Badge bg={sb.bg} fg={sb.fg} text={sb.label} />
                {isClosed && <Badge bg="#E6C8C8" fg="#5C1E1E" text="마감" />}
              </View>

              {post.type === 'fixed' ? (
                <>
                  <Text style={{ fontFamily: F.sys, fontSize: 18, color: C.charcoal, fontWeight: '700' }}>{post.course}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
                    {post.date} ({post.day}) · {post.time}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontFamily: F.sys, fontSize: 18, color: C.charcoal, fontWeight: '700' }}>장소 · 날짜 미정</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textSecondary, marginTop: 4 }}>동반자와 함께 정해요</Text>
                </>
              )}

              {post.word ? (
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 10, padding: 12, marginTop: 12 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textSecondary, lineHeight: 19 }}>"{post.word}"</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight }}>모집 인원</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '700', marginLeft: 8 }}>
                  {isTeam ? `${post.teams}팀 · ${post.teams * 4}명` : `${post.capacity}명`}
                </Text>
              </View>

              <View style={{ marginTop: 14 }}>{actionBtn}</View>
            </View>

            {/* 2·3. 참여자 현황 (단체면 팀 탭) */}
            <Text style={[sectionLabel, { marginTop: 10 }]}>참여자 현황</Text>
            <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
              borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
              {isTeam && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  {post.teamJoined.map((_, i) => {
                    const on = teamTab === i;
                    return (
                      <TouchableOpacity key={i} onPress={() => setTeamTab(i)} activeOpacity={0.8}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8,
                          backgroundColor: on ? C.charcoal : C.bgPrimary, borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>
                          {i + 1}팀
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {slots.map((s, i) => <SlotRow key={i} slot={s} idx={i} />)}
            </View>

            {/* 대기자 */}
            {(post.waitlistCount > 0 || waitlistNum) && (
              <>
                <Text style={sectionLabel}>대기자</Text>
                <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
                  borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
                  {waiters.map((nm, i) => <WaitRow key={i} num={i + 1} name={nm} />)}
                  {waitlistNum ? <WaitRow num={waitlistNum} name="나" me /> : null}
                </View>
              </>
            )}

            {/* 4. 카카오톡 단체방 */}
            <TouchableOpacity onPress={handleKakao} activeOpacity={0.85}
              style={{ marginHorizontal: 16, marginTop: 22, backgroundColor: '#FEE500', borderRadius: 12,
                paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Text style={{ fontSize: 15 }}>💬</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#3C1E1E', fontWeight: '700' }}>카카오톡 단체방 만들기</Text>
            </TouchableOpacity>

            {/* 댓글 영역 — UI만 (기능은 추후 추가) */}
            <Text style={sectionLabel}>댓글</Text>
            <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
              borderWidth: 0.5, borderColor: C.hairline, paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight }}>댓글 기능은 곧 추가될 예정이에요</Text>
            </View>
          </ScrollView>

          {/* 참여 확인 / 카카오 안내 — 모달 위 오버레이 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
