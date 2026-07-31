import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Keyboard, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sumHoles, reconcileScoreRow } from '../utils/scorecardOcr';

// 스코어카드 인식 결과 검토 — (여러 명이면) 본인 행 선택 → 18홀 표 미리보기·수정 → 확정.
//  rows: [{ label, holes:number[18], total }]   label은 화면 구분용(저장 X)
//  onConfirm({ holeScores:number[18], total })
//
// 자동 확정 X — 추출값을 사용자가 반드시 확인·수정 후 확정 ([[project_scorecard_ocr]]).
export function ScorecardReviewModal({ visible, rows = [], holePars = null, photos = [], failed = false, failedReason = '', lowConfidence = false, lowReasons = [], rotating = false, onRotate = null, onConfirm, onClose }) {
  const { width: winW } = useWindowDimensions();
  const multi = rows.length > 1;
  const [rowIdx, setRowIdx] = useState(multi ? null : 0);
  const [holes, setHoles] = useState([]); // 편집용 문자열 배열
  // 파는 화면에서 고칠 수 있다 — 파대비 카드에서 전원이 똑같이 어긋나는 원인이 '파 한 칸 오독'이라,
  //   그 한 칸만 바로잡으면 끝난다. 프롭을 복사해 로컬로 들고 있는다(원본은 안 건드림).
  const [pars, setPars] = useState([]);
  const [photoBig, setPhotoBig] = useState(false);   // 카드 사진 확대(가로 스크롤로 훑어보기)

  // 행 로드 — 공유·수신과 같은 재조정 함수(단일 소스). par 있으면 파대비→실타수 환산.
  //   par를 못 읽어 환산 불가한 파대비 카드는 holes=null로 와서 셀을 비운다(파대비 숫자를 실타수인 척 보이면 99→27 오해).
  //   그 경우 총타는 인쇄 총계를 신뢰(아래 total 폴백 + confirm).
  const loadRow = (i) => {
    const row = rows[i] || {};
    const { holes: rh } = reconcileScoreRow(row.holes, row.total, holePars);
    setHoles(Array.isArray(rh) ? rh.map(n => (n == null ? '' : String(n))) : []);
  };

  // 열릴 때마다 초기화 — 1행이면 바로 표, 여러 행이면 행 선택부터.
  useEffect(() => {
    if (!visible) return;
    setPars(Array.from({ length: 18 }, (_, i) => (Number.isFinite(holePars?.[i]) ? holePars[i] : null)));
    setPhotoBig(false);
    if (multi) { setRowIdx(null); setHoles([]); }
    else { setRowIdx(0); loadRow(0); }
  }, [visible, rows, holePars]);

  const pickRow = (i) => { setRowIdx(i); loadRow(i); };

  // 파 탭 → 3→4→5→3 순환. 파가 1 올라가면 그 홀 타수도 1 올린다(파대비 카드는 타수=파+파대비라
  //   파를 잘못 읽으면 타수가 딱 그만큼 어긋나 있다). 사용자가 산수를 하지 않아도 총타가 저절로 맞는다.
  const bumpPar = (i) => {
    const cur = Number.isFinite(pars[i]) ? pars[i] : null;
    const next = cur === 3 ? 4 : cur === 4 ? 5 : 3;   // 못 읽은 칸(null)은 3부터 시작
    const delta = cur == null ? 0 : next - cur;
    setPars(prev => { const n = [...prev]; n[i] = next; return n; });
    if (delta === 0) return;
    setHoles(prev => {
      const n = [...prev];
      const s = parseInt(n[i], 10);
      if (Number.isFinite(s)) n[i] = String(Math.max(1, s + delta));
      return n;
    });
  };

  const setHole = (i, v) => {
    const clean = v.replace(/[^0-9]/g, '').slice(0, 2);
    setHoles(prev => { const next = [...prev]; next[i] = clean; return next; });
  };

  const holeNums = holes.map(s => (s === '' ? null : parseInt(s, 10)));
  const holesSum = sumHoles(holeNums);
  const front = sumHoles(holeNums.slice(0, 9));
  const back = sumHoles(holeNums.slice(9, 18));
  const filled = holeNums.filter(n => Number.isFinite(n)).length;
  // 인쇄 총계(선택된 행) — 홀별을 못 읽어(par대비 미환산 등) 비운 경우 이 값을 총타로 신뢰.
  const printedTotal = Number.isFinite(rows[rowIdx]?.total) ? rows[rowIdx].total : (parseInt(rows[rowIdx]?.total) || 0);
  const total = holesSum > 0 ? holesSum : printedTotal;
  const holesMissing = filled === 0 && printedTotal > 0; // 홀별 미인식 — 총타만 반영

  const inSelect = multi && rowIdx === null;

  // 카드에 인쇄된 총타 — 홀 합과 어긋나면 몇 타 차이인지 숫자로 짚어준다.
  const cardTotal = Number(rows[rowIdx]?.printedTotal) || 0;
  const gap = (cardTotal > 0 && filled === 18) ? cardTotal - holesSum : 0;

  // 저신뢰 사유(CF notes) → 확인할 것 한 줄. 급한 것부터 우선.
  //   ★'total'은 차이를 숫자로 — 파대비 카드에서 PAR 한 칸을 잘못 읽으면 그 par를 쓰는 전원이
  //     똑같이 어긋난다. "숫자를 확인하세요"만으론 어디를 볼지 알 수 없어 그냥 확정하게 된다.
  const lowMessage =
    lowReasons.includes('order') ? '전반·후반 순서를 확정하지 못했어요. 앞 9홀이 맞는지 확인해주세요.'
    : lowReasons.includes('half') ? '카드 한 장만 읽었어요. 나머지 9홀은 직접 입력해주세요.'
    : gap !== 0
      ? `카드는 ${cardTotal}타, 홀별 합은 ${holesSum}타 — ${Math.abs(gap)}타 ${gap > 0 ? '모자라요' : '많아요'}.\n아래 '파' 줄을 카드의 PAR과 맞춰보세요. 보통 파 한 칸을 잘못 읽은 거예요.`
    : lowReasons.includes('total') ? '홀별 합이 카드에 인쇄된 합계와 달라요. 숫자를 확인해주세요.'
    : '빈 칸이 있어요. 못 읽은 홀을 직접 채워주세요. 또렷한 스크린샷이면 더 정확해요.';

  // ★닫기·확정 첫 줄 Keyboard.dismiss() — 숫자 키보드가 뜬 채 이 중첩 Modal(+KeyboardProvider)이 unmount되면
  //   iOS에서 포커스(first responder)가 사라진 창에 남아 터치 전체가 죽음(Build 71 ✕ 멈춤 재현).
  //   별명 시트의 '확정 첫 줄 dismiss' 패턴과 동일 ([[ios-keyboard-save-tap-eaten]]).
  const handleClose = () => { Keyboard.dismiss(); onClose && onClose(); };

  // 안드 뒤로가기 — 표에서는 행 선택으로, 행 선택/단일행에서는 모달 닫기
  const handleRequestClose = () => {
    if (multi && rowIdx !== null) { Keyboard.dismiss(); setRowIdx(null); return; }
    handleClose();
  };

  const confirm = () => {
    Keyboard.dismiss();
    // total은 홀 합>0이면 홀 합, 아니면 인쇄 총계 폴백(위 정의) — 홀별을 못 읽어도 총타는 잃지 않는다.
    //   화면에서 고친 파도 함께 돌려준다 — 버디 자동집계가 틀린 파로 세지 않게.
    onConfirm && onConfirm({ holeScores: holeNums, total, holePars: pars.some(p => Number.isFinite(p)) ? pars : null });
  };

  // 9홀 한 줄 렌더 (start: 0=전반, 9=후반)
  //  ★PAR 줄을 같이 보여준다 — 파대비 카드에서 전원이 똑같이 어긋나는 원인은 PAR 한 칸 오독인데,
  //    PAR이 화면에 없으면 사용자가 '사진 전체와 스코어 18개'를 대조해야 했다(사용자 제보 2026-07-31).
  //    PAR이 보이면 카드의 PAR 줄(대개 4가 반복되는 한 줄)만 훑으면 되고, 고칠 홀도 바로 지목된다.
  const renderNine = (start, title) => {
    const parSum = pars.slice(start, start + 9).reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
    return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 6 }}>
        {title}{parSum > 0 ? `  ·  파 ${parSum}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: 9 }, (_, k) => {
          const i = start + k;
          const par = Number.isFinite(pars[i]) ? pars[i] : null;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: C.warmGray }}>{i + 1}</Text>
              {/* 파 — 탭하면 3→4→5로 바뀌고 그 홀 타수도 같이 움직인다(사용자가 산수를 안 해도 되게) */}
              <TouchableOpacity onPress={() => bumpPar(i)} hitSlop={{ top: 6, bottom: 2, left: 4, right: 4 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: par ? C.burgundy : C.warmGrayLight, marginBottom: 2 }}>
                  {par ? `파${par}` : '파·'}
                </Text>
              </TouchableOpacity>
              <AppTextInput
                value={holes[i] ?? ''}
                onChangeText={(v) => setHole(i, v)}
                keyboardType="numeric"
                maxLength={2}
                style={{
                  width: '100%', textAlign: 'center',
                  fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal,
                  paddingVertical: 7, borderRadius: 8,
                  backgroundColor: C.bgSecondary,
                }} />
            </View>
          );
        })}
      </View>
    </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
      {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 자체 Provider 필요(맛집·DM·일정모달 동일 패턴).
          edge-to-edge라 안드 adjustResize가 무효 → 후반(IN) 홀 입력칸이 키보드에 가려졌음. */}
      <KeyboardProvider>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} edges={['bottom']}>
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingTop: 10, paddingHorizontal: 20, paddingBottom: 20, maxHeight: '90%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 12 }} />

            {/* 헤더 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, flex: 1 }}>
                {inSelect ? '본인 줄을 선택해주세요' : '스코어카드 확인'}
              </Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(20), color: C.warmGray }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 사진 회전 후 다시 읽기 — 태블릿 카드가 옆으로 누워(90°) AI가 못 읽을 때. 원본을 90°씩 돌려 재인식. */}
            {onRotate && (
              <TouchableOpacity onPress={onRotate} disabled={rotating} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 11, borderRadius: 10, marginBottom: 12,
                  backgroundColor: C.bgSecondary, opacity: rotating ? 0.6 : 1 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal }}>
                  {rotating ? '사진 돌려서 다시 읽는 중…' : '카드가 옆으로 누웠나요?  90° 회전 후 다시 읽기'}
                </Text>
              </TouchableOpacity>
            )}

            {/* 저신뢰 안내 — 서버 산술 검산이 확정에 실패한 사유별로 '무엇을 확인할지'를 알려준다.
                사유 없이 "정확하지 않을 수 있어요"만 띄우면 뭘 봐야 할지 몰라 그냥 확정해버린다(2026-07-31). */}
            {/* ★옅은 노랑 배경 + 회색 작은 글씨라 "잘 안 보인다"는 제보(2026-07-31).
                고칠 게 있는 경우(gap≠0)는 붉은 톤 + 진한 본문으로 확실히 눈에 걸리게 한다. */}
            {!failed && lowConfidence && !inSelect && (
              <View style={{ marginBottom: 12, padding: 12, borderRadius: 10,
                backgroundColor: gap !== 0 ? '#F6E7E4' : (C.butter + '33'),
                borderLeftWidth: 3, borderLeftColor: gap !== 0 ? '#8B2A2A' : C.butter }}>
                <Text style={{ fontFamily: gap !== 0 ? F.sysSb : F.sys, fontSize: fs(12),
                  color: gap !== 0 ? '#8B2A2A' : C.warmGray, lineHeight: 18 }}>{lowMessage}</Text>
              </View>
            )}

            {/* 인식 실패 안내 — 서버가 사유를 준 경우(AI 사용량 초과 등)엔 그걸 그대로 보여준다.
                사진이 문제가 아니라 '잠시 후 되는' 상황인데 매번 "사진을 못 읽었다"로만 안내하면
                사용자가 사진만 계속 바꿔 찍게 된다(2026-07-25 429 제보). 사유가 없을 때만 기존 문구. */}
            {failed && (
              <View style={{ marginBottom: 12, padding: 10, borderRadius: 10,
                backgroundColor: C.butter + '33' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>
                  {failedReason
                    ? `${failedReason}\n지금 바로 적으시려면 아래에 직접 입력해도 돼요.`
                    : '사진에서 숫자를 충분히 읽지 못했어요.\n아래에 직접 입력하거나, 카톡으로 받은 스코어카드 사진으로 다시 시도해보세요.'}
                </Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {inSelect ? (
                // ── 본인 행 선택 (동반자 포함 표) ──
                <View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginBottom: 10, lineHeight: 18 }}>
                    인식된 줄 중 본인 스코어 줄을 골라주세요.{'\n'}이름은 저장하지 않아요.
                  </Text>
                  {rows.map((r, i) => (
                    <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => pickRow(i)}
                      style={{ padding: 14, borderRadius: 12, marginBottom: 8,
                        backgroundColor: C.bgSecondary }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, flex: 1 }}>{r.label}</Text>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>총 {r.total}타</Text>
                      </View>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }} numberOfLines={1}>
                        {(r.holes || []).join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                // ── 18홀 표 미리보기·수정 ──
                <View>
                  {/* ★카드 사진을 같은 화면에 둔다 — 숫자가 어긋났을 때 "카드와 대조하세요"라고만 하면
                      사진첩을 오가며 18홀을 맞춰봐야 한다. 어느 홀이 틀렸는지는 산술로 특정할 수 없으니,
                      최소한 대조할 사진은 눈앞에 있어야 한다(사용자 제보 2026-07-31).
                      '크게 보기'는 가로로 넓혀 스크롤 — 파 줄의 작은 숫자를 읽을 수 있게. */}
                  {photos.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={photoBig}
                        pagingEnabled={!photoBig} nestedScrollEnabled>
                        {photos.map((u, i) => (
                          <Image key={`${u}-${i}`} source={{ uri: u }} contentFit="contain" cachePolicy="memory-disk"
                            style={{ width: photoBig ? (winW - 40) * 2.6 : (winW - 40), height: photoBig ? 300 : 165,
                              marginRight: i < photos.length - 1 ? 8 : 0, backgroundColor: '#15171A', borderRadius: 8 }} />
                        ))}
                      </ScrollView>
                      <TouchableOpacity onPress={() => setPhotoBig(b => !b)} activeOpacity={0.85}
                        style={{ marginTop: 6, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: C.bgSecondary }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>
                          {photoBig ? '작게 보기' : '크게 보기 (파 줄 확인)'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {renderNine(0, '전반 (OUT)')}
                  {renderNine(9, '후반 (IN)')}
                  {/* 홀별 미인식(par 못 읽어 파대비 환산 실패 등) — 총타(인쇄값)만 반영. 필요하면 홀별 직접 입력. */}
                  {holesMissing && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17, marginTop: 4, marginBottom: 6 }}>
                      홀별 숫자를 정확히 읽지 못해 총타(총 {printedTotal}타)만 반영했어요.{'\n'}홀별이 필요하면 위 칸에 직접 입력해주세요.
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4,
                    paddingTop: 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray, flexShrink: 1 }}>
                      전반 {front} · 후반 {back}
                    </Text>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: gap !== 0 ? '#8B2A2A' : C.charcoal }}>
                        총 {total}타 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>({filled}/18)</Text>
                      </Text>
                      {/* 카드 표기와 다르면 그 자리에서 바로 보이게 — 고친 홀이 맞았는지 즉시 확인된다 */}
                      {gap !== 0 && (
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#8B2A2A', marginTop: 2 }}>
                          카드 표기 {cardTotal}타
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 하단 버튼 */}
            {!inSelect && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                {multi && (
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setRowIdx(null); }} activeOpacity={0.85}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray }}>다시 선택</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={confirm} activeOpacity={0.85} disabled={rotating}
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.burgundy, opacity: rotating ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>이대로 입력</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
      </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}
