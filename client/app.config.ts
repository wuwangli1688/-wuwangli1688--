import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = process.env.COZE_PROJECT_NAME || process.env.EXPO_PUBLIC_COZE_PROJECT_NAME || '记账助手';
const projectId = process.env.COZE_PROJECT_ID || process.env.EXPO_PUBLIC_COZE_PROJECT_ID;
const slugAppName = projectId ? `app${projectId}` : 'jizhang';
const bundleId = `com.${slugAppName}.app`;

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": appName,
    "slug": slugAppName,
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": slugAppName,
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": bundleId,
      "buildNumber": "1",
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "记账助手需要访问您的相册，以便您上传记账凭证图片。",
        "NSPhotoLibraryAddUsageDescription": "记账助手需要保存图片到您的相册。",
        "NSCameraUsageDescription": "记账助手需要使用您的相机，以便您拍摄记账凭证。",
        "NSMicrophoneUsageDescription": "记账助手需要访问您的麦克风，以便您录制语音备注。",
        "NSLocationWhenInUseUsageDescription": "记账助手需要访问您的位置，以便记录消费地点。",
        "LSRequiresIPhoneOS": true,
        "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
        "UIRequiresFullScreen": true,
        "ITSAppUsesNonExemptEncryption": false
      },
      "associatedDomains": [
        `applinks:${slugAppName}.expo.app`
      ],
      "runtimeVersion": {
        "policy": "sdkVersion"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": `com.anonymous.x${projectId || '0'}`,
      "permissions": [
        "CAMERA",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      process.env.EXPO_PUBLIC_BACKEND_BASE_URL ? [
        "expo-router",
        {
          "origin": process.env.EXPO_PUBLIC_BACKEND_BASE_URL
        }
      ] : 'expo-router',
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "记账助手需要访问您的相册，以便您上传记账凭证图片。",
          "cameraPermission": "记账助手需要使用您的相机，以便您拍摄记账凭证。",
          "microphonePermission": "记账助手需要访问您的麦克风，以便您录制语音备注。"
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "记账助手需要访问您的位置，以便记录消费地点。"
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "记账助手需要使用相机以拍摄记账凭证。",
          "microphonePermission": "记账助手需要访问麦克风以录制语音备注。",
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-av",
        {
          "microphonePermission": "记账助手需要访问您的麦克风，以便录制语音备注。"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": projectId || undefined
      }
    }
  }
}
