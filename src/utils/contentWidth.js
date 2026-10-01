import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { C } from '../constants/colors';

/**
 * 넓은 화면(폴더블 펼침·태블릿) 대응 — 콘텐츠를 이 폭으로 가운데 모은다(2026-10-01, 너나픽 이식).
 *
 * 왜 필요한가 — 앱은 세로 폰 기준이라, 갤럭시 폴드처럼 **펼치면 넓은/정사각형에 가까운**
 * 화면에선 콘텐츠가 좌우로 늘어나 비율이 어색하다. 반대로 플립(펼치면 21:9로 길쭉)은
 * 폭이 보통이라 손댈 필요가 없다. iOS는 supportsTablet이라 아이패드도 같은 처지였다.
 *
 * ★기기 모델을 안 따진다 — **실제 창 폭을 재서** 임계값을 넘을 때만 모은다. 폰·플립은 임계값
 * 이하라 `contentWidth`가 원래 폭을 그대로 돌려줘 **아무 영향이 없다**(회귀 위험 0).
 *
 * ★창 폭을 레이아웃에 직접 쓰던 곳(홈 카드 레일·여권 도장 격자·크루 앨범 격자·온보딩 페이저·
 * 스코어 차트 등)은 `useContentWidth()`를 거쳐야 가운데-정렬한 그릇과 폭이 맞는다.
 * 안 그러면 그릇은 500인데 내용은 창 폭(예: 700)이라 어긋난다.
 *
 * ★RN `Modal`은 루트 창에 따로 그려져 App.js의 WideFrame 바깥이다. 전체 화면 모달(스코어 통계·
 * 날씨/교통·크루 앨범(모임 탭)·스코어카드 확인 등)은 **모달 안에서 한 번 더 `<WideFrame>`**으로 감싼다.
 * 사진 뷰어·크롭처럼 꽉 채우는 게 자연스러운 모달은 감싸지 않고 창 폭을 그대로 쓴다(단, 모듈 최상단
 * Dimensions.get 대신 훅으로 — 접은 채 켜고 펼치면 옛 폭이 남는 문제).
 */
export const WIDE_THRESHOLD = 560;
export const MAX_CONTENT_WIDTH = 500;

/** 창 폭 → 콘텐츠 폭. 임계값 이하(폰·플립)면 그대로. */
export function contentWidth(winWidth) {
  return winWidth > WIDE_THRESHOLD ? MAX_CONTENT_WIDTH : winWidth;
}

/** 넓은 화면(모아야 하는가)인지. */
export function isWideScreen(winWidth) {
  return winWidth > WIDE_THRESHOLD;
}

/** 살아있는 콘텐츠 폭(리사이즈·펼침에 반응). */
export function useContentWidth() {
  return contentWidth(useWindowDimensions().width);
}

/**
 * 넓은 화면이면 자식을 MAX_CONTENT_WIDTH 폭으로 가운데 모으고 양옆은 `bg`로 채운다.
 * 폰(임계값 이하)에선 자식을 그대로 돌려줘 트리가 바뀌지 않는다.
 * - bg: 양옆 여백 색(기본 헤어라인 톤). 모달 안에서 배경이 따로 있으면 'transparent'.
 * - style: 모인 그릇(안쪽 View)에 얹을 스타일 — 세로 정렬(justifyContent) 등이 필요할 때.
 */
export function WideFrame({ children, bg = C.hairline, style }) {
  const { width } = useWindowDimensions();
  if (!isWideScreen(width)) {
    return style ? <View style={[{ flex: 1 }, style]}>{children}</View> : <>{children}</>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center' }}>
      <View style={[{ flex: 1, width: MAX_CONTENT_WIDTH }, style]}>{children}</View>
    </View>
  );
}
