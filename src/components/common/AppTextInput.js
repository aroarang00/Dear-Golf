import React, { forwardRef, useState, useCallback } from 'react';
import { TextInput, Text, View, StyleSheet, Platform } from 'react-native';
import { F, C } from '../../constants/colors';

// 앱 공용 입력창 — Android에서 TextInput placeholder가 fontFamily를 무시하고 기기 시스템 폰트로
//   렌더되는 RN 버그(facebook/react-native#45853·#50137) 우회. 비었을 때 placeholder를 진짜
//   <Text>(앱 폰트)로 입력창 위에 덮어 그린다. iOS는 정상이라 네이티브 placeholder 그대로 통과.
// ★호출부는 <TextInput>과 완전히 동일하게 쓴다 — 같은 props·ref·style. 레이아웃 보존을 위해
//   바깥 레이아웃 속성(margin/flex/width 등)만 래퍼 View로 옮기고, TextInput 본체는 기존 스타일을
//   그대로 받아 렌더가 1px도 안 바뀌게 한다(박스·padding·테두리는 TextInput에 그대로 유지).

// 래퍼 View로 옮길 '바깥 레이아웃' 키 — 이게 TextInput에 남으면 View·TextInput 양쪽에 적용돼 이중이 됨.
const OUTER_KEYS = [
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth',
];

const AppTextInput = forwardRef(function AppTextInput(props, ref) {
  const { style, placeholder, placeholderTextColor, value, defaultValue, onChangeText, multiline, ...rest } = props;

  // Hook은 항상 같은 순서로 호출 — 플랫폼 분기보다 먼저(Rules of Hooks).
  const controlled = value !== undefined;            // 제어형(value 존재) vs 비제어형
  const [innerEmpty, setInnerEmpty] = useState(!defaultValue);
  const handleChangeText = useCallback((t) => {
    if (!controlled) setInnerEmpty(!t);
    onChangeText && onChangeText(t);
  }, [controlled, onChangeText]);

  // iOS — placeholder 폰트 버그 없음. 군더더기 없이 그대로 통과.
  if (Platform.OS !== 'android') {
    return (
      <TextInput
        ref={ref}
        style={style}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        multiline={multiline}
        {...rest}
      />
    );
  }

  const flat = StyleSheet.flatten(style) || {};
  // 비었는지 판단 — 제어형은 value로, 비제어형은 내부 추적.
  const isEmpty = controlled ? (value == null || value === '') : innerEmpty;

  // 바깥 레이아웃 속성만 래퍼 View로 분리(나머지 박스·텍스트 스타일은 TextInput에 그대로 남김).
  const outer = {};
  const inner = { ...flat };
  for (const k of OUTER_KEYS) {
    if (flat[k] !== undefined) { outer[k] = flat[k]; delete inner[k]; }
  }

  // 오버레이 placeholder 정렬 — TextInput의 padding/폰트/정렬을 그대로 맞춰 위치 일치.
  const overlayStyle = {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    paddingTop: flat.paddingTop ?? flat.paddingVertical ?? flat.padding,
    paddingBottom: flat.paddingBottom ?? flat.paddingVertical ?? flat.padding,
    paddingLeft: flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding,
    paddingRight: flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding,
    fontFamily: flat.fontFamily || F.sys,
    fontSize: flat.fontSize,
    lineHeight: flat.lineHeight,
    letterSpacing: flat.letterSpacing,
    textAlign: flat.textAlign,
    color: placeholderTextColor || C.warmGrayLight,
    textAlignVertical: multiline ? 'top' : 'center',
    includeFontPadding: false,
  };

  return (
    <View style={[{ position: 'relative' }, outer]}>
      <TextInput
        ref={ref}
        style={inner}
        placeholder={undefined}
        value={value}
        defaultValue={defaultValue}
        onChangeText={handleChangeText}
        multiline={multiline}
        {...rest}
      />
      {isEmpty && placeholder != null && placeholder !== '' && (
        // ★오버레이는 View(pointerEvents='none')로 감싼다 — 안드에서 <Text>의 pointerEvents는 불안정해,
        //   입력칸이 TouchableOpacity 안에 있으면 빈 칸 탭이 TextInput 대신 부모로 빨려가 포커스가 안 잡혔음
        //   (맛집 저장 메모 입력 불가 버그). View pointerEvents는 확실히 통과 → TextInput이 탭을 받음.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Text numberOfLines={multiline ? undefined : 1} style={overlayStyle}>
            {placeholder}
          </Text>
        </View>
      )}
    </View>
  );
});

export default AppTextInput;
