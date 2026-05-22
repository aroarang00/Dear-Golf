import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 홈 첫 진입 안내 — 3단계 (0·1: 탭/3초 후 자동, 2: 메뉴 안내 + 버튼)
const TIPS = [
  { title: '라운딩 일정 추가하기', desc: '말풍선 버튼을 눌러 첫 일정을 등록해보세요' },
  { title: '날씨 · 교통 확인', desc: '버튼을 탭하면 날씨와 교통을 확인할 수 있어요' },
];

const MENUS = [
  ['홈', '예정 라운딩과 오늘의 골프 정보'],
  ['라운지', '함께 칠 동반자 모집·참여'],
  ['MY', '라운딩 기록 · 통계 · 명예의 전당'],
  ['친구', '골프 친구와 기록 공유'],
  ['코스', '골프장 검색과 코스 정보'],
];

export function HomeTooltip({ visible, onClose }) {
  const [step, setStep] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  // 0·1단계 — 3초 후 자동 진행
  useEffect(() => {
    if (!visible || step > 1) return;
    timerRef.current = setTimeout(() => setStep(s => s + 1), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, step]);

  if (!visible) return null;

  const advance = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStep(s => s + 1);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        {step <= 1 ? (
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'flex-start', paddingTop: '34%', paddingHorizontal: 28 }}
            activeOpacity={1}
            onPress={advance}>
            <View style={{ backgroundColor: C.bgPrimary, borderRadius: 14, padding: 18, borderLeftWidth: 4, borderLeftColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 6 }}>
                {step + 1} / 3
              </Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 5 }}>
                {TIPS[step].title}
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 20 }}>
                {TIPS[step].desc}
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 10 }}>
                화면을 탭하거나 잠시 기다리면 넘어가요
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
            <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, padding: 22 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 6 }}>3 / 3</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginBottom: 16 }}>
                메뉴 한눈에 보기
              </Text>
              {MENUS.map(([name, desc]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 11 }}>
                  <View style={{ backgroundColor: C.charcoal, borderRadius: 6, paddingVertical: 4, marginRight: 10, width: 56, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter }}>{name}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, flex: 1, lineHeight: 18 }}>{desc}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={onClose} activeOpacity={0.85}
                style={{ marginTop: 10, backgroundColor: C.charcoal, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>시작할게요!</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
