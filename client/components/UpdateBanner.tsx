import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function UpdateBanner() {
  const { isAuthenticated } = useAuth();
  const { updateInfo, checkForUpdate } = useUpdateChecker(isAuthenticated);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !updateInfo.available || dismissed) return null;

  const handleDownload = async () => {
    setDownloading(true);
    setProgress(0);
    const downloadUrl = updateInfo.downloadUrl
      ? `${EXPO_PUBLIC_BACKEND_BASE_URL}${updateInfo.downloadUrl}`
      : null;

    if (downloadUrl && Platform.OS !== 'web') {
      try {
        const fileUri = `${(FileSystem as any).documentDirectory}update_${updateInfo.version}.apk`;
        const downloadResult = await (FileSystem as any).downloadAsync(downloadUrl, fileUri);
        if (downloadResult.status === 200) {
          setProgress(100);
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/vnd.android.package-archive',
              dialogTitle: '安装更新',
            });
          } else {
            Alert.alert('更新已下载', `请手动安装更新包 (v${updateInfo.version})`);
          }
          setDismissed(true);
          setDownloading(false);
          return;
        }
      } catch {
        // Fallback to manual download
      }
    }

    // Web: refresh to load latest
    if (Platform.OS === 'web') {
      window.location.reload();
    } else {
      Alert.alert(
        '发现新版本',
        `新版本 v${updateInfo.version} 已可用\n${updateInfo.releaseNotes ? `\n更新说明：${updateInfo.releaseNotes}` : ''}\n\n请前往应用商店或官网下载最新版本。`,
        [
          { text: '稍后更新', style: 'cancel' },
          { text: '立即更新', onPress: () => setDismissed(false) },
        ]
      );
    }
    setDownloading(false);
  };

  return (
    <View style={{
      backgroundColor: '#2563EB',
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <FontAwesome6 name="download" size={14} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 13, marginLeft: 8, flex: 1 }}>
          {downloading
            ? `正在下载更新 v${updateInfo.version}...`
            : `新版本 v${updateInfo.version} 可用`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {downloading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <TouchableOpacity
              onPress={handleDownload}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>更新</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDismissed(true)}>
              <FontAwesome6 name="xmark" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}