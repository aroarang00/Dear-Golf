// ESLint (flat config, ESLint 9 / eslint-config-expo 10) — 2026-08-04 도입.
//   도입 목적은 '스타일 통일'이 아니라 **런타임까지 새는 실수 잡기**다.
//   특히 react-hooks/exhaustive-deps — useEffect가 366개인데 의존성 누락은 지금까지 아무도 못 잡았다.
//   (증상이 "가끔 갱신이 안 됨"으로 나와 재현이 제일 어려운 종류)
//
// ★규칙을 끌 땐 반드시 '왜 끄는지'를 여기 적을 것. 안 적으면 나중에 "켜야 하나?"로 다시 고민하게 된다.
//
// 실행: npm run lint  /  자동수정: npm run lint:fix
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      'functions/node_modules/*',
      'android/*',
      'ios/*',
      'patches/*',
      'eslint-report.json',
    ],
  },
  {
    rules: {
      // ── 켜는 것: 실제로 버그가 되는 것들 ──
      // 훅 의존성 누락 — 도입 이유 1순위. 처음엔 경고로 두고 목록을 보고 판단한다
      //   (일부는 '의도적으로 뺀' 것이라 일괄 수정하면 오히려 무한루프가 난다).
      'react-hooks/exhaustive-deps': 'warn',
      // 훅 규칙 위반(조건문 안 훅 등)은 무조건 터지므로 에러.
      'react-hooks/rules-of-hooks': 'error',
      // 같은 객체에 키를 두 번 — 뒤엣것이 조용히 이기므로 앞 정의가 죽는다. 실제로 gS.js에서 나왔다(08-04).
      'no-dupe-keys': 'error',

      // ── 끄는 것: 이 코드베이스에선 소음만 되는 것들 ──
      // ① JSX 안의 따옴표 이스케이프(70건) — HTML 규칙이다. React Native엔 HTML 파서가 없어
      //    <Text>"{댓글}"</Text> 같은 표기가 정상 동작한다. 웹이면 켤 것.
      'react/no-unescaped-entities': 'off',
      // ② import 순서(229건) — App.js가 Sentry.init()을 import 사이에 두는 건 '가장 먼저 초기화'하려는 의도다.
      //    버그와 무관하고, 60,528줄에 켜면 diff만 커진다.
      'import/first': 'off',
      // ③ 인라인 스타일 5,117곳 — 알고 있는 빚이고 지금 고칠 대상이 아니다(제품 방향 확정 후).
      'react-native/no-inline-styles': 'off',
      // ④ 삼항·단축평가를 문장으로 쓰는 표기(6건) — 이 코드베이스가 의도적으로 쓰는 축약형이고 동작은 정확하다.
      'no-unused-expressions': ['warn', { allowTernary: true, allowShortCircuit: true }],
      // ⑤ catch(e)의 안 쓰는 e(64곳) — 여기서 지적해봐야 지울 수도 없고(잡는 건 맞다) 진짜 문제를 가린다.
      //    ★단 이 64곳은 '에러를 잡아놓고 아무 데도 안 쓴다'는 뜻이다 = 조용한 실패 목록.
      //    Sentry 연결 작업(예정)의 후보가 정확히 여기다. 검사에서만 빼고 사실은 남겨둔다.
      //    ★나머지 옵션은 eslint-config-expo 기본값 그대로 둘 것(utils/core.js) — 특히 ignoreRestSiblings:true.
      //    이걸 빠뜨리면 `const { ownerUid, ...rest } = doc`(필드 빼내는 관용구)가 전부 경고로 뜬다.
      'no-unused-vars': ['warn', { vars: 'all', args: 'none', ignoreRestSiblings: true, caughtErrors: 'none' }],
    },
  },
  {
    // Node 스크립트·Cloud Functions — CommonJS 전역(__dirname 등)이 필요하다.
    //   여기 안 넣으면 no-undef 8건이 '가짜 에러'로 뜬다.
    files: ['scripts/**/*.js', 'functions/**/*.js', '*.config.js', 'metro.config.js', 'babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly',
        exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
        console: 'readonly', Buffer: 'readonly',
      },
    },
  },
]);
