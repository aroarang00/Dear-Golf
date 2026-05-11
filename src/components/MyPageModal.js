import React, { useState, useEffect } from 'react';
import {
  Modal, View, ScrollView, Text, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { C, F } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { myS } from '../styles/myS';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';

export function MyPageModal({ visible, onClose }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const [nickname, setNickname] = useState(userProfile.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [departure, setDeparture] = useState(userProfile.departure || '');
  const [phone, setPhone] = useState(userProfile.phone || '');
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingStats, setEditingStats] = useState(false);
  const [avgScore, setAvgScore] = useState(String(userProfile.avgScore || ''));
  const [lifeBest, setLifeBest] = useState(String(userProfile.lifeBest || ''));
  const [totalRounds, setTotalRounds] = useState(String(userProfile.totalRounds || ''));

  const handleSaveStats = () => {
    const updated = {
      ...userProfile,
      avgScore: Number(avgScore) || 0,
      lifeBest: Number(lifeBest) || 0,
      totalRounds: Number(totalRounds) || 0,
    };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingStats(false);
    Alert.alert('완료', '통계가 저장되었어요 ✓');
  };

  useEffect(() => {
    if (visible) {
      setNickname(userProfile.nickname);
      setDeparture(userProfile.departure || '');
      setPhone(userProfile.phone || '');
      setEditingInfo(false);
    }
  }, [visible]);

  const handleSaveInfo = () => {
    const updated = { ...userProfile, departure, phone };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingInfo(false);
    Alert.alert('완료', '내 정보가 저장되었어요 ✓');
  };

  const handleCancelInfo = () => {
    setDeparture(userProfile.departure || '');
    setPhone(userProfile.phone || '');
    setEditingInfo(false);
  };

  const formatPhone = (t) => {
    const numbers = (t || '').replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return numbers.slice(0, 3) + '-' + numbers.slice(3);
    return numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
  };

  const handleSaveNickname = () => {
    const trimmed = (nickname || '').trim();
    if (!trimmed) {
      setNickname(userProfile.nickname);
      setEditingNick(false);
      return;
    }
    if (trimmed === userProfile.nickname) {
      setEditingNick(false);
      return;
    }
    const updated = { ...userProfile, nickname: trimmed };
    setUserProfile({ ...updated });
    setNickname(trimmed);
    setEditingNick(false);
    Alert.alert('완료', '닉네임이 변경되었어요');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={myS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={myS.sheet}>
            <View style={myS.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={myS.profileArea}>
                <View style={myS.avatar}>
                  <Text style={myS.avatarTxt}>{nickname.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {editingNick ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[myS.nickInput, { flex: 1 }]}
                        value={nickname} onChangeText={setNickname}
                        onSubmitEditing={handleSaveNickname}
                        returnKeyType="done"
                        autoFocus maxLength={10}
                        autoCapitalize="none" autoCorrect={false} keyboardType="default" />
                      <TouchableOpacity onPress={handleSaveNickname}
                        style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                        activeOpacity={0.7}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        setNickname(userProfile.nickname);
                        setEditingNick(false);
                      }} activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={myS.nickname}>{nickname}</Text>
                      <TouchableOpacity
                        onPress={() => setEditingNick(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 10 }}
                        activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: 12 }}>닉네임 수정</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={myS.realName}>{userProfile.realName}</Text>
                </View>
              </View>
              <TripleStripe height={1.5} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={myS.sectionLabel}>나의 통계</Text>
                  <View style={{ flex: 1 }} />
                  {editingStats ? (
                    <>
                      <TouchableOpacity onPress={() => {
                        setAvgScore(String(userProfile.avgScore || ''));
                        setLifeBest(String(userProfile.lifeBest || ''));
                        setTotalRounds(String(userProfile.totalRounds || ''));
                        setEditingStats(false);
                      }}>
                        <Text style={{ color: '#8B8680', marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveStats}
                        style={{ backgroundColor: '#6B1E2A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ color: '#F5E6A8', fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingStats(true)}>
                      <Text style={{ color: '#6B1E2A', fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingStats ? (
                  <View>
                    {[
                      { label: '평균 타수', value: avgScore, set: setAvgScore, ph: '92' },
                      { label: '베스트 스코어', value: lifeBest, set: setLifeBest, ph: '78' },
                      { label: '총 라운딩 수', value: totalRounds, set: setTotalRounds, ph: '0' },
                    ].map((field, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 4 }}>
                          {field.label}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                            fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}
                          value={field.value}
                          onChangeText={field.set}
                          keyboardType="numeric"
                          placeholder={field.ph}
                          placeholderTextColor={C.warmGrayLight}
                          maxLength={4}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={myS.statsRow}>
                    {[
                      { label: '총 라운딩', value: userProfile.totalRounds || DIARY_DATA.length },
                      { label: '평균타', value: userProfile.avgScore || Math.round(DIARY_DATA.reduce((s,d) => s+d.score, 0) / DIARY_DATA.length) },
                      { label: '베스트', value: userProfile.lifeBest || Math.min(...DIARY_DATA.map(d => d.score)) },
                    ].map((st, i) => (
                      <View key={i} style={myS.statBox}>
                        <Text style={myS.statVal}>{st.value}</Text>
                        <Text style={myS.statLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={myS.sectionLabel}>내 정보</Text>
                  <View style={{ flex: 1 }} />
                  {editingInfo ? (
                    <>
                      <TouchableOpacity onPress={handleCancelInfo}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveInfo}
                        style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingInfo(true)}>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>자주 가는 출발지</Text>
                    {editingInfo ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={departure} onChangeText={setDeparture} autoFocus
                        placeholder="서울 강남구 역삼동" placeholderTextColor={C.warmGrayLight} />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: departure ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {departure || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>전화번호 (선택)</Text>
                    {editingInfo ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={phone} onChangeText={(t) => setPhone(formatPhone(t))} maxLength={13}
                        placeholder="010-0000-0000" placeholderTextColor={C.warmGrayLight} keyboardType="phone-pad" />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: phone ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {phone || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>설정</Text>
                {[{ icon: '✏️', label: '닉네임 변경' }, { icon: '🔔', label: '알림 설정' }, { icon: '📷', label: '앱 권한 (사진·위치)' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>정보</Text>
                {[{ icon: '⭐', label: '앱 평가하기' }, { icon: '📋', label: 'v1.0.0' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>Dear Golf v1.0.0</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
