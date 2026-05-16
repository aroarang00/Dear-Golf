import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
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
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(26,61,82,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 라운딩 일정</Text>
          <Text style={{
            fontFamily: F.sys,
            fontSize: 26,
            fontWeight: '700',
            color: C.navy,
          }}>캘린더</Text>
        </View>
        <TouchableOpacity
          onPress={() => Alert.alert(
            '일정 삭제 안내',
            '지난 일정을 삭제하려면\n일정 카드를 길게 누르세요.\n\n다이어리 기록이 있는 일정은\n다이어리 탭에서 삭제할 수 있어요.',
            [{ text: '확인' }],
          )}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 1.5, borderColor: C.navy,
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ fontFamily: F.en, fontSize: 14, color: C.navy, fontWeight: '700', lineHeight: 17 }}>!</Text>
        </TouchableOpacity>
      </View>
      <MyScheduleTab
        diaries={diaries}
        onRequestAddDiary={(seed) => navigation.navigate('다이어리', { openAddModal: true, addDate: seed?.date })}
      />
    </SafeAreaView>
  );
}
