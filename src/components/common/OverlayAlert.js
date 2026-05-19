import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../../constants/colors';

// 풀스크린 모달 위에서도 보이는 알럿/액션시트.
// 네이티브 Modal이 아닌 오버레이 View로 띄워 모달 전환 충돌을 피한다.
//   data: { title, message, buttons: [{ text, onPress, style }] }
export function OverlayAlert({ data, onClose }) {
  if (!data) return null;
  const buttons = data.buttons && data.buttons.length ? data.buttons : [{ text: '확인' }];
  const inRow = buttons.length <= 2;
  const btnStyle = (b) => {
    if (b.style === 'destructive') return { bg: C.burgundy, fg: C.butter, border: false };
    if (b.style === 'cancel') return { bg: C.bgSecondary, fg: C.warmGray, border: true };
    return { bg: C.charcoal, fg: C.butter, border: false };
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 340 }}>
        {!!data.title && (
          <Text style={{ fontFamily: F.sys, fontSize: 16, fontWeight: '700', color: C.charcoal, textAlign: 'center', marginBottom: data.message ? 8 : 18 }}>
            {data.title}
          </Text>
        )}
        {!!data.message && (
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            {data.message}
          </Text>
        )}
        <View style={{ flexDirection: inRow ? 'row' : 'column', gap: 8 }}>
          {buttons.map((b, i) => {
            const s = btnStyle(b);
            return (
              <TouchableOpacity key={i} activeOpacity={0.85}
                onPress={() => { onClose(); b.onPress && b.onPress(); }}
                style={{ flex: inRow ? 1 : undefined, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                  backgroundColor: s.bg, borderWidth: s.border ? 0.5 : 0, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: s.fg, fontWeight: b.style === 'cancel' ? '400' : '600' }}>
                  {b.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
