import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { SCOPE_BADGE, FILTER_BADGE, COMPANION_LABEL, SKILL_LABEL, waitlistRespondHours, pickNames } from '../constants/roundup';
import { ProfileActionSheet } from './common/ProfileActionSheet';
import { OverlayAlert } from './common/OverlayAlert';
import { UserContext } from '../contexts/UserContext';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge } from './common/TrustBadge';
import { MannerBadge } from './common/MannerBadge';
import { MANNER_DELTAS, cancelDeltaKindByHours, CANCEL_DELTA_LABEL } from '../constants/mannerGrade';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';

// 참여자 아바타 색상
const AV = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B8B5E', fg: '#fff' },
  { bg: '#D9B8B8', fg: '#5C1E1E' },
];

const sectionLabel = { fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5,
  marginHorizontal: 16, marginTop: 22, marginBottom: 8 };
const hintStyle = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 };

function Badge({ bg, fg, text }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: fg }}>{text}</Text>
    </View>
  );
}

// 참여자 / 빈 슬롯 한 줄. onPress 시 신고/차단 시트.
function SlotRow({ slot, idx, onPress }) {
  if (slot.open) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.warmGrayLight,
          borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(16), color: C.warmGray }}>+</Text>
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>모집 중인 자리</Text>
      </View>
    );
  }
  const pal = AV[idx % AV.length];
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pal.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: pal.fg }}>{slot.name.charAt(0)}</Text>
      </View>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{slot.name}</Text>
      {slot.host && (
        <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>주최자</Text>
        </View>
      )}
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#3C7D4F', marginLeft: 'auto' }}>참여 확정</Text>
    </TouchableOpacity>
  );
}

