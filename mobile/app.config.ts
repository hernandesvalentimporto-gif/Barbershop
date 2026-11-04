import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Identificadores gerados no projeto Manus: preservar para atualizações futuras.
const bundleId = "space.manus.barberhp.t054228665129522";
const scheme = "manus054228665129522";

const config: ExpoConfig & { logoUrl: string } = {
  name: "Barber Shop Sistemas HP",
  slug: "barberhp",
  version: "1.0.0",
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663030234316/oEqQNEVtWoigIZhQ.png",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme,
  userInterfaceStyle: "dark",
  extra: {
    oauthPortalUrl: process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
    oauthServerUrl: process.env.MANUS_OAUTH_API_URL ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
    appId: process.env.MANUS_PROJECT_ID ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    barberApiUrl: "https://sistemashp.com.br/barbershop/api.php",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: bundleId,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#080808",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    permissions: [],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.POST_NOTIFICATIONS",
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-asset",
    "expo-router",
    "expo-secure-store",
    ["expo-splash-screen", {
      image: "./assets/images/splash-icon.png",
      imageWidth: 240,
      resizeMode: "contain",
      backgroundColor: "#080808",
      dark: { backgroundColor: "#080808" },
    }],
    ["expo-build-properties", {
      android: { buildArchs: ["arm64-v8a", "armeabi-v7a"], minSdkVersion: 24 },
    }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
