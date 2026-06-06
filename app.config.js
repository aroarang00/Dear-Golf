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
      // FCM 푸시 — 안드 네이티브 빌드에 Firebase 설정 포함(없으면 푸시 토큰 미발급). [[android-fcm-push]]
      googleServicesFile: './google-services.json',
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
      // Android Auto Backup 비활성화 — 앱 삭제 시 데이터 완전 초기화.
      // 활성화 상태(기본값)면 SharedPreferences·AsyncStorage가 Google 계정에 자동 백업되어
      // 같은 Google 계정으로 재설치 시 옛 데이터 복원됨 → 카카오 로그인 흐름 우회·테스트 부정확.
      // Phase 2 Firebase 연동 시 사용자 데이터는 Firestore + 카카오 sub 매핑으로 복원이 정석
      // ([[data-migration]]·[[account-deletion]] 정책과 일관).
      allowBackup: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      // 폰트를 네이티브 빌드에 직접 포함 — JS 런타임 로드(useFonts)만 쓰면
      // 안드로이드 <Modal> 내부에서 커스텀 폰트가 시스템 글꼴로 폴백되는 버그가 있어
      // (MY 통계박스·라운지 정원 숫자 등), expo-font 플러그인으로 빌드에 박아 해결.
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/Pretendard-Regular.otf',
            './assets/fonts/Pretendard-Medium.otf',
            './assets/fonts/Pretendard-SemiBold.otf',
            './assets/fonts/Pretendard-Bold.otf',
            './assets/fonts/PlayfairDisplay_700Bold.ttf',
            './assets/fonts/PlayfairDisplay_700Bold_Italic.ttf',
            './assets/fonts/Lora_500Medium_Italic.ttf',
          ],
        },
      ],
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
        'expo-image-picker',
        {
          photosPermission:
            '라운딩 사진과 프로필 사진을 다이어리에 첨부하기 위해 사진첩 접근 권한이 필요해요',
          cameraPermission:
            '라운딩 순간을 즉시 촬영해 기록하기 위해 카메라 접근 권한이 필요해요',
        },
      ],
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
        },
      ],
      [
        'expo-build-properties',
        {
          // iOS 최소 버전 15.5 — ML Kit(@react-native-ml-kit/text-recognition, GoogleMLKit 8.0.0)
          // pod이 요구. 미설정 시 EAS_BUILD_HIGHER_MINIMUM_DEPLOYMENT_TARGET_ERROR로 빌드 실패.
          ios: {
            deploymentTarget: '15.5',
          },
          android: {
            extraMavenRepos: [
              'https://devrepo.kakao.com/nexus/content/groups/public/',
            ],
          },
        },
      ],
      // Sentry — 에러 모니터링. PII는 App.js Sentry.init에서 sendDefaultPii:false로 비활성 ([[api-key-security]]).
      //  소스맵 업로드 비활성(2026-05-30): org/project/auth-token 미설정 시 빌드의 Sentry 소스맵 단계가
      //  실패해 안드·iOS 빌드가 모두 깨짐. 런타임 에러 수집은 DSN만으로 동작(소스맵 없으면 스택만 난독).
      //  출시 전 Sentry org/project + SENTRY_AUTH_TOKEN 설정 후 url 업로드 재활성 검토 ([[api-key-security]]).
      [
        '@sentry/react-native/expo',
        {
          autoUploadSourceMaps: false,
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
