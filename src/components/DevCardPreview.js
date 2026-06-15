// ★TEMP_DEV — 공유카드 4종 미리보기(샘플 데이터). dev에서 카드 디자인 확인용. 최종 빌드 전 제거.
//   App.js에서 DEV_BYPASS_LOGIN일 때만 렌더. 우상단 '🃏' 버튼 → 전체화면 모달에 4종 카드 스크롤.
import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { RoundCard } from './RoundCard';
import { RoundCardScorecard } from './RoundCardScorecard';
import { RoundCardMemory } from './RoundCardMemory';
import { RoundCardPolaroid } from './RoundCardPolaroid';

const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/dear-golf.firebasestorage.app/o/rounds%2FicHIqbVm8VWfu1y5DfAj5ylkCmj2%2Fm_1780985108529_0_1p7a4l.jpg?alt=media&token=b85dc63e-df5c-4541-9328-6e9770a94c73';

// 홀인원 + 싱글(71) + 사진 + 18홀 + 메모 + 동반자 — 모든 카드 요소 한 번에 검증
const SAMPLE = {
  photos: [PHOTO], // 사진 있는 버전 확인용(no-photo 보려면 [])
  special: 'HOLE IN ONE',
  score: 71, par: 72, // 싱글(≤79) — SINGLE 칩 표시 확인용(holeScores 합 71과 일치)
  course: '라비에벨CC 올드코스',
  date: '2026.06.14', day: '일', weather: '맑음',
  playerName: '홍길동',
  companions: [{ name: '홍길동', isMe: true }, { name: '김철수' }, { name: '이영희' }, { name: '박민수' }],
  memo: '날씨도 좋고 최고였다',
  // 버디·이글·홀인원·파·보기·더블 섞어 모든 표기 확인용(합 71 유지). idx2=홀인원(par3·1타), idx5=이글(par5·3), idx0·9=버디
  holeScores: [3, 5, 1, 5, 4, 3, 5, 3, 4, 3, 4, 5, 4, 4, 5, 4, 3, 6],
  holePars: [4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 4],
  starRating: 5, overseas: false,
};

const CARDS = [
  ['매거진 (special=버건디)', RoundCard],
  ['스코어카드 (타수옆 버건디)', RoundCardScorecard],
  ['기념 (special=워터마크자리)', RoundCardMemory],
  ['폴라로이드', RoundCardPolaroid],
];

export function DevCardPreview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ position: 'absolute', top: (StatusBar.currentHeight || 24) + 8, right: 12, zIndex: 99998,
          backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: '#fff', fontSize: 14 }}>🃏 카드</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#15120F', paddingTop: (StatusBar.currentHeight || 24) + 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 }}>
            <Text style={{ color: '#F5E6A8', fontSize: 16, fontWeight: '600' }}>공유카드 미리보기 (DEV)</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 8 }}>
              <Text style={{ color: '#fff', fontSize: 16 }}>닫기 ✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 16, paddingBottom: 60 }}>
            {CARDS.map(([label, Card], i) => (
              <View key={i} style={{ marginBottom: 28, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 10 }}>{label}</Text>
                <Card item={SAMPLE} width={300} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
