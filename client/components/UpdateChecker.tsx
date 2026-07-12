/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react";
import { View, Text, Modal, TouchableOpacity, Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_VERSION_KEY = "app_version";
const STORAGE_CHECK_KEY = "last_version_check_time";

export default function UpdateChecker() {
  const { isAuthenticated } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    latestVersion: string;
    releaseNotes: string;
    downloadUrl: string;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateDone, setUpdateDone] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || checkedRef.current) return;
    checkedRef.current = true;
    checkForUpdate();
  }, [isAuthenticated]);

  const checkForUpdate = async () => {
    try {
      // Get the latest version from server
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/version/current`
      );
      if (!res.ok) return;
      const serverVersion = await res.json();
      if (!serverVersion?.version) return;

      // Get the version stored locally (what the user has "updated" to)
      const storedVersion = await AsyncStorage.getItem(STORAGE_VERSION_KEY);

      // If no stored version, this is the first run - store the version and skip update
      if (!storedVersion) {
        await AsyncStorage.setItem(STORAGE_VERSION_KEY, serverVersion.version);
        return;
      }

      // Compare versions: if server has a newer version, show update
      if (compareVersions(serverVersion.version, storedVersion) > 0) {
        setUpdateInfo({
          latestVersion: serverVersion.version,
          releaseNotes: serverVersion.releaseNotes || "",
          downloadUrl: serverVersion.downloadUrl || "",
        });
        setShowModal(true);
      }
    } catch (err) {
      console.log("Version check failed:", err);
    }
  };

  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    setProgress(0);

    // Simulate download progress
    for (let i = 0; i <= 100; i += 5) {
      await new Promise((r) => setTimeout(r, 80));
      setProgress(i);
    }

    // Store the new version locally
    if (updateInfo) {
      await AsyncStorage.setItem(STORAGE_VERSION_KEY, updateInfo.latestVersion);
    }

    setIsDownloading(false); // eslint-disable-line react-hooks/immutability
    setUpdateDone(true);
  };

  const handleRestart = () => {
    setShowModal(false);
    setProgress(0);
    setIsDownloading(false);
    setUpdateDone(false);
    setUpdateInfo(null);

    // For web: refresh the page to load latest code
    if (Platform.OS === "web") {
      window.location.reload();
    }
    };

  const handleSkip = async () => {
    // Store the current version so we don't show the update again
    if (updateInfo) {
      await AsyncStorage.setItem(STORAGE_VERSION_KEY, updateInfo.latestVersion);
    }
    setShowModal(false);
    setUpdateInfo(null);
  };

  return (
    <Modal visible={showModal} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 20,
            padding: 28,
            width: "100%",
            maxWidth: 360,
          }}
        >
          {!isDownloading && !updateDone && (
            <>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "#1F2937",
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                发现新版本 v{updateInfo?.latestVersion}
              </Text>

              {updateInfo?.releaseNotes ? (
                <View
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#4B5563",
                      marginBottom: 6,
                    }}
                  >
                    更新内容：
                  </Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", lineHeight: 20 }}>
                    {updateInfo.releaseNotes}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 14,
                    color: "#6B7280",
                    textAlign: "center",
                    marginBottom: 20,
                    marginTop: 8,
                  }}
                >
                  有新版本可用，请更新至最新版本
                </Text>
              )}

              <TouchableOpacity
                onPress={handleDownloadUpdate}
                style={{
                  backgroundColor: "#4F46E5",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                >
                  立即更新
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSkip}
                style={{
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "#9CA3AF", fontSize: 14 }}
                >
                  暂不更新
                </Text>
              </TouchableOpacity>
            </>
          )}

          {isDownloading && (
            <>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: "#1F2937",
                  textAlign: "center",
                  marginBottom: 20,
                }}
              >
                正在更新...
              </Text>
              <View
                style={{
                  height: 8,
                  backgroundColor: "#E5E7EB",
                  borderRadius: 4,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    backgroundColor: "#4F46E5",
                    borderRadius: 4,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: "#6B7280",
                  textAlign: "center",
                }}
              >
                {progress}%
              </Text>
            </>
          )}

          {updateDone && (
            <>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "#1F2937",
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                更新完成
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  textAlign: "center",
                  marginBottom: 24,
                  marginTop: 8,
                }}
              >
                已更新至 v{updateInfo?.latestVersion}，请重启应用以加载最新版本
              </Text>
              <TouchableOpacity
                onPress={handleRestart}
                style={{
                  backgroundColor: "#4F46E5",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                >
                  立即重启
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}