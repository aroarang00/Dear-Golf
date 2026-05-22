import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

// 참여자 아바타 색상
const AV = ['#C8D9E6', '#F5E6A8', '#6B8B5E', '#D9B8B8'];

// 평가 옵션 — 👍 / 😐 / 👎 (3개만 표시)
const OPTIONS = [
  { key: 'good',    icon: '👍', label: '좋았어요',   color: '#3C7D4F', bg: '#E8F4EA' },
  { key: 'neutral', icon: '😐', label: '보통이에요', color: '#6B6660', bg: '#F0EEEA' },
  { key: 'bad',     icon: '👎', label: '별로였어요', color: '#8B2A2A', bg: '#F4E8E8' },
];

// 라운딩 후 상호 평가 — 모든 동반자를 평가해야 제출 활성화.
// 익명 일괄 집계·점수 반영·푸시는 Phase 2 (Cloud Functions) 작업.
export function RoundEvaluationModal({ visible, round, onClose, onSubmit }) {
  const [ratings, setRatings] = useState({});

  // 모달 열 때마다 상태 초기화
  useEffect(() => { if (visible) setRatings({}); }, [visible]);

  if (!round) return null;
  const people = round.participants || [];
  const allRated = people.length > 0 && people.every(p => !!ratings[p.id]);

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
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>라운딩 평가</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>
              {round.course || '지난 라운딩'}
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 3 }}>
              {round.date || ''}
            </Text>
            <View style={{ backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#E2D2A8', borderRadius: 10, padding: 12, marginTop: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B6914', lineHeight: 16 }}>
                💡 48시간 후 익명으로 일괄 반영돼요.{'\n'}누가 어떤 평가를 했는지는 절대 표시되지 않아요.
              </Text>
            </View>

            <View style={{ marginTop: 18, gap: 14 }}>
              {people.map((p, i) => {
                const pal = AV[i % AV.length];
                const rating = ratings[p.id];
                return (
                  <View key={p.id} style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                    borderRadius: 12, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pal,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>
                          {p.name.charAt(0)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{p.name}</Text>
                        {p.role && (
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 2 }}>{p.role}</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {OPTIONS.map(o => {
                        const on = rating === o.key;
                        return (
                          <TouchableOpacity key={o.key} activeOpacity={0.7}
                            onPress={() => setRatings(r => ({ ...r, [p.id]: o.key }))}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
                              backgroundColor: on ? o.bg : C.bgPrimary,
                              borderWidth: 1, borderColor: on ? o.color : C.hairline }}>
                            <Text style={{ fontSize: fs(17) }}>{o.icon}</Text>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), marginTop: 3,
                              color: on ? o.color : C.warmGray }}>{o.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity activeOpacity={0.85} disabled={!allRated}
              onPress={() => { onSubmit && onSubmit(ratings); onClose(); }}
              style={{ marginTop: 22, backgroundColor: allRated ? C.burgundy : C.hairline,
                borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14),
                color: allRated ? C.butter : C.warmGrayLight }}>
                {allRated ? '평가 제출' : '모든 동반자를 평가해주세요'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
