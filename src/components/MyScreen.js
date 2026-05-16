import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { CourseLogTab } from './CourseLogTab';
import { FriendsTab } from './FriendsTab';

const SUB_TABS = [
  ['course', '내 코스기록', C.butter],
  ['friends', '친구', C.burgundy],
];

export function MyScreen({ navigation }) {
  const [tab, setTab] = useState('course');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.warmGray, paddingHorizontal: 20, paddingVertical: 13 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
        <Text style={{
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: 28,
          color: '#FFFFFF',
        }}>My</Text>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        {SUB_TABS.map(([k, l, color]) => {
          const on = tab === k;
          return (
            <TouchableOpacity key={k}
              onPress={() => setTab(k)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: on ? 3 : 0, borderBottomColor: color }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: on ? C.charcoal : C.warmGrayLight, fontWeight: on ? '600' : '400' }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'course' ? (
        <CourseLogTab navigation={navigation} />
      ) : (
        <FriendsTab />
      )}
    </SafeAreaView>
  );
}
