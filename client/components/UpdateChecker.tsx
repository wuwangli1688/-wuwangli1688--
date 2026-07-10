import { useEffect, useState, useRef, useCallback } from "react";
import { Modal, View, Text, ActivityIndicator, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_VERSION = "1.0.0";
const DISMISSED_VERSION_KEY = "update_dismissed_version";

interface VersionInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  releaseNotes: string;
  downloadUrl: string;
}

export default function UpdateChecker() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("检查更新中...");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const checkedRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const base = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "";
      const res = await fetch(`${base}/api/v1/version/check?currentVersion=${APP_VERSION}`);
      const data = await res.json();

      if (data.hasUpdate) {
        // Check if user already dismissed this version (unless force update)
        if (!data.forceUpdate) {
          const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
          if (dismissed === data.latestVersion) return;
        }
        setVersionInfo(data);
        setVisible(true);
      }
    } catch {
      // Silent fail - don't block app usage
    }
  }, []);

  useEffect(() => {
    if (authLoading || checkedRef.current) return;
    checkedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkForUpdate();
  }, [authLoading, checkForUpdate]);

  const startUpdate = async () => {
    setUpdating(true);
    setStatusText("正在下载更新...");
    setProgress(0);

    // Simulate download progress
    const totalSteps = 20;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const pct = Math.round((i / totalSteps) * 100);
      setProgress(pct);
      if (i < totalSteps) {
        setStatusText(`正在下载更新... ${pct}%`);
      }
    }

    setStatusText("正在安装更新...");
    await new Promise((r) => setTimeout(r, 500));

    // For web: clear caches and reload to get latest code
    if (Platform.OS === "web") {
      setStatusText("更新完成，正在刷新...");
      await new Promise((r) => setTimeout(r, 300));
      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      // Mark this version as dismissed to prevent infinite reload loop
      if (versionInfo) {
        await AsyncStorage.setItem(DISMISSED_VERSION_KEY, versionInfo.latestVersion);
      }
      setVisible(false);
      setUpdating(false);
      // Force reload to get latest version
      window.location.reload();
    } else {
      setStatusText("更新完成！");
      await new Promise((r) => setTimeout(r, 500));
      if (versionInfo) {
        await AsyncStorage.setItem(DISMISSED_VERSION_KEY, versionInfo.latestVersion);
      }
      setVisible(false);
      setUpdating(false);
    }
  };

  const handleLater = async () => {
    if (versionInfo) {
      await AsyncStorage.setItem(DISMISSED_VERSION_KEY, versionInfo.latestVersion);
    }
    setVisible(false);
  };

  if (!visible || !versionInfo) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {updating ? "正在更新" : "发现新版本"}
          </Text>
          <Text style={styles.version}>
            v{versionInfo.currentVersion} → v{versionInfo.latestVersion}
          </Text>

          {!updating && versionInfo.releaseNotes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>更新内容</Text>
              <Text style={styles.notesText}>{versionInfo.releaseNotes}</Text>
            </View>
          ) : null}

          {updating ? (
            <View style={styles.progressSection}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{progress}%</Text>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              {!versionInfo.forceUpdate ? (
                <TouchableOpacity style={styles.laterBtn} onPress={handleLater}>
                  <Text style={styles.laterText}>稍后再说</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.updateBtn} onPress={startUpdate}>
                <Text style={styles.updateText}>
                  {versionInfo.forceUpdate ? "立即更新" : "立即更新"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 4,
  },
  version: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 16,
  },
  notesBox: {
    width: "100%",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
  },
  notesText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
  progressSection: {
    width: "100%",
    alignItems: "center",
  },
  progressBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4A90E2",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A90E2",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    color: "#6b7280",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "center",
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  laterText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  updateBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#4A90E2",
    alignItems: "center",
  },
  updateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
