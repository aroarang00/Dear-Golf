// app.config.js — app.json을 대체하는 동적 설정. .env / EAS env vars에서 키 주입.
// EXPO_PUBLIC_* 변수는 빌드 번들에 인라인되므로 진짜 비밀 키는 서버 프록시(Cloud Functions)로 보호. [[project_api_key_security]]
// 로컬 dev: .env 파일 자동 로드 / EAS build: 콘솔 등록된 env vars 주입.

module.exports = {
  expo: {
    name: 'Dear Golf',
    slug: 'dear-golf',
    scheme: 'deargolf',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#C8D9E6',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.deargolf',
      buildNumber: '1',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1A3D52',
      },
      edgeToEdgeEnabled: true,
      package: 'app.deargolf',
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-font',
      '@react-native-community/datetimepicker',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            '출발지 자동 설정 및 현재 위치 날씨를 위해 위치 권한이 필요해요',
          locationWhenInUsePermission:
            '출발지 자동 설정 및 현재 위치 날씨를 위해 위치 권한이 필요해요',
        },
      ],
      'expo-video',
      [
        'expo-notifications',
        {
          color: '#6B1E2A',
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission:
            '라운딩 일정을 기기 캘린더에 자동으로 추가하기 위해 캘린더 접근 권한이 필요해요',
        },
      ],
      'expo-web-browser',
      [
        'expo-media-library',
        {
          photosPermission:
            '특별한 순간 카드를 갤러리에 저장하기 위해 사진첩 권한이 필요해요',
          savePhotosPermission:
            '특별한 순간 카드를 갤러리에 저장하기 위해 사진첩 권한이 필요해요',
          isAccessMediaLocationEnabled: false,
        },
      ],
      [
        '@react-native-seoul/kakao-login',
        {
          kakaoAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
          kotlinVersion: '2.0.21',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: [
              'https://devrepo.kakao.com/nexus/content/groups/public/',
            ],
          },
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '17a8133b-1b3e-4832-a435-4489015e3493',
      },
    },
  },
};
