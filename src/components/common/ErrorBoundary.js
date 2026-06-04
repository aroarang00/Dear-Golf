import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { C, F, fs } from '../../constants/colors';

// 앱 전역 에러 경계 — 렌더 중 예외가 나도 앱이 죽지(흰 화면/강제종료) 않고 차분한 안내를 띄운다.
//   렌더 에러는 try-catch로 못 잡으므로 Error Boundary(클래스)가 정석. async 에러는 각 호출부 try-catch가 담당.
//   에러는 Sentry로 보고([[sentry-symbolication]]). '다시 시도'로 자식 트리를 재마운트해 일시적 오류를 회복.
export class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try { Sentry.captureException(error, { extra: { componentStack: info?.componentStack } }); } catch (e) {}
    if (__DEV__) console.warn('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: fs(34), marginBottom: 16 }}>⛳</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal, marginBottom: 8, textAlign: 'center' }}>
          잠시 문제가 생겼어요
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
          잠시 후 다시 시도해주세요
        </Text>
        <TouchableOpacity onPress={this.handleRetry} activeOpacity={0.85}
          style={{ backgroundColor: C.burgundy, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 36 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
