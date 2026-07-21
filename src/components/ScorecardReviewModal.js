import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Keyboard, Switch } from 'react-native';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sumHoles } from '../utils/scorecardOcr';

// 스코어카드 인식 결과 검토 — (여러 명이면) 본인 행 선택 → 18홀 표 미리보기·수정 → 확정.
//  rows: [{ label, holes:number[18], total }]   label은 화면 구분용(저장 X)
//  onConfirm({ holeScores:number[18], total })
//
// 자동 확정 X — 추출값을 사용자가 반드시 확인·수정 후 확정 ([[project_scorecard_ocr]]).
export function ScorecardReviewModal({ visible, rows = [], holePars = null, failed = false, lowConfidence = false, onConfirm, onClose }) {
  const multi = rows.length > 1;
  const [rowIdx, setRowIdx] = useState(multi ? null : 0);
  const [holes, setHoles] = useState([]); // 편집용 문자열 배열
  const [parRel, setParRel] = useState(false); // 파대비(오버파) 표기 카드 → 실제 타수 변환 토글

  // par 행을 충분히 읽었을 때만 파대비 변환 제공(9홀 이상 par 확보). 스마트스코어류=홀별 파대비 표기.
  const parReady = Array.isArray(holePars) && holePars.filter(p => p >= 3 && p <= 5).length >= 9;

  // 행 로드 — 파대비 카드면 인쇄 총계와 대조해 자동 변환(추측 아님·산술 교차검증).
  //   홀별합 vs 인쇄총계가 안 맞고, (홀별합+par합)이 인쇄총계와 맞으면 = 파대비 표기 → par 더해 실제 타수로.
  //   실제 타수 카드는 홀별합≈총계라 그대로. par합(≈72)까지 더해야 맞는 실수는 산술적으로 불가 → 오판 안 됨.
  const loadRow = (i) => {
    const row = rows[i] || {};
    const raw = (row.holes || []).map(n => (Number.isFinite(n) ? n : null));
    const holesSum = raw.reduce((s, n) => s + (n || 0), 0);
    const printed = row.total;
    let asRel = false;
    // 인쇄총계가 홀별합과 '다를' 때만 신뢰 — 같으면 CF가 합으로 폴백한 값일 수 있어 판별 불가(→ 수동 토글).
    if (parReady && Number.isFinite(printed) && printed > 0 && printed !== holesSum) {
      const parSum = raw.reduce((s, n, idx) => {
        const p = holePars?.[idx];
        return s + ((n != null && p >= 3 && p <= 5) ? p : 0);
      }, 0);
      const dStroke = Math.abs(holesSum - printed);
      const dRel = Math.abs(holesSum + parSum - printed);
      if (dRel < dStroke && dRel <= 8) asRel = true; // tol 8 = 총계 오독+버디(음수 잘림) 여유. 실제타수 카드의 dRel은 ~70이라 안 걸림
    }
    const conv = raw.map((n, idx) => {
      if (!asRel || n == null) return n;
      const p = holePars?.[idx];
      return (p >= 3 && p <= 5) ? n + p : n;
    });
    setHoles(conv.map(n => (n == null ? '' : String(n))));
    setParRel(asRel);
  };

  // 열릴 때마다 초기화 — 1행이면 바로 표, 여러 행이면 행 선택부터. 파대비 토글도 리셋.
  useEffect(() => {
    if (!visible) return;
    setParRel(false);
    if (multi) { setRowIdx(null); setHoles([]); }
    else { setRowIdx(0); loadRow(0); }
  }, [visible, rows]);

  const pickRow = (i) => { setParRel(false); setRowIdx(i); loadRow(i); };

  // 파대비 토글 — 켜면 각 홀의 파 대비 값에 그 홀 par를 더해 실제 타수로 즉시 변환(끄면 역변환).
  //   예) 파4 홀 '+2'(2) → 6, '0'(파) → 4. par 못 읽은 홀·빈칸은 그대로 둔다.
  const toggleParRel = () => {
    const on = !parRel;
    Keyboard.dismiss();
    setHoles(prev => prev.map((s, i) => {
      const par = holePars?.[i];
      if (s === '' || !(par >= 3 && par <= 5)) return s;
      const n = parseInt(s, 10);
      if (!Number.isFinite(n)) return s;
      return String(on ? n + par : Math.max(0, n - par));
    }));
    setParRel(on);
  };

  const setHole = (i, v) => {
    const clean = v.replace(/[^0-9]/g, '').slice(0, 2);
    setHoles(prev => { const next = [...prev]; next[i] = clean; return next; });
  };

  const holeNums = holes.map(s => (s === '' ? null : parseInt(s, 10)));
  const total = sumHoles(holeNums);
  const front = sumHoles(holeNums.slice(0, 9));
  const back = sumHoles(holeNums.slice(9, 18));
  const filled = holeNums.filter(n => Number.isFinite(n)).length;

  const inSelect = multi && rowIdx === null;

  // ★닫기·확정 첫 줄 Keyboard.dismiss() — 숫자 키보드가 뜬 채 이 중첩 Modal(+KeyboardProvider)이 unmount되면
  //   iOS에서 포커스(first responder)가 사라진 창에 남아 터치 전체가 죽음(Build 71 ✕ 멈춤 재현).
  //   별명 시트의 '확정 첫 줄 dismiss' 패턴과 동일 ([[ios-keyboard-save-tap-eaten]]).
  const handleClose = () => { Keyboard.dismiss(); onClose && onClose(); };

  // 안드 뒤로가기 — 표에서는 행 선택으로, 행 선택/단일행에서는 모달 닫기
  const handleRequestClose = () => {
    if (multi && rowIdx !== null) { Keyboard.dismiss(); setRowIdx(null); return; }
    handleClose();
  };

  const confirm = () => { Keyboard.dismiss(); onConfirm && onConfirm({ holeScores: holeNums, total }); };

  // 9홀 한 줄 렌더 (start: 0=전반, 9=후반)
  const renderNine = (start, title) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 6 }}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: 9 }, (_, k) => {
          const i = start + k;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: C.warmGray, marginBottom: 2 }}>{i + 1}</Text>
              <AppTextInput
                value={holes[i] ?? ''}
                onChangeText={(v) => setHole(i, v)}
                keyboardType="numeric"
                maxLength={2}
                style={{
                  width: '100%', textAlign: 'center',
                  fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal,
                  paddingVertical: 7, borderRadius: 8,
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                }} />
            </View>
          );
        })}
      </View>
    </View>
  );

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

            {/* 저신뢰 안내 — 인쇄된 합계와 안 맞음(잘못 읽었을 수 있음). 확인·수정 강조. failed면 그쪽 안내가 우선. */}
            {!failed && lowConfidence && !inSelect && (
              <View style={{ marginBottom: 12, padding: 10, borderRadius: 10,
                backgroundColor: C.butter + '33', borderWidth: 0.5, borderColor: C.butter + '80' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                  ⚠️ 숫자가 정확하지 않을 수 있어요 — 홀별로 확인·수정해주세요.{'\n'}또렷한 스크린샷(앱 디지털 카드)이면 더 정확해요.
                </Text>
              </View>
            )}

            {/* 인식 실패/숫자 부족 안내 — 빈 표에 직접 입력 유도 (부드러운 톤) */}
            {failed && (
              <View style={{ marginBottom: 12, padding: 10, borderRadius: 10,
                backgroundColor: C.butter + '33', borderWidth: 0.5, borderColor: C.butter + '80' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                  사진에서 숫자를 충분히 읽지 못했어요.{'\n'}아래에 직접 입력하거나, 카톡으로 받은 스코어카드 사진으로 다시 시도해보세요.
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
                        backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
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
                  {/* 파대비 표기 카드 변환 토글 — par를 읽은 카드에서만. 스마트스코어류=홀칸이 파 대비(0·+1·+2). */}
                  {parReady && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 10,
                      borderRadius: 10, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal }}>파대비(오버파) 표기 카드예요</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray, marginTop: 2, lineHeight: 15 }}>
                          홀칸이 0·+1·+2처럼 파 기준이면 켜세요 — 실제 타수로 바꿔줘요 (파4 +2 → 6)
                        </Text>
                      </View>
                      <Switch value={parRel} onValueChange={toggleParRel}
                        trackColor={{ true: C.burgundy, false: C.hairline }} thumbColor={C.bgPrimary} />
                    </View>
                  )}
                  {renderNine(0, '전반 (OUT)')}
                  {renderNine(9, '후반 (IN)')}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
                    paddingTop: 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>
                      전반 {front} · 후반 {back}
                    </Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
                      총 {total}타 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>({filled}/18)</Text>
                    </Text>
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
                      backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray }}>다시 선택</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={confirm} activeOpacity={0.85}
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.burgundy }}>
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
