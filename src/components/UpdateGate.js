import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking, BackHandler } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { checkAppVersion, currentVersion } from '../utils/appVersion';

// 앱 업데이트 안내 — 전역 오버레이. App 트리 맨 위에 얹어 어느 화면에서나 덮는다.
//
// ★두 얼굴이 있다 (사용자 2026-07-22)
//   block   : minVersion 미만. 넘길 수 없다. 안드 하드웨어 뒤로가기도 막는다.
//   suggest : latestVersion 미만. '나중에'로 넘길 수 있고, 넘긴 버전은 기억해 다시 조르지 않는다.
//
// ★평소엔 suggest만 쓴다. block은 데이터가 깨질 때만 쓰는 비상 스위치다 —
//   업데이트를 강제하는 게 아니라 이탈을 강제하게 되기 때문이다(스토어 갔다 안 돌아오는 사람이 생긴다).
//   그래서 suggest는 '나중에'를 크게 두고, block은 아예 다른 화면처럼 보이게 한다.
//
// ★스토어 링크가 없으면 버튼을 감춘다. iOS 앱 ID를 config/app.iosUrl에 넣기 전에는
//   "업데이트" 버튼이 아무 데도 안 가는데, 그건 막다른 길이라 안내만 남긴다.
export function UpdateGate() {
  const [info, setInfo] = useState(null);   // { state, storeUrl, message }
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await checkAppVersion();
      if (!alive || r.state === 'ok') return;
      // 권장은 같은 버전으로 한 번 넘겼으면 다시 안 띄운다. 차단은 넘긴 기록과 무관하게 뜬다.
      if (r.state === 'suggest') {
        const done = await storage.load(STORAGE_KEYS.updateSuggestSkipped, '');
        if (done && done === currentVersion()) return;
      }
      setInfo(r);
    })();
    return () => { alive = false; };
  }, []);

  const blocking = !!info && info.state === 'block' && !skipped;

  // 차단 중에는 안드 하드웨어 뒤로가기를 먹는다 — 안 막으면 뒤로 한 번에 게이트가 무의미해진다.
  useEffect(() => {
    if (!blocking) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [blocking]);

  if (!info || skipped) return null;
  const isBlock = info.state === 'block';

  const openStore = () => { if (info.storeUrl) Linking.openURL(info.storeUrl).catch(() => {}); };
  const later = () => {
    storage.save(STORAGE_KEYS.updateSuggestSkipped, currentVersion());
    setSkipped(true);
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: isBlock ? C.navy : 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: C.bgPrimary, borderRadius: 20,
        paddingHorizontal: 24, paddingVertical: 26 }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 2, marginBottom: 8 }}>
          DEAR GOLF
        </Text>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, marginBottom: 10 }}>
          {isBlock ? '업데이트가 필요해요' : '새 버전이 나왔어요'}
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary, lineHeight: fs(21) }}>
          {info.message || (isBlock
            ? '지금 버전으로는 정상적으로 쓸 수 없어요.\n스토어에서 업데이트한 뒤 이용해주세요.'
            : '더 편해진 기능이 준비돼 있어요.\n지금 업데이트하시겠어요?')}
        </Text>

        {!!info.storeUrl && (
          <TouchableOpacity onPress={openStore} activeOpacity={0.85}
            style={{ marginTop: 20, backgroundColor: '#6B1E2A', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>스토어에서 업데이트</Text>
          </TouchableOpacity>
        )}
        {!info.storeUrl && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 18, lineHeight: fs(18) }}>
            앱스토어(또는 플레이스토어)에서{'\n'}'디어골프'를 검색해 업데이트해주세요.
          </Text>
        )}

        {/* 차단일 땐 넘길 길을 만들지 않는다 — 버튼 하나라도 있으면 그게 곧 우회로다 */}
        {!isBlock && (
          <TouchableOpacity onPress={later} activeOpacity={0.7}
            style={{ marginTop: 6, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.warmGray }}>나중에</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
