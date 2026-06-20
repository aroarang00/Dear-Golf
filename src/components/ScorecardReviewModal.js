import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sumHoles } from '../utils/scorecardOcr';

// 스코어카드 인식 결과 검토 — (여러 명이면) 본인 행 선택 → 18홀 표 미리보기·수정 → 확정.
//  rows: [{ label, holes:number[18], total }]   label은 화면 구분용(저장 X)
//  onConfirm({ holeScores:number[18], total })
//
// 자동 확정 X — 추출값을 사용자가 반드시 확인·수정 후 확정 ([[project_scorecard_ocr]]).
export function ScorecardReviewModal({ visible, rows = [], failed = false, onConfirm, onClose }) {
  const multi = rows.length > 1;
  const [rowIdx, setRowIdx] = useState(multi ? null : 0);
  const [holes, setHoles] = useState([]); // 편집용 문자열 배열

  const loadRow = (i) =>
    setHoles((rows[i]?.holes || []).map(n => (Number.isFinite(n) ? String(n) : '')));

  // 열릴 때마다 초기화 — 1행이면 바로 표, 여러 행이면 행 선택부터
  useEffect(() => {
    if (!visible) return;
    if (multi) { setRowIdx(null); setHoles([]); }
    else { setRowIdx(0); loadRow(0); }
  }, [visible, rows]);

  const pickRow = (i) => { setRowIdx(i); loadRow(i); };

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

  // 안드 뒤로가기 — 표에서는 행 선택으로, 행 선택/단일행에서는 모달 닫기
  const handleRequestClose = () => {
    if (multi && rowIdx !== null) { setRowIdx(null); return; }
    onClose && onClose();
  };

  const confirm = () => onConfirm && onConfirm({ holeScores: holeNums, total });

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
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} edges={['bottom']}>
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingTop: 10, paddingHorizontal: 20, paddingBottom: 20, maxHeight: '90%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 12 }} />

            {/* 헤더 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, flex: 1 }}>
                {inSelect ? '본인 줄을 선택해주세요' : '스코어카드 확인'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(20), color: C.warmGray }}>✕</Text>
              </TouchableOpacity>
            </View>

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
                  <TouchableOpacity onPress={() => setRowIdx(null)} activeOpacity={0.85}
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
      </SafeAreaProvider>
    </Modal>
  );
}
