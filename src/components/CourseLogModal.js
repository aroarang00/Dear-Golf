import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { CourseLogTab } from './CourseLogTab';

// 내 코스기록 — 코스 탭 헤더에서 진입하는 전체화면 페이지.
// 기존 MY 화면에 있던 라운딩 통계 박스 + 코스기록 목록.
export function CourseLogModal({ visible, onClose, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [diaries, setDiaries] = useState(DIARY_DATA);

  useEffect(() => {
    if (!visible) return;
    storage.load(STORAGE_KEYS.diaries, DIARY_DATA).then(d => setDiaries(d || DIARY_DATA));
  }, [visible]);

  const avg = userProfile.avgScore || (diaries.length > 0 ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length) : 0);
  const best = userProfile.lifeBest || (diaries.length > 0 ? Math.min(...diaries.map(d => d.score)) : 0);
  const totalRounds = userProfile.totalRounds || diaries.length;

  // CourseLogTab 내부에서 다른 탭으로 이동할 땐 이 모달을 먼저 닫는다.
  // navigation 식별자 기준으로 메모이즈 — CourseLogTab의 리스너 effect가 매 렌더 재실행되지 않게.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wrappedNav = useMemo(() => (navigation ? {
    navigate: (name, params) => { onCloseRef.current(); navigation.navigate(name, params); },
    addListener: (ev, cb) => navigation.addListener(ev, cb),
  } : undefined), [navigation]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — MY 헤더와 동일한 네이비 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.bgPrimary }}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(250,246,236,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 17, color: C.bgPrimary, fontWeight: '700' }}>내 코스기록</Text>
            </View>
          </View>

          {/* 라운딩 통계 박스 — 기존 MY 화면에서 이동 */}
          <View style={dS.statsRow}>
            {[
              { label: '라운딩', value: totalRounds },
              { label: '평균타', value: avg, hi: true },
              { label: '베스트', value: best },
            ].map((st, i) => (
              <View key={i} style={[dS.statBox, st.hi && dS.statBoxHi]}>
                <Text style={[dS.statVal, st.hi && { color: C.burgundy }]}>{st.value}</Text>
                <Text style={dS.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>

          <CourseLogTab navigation={wrappedNav} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
