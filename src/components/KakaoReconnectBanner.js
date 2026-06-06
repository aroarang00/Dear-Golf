import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { loginWithKakao, linkOrSignInWithKakao } from '../utils/kakaoAuth';
import { checkBannedByKakaoSub } from '../utils/account';
import { ensureUserDoc } from '../utils/userDoc';
import { C, F, fs } from '../constants/colors';

// 카카오 연동 흔적([[anonymous-user-policy]] 복귀 경로)이 있는데 현재 세션이 익명으로 떨어졌을 때만
// 홈 상단에 뜨는 배너. 탭하면 카카오로 다시 로그인해 기존 카카오 uid로 복귀한다.
// (흔적 없는 순수 익명용 '연동하고 안전 보관' 배너는 출시 전 B묶음에서 이 컴포넌트를 확장)
export function KakaoReconnectBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const evaluate = async () => {
      const traced = await storage.load(STORAGE_KEYS.kakaoTrace, false);
      if (mounted) setShow(!!traced && !!auth.currentUser?.isAnonymous);
    };
    evaluate();
    // uid가 바뀌면(복귀 성공 등) 자동 재평가
    const unsub = onAuthStateChanged(auth, () => evaluate());
    return () => { mounted = false; unsub(); };
  }, []);

  const handleReconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await loginWithKakao();
      if (!result || result.ok === false) {
        Alert.alert('카카오 연결 실패', '잠시 후 다시 시도해 주세요.');
        return;
      }
      // 정지 계정 차단 ([[account-deletion]])
      if (result.kakaoId) {
        const ban = await checkBannedByKakaoSub(result.kakaoId);
        if (ban.banned) {
          Alert.alert('이용이 제한된 계정이에요', '이 카카오 계정은 Dear Golf 이용이 제한되었어요.');
          return;
        }
      }
      const link = await linkOrSignInWithKakao(result.idToken);
      if (!link.ok) {
        Alert.alert('카카오 연결 실패', `다시 시도해 주세요.\n(${link.error})`);
        return;
      }
      await ensureUserDoc(link.uid, {
        kakaoId: result.kakaoId,
        nickname: result.nickname,
        profileImageUrl: result.profileImageUrl,
      });
      setShow(false);
      Alert.alert('연결 완료', '카카오 계정으로 다시 연결됐어요.\n기록이 안전하게 보관돼요.');
    } catch (e) {
      Alert.alert('오류', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!show) return null;

  return (
    <TouchableOpacity onPress={handleReconnect} activeOpacity={0.85} disabled={busy}
      style={{ marginHorizontal: 14, marginTop: 10, backgroundColor: '#FEF8D8',
        borderWidth: 0.5, borderColor: '#E8D88A', borderRadius: 12,
        paddingVertical: 12, paddingHorizontal: 14,
        flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: fs(18) }}>💬</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>
          카카오로 다시 연결하기
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
          연결하면 기록이 안전하게 보관돼요
        </Text>
      </View>
      {busy
        ? <ActivityIndicator size="small" color={C.warmGray} />
        : <Text style={{ fontFamily: F.sys, fontSize: fs(20), color: C.warmGray }}>›</Text>}
    </TouchableOpacity>
  );
}
