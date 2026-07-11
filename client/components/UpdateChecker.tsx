import { useEffect, useState, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_VERSION = "1.0.0";
const DISMISSED_VERSION_KEY = "update_dismissed_version";
const LAST_CHECK_KEY = "update_last_check_time";

interface VersionInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  releaseNotes: string;
  downloadUrl: string;
}

export default function UpdateChecker() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const progressRef = useRef(0);
  const animValue = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  // Check update immediately on mount — no auth dependency
  const checkForUpdate = useCallback(async () => {
    try {
      // Throttle checks to once per 5 minutes
      const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck) {
        const elapsed = Date.now() - parseInt(lastCheck, 10);
        if (elapsed < 5 * 60 * 1000) return;
      }
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

      const base = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "";
      const res = await fetch(
        `${base}/api/v1/version/check?currentVersion=${APP_VERSION}`
      );
      if (!res.ok) return;
      const data: VersionInfo = await res.json();

      if (!data.hasUpdate) return;

      // Check dismissed version
      const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
      if (!data.forceUpdate && dismissed === data.latestVersion) return;

      if (!mountedRef.current) return;
      setVersionInfo(data);
      setVisible(true);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Start check immediately — no waiting for auth
    checkForUpdate();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth progress animation
  useEffect(() => {
    if (!updating) return;
    const listener = animValue.addListener(({ value }) => {
      setProgress(Math.round(value));
    });
    return () => animValue.removeListener(listener);
  }, [updating, animValue]);

  const animateProgress = useCallback(
    (from: number, to: number, duration: number) => {
      animValue.setValue(from);
      Animated.timing(animValue, {
        toValue: to,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start();
    },
    [animValue]
  );

  const startUpdate = useCallback(async () => {
    if (!versionInfo) return;
    setUpdating(true);
    progressRef.current = 0;

    // Phase 1: Preparing (0 → 20%)
    setStatusText("正在准备更新...");
    animateProgress(0, 20, 400);
    await new Promise((r) => setTimeout(r, 500));

    // Phase 2: Downloading (20 → 85%)
    setStatusText("正在下载更新包...");
    animateProgress(20, 85, 1500);
    await new Promise((r) => setTimeout(r, 1600));

    // Phase 3: Installing (85 → 100%)
    setStatusText("正在安装更新...");
    animateProgress(85, 100, 600);
    await new Promise((r) => setTimeout(r, 700));

    // Phase 4: Finalize
    if (Platform.OS === "web") {
      setStatusText("更新完成，正在刷新...");
      await new Promise((r) => setTimeout(r, 300));

      // Clear all browser caches
      try {
        if (typeof caches !== "undefined") {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        // Clear session storage to force fresh load
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.clear();
        }
      } catch {
        // Ignore cache errors
      }

      await AsyncStorage.setItem(
        DISMISSED_VERSION_KEY,
        versionInfo.latestVersion
      );
      setVisible(false);
      setUpdating(false);

      // Force hard reload (bypass browser cache)
      if (typeof window !== "undefined") {
        window.location.href =
          window.location.href.split("?")[0] +
          "?v=" +
          versionInfo.latestVersion +
          "&t=" +
          Date.now();
      }
    } else {
      // Native: guide to app store
      setStatusText("请前往应用商店下载最新版本");
      await new Promise((r) => setTimeout(r, 2000));
      await AsyncStorage.setItem(
        DISMISSED_VERSION_KEY,
        versionInfo.latestVersion
      );
      setVisible(false);
      setUpdating(false);
    }
  }, [versionInfo, animateProgress]);

  const handleLater = useCallback(async () => {
    if (versionInfo) {
      await AsyncStorage.setItem(
        DISMISSED_VERSION_KEY,
        versionInfo.latestVersion
      );
    }
    setVisible(false);
  }, [versionInfo]);

  if (!visible || !versionInfo) return null;

  // Force update: no dismiss option
  const isForce = versionInfo.forceUpdate;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <Text style={styles.title}>
            {updating ? "正在更新" : "发现新版本"}
          </Text>
          <Text style={styles.version}>
            v{versionInfo.currentVersion} → v{versionInfo.latestVersion}
          </Text>

          {/* Release notes */}
          {!updating && versionInfo.releaseNotes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>更新内容</Text>
              <Text style={styles.notesText}>
                {versionInfo.releaseNotes}
              </Text>
            </View>
          ) : null}

          {/* Progress section */}
          {updating ? (
            <View style={styles.progressSection}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.max(progress, 2)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{progress}%</Text>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              {!isForce && (
                <TouchableOpacity
                  style={styles.laterBtn}
                  onPress={handleLater}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterText}>稍后再说</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.updateBtn, isForce && styles.updateBtnFull]}
                onPress={startUpdate}
                activeOpacity={0.7}
              >
                <Text style={styles.updateText}>
                  {isForce ? "立即更新（必须）" : "立即更新"}
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
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  version: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 18,
  },
  notesBox: {
    width: "100%",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 8,
  },
  notesText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  },
  progressSection: {
    width: "100%",
    alignItems: "center",
    paddingTop: 8,
  },
  progressBarBg: {
    width: "100%",
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4F46E5",
    borderRadius: 5,
  },
  progressText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#4F46E5",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
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
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  laterText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6b7280",
  },
  updateBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  updateBtnFull: {
    flex: 1.5,
  },
  updateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
