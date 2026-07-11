import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";


const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface InstallMethod {
  id: string;
  title: string;
  description: string;
  url: string;
  qr_code: string;
  steps: string[];
}

export default function ShareScreen() {
  const [appName, setAppName] = useState("收支记账本");
  const [methods, setMethods] = useState<InstallMethod[]>([]);
  const [activeMethod, setActiveMethod] = useState<string>("web");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInstallInfo();
  }, []);

  const fetchInstallInfo = async () => {
    try {
      /**
       * 服务端文件：server/src/routes/share.ts
       * 接口：GET /api/v1/share/install-info
       * 无参数
       */
      const res = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/share/install-info`
      );
      const data = await res.json();
      if (data.data) {
        setAppName(data.data.app_name || "收支记账本");
        setMethods(data.data.methods || []);
        if (data.data.methods?.length > 0) {
          setActiveMethod(data.data.methods[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch install info:", err);
    } finally {
      setLoading(false);
    }
  };

  const currentMethod = methods.find((m) => m.id === activeMethod);

  const handleCopyLink = () => {
    if (!currentMethod?.url) return;
    Alert.alert("已复制", `链接已复制：\n${currentMethod.url}`);
  };

  const handleShare = async () => {
    if (!currentMethod?.url) return;
    try {
      await Share.share({
        message: `快来使用${appName}吧！扫码安装：${currentMethod.url}`,
        url: currentMethod.url,
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  const handleOpenExpoGo = () => {
    const expoGoUrl = methods.find((m) => m.id === "expo_go")?.url;
    if (expoGoUrl) {
      Linking.openURL(expoGoUrl).catch(() => {
        Alert.alert(
          "未找到 Expo Go",
          "请先在应用商店安装 Expo Go 应用，然后扫描上方的二维码即可打开。"
        );
      });
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>生成安装信息...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>安装{appName}</Text>
          <Text style={styles.headerSubtitle}>
            选择以下方式在手机上安装使用
          </Text>
        </View>

        {/* Method Tabs */}
        <View style={styles.tabRow}>
          {methods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.tab,
                activeMethod === method.id && styles.tabActive,
              ]}
              onPress={() => setActiveMethod(method.id)}
            >
              <FontAwesome6
                name={method.id === "web" ? "globe" : "mobile-screen"}
                size={14}
                color={activeMethod === method.id ? "#0284C7" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeMethod === method.id && styles.tabTextActive,
                ]}
              >
                {method.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* QR Code Card */}
        {currentMethod && (
          <View style={styles.qrCard}>
            <View style={styles.qrContainer}>
              {currentMethod.qr_code ? (
                <Image
                  source={{ uri: currentMethod.qr_code }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <FontAwesome6 name="qrcode" size={64} color="#CBD5E1" />
                </View>
              )}
            </View>
            <Text style={styles.qrTitle}>{currentMethod.description}</Text>

            {/* Action buttons under QR */}
            <View style={styles.qrActions}>
              <TouchableOpacity style={styles.qrActionBtn} onPress={handleCopyLink}>
                <FontAwesome6 name="copy" size={13} color="#0284C7" />
                <Text style={styles.qrActionText}>复制链接</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrActionBtn} onPress={handleShare}>
                <FontAwesome6 name="share-nodes" size={13} color="#0284C7" />
                <Text style={styles.qrActionText}>分享给朋友</Text>
              </TouchableOpacity>
              {currentMethod.id === "expo_go" && (
                <TouchableOpacity style={styles.qrActionBtn} onPress={handleOpenExpoGo}>
                  <FontAwesome6 name="play" size={13} color="#0284C7" />
                  <Text style={styles.qrActionText}>打开 Expo Go</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Installation Steps */}
        {currentMethod && (
          <View style={styles.stepsCard}>
            <View style={styles.stepsHeader}>
              <FontAwesome6 name="list-ol" size={16} color="#0284C7" />
              <Text style={styles.stepsTitle}>安装步骤</Text>
            </View>
            {currentMethod.steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <FontAwesome6 name="lightbulb" size={14} color="#F59E0B" />
            <Text style={styles.tipsTitle}>温馨提示</Text>
          </View>
          <Text style={styles.tipsText}>
            {activeMethod === "web"
              ? "• 推荐使用 Chrome / Safari 浏览器打开\n• 打开后点击「添加到主屏幕」，获得类似 App 的体验\n• 数据存储在云端，多设备同步"
              : "• 需要先在应用商店安装 Expo Go 应用\n• iOS 用户需在「设置 → 通用 → VPN与设备管理」中信任 Expo\n• 此方式适合开发测试使用"}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#94A3B8",
    marginTop: 12,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
  },
  // Tabs
  tabRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabActive: {
    backgroundColor: "#E0F2FE",
    borderColor: "#0284C7",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  tabTextActive: {
    color: "#0284C7",
  },
  // QR Card
  qrCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  qrContainer: {
    width: 200,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrPlaceholder: {
    width: 180,
    height: 180,
    justifyContent: "center",
    alignItems: "center",
  },
  qrTitle: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    marginBottom: 16,
  },
  qrActions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  qrActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  qrActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284C7",
  },
  // Steps
  stepsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  stepsTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0284C7",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
    lineHeight: 20,
    paddingTop: 1,
  },
  // Tips
  tipsCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
  },
  tipsText: {
    fontSize: 12,
    color: "#78716C",
    lineHeight: 20,
  },
});
