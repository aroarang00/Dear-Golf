import { registerRootComponent } from 'expo';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

// ★시작 오류 가드(2026-10-05) — 1.2.1(빌드 80)이 iPhone·iPad에서 실행 즉시 죽었는데(App Review 2.1a),
//   크래시 로그엔 "expo-updates errorRecovery가 JS 치명 오류를 받아 abort"만 남고 오류 문구가 없었다.
//   프로덕션에선 JS 시작 오류 = 즉시 종료라 원인을 볼 길이 없으므로, App 모듈 로드(모든 import 포함)와
//   첫 렌더를 여기서 감싸 오류가 나면 죽는 대신 문구·스택을 화면에 띄운다(캡처해 보내면 원인 확정).
//   정상일 땐 App을 그대로 등록하니 동작 차이 없음. 로드 오류 때는 expo-updates 롤백 대신 이 화면이 뜬다.
let App = null;
let bootError = null;
try {
  App = require('./App').default;
} catch (e) {
  bootError = e;
}

function describe(e) {
  if (!e) return '';
  const name = e.name || 'Error';
  const msg = e.message || String(e);
  const stack = (e.stack || '').split('\n').slice(0, 14).join('\n');
  return `${name}: ${msg}\n\n${stack}`;
}

function BootErrorScreen({ error, phase }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#1A3D52', paddingTop: 70, paddingHorizontal: 18 }}>
      <Text style={{ color: '#F5E6A8', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>디어골프 시작 오류</Text>
      <Text style={{ color: '#C8D9E6', fontSize: 12, marginBottom: 14 }}>
        {phase} 단계에서 문제가 생겼어요. 이 화면을 캡처해 보내주시면 바로 고칠 수 있어요.
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text selectable style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 16, fontFamily: 'Menlo' }}>{describe(error)}</Text>
      </ScrollView>
    </View>
  );
}

// 첫 렌더 중 오류(모듈 로드는 통과했지만 화면을 그리다 터지는 경우)도 같은 화면으로.
class RenderErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <BootErrorScreen error={this.state.error} phase="화면 그리기" />;
    return this.props.children;
  }
}

function Root(props) {
  if (bootError) return <BootErrorScreen error={bootError} phase="앱 불러오기" />;
  return (
    <RenderErrorBoundary>
      <App {...props} />
    </RenderErrorBoundary>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
