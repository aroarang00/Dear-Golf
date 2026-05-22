import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';

const AV = ['#C8D9E6', '#F5E6A8', '#6B8B5E', '#D9B8B8'];

// 좋아요 누른 사람 목록 팝업 — names가 배열이면 표시
export function WhoLikedModal({ names, onClose }) {
  if (!names) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 }}
        activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>
              👍 좋아요 {names.length}
            </Text>
          </View>
          {names.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGrayLight, textAlign: 'center', paddingVertical: 28 }}>
              아직 좋아요가 없어요
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {names.map((nm, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 9 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: AV[i % AV.length],
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{nm.charAt(0)}</Text>
                  </View>
                  <Text style={{ fontFamily: nm === '나' ? F.sysB : F.sysM, fontSize: fs(14), color: C.charcoal }}>
                    {nm}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}
            style={{ paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>확인</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
