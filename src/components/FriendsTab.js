import React, { useState } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import { C, F } from '../constants/colors';
import { FRIENDS_DATA } from '../constants/data';
import { TripleStripe } from './common/TripleStripe';

export function FriendsTab() {
  const [searchNick, setSearchNick] = useState('');
  const [showFriends, setShowFriends] = useState(false);

  const confirmedFriends = FRIENDS_DATA;
  const pendingFriends = [{ id: 'p1', nickname: '박정호', status: 'pending' }];

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <View style={{
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
        backgroundColor: C.bgPrimary,
      }}>
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
          />
          <TouchableOpacity style={{
            backgroundColor: C.charcoal, borderRadius: 10,
            paddingHorizontal: 16, justifyContent: 'center',
          }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter }}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
            onPress={() => setShowFriends(!showFriends)}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>
              친구 {confirmedFriends.length}명{pendingFriends.length > 0 ? ` · 신청중 ${pendingFriends.length}명` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: C.burgundy, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>+ 친구 추가</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{showFriends ? '∧' : '∨'}</Text>
            </View>
          </TouchableOpacity>

          {showFriends && (
            <View style={{ marginBottom: 16 }}>
              {confirmedFriends.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.en, fontSize: 16, color: C.charcoal }}>{f.nickname.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary }}>{f.nickname}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{f.lastCourse} · {f.lastDate}</Text>
                  </View>
                </View>
              ))}
              {pendingFriends.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline, opacity: 0.5 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.warmGrayLight, borderStyle: 'dashed' }}>
                    <Text style={{ fontFamily: F.en, fontSize: 16, color: C.warmGrayLight }}>{f.nickname.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>{f.nickname}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>친구 신청중...</Text>
                  </View>
                  <TouchableOpacity style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>취소</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TripleStripe height={1} />

          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginTop: 14, marginBottom: 10 }}>최근 라운딩</Text>
          {confirmedFriends.map(f => (
            <View key={f.id} style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: C.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.en, fontSize: 16, color: C.charcoal }}>{f.nickname.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary }}>{f.nickname}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{f.lastCourse} · {f.lastDate}</Text>
                </View>
              </View>
              {f.photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {f.photos.map((uri, i) => (
                      <Image key={i} source={{ uri }} style={{ width: 120, height: 90, borderRadius: 8 }} resizeMode="cover" />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 8, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>공유된 사진이 없어요</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
