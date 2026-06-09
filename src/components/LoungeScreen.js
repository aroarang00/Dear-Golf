// 라운지 — 하단 탭. 라운딩 모집 전체 내용을 일반 화면으로 표시.
// RoundupTab을 asScreen 모드로 호출해 Modal 래퍼·뒤로가기 버튼 없이 동작.
import React from 'react';
import { RoundupTab } from './RoundupTab';

export function LoungeScreen({ navigation, route }) {
  // route — 푸시 탭으로 전달된 { openPostId }를 RoundupTab이 소비해 해당 모집글 상세를 연다.
  return <RoundupTab asScreen visible navigation={navigation} route={route} />;
}
