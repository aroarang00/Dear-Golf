import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { MyScheduleTab } from './MyScheduleTab';

export function ScheduleScreen({ navigation }) {
  const [diaries, setDiaries] = useState(DIARY_DATA);

  // 다이어리(라운딩 기록)는 캘린더 완료 표시에만 쓰임 → 탭 진입 시마다 최신값 로드
  useEffect(() => {
    const load = async () => {
      const d = await storage.load(STORAGE_KEYS.diaries, DIARY_DATA);
      setDiaries(d);
    };
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(26,61,82,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 라운딩 캘린더</Text>
        <Text style={{
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: 28,
          color: '#1A3D52',
        }}>Schedule</Text>
      </View>
      <MyScheduleTab
        diaries={diaries}
        onRequestAddDiary={(seed) => navigation.navigate('다이어리', { openAddModal: true, addDate: seed?.date })}
      />
    </SafeAreaView>
  );
}
