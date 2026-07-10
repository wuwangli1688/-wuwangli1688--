import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
  Platform,
  Alert,
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function ShareScreen() {
  const [shareUrl, setShareUrl] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShareInfo();
  }, []);

  const fetchShareInfo = async () => {
    try {
      /**
       * 服务端文件：server/src/routes/share.ts
       * 接口：GET /api/v1/share/app-url
       * 无参数
       */
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/share/app-url`);
      const data = await res.json();
      setShareUrl(data.data?.url || "");
      setQrCodeUri(data.data?.qr_code || "");
    } catch (err) {
      console.error("Failed to fetch share info:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    Alert.alert("链接已复制", shareUrl);
    Alert.alert("已复制", "链接已复制到剪贴板");
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `快来使用收支记账本吧！${shareUrl}`,
        url: shareUrl,
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>生成分享信息...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>分享应用</Text>
          <Text style={styles.headerSubtitle}>邀请朋友一起使用收支记账本</Text>
        </View>

        {/* QR Code Card */}
        <View style={styles.qrCard}>
          <View style={styles.qrContainer}>
            {qrCodeUri ? (
              <Image
                source={{ uri: qrCodeUri }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                <FontAwesome6 name="qrcode" size={64} color="#CBD5E1" />
              </View>
            )}
          </View>
          <Text style={styles.qrHint}>扫描二维码访问应用</Text>
        </View>

        {/* Link Section */}
        <View style={styles.linkCard}>
          <View style={styles.linkRow}>
            <FontAwesome6 name="link" size={16} color="#64748B" />
            <Text style={styles.linkText} numberOfLines={1}>
              {shareUrl}
            </Text>
          </View>
          <View style={styles.linkActions}>
            <TouchableOpacity style={styles.linkBtn} onPress={handleCopyLink}>
              <FontAwesome6 name="copy" size={14} color="#0284C7" />
              <Text style={styles.linkBtnText}>复制链接</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={handleShare}>
              <FontAwesome6 name="share-nodes" size={14} color="#0284C7" />
              <Text style={styles.linkBtnText}>分享</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <FontAwesome6 name="circle-info" size={16} color="#94A3B8" />
          <Text style={styles.infoText}>
            将链接或二维码分享给朋友，他们可以通过链接直接访问应用
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 20,
    paddingTop: 16,
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
    marginBottom: 24,
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
  qrCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
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
  qrHint: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 16,
  },
  linkCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
  },
  linkActions: {
    flexDirection: "row",
    gap: 12,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0284C7",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 18,
  },
});
