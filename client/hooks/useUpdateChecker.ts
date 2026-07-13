import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  forceUpdate: boolean;
  checking: boolean;
}

export function useUpdateChecker(isAuthenticated: boolean) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    version: '',
    releaseNotes: '',
    downloadUrl: '',
    forceUpdate: false,
    checking: false,
  });
  const checkedRef = useRef(false);

  const checkForUpdate = useCallback(async (silent: boolean = false) => {
    setUpdateInfo(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/version/current`);
      if (!res.ok) {
        if (!silent) {
          Alert.alert('检查失败', '无法连接更新服务器');
        }
        return;
      }
      const data = await res.json();
      const serverVersion = data.version;

      if (!serverVersion) {
        if (!silent) {
          Alert.alert('检查更新', '当前已是最新版本');
        }
        return;
      }

      if (compareVersions(serverVersion, APP_VERSION) > 0) {
        setUpdateInfo({
          available: true,
          version: serverVersion,
          releaseNotes: data.releaseNotes || '',
          downloadUrl: data.download_url || '',
          forceUpdate: data.forceUpdate || false,
          checking: false,
        });
      } else {
        setUpdateInfo(prev => ({
          ...prev,
          available: false,
          checking: false,
        }));
        // 更新本地存储版本号
        await AsyncStorage.setItem('app_version', APP_VERSION);
      }
    } catch {
      if (!silent) {
        Alert.alert('检查失败', '网络错误，请稍后重试');
      }
    } finally {
      setUpdateInfo(prev => ({ ...prev, checking: false }));
    }
  }, []);

  // Auto-check on login
  useEffect(() => {
    if (isAuthenticated && !checkedRef.current) {
      checkedRef.current = true;
      // Delay auto-check to avoid blocking login flow
      const timer = setTimeout(() => {
        checkForUpdate(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, checkForUpdate]);

  // Reset check flag when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      checkedRef.current = false;
    }
  }, [isAuthenticated]);

  return {
    updateInfo,
    checkForUpdate: () => checkForUpdate(false),
    checkForUpdateSilent: () => checkForUpdate(true),
  };
}