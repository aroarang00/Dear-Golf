import React, { useState, useEffect, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { OverlayAlert } from './common/OverlayAlert';
import { getReportRemainingThisMonth, incrementReportCount, REPORT_MONTH_LIMIT } from '../utils/reportLimit';
import { searchUsersByNickname } from '../utils/friends';
import { createReport } from '../utils/reports';

// 사용자 신고 모달 ([[report-block-policy]] §1, §5, §6).
// 7단계 흐름 단일 화면 — 닉네임 → 대상자 확인 → 사유 → 근거 → 경고 → 접수.
// 즉시 차단 X — 검토 후 결과 통보 (Phase 2 Cloud Functions).
// 노쇼 신고는 별도 흐름이라 카테고리에서 제외 (Phase 2 [[noshow-report-system]]).

const REASON_OPTIONS = [
  { key: 'misbehavior',  label: '비매너',           desc: '약속 어김·반복적 지각 등' },
  { key: 'fake_profile', label: '허위 프로필',      desc: '닉네임·실력·사진 등 거짓' },
  { key: 'harassment',   label: '성희롱·욕설',      desc: '부적절한 발언·괴롭힘' },
  { key: 'fraud',        label: '사기',             desc: '금전 요구·페이백 등' },
];

const MIN_EVIDENCE = 10; // 근거 텍스트 최소 글자 수 (의도적 마찰)

// presetTarget({id,name}) — 대상을 미리 고정(DM 등 상대를 이미 아는 경우 1단계 닉네임 검색 건너뜀, 변경 불가).
// prefillEvidence — 근거란 초기값(DM 메시지 인용 자동 삽입 등). 둘 다 옵셔널, 없으면 기존 7단계 흐름 그대로.
export function ReportModal({ visible, onClose, presetTarget = null, prefillEvidence = '' }) {
  const { userProfile } = useContext(UserContext);
  const [remaining, setRemaining] = useState(REPORT_MONTH_LIMIT);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);   // { id, name }
  const [reason, setReason] = useState(null);
  const [evidence, setEvidence] = useState('');
  const [alert, setAlert] = useState(null);

  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  // (RN Modal에선 onRequestClose가 신뢰되는 back 핸들러 — BackHandler 훅 제거)
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setTarget(presetTarget || null); setReason(null); setEvidence(prefillEvidence || ''); setAlert(null);
    getReportRemainingThisMonth().then(setRemaining);
  }, [visible]);

  // 자동완성 — 2글자 이상 시 Firestore users 닉네임 prefix 매칭 (본인 제외는 util이 처리).
  // 300ms debounce로 글자 입력 중 과도 호출 방지.
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const users = await searchUsersByNickname(q, 5);
        if (cancelled) return;
        setSuggestions(users.map(u => ({ id: u.uid, name: u.nickname })));
      } catch (e) {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const fraudHint = reason === 'fraud';
  const canProceed = !!target && !!reason && evidence.trim().length >= MIN_EVIDENCE && remaining > 0;

  const confirmSubmit = () => {
    if (!canProceed) return;
    setAlert({
      title: '⚠️ 신고는 신중히 결정해주세요',
      message:
        `신고가 접수되면:\n` +
        `· 디어골프 팀이 7일 이내에 검토해요\n` +
        `· 사실 확인 시 ${target.name}님과 양방향 영구 차단 (해제 불가)\n` +
        `· 허위신고로 확정되면 본인에게도 매너 -10·60일 정지\n` +
        `· 거짓 근거 진술도 허위신고로 처리\n\n` +
        `정말 신고하시겠어요?`,
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '신고하기', style: 'destructive', onPress: doSubmit },
      ],
    });
  };

  const doSubmit = async () => {
    // Firestore reports 컬렉션 등록 + 로컬 한도 카운트.
    // 이메일/검토 자동 발송은 Phase 5 Cloud Functions onCreate 트리거로 처리.
    try {
      await createReport({
        targetUid: target.id,
        targetName: target.name,
        reporterName: userProfile?.nickname || '',
        reason,
        evidence: evidence.trim(),
      });
    } catch (e) {
      if (__DEV__) console.warn('[ReportModal] createReport failed', e?.message);
      setAlert({
        title: '신고 접수에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    await incrementReportCount();
    const next = await getReportRemainingThisMonth();
    setRemaining(next);
    setAlert({
      title: '신고가 접수됐어요',
      // 사진 첨부는 인앱 미지원(악용 리스크로 백로그) — 캡처 등 추가 증빙은 이메일로 받음(2026-07-03)
      message: `디어골프 팀이 7일 이내에 검토하고 결과를 알려드릴게요.\n진행 상황은 마이페이지에서 확인할 수 있어요.\n\n캡처 등 추가 증빙이 있다면 닉네임과 함께\ndeargolf.official@gmail.com 으로 보내주세요.\n\n이번 달 남은 신고 ${next}건`,
      buttons: [{ text: '확인', onPress: onClose }],
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center',
            gap: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>신고하기</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginLeft: 'auto' }}>
              {remaining > 0 ? `이번 달 ${remaining}건 남음` : '이번 달 한도 도달'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>

            {remaining === 0 ? (
              <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 18, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginBottom: 6 }}>
                  이번 달 신고 횟수를 초과했어요
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
                  사용자 신고는 월 {REPORT_MONTH_LIMIT}건으로 제한되어 있어요.{'\n'}다음 달 1일에 다시 가능해져요.
                </Text>
              </View>
            ) : (
              <>
                {/* 1. 대상자 입력 */}
                <Text style={section}>1. 누구를 신고하시나요?</Text>
                {target ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSecondary,
                    borderRadius: 12, padding: 14 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgPrimary,
                      alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{target.name.charAt(0)}</Text>
                    </View>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, flex: 1 }}>{target.name}</Text>
                    {/* presetTarget(DM 등 대상 고정)일 땐 변경 불가 — 그 외엔 변경 버튼 노출 */}
                    {!presetTarget && (
                      <TouchableOpacity onPress={() => { setTarget(null); setQuery(''); }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray,
                          textDecorationLine: 'underline' }}>변경</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <>
                    <AppTextInput
                      style={input}
                      placeholder="닉네임 3글자 이상 입력"
                      placeholderTextColor={C.warmGrayLight}
                      value={query}
                      onChangeText={setQuery}
                    />
                    {suggestions.length > 0 && (
                      <View style={{ marginTop: 6, backgroundColor: C.bgSecondary, borderRadius: 10 }}>
                        {suggestions.map(s => (
                          <TouchableOpacity key={s.id} onPress={() => setTarget({ id: s.id, name: s.name })}
                            style={{ paddingHorizontal: 14, paddingVertical: 11,
                              borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{s.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {query.length >= 3 && suggestions.length === 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>
                        매칭되는 사용자가 없어요. 한 번도 상호작용 없는 사용자는 신고할 수 없어요.
                      </Text>
                    )}
                  </>
                )}

                {/* 2. 사유 카테고리 */}
                {target && (
                  <>
                    <Text style={section}>2. 어떤 문제인가요?</Text>
                    <View style={{ gap: 8 }}>
                      {REASON_OPTIONS.map(r => {
                        const on = reason === r.key;
                        return (
                          <TouchableOpacity key={r.key} activeOpacity={0.85} onPress={() => setReason(r.key)}
                            style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10,
                              backgroundColor: on ? C.charcoal : C.bgSecondary }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: on ? C.butter : C.charcoal }}>
                              {r.label}
                            </Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11),
                              color: on ? C.butter : C.warmGray, marginTop: 2 }}>{r.desc}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {fraudHint && (
                      <View style={{ marginTop: 10, padding: 12, backgroundColor: '#F5E6A8',
                        borderRadius: 10 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#5A4500', marginBottom: 4 }}>
                          사기는 형사 사안이에요
                        </Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#5A4500', lineHeight: 17 }}>
                          금전 피해는 가까운 경찰서나 사이버수사대(국번없이 182)에도 함께 신고해주세요.
                          디어골프 신고는 플랫폼 내 제재용이에요.
                        </Text>
                        <TouchableOpacity onPress={() => Linking.openURL('https://ecrm.police.go.kr')}
                          style={{ marginTop: 8 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#5A4500',
                            textDecorationLine: 'underline' }}>경찰청 사이버범죄 신고 →</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                {/* 3. 근거 진술 */}
                {target && reason && (
                  <>
                    <Text style={section}>3. 어떤 상황이었나요?</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6, lineHeight: 16 }}>
                      구체적인 상황·시점·근거를 적어주세요. 거짓 진술 시 허위신고로 처리됩니다.
                    </Text>
                    <AppTextInput
                      style={[input, { minHeight: 110, textAlignVertical: 'top' }]}
                      placeholder={`최소 ${MIN_EVIDENCE}자 이상 입력`}
                      placeholderTextColor={C.warmGrayLight}
                      multiline
                      value={evidence}
                      onChangeText={(t) => setEvidence(t.slice(0, 500))}
                    />
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight,
                      textAlign: 'right', marginTop: 4 }}>
                      {evidence.length}/500
                    </Text>
                  </>
                )}

                {/* 4. 접수 */}
                <TouchableOpacity onPress={confirmSubmit} disabled={!canProceed} activeOpacity={0.85}
                  style={{ marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                    backgroundColor: canProceed ? C.burgundy : C.hairline }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15),
                    color: canProceed ? C.butter : C.warmGray }}>
                    신고하기
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight,
                  textAlign: 'center', marginTop: 10, lineHeight: 14 }}>
                  신고는 검토 요청이며 즉시 차단되지 않아요.{'\n'}
                  상대방을 안 보이게 하려면 마이페이지 → 차단 관리를 이용해주세요.
                </Text>
              </>
            )}

          </ScrollView>
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const section = { fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 22, marginBottom: 10 };
const input = { fontFamily: F.sys, fontSize: fs(13), color: C.charcoal,
  backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 };
