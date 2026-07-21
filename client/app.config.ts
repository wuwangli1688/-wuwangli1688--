import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = '即时记账';
const appVersion = '1.2.1';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": appName,
    "slug": "jizhang-ledger",
    "version": appVersion,
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "jizhang",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.jizhang.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "即时记账需要访问您的相册，以便您上传记账凭证图片。",
        "NSPhotoLibraryAddUsageDescription": "即时记账需要保存图片到您的相册。",
        "NSCameraUsageDescription": "即时记账需要使用您的相机，以便您拍摄记账凭证。",
        "NSMicrophoneUsageDescription": "即时记账需要访问您的麦克风，以便您录制语音备注。",
        "NSLocationWhenInUseUsageDescription": "即时记账需要访问您的位置，以便记录消费地点。",
        "LSRequiresIPhoneOS": true,
        "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
        "UIRequiresFullScreen": true,
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#FF6B35"
      },
      "package": "com.jizhang.app",
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
      'expo-router',
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#FF6B35"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "即时记账需要访问您的相册，以便您上传记账凭证图片。",
          "cameraPermission": "即时记账需要使用您的相机，以便您拍摄记账凭证。",
          "microphonePermission": "即时记账需要访问您的麦克风，以便您录制语音备注。"
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "即时记账需要访问您的位置，以便记录消费地点。"
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "即时记账需要使用相机以拍摄记账凭证。",
          "microphonePermission": "即时记账需要访问麦克风以录制语音备注。",
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-av",
        {
          "microphonePermission": "即时记账需要访问您的麦克风，以便录制语音备注。"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "363cae34-ef0a-4c22-901a-5caba415fbbb"
      }
    }
  }
}
