import React, { useState } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { FRIENDS_DATA } from '../constants/data';

// 더미 친구 피드 — Firebase 연동 전 UI 표시용
const FEED = [
  { id: 'fd1', name: '오세훈', course: '제이드팰리스 GC', date: '5.12', isPublic: true,  score: 78, par: 72, rating: 5, memo: '인생 베스트 갱신! 퍼팅이 다 들어간 날', claps: 14 },
  { id: 'fd2', name: '김민준', course: '남촌 골프클럽',   date: '5.10', isPublic: true,  score: 88, par: 72, rating: 4, memo: '드라이버가 잘 맞은 날 ⛳',            claps: 8 },
  { id: 'fd3', name: '이수연', course: '블랙스톤 CC',     date: '5.08', isPublic: false, claps: 5 },
  { id: 'fd4', name: '박지영', course: '레이크사이드 CC', date: '5.03', isPublic: true,  score: 94, par: 72, rating: 3, memo: '바람이 강해서 고전했어요',          claps: 3 },
  { id: 'fd5', name: '정현우', course: '베어크리크 GC',   date: '4.29', isPublic: false, claps: 11 },
];

const AVATAR_COLORS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#8B8680', fg: '#fff' },
  { bg: '#6B8B5E', fg: '#fff' },
];

function FeedCard({ item, palette, clapped, onClap }) {
  const diff = item.isPublic ? item.score - item.par : 0;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const clapCount = item.claps + (clapped ? 1 : 0);
  return (
    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14, marginBottom: 12 }}>
      {/* 헤더 — 아바타 + 이름 + 골프장·날짜 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 16, color: palette.fg, fontWeight: '600' }}>{item.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{item.name}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 2 }}>{item.course} · {item.date}</Text>
        </View>
      </View>

      {/* 본문 — 공개면 스코어/별점/메모, 비공개면 안내 */}
      {item.isPublic ? (
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 10, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: F.en, fontSize: 26, color: C.charcoal, fontWeight: '700' }}>{item.score}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>타 · {diffLabel}</Text>
            {item.rating > 0 && (
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C', marginLeft: 4 }}>{'★'.repeat(item.rating)}</Text>
            )}
          </View>
          {item.memo ? (
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 6, lineHeight: 18 }}>"{item.memo}"</Text>
          ) : null}
        </View>
      ) : (
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 10, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray }}>라운딩 다녀왔어요 ⛳</Text>
        </View>
      )}

      {/* 잘쳤다 버튼 */}
      <TouchableOpacity onPress={onClap} activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 10, paddingVertical: 9, borderRadius: 10,
          backgroundColor: clapped ? C.butter : C.bgPrimary,
          borderWidth: 0.5, borderColor: clapped ? C.butter : C.hairline,
        }}>
        <Text style={{ fontSize: 13 }}>👏</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: clapped ? '#5A4500' : C.warmGray }}>
          잘쳤다 {clapCount}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function FriendsTab() {
  const [searchNick, setSearchNick] = useState('');
  const [claps, setClaps] = useState({});

  const friendCount = FRIENDS_DATA.length;
  const pendingCount = 1;
  const toggleClap = (id) => setClaps(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 닉네임 검색 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={{
              flex: 1, backgroundColor: C.bgSecondary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontFamily: F.sys, fontSize: 13, color: C.textPrimary,
              borderWidth: 0.5, borderColor: C.hairline,
            }}
            placeholder="닉네임으로 친구 찾기..."
            placeholderTextColor={C.warmGrayLight}
            value={searchNick}
            onChangeText={setSearchNick}
            returnKeyType="search"
          />
          <TouchableOpacity activeOpacity={0.8}
            style={{ backgroundColor: C.charcoal, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '600' }}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}>
        {/* 친구 수 + 친구 추가 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>
            친구 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{friendCount}</Text>명
            {pendingCount > 0 ? ` · 신청중 ${pendingCount}명` : ''}
          </Text>
          <TouchableOpacity activeOpacity={0.7}
            style={{ borderWidth: 1, borderColor: C.burgundy, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, fontWeight: '600' }}>+ 친구 추가</Text>
          </TouchableOpacity>
        </View>

        {/* 친구 피드 */}
        {FEED.map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            palette={AVATAR_COLORS[i % AVATAR_COLORS.length]}
            clapped={!!claps[item.id]}
            onClap={() => toggleClap(item.id)}
          />
        ))}

        {/* Firebase 안내 */}
        <View style={{ marginTop: 6, backgroundColor: C.paleSky + '33', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
            🔒 친구 기능은 Firebase 연동 후{'\n'}정식 오픈 예정이에요
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