// 대기자 한 줄
function WaitRow({ num, name, me }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <View style={{ minWidth: 44, alignItems: 'center', backgroundColor: '#F0E8D8', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#8B6914' }}>대기 {num}번</Text>
      </View>
      <Text style={{ fontFamily: me ? F.sysB : F.sysSb, fontSize: fs(13), color: C.charcoal }}>{name}</Text>
      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 'auto' }}>대기 중</Text>
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
export function RoundupDetail({ post, visible, joined, applied, waitlistNum, isBookmarked, onClose, onApply, onWaitlist, onCancel, onCancelWait, onDelete, onGradePress, onToggleBookmark, onBlock, onReport }) {
  const { userProfile } = React.useContext(UserContext);
  const [teamTab, setTeamTab] = useState(0);
  const [alert, setAlert] = useState(null);
  const [actionTarget, setActionTarget] = useState(null); // 프로필 클릭 — 신고/차단 시트

  // 안드로이드 뒤로가기 — 오버레이 우선 닫기 (가장 최근 열린 것부터)
  useOverlayBackHandler(!!actionTarget, () => setActionTarget(null));
  useOverlayBackHandler(!!alert, () => setAlert(null));

  useEffect(() => { if (visible) setTeamTab(0); }, [visible]);

  if (!post) return null;

  const isTeam = post.teams > 1;
  const isMine = post.author === '나';   // 내가 올린 모집글
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const authorGrade = getTrustGrade(post.authorHostedCount, post.authorMannerScore);
  const allFull = isTeam
    ? post.teamJoined.every(c => c >= 4)
    : (post.joined || 0) >= (post.capacity || 4);
  const isClosed = post.closed || allFull;
  const respondHours = waitlistRespondHours(post.date);
  const slots = buildSlots(post, isTeam ? teamTab : null);
  const waiters = pickNames(post.id + ':wait', post.waitlistCount || 0);

  // 전체공개는 신청(수락 대기), 친구공개·친구지정은 즉시 참여
  const confirmApply = () => {
    const instant = post.scope !== 'all';
    setAlert({
      title: instant ? '이 라운딩에 참여할까요?' : '이 라운딩에 참여 신청할까요?',
      message: instant
        ? '친구 대상 모집이라 바로 참여가 확정돼요.'
        : '주최자에게 신청이 전달되고, 주최자가 수락하면 참여가 확정돼요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: instant ? '참여하기' : '참여 신청', onPress: onApply },
      ],
    });
  };
  // 참여 취소 — 상세 모달 위 오버레이로 확인창을 띄운다(모달 뒤에 가리지 않게)
  // 취소 시점(티오프까지 남은 시간) 기준 4구간 — RoundupTab의 getCancelInfo와 일관
  const confirmCancel = () => {
    let hoursUntil = 24 * 30; // 오픈형 기본: 한 달치 — cancel7dPlus(0)
    if (post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      const now = new Date();
      hoursUntil = (target - now) / 3600000;
    }
    const deltaKind = cancelDeltaKindByHours(hoursUntil);
    const deltaVal = MANNER_DELTAS[deltaKind];
    const label = CANCEL_DELTA_LABEL[deltaKind] || '취소';
    // 임박 취소는 모집 자격 14일 정지도 추가 발동 (정책 [[roundup-penalty-policy]])
    const suspendWarning = deltaKind === 'cancelImminent'
      ? '\n\n⚠️ 임박 취소는 모집 자격 14일 정지도 적용돼요.'
      : '';
    setAlert({
      title: '참여를 취소할까요?',
      message: `${label} — 매너 점수 ${deltaVal}점이 적용돼요.${suspendWarning}\n취소하면 자리는 다시 열려요.`,
      buttons: [
        { text: '계속 참여', style: 'cancel' },
        { text: '참여 취소', style: 'destructive', onPress: onCancel },
      ],
    });
  };
  // 대기 취소 — 대기는 확정 참여가 아니라 매너 점수 차감 없음
  const confirmCancelWait = () => setAlert({
    title: '대기를 취소할까요?',
    message: '대기 신청이 취소돼요. 필요하면 다시 대기 신청할 수 있어요.',
    buttons: [
      { text: '닫기', style: 'cancel' },
      { text: '대기 취소', style: 'destructive', onPress: onCancelWait },
    ],
  });
  // 카카오톡 단톡방 안내 — 친구공개·친구지정 모집에서만 주최자가 직접 단톡방 개설
  // Phase 2: Dear Golf 앱 푸시로 참여자 전원에게 사전 안내 발송
  // 현재는 주최자 안내 모달만 + 카카오톡 앱 열기 (실제 단톡방 개설은 카카오톡에서 수동)
  const handleKakao = () => {
    setAlert({
      title: '단톡방 안내',
      message: '참여자분들에게 알림을 보냈어요!\n카카오톡에서 친구분들과 단톡방을 만들어주세요.',
      buttons: [
        { text: '닫기', style: 'cancel' },
        { text: '카카오톡 열기', onPress: () => Linking.openURL('kakaotalk://').catch(() => setAlert({
          title: '카카오톡이 설치되어 있지 않아요',
          message: '카카오톡 앱을 먼저 설치해주세요.',
          buttons: [{ text: '확인' }],
        })) },
      ],
    });
  };
  const confirmDelete = () => setAlert({
    title: '모집글을 삭제할까요?',
    message: '삭제하면 참여자·대기자에게 더 이상 보이지 않아요. 되돌릴 수 없어요.',
    buttons: [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: onDelete },
    ],
  });

  // 참여 / 마감(대기) 버튼
  let actionBtn;
  if (isMine) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
          backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>내가 올린 모집글</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={confirmDelete}
          style={{ marginTop: 8, borderRadius: 10, paddingVertical: 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>모집글 삭제</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (joined) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
          backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>참여 확정 ✓</Text>
        </View>
        <TouchableOpacity onPress={confirmCancel} activeOpacity={0.7}
          style={{ marginTop: 6, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            참여 취소
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (applied) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
        backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>신청 완료 · 수락 대기 중</Text>
      </View>
    );
  } else if (waitlistNum) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
          backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>⏳ 대기 {waitlistNum}번</Text>
        </View>
        <Text style={hintStyle}>
          취소자 발생 시 푸시 알림을 보내드려요. {respondHours}시간 내 미응답 시 다음 대기자에게 넘어가요.
        </Text>
        <TouchableOpacity onPress={confirmCancelWait} activeOpacity={0.7}
          style={{ marginTop: 4, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            대기 취소
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (userProfile?.isRestricted) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
        backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>🚫 이용 제한 중</Text>
      </View>
    );
  } else if (userProfile?.mannerEvaluationPending) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
        backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>지난 라운딩 평가 후 신청 가능해요</Text>
      </View>
    );
  } else if (!isClosed) {
    const instant = post.scope !== 'all';
    actionBtn = (
      <TouchableOpacity activeOpacity={0.85} onPress={confirmApply}
        style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: C.burgundy }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>{instant ? '참여하기' : '참여 신청'}</Text>
      </TouchableOpacity>
    );
  } else {
    actionBtn = (
      <View>
        <TouchableOpacity activeOpacity={0.85} onPress={onWaitlist}
          style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.charcoal }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>
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
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>모집 상세</Text>
            <View style={{ flex: 1 }} />
            {!isMine && onToggleBookmark && (
              <TouchableOpacity onPress={onToggleBookmark} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(22), color: isBookmarked ? '#E2B33D' : C.warmGrayLight }}>
                  {isBookmarked ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            )}
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

              {/* 주최자 — 이름·신뢰도·매너 점수. 영역 탭 시 신고/차단 시트 */}
              <TouchableOpacity activeOpacity={0.8}
                onPress={() => setActionTarget({ id: post.authorId || post.author, name: post.author, role: 'host' })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
                  backgroundColor: C.bgPrimary, borderRadius: 10, marginBottom: 12 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1, marginRight: 2 }}>주최자</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>{post.author}</Text>
                <TrustBadge grade={authorGrade} onPress={() => onGradePress?.(authorGrade.key)} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                    주최 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{post.authorHostedCount || 0}</Text>회 ·
                  </Text>
                  <MannerBadge score={post.authorMannerScore} size={14} />
                </View>
              </TouchableOpacity>

              {post.type === 'fixed' ? (
                <>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal }}>{post.course}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, marginTop: 4 }}>
                    {post.date} ({post.day}) · {post.time}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal }}>장소 · 날짜 미정</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, marginTop: 4 }}>동반자와 함께 정해요</Text>
                </>
              )}

              {/* 동반자 조건 — 구성·실력·태그. 'any'/빈배열은 숨김 */}
              {(() => {
                const compTxt = post.companion && post.companion !== 'any' ? COMPANION_LABEL[post.companion] : null;
                const skillTxt = post.skill && post.skill !== 'any' ? SKILL_LABEL[post.skill] : null;
                const tagList = Array.isArray(post.tags) ? post.tags : [];
                if (!compTxt && !skillTxt && tagList.length === 0) return null;
                return (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 6 }}>동반자 조건</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {compTxt && <Badge bg={FILTER_BADGE.companion.bg} fg={FILTER_BADGE.companion.fg} text={compTxt} />}
                      {skillTxt && <Badge bg={FILTER_BADGE.skill.bg} fg={FILTER_BADGE.skill.fg} text={skillTxt} />}
                      {tagList.map(t => (
                        <Badge key={t} bg={FILTER_BADGE.tag.bg} fg={FILTER_BADGE.tag.fg} text={`#${t}`} />
                      ))}
                    </View>
                  </View>
                );
              })()}

              {post.word ? (
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 10, padding: 12, marginTop: 12 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>"{post.word}"</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>모집 인원</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginLeft: 8 }}>
                  {isTeam ? `${post.teams}팀 · ${post.teams * 4}명` : `${post.capacity}명`}
                </Text>
                {post.companions?.length > 0 && !isTeam ? (
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, marginLeft: 8 }}>
                    (동반자 {post.companions.map(n => n).join(', ')} 포함)
                  </Text>
                ) : null}
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
                        <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(12), color: on ? C.butter : C.warmGray }}>
                          {i + 1}팀
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {slots.map((s, i) => (
                <SlotRow key={i} slot={s} idx={i}
                  onPress={s.name ? () => setActionTarget({ id: s.name, name: s.name, role: s.host ? 'host' : 'participant' }) : null} />
              ))}
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

            {/* 4. 카카오톡 단톡방 안내 — 친구공개·친구지정 모집에서만 주최자에게 노출 (전체공개는 댓글로만) */}
            {isMine && post.scope !== 'all' && (() => {
              const kakaoEnabled = isClosed;  // 마감 후에만 활성
              const hintText = kakaoEnabled
                ? '참여자분들에게 알림이 가요. 카카오톡에서 단톡방을 만들어주세요'
                : '모집이 마감되면 단톡방 안내가 활성화돼요';
              return (
                <>
                  <TouchableOpacity onPress={kakaoEnabled ? handleKakao : undefined}
                    disabled={!kakaoEnabled} activeOpacity={0.85}
                    style={{ marginHorizontal: 16, marginTop: 22, borderRadius: 12,
                      paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      backgroundColor: kakaoEnabled ? '#FEE500' : C.bgSecondary,
                      borderWidth: kakaoEnabled ? 0 : 0.5, borderColor: C.hairline,
                      opacity: kakaoEnabled ? 1 : 0.7 }}>
                    <Text style={{ fontSize: fs(15) }}>💬</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14),
                      color: kakaoEnabled ? '#3C1E1E' : C.warmGrayLight }}>
                      카카오톡 단톡방 안내하기
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray,
                    marginHorizontal: 16, marginTop: 6, textAlign: 'center' }}>{hintText}</Text>
                </>
              );
            })()}

            {/* 댓글 영역 — UI만 (기능은 추후 추가) */}
            <Text style={sectionLabel}>댓글</Text>
            <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
              borderWidth: 0.5, borderColor: C.hairline, paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>댓글 기능은 곧 추가될 예정이에요</Text>
            </View>
          </ScrollView>

          {/* 참여 확인 / 카카오 안내 — 모달 위 오버레이 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
          {/* 프로필 액션 시트 — 주최자/참여자 신고·차단 */}
          <ProfileActionSheet
            visible={!!actionTarget}
            target={actionTarget}
            isMe={actionTarget?.name === '나'}
            onClose={() => setActionTarget(null)}
            onReport={(t) => onReport?.(t)}
            onBlock={(t) => onBlock?.(t)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
