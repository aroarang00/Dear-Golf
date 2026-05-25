module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
    env: {
      production: {
        // prod 빌드(EAS preview·production)에서 console.log/warn/info/debug 자동 제거.
        // console.error는 유지 (향후 Sentry 등 에러 모니터링 연결 대비).
        // dev/Expo Go에선 적용 X — 개발 디버깅 영향 없음.
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  };
};
