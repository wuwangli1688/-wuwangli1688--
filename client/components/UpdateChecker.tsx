import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
const VERSION_CHECK_KEY = "last_version_check";

interface VersionInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  forceUpdate?: boolean;
  releaseNotes?: string;
  downloadUrl?: string;
}

export default function UpdateChecker() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useSafeRouter();
  const [checking, setChecking] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateDone, setUpdateDone] = useState(false);
  const checkedRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    try {
      // Check if we already checked recently (within 1 hour)
      const lastCheck = await AsyncStorage.getItem(VERSION_CHECK_KEY);
      if (lastCheck) {
        const elapsed = Date.now() - parseInt(lastCheck, 10);
        if (elapsed < 3600000) return; // 1 hour
      }

      setChecking(true);
      const res = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/version/check?currentVersion=1.1.0`
      );
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      if (data.hasUpdate) {
        setVersionInfo(data);
        // Save check time
        await AsyncStorage.setItem(VERSION_CHECK_KEY, String(Date.now()));
      }
    } catch {
      // Silently fail
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLoading || checkedRef.current) return;
    checkForUpdate();
  }, [isAuthenticated, isLoading, checkForUpdate]);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setProgress(0);

    // Simulate download progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUpdating(false);
          setUpdateDone(true);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 300);
  }, []);

  const handleClose = useCallback(() => {
    setVersionInfo(null);
    setUpdateDone(false);
    setProgress(0);
  }, []);

  if (checking) return null;

  return (
    <>
      {/* Update Available Modal */}
      <Modal visible={!!versionInfo && !updating && !updateDone} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <FontAwesome6 name="box" size={48} color="#2563EB" style={styles.dialogIcon} />
            <Text style={styles.dialogTitle}>发现新版本</Text>
            <Text style={styles.dialogVersion}>
              v{versionInfo?.latestVersion}
            </Text>
            {versionInfo?.releaseNotes ? (
              <View style={styles.releaseNotes}>
                <Text style={styles.releaseNotesTitle}>更新内容：</Text>
                <Text style={styles.releaseNotesText}>{versionInfo.releaseNotes}</Text>
              </View>
            ) : null}
            <View style={styles.dialogActions}>
              {!versionInfo?.forceUpdate && (
                <TouchableOpacity style={[styles.dialogBtn, styles.cancelBtn]} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>稍后再说</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.dialogBtn, styles.updateBtn]} onPress={handleUpdate}>
                <Text style={styles.updateBtnText}>立即更新</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Updating Progress Modal */}
      <Modal visible={updating} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>正在更新</Text>
            <Text style={styles.progressText}>{progress}%</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressHint}>正在下载更新包，请稍候...</Text>
          </View>
        </View>
      </Modal>

      {/* Update Complete Modal */}
      <Modal visible={updateDone} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <FontAwesome6 name="circle-check" size={48} color="#059669" style={styles.dialogIcon} />
            <Text style={styles.dialogTitle}>更新完成</Text>
            <Text style={styles.dialogDesc}>
              版本已更新至 v{versionInfo?.latestVersion}，请重启应用以应用最新更新。
            </Text>
            <TouchableOpacity style={[styles.dialogBtn, styles.updateBtn, { width: "100%" }]} onPress={handleClose}>
              <Text style={styles.updateBtnText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dialogIcon: { marginBottom: 12 },
  dialogTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  dialogVersion: { fontSize: 24, fontWeight: "800", color: "#2563EB", marginBottom: 12 },
  dialogDesc: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  releaseNotes: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    width: "100%",
    marginBottom: 20,
  },
  releaseNotesTitle: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 },
  releaseNotesText: { fontSize: 13, color: "#334155", lineHeight: 20 },
  dialogActions: { flexDirection: "row", gap: 12, width: "100%" },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: "#F1F5F9" },
  cancelBtnText: { fontSize: 15, fontWeight: "500", color: "#64748B" },
  updateBtn: { backgroundColor: "#2563EB" },
  updateBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  progressText: { fontSize: 32, fontWeight: "800", color: "#2563EB", marginBottom: 12 },
  progressBarContainer: {
    width: "100%",
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 4,
  },
  progressHint: { fontSize: 13, color: "#94A3B8" },
});