import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';
import { useAndroidBack } from '../../hooks/useAndroidBack';

// 풀스크린 모달 위에서도 보이는 알럿/액션시트.
// 네이티브 Modal이 아닌 오버레이 View로 띄워 모달 전환 충돌을 피한다.
//   data: { title, message, highlight, note, buttons: [{ text, onPress, style }] }
//   highlight: [{ icon, text }] — 진하게 강조할 핵심 정보(구장·날짜 등) 카드. 선택.
//   note: 강조 카드 아래 작은 보조 안내. 선택.
export function OverlayAlert({ data, onClose }) {
  const insets = useSafeAreaInsets();
  // 안드로이드 뒤로가기 — 알럿이 떠 있으면 닫기만 하고 네비게이션으로 넘기지 않음
  useAndroidBack(!!data, onClose);
  if (!data) return null;
  const buttons = data.buttons && data.buttons.length ? data.buttons : [{ text: '확인' }];
  const inRow = buttons.length <= 2;
  const btnStyle = (b) => {
    if (b.style === 'destructive') return { bg: C.burgundy, fg: C.butter, borderColor: null, borderWidth: 0 };
    if (b.style === 'cancel') return { bg: C.bgSecondary, fg: C.warmGray, borderColor: C.hairline, borderWidth: 0.5 };
    // 2차 액션 — 1차(채움)와 색으로 구분되게 아웃라인(흰 배경+진한 테두리·글씨). 예: '익명으로 참여'
    if (b.style === 'secondary') return { bg: C.bgPrimary, fg: C.charcoal, borderColor: C.charcoal, borderWidth: 1.2 };
    return { bg: C.charcoal, fg: C.butter, borderColor: null, borderWidth: 0 };
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
      paddingTop: 32, paddingHorizontal: 32, paddingBottom: Math.max(32, insets.bottom + 24) }}>
      <View style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 340 }}>
        {!!data.title && (
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, textAlign: 'center', marginBottom: data.message ? 8 : 18 }}>
            {data.title}
          </Text>
        )}
        {!!data.message && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: data.highlight || data.note ? 14 : 20 }}>
            {data.message}
          </Text>
        )}
        {Array.isArray(data.highlight) && data.highlight.length > 0 && (
          <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12,
            paddingVertical: 14, paddingHorizontal: 16, marginBottom: data.note ? 12 : 20 }}>
            {data.highlight.map((h, i) => (
              <Text key={i} style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, textAlign: 'center',
                lineHeight: 22, marginTop: i === 0 ? 0 : 6 }}>
                {h.icon ? `${h.icon} ` : ''}{h.text}
              </Text>
            ))}
          </View>
        )}
        {!!data.note && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
            {data.note}
          </Text>
        )}
        <View style={{ flexDirection: inRow ? 'row' : 'column', gap: 8 }}>
          {buttons.map((b, i) => {
            const s = btnStyle(b);
            return (
              <TouchableOpacity key={i} activeOpacity={0.85}
                onPress={() => { onClose(); b.onPress && b.onPress(); }}
                style={{ flex: inRow ? 1 : undefined, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                  backgroundColor: s.bg, borderWidth: s.borderWidth || 0, borderColor: s.borderColor || C.hairline }}>
                <Text style={{ fontFamily: b.style === 'cancel' ? F.sys : F.sysB, fontSize: fs(15), color: s.fg }}>
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
