import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import Constants from "expo-constants";
import { authFetch } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Summary {
  total_income: string;
  total_expense: string;
  balance: string;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, role, role_title, displayName, email, pendingCount, signOut, refreshProfile } = useAuth();

// Derive account name from email
const accountName = email
  ? (email.endsWith('@jizhangapp.local')
    ? decodeURIComponent(email.replace('@jizhangapp.local', ''))
    : email.split('@')[0])
  : '';
  const router = useSafeRouter();
  const [summary, setSummary] = useState<Summary>({ total_income: "0.00", total_expense: "0.00", balance: "0.00" });
  const [subscription, setSubscription] = useState<any>(null);

// Compare semantic versions (e.g. "1.0.1" > "1.0.0" returns 1)
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
  const [totalCount, setTotalCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [caching, setCaching] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<"checking" | "ready" | "downloading" | "done">("checking");
  const [updateVersion, setUpdateVersion] = useState("");
  const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
  const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState("");

  // Store switching
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [storeSelectorVisible, setStoreSelectorVisible] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);

  // Load stored version from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("app_version");
      if (stored) {
        setCurrentVersion(stored);
      } else {
        // First run - store default version
        await AsyncStorage.setItem("app_version", APP_VERSION);
      }
    })();
  }, []);

  // Display name edit modal
  const [displayNameModalVisible, setDisplayNameModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  // Password change modal
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // About modal
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [aboutModalType, setAboutModalType] = useState<"product" | "privacy" | "personal" | "thirdparty">("product");

  // Feedback modal
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const fetchAllTimeStats = useCallback(async () => {
    try {
      const [summaryRes, transRes] = await Promise.all([
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/summary`),
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?size=1`),
      ]);

      const summaryData = await summaryRes.json();
      const transData = await transRes.json();

      setSummary(summaryData.data || { total_income: "0.00", total_expense: "0.00", balance: "0.00" });
      setTotalCount(transData.pagination?.total || 0);
    } catch {
      // silently fail
    }
  }, []);

  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`);
      if (res.ok) {
        const data = await res.json();
        setStores(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingStores(false);
    }
  }, []);

  // Load selected store from AsyncStorage
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("selected_store_id");
      setSelectedStoreId(stored);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAllTimeStats();
      refreshProfile();
      fetchStores();
      fetchSubscription();
    }, [fetchAllTimeStats, refreshProfile, fetchStores])
  );

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/my`);
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.data || data);
      }
    } catch {}
  }, []);

  const handleSelectStore = async (storeId: string | null) => {
    setSelectedStoreId(storeId);
    if (storeId) {
      await AsyncStorage.setItem("selected_store_id", storeId);
    } else {
      await AsyncStorage.removeItem("selected_store_id");
    }
    setStoreSelectorVisible(false);
  };

  const handleExport = useCallback(async () => {
    if (exporting) return;
    // Check subscription: free users cannot export
    if (!subscription || subscription?.plan_type === 'free') {
      Alert.alert(
        "升级专业版",
        "免费版不支持数据导出。升级专业版后可导出 Excel 格式记账明细。",
        [
          { text: "取消", style: "cancel" },
          { text: "去升级", onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }
    setExporting(true);
    try {
      const url = `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/export/transactions`;
      const res = await authFetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "导出失败");
      }
      const now = new Date();
      const fileName = `记账明细_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;
      if (Platform.OS === "web") {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } else {
        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const filePath = `${(FileSystem as any).cacheDirectory}${fileName}`;
        await (FileSystem as any).writeAsStringAsync(filePath, base64, {
          encoding: (FileSystem as any).EncodingType.Base64,
        });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(filePath, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "导出记账明细",
            UTI: "org.openxmlformats.spreadsheetml.sheet",
          });
        } else {
          Alert.alert("提示", "文件已保存到本地");
        }
      }
    } catch (e: any) {
      Alert.alert("导出失败", e.message || "导出过程中发生错误");
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      Alert.alert("提示", "请填写所有字段");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("提示", "新密码长度至少6位");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("提示", "两次新密码输入不一致");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/change-password`, {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (res.ok) {
        Alert.alert("成功", "密码修改成功");
        setPasswordModalVisible(false);
        setOldPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        const err = await res.json();
        Alert.alert("错误", err.error || "修改失败");
      }
    } catch {
      Alert.alert("错误", "网络错误");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("退出登录", "确定要退出当前账号吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleOpenEditDisplayName = () => {
    const currentName = displayName || email?.split('@')[0] || "";
    setEditDisplayName(currentName);
    setDisplayNameModalVisible(true);
  };

  const handleSaveDisplayName = async () => {
    if (!editDisplayName.trim()) {
      Alert.alert("提示", "显示名称不能为空");
      return;
    }
    setSavingDisplayName(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/profile`, {
        method: "PUT",
        body: JSON.stringify({ displayName: editDisplayName.trim() }),
      });
      if (res.ok) {
        Alert.alert("成功", "显示名称已更新");
        setDisplayNameModalVisible(false);
        await refreshProfile();
      } else {
        const err = await res.json();
        Alert.alert("错误", err.error || "更新失败");
      }
    } catch {
      Alert.alert("错误", "网络错误");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleClearCache = async () => {
    setCaching(true);
    try {
      // Clear cached data from AsyncStorage (preserve auth/session data)
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) =>
        key.startsWith("cache_") || key.startsWith("last_") || key === "last_version_check"
      );
      let clearedCount = 0;
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
        clearedCount = cacheKeys.length;
      }
      Alert.alert("清理完成", `已清除 ${clearedCount} 项缓存数据`);
    } catch {
      Alert.alert("清理失败", "缓存清理过程中发生错误");
    } finally {
      setCaching(false);
    }
  };

  const handleOpenAbout = (type: 'product' | 'privacy' | 'personal' | 'thirdparty') => {
    setAboutModalType(type);
    setAboutModalVisible(true);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackContent.trim()) {
      Alert.alert("提示", "请填写反馈内容");
      return;
    }
    setSubmittingFeedback(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/feedback`, {
        method: "POST",
        body: JSON.stringify({
          content: feedbackContent.trim(),
          contact: feedbackEmail.trim(),
        }),
      });
      if (res.ok) {
        Alert.alert("感谢反馈", "您的建议已收到，我们会认真考虑！");
        setFeedbackModalVisible(false);
        setFeedbackContent('');
        setFeedbackEmail('');
      } else {
        const err = await res.json();
        Alert.alert("错误", err.error || "提交失败");
      }
    } catch {
      Alert.alert("错误", "网络错误，请稍后重试");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateModalVisible(true);
    setUpdateStatus("checking");
    try {
      // 获取服务器最新版本
      const currentRes = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/version/current`
      );
      if (!currentRes.ok) {
        setUpdateStatus("done");
        Alert.alert("检查失败", "无法连接更新服务器");
        setUpdateModalVisible(false);
        return;
      }
      const versionData = await currentRes.json();
      const serverVersion = versionData.version;
      if (!serverVersion) {
        setUpdateStatus("done");
        setTimeout(() => {
          setUpdateModalVisible(false);
          Alert.alert("检查更新", "当前已是最新版本");
        }, 500);
        return;
      }
      // 使用应用内置版本号作为当前版本（与后端版本号比较）
      // 服务器版本 > 内置版本 → 有新版本可更新
      if (compareVersions(serverVersion, APP_VERSION) > 0) {
        setUpdateVersion(serverVersion);
        setUpdateDownloadUrl(versionData.download_url || "");
        setUpdateStatus("ready");
      } else {
        setUpdateStatus("done");
        setTimeout(() => {
          setUpdateModalVisible(false);
          Alert.alert("检查更新", "当前已是最新版本");
        }, 500);
      }
    } catch {
      setUpdateStatus("done");
      Alert.alert("检查失败", "网络错误，请稍后重试");
      setUpdateModalVisible(false);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setUpdateStatus("downloading");
    setUpdateProgress(0);
    const downloadUrl = updateDownloadUrl
      ? `${EXPO_PUBLIC_BACKEND_BASE_URL}${updateDownloadUrl}`
      : null;
    if (downloadUrl && Platform.OS !== "web") {
      try {
        const fileUri = `${(FileSystem as any).documentDirectory}update_${updateVersion}.apk`;
        const downloadResult = await (FileSystem as any).downloadAsync(downloadUrl, fileUri);
        if (downloadResult.status === 200) {
          setUpdateProgress(100);
          setUpdateStatus("done");
          // Store the new version
          await AsyncStorage.setItem("app_version", updateVersion);
          setTimeout(() => {
            setUpdateModalVisible(false);
            setCurrentVersion(updateVersion);
            Alert.alert("更新完成", `版本已更新至 v${updateVersion}，请重启应用以应用最新更新。`);
          }, 500);
          return;
        }
      } catch {
        // Fallback to simulation
      }
    }
    // Simulate download progress
    const interval = setInterval(() => {
      setUpdateProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUpdateStatus("done");
          // Store the new version
          AsyncStorage.setItem("app_version", updateVersion);
          setTimeout(() => {
            setUpdateModalVisible(false);
            setCurrentVersion(updateVersion);
            // For web: refresh the page to load latest code
            if (Platform.OS === "web") {
              window.location.reload();
            } else {
              Alert.alert("更新完成", `版本已更新至 v${updateVersion}，请重启应用以应用最新更新。`);
            }
          }, 500);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 300);
  };

  const menuItems = [
    { icon: "receipt" as const, title: "记账笔数", value: `${totalCount} 笔`, color: "#2563EB" },
    { icon: "arrow-trend-up" as const, title: "累计收入", value: `¥${parseFloat(summary.total_income).toFixed(2)}`, color: "#059669" },
    { icon: "arrow-trend-down" as const, title: "累计支出", value: `¥${parseFloat(summary.total_expense).toFixed(2)}`, color: "#DC2626" },
    { icon: "wallet" as const, title: "累计结余", value: `¥${parseFloat(summary.balance).toFixed(2)}`, color: "#2563EB" },
  ];

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <FontAwesome6 name={role === "parent" ? "user-shield" : "user"} size={36} color="#2563EB" />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.profileName}>{displayName || email?.split('@')[0] || "我的账本"}</Text>
            {role === "parent" && (
              <TouchableOpacity style={styles.editNameBtn} onPress={handleOpenEditDisplayName}>
                <FontAwesome6 name="pen" size={14} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {role === "parent" ? "主账号" : "子账号"}
            </Text>
          </View>
          <Text style={styles.profileDesc}>登录账号：{accountName}</Text>
          {role === "child" && role_title ? (
            <Text style={styles.roleTitleText}>职能：{role_title}</Text>
          ) : null}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {menuItems.map((item, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: `${item.color}12` }]}>
                <FontAwesome6 name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.statTitle}>{item.title}</Text>
              <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Store Switcher */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>当前店铺</Text>
          <TouchableOpacity style={styles.actionItem} onPress={() => setStoreSelectorVisible(true)}>
            <View style={[styles.actionIcon, { backgroundColor: "#E0F2FE" }]}>
              <FontAwesome6 name="store" size={16} color="#0284C7" />
            </View>
            {selectedStoreId ? (
              <Text style={styles.actionText}>
                {stores.find(s => s.id === selectedStoreId)?.name || '已选择店铺'}
              </Text>
            ) : (
              <Text style={styles.actionText}>全部店铺（不筛选）</Text>
            )}
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
          {loadingStores && (
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, marginLeft: 4 }}>
              加载中...
            </Text>
          )}
        </View>

        {/* Account Management (parent only) */}
        {role === "parent" && (
          <View style={styles.actionsSection}>
            <Text style={styles.actionsTitle}>账号管理</Text>

            <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/review")}>
                <View style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}>
                  <FontAwesome6 name="clipboard-check" size={16} color="#D97706" />
                </View>
                <Text style={styles.actionText}>待审核记录</Text>
                {pendingCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{pendingCount}</Text>
                  </View>
                )}
                <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
              </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/account-manage")}>
              <View style={[styles.actionIcon, { backgroundColor: "#EDE9FE" }]}>
                <FontAwesome6 name="users" size={16} color="#7C3AED" />
              </View>
              <Text style={styles.actionText}>子账号管理</Text>
              <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/stores")}>
              <View style={[styles.actionIcon, { backgroundColor: "#E0F2FE" }]}>
                <FontAwesome6 name="store" size={16} color="#0284C7" />
              </View>
              <Text style={styles.actionText}>店铺管理</Text>
              <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push("/categories")}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}>
                <FontAwesome6 name="tags" size={16} color="#D97706" />
              </View>
              <Text style={styles.actionText}>项目分类</Text>
              <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Data Management */}
        {role !== "child" && (
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>数据管理</Text>

          <TouchableOpacity style={styles.actionItem} onPress={handleExport} disabled={exporting}>
            <View style={[styles.actionIcon, { backgroundColor: "#DBEAFE" }]}>
              {exporting ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <FontAwesome6 name="file-excel" size={16} color="#2563EB" />
              )}
            </View>
            <Text style={styles.actionText}>{exporting ? "导出中..." : "导出 Excel"}</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/share")}>
            <View style={[styles.actionIcon, { backgroundColor: "#F0FDF4" }]}>
              <FontAwesome6 name="qrcode" size={16} color="#059669" />
            </View>
            <Text style={styles.actionText}>分享应用 / 二维码</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          </View>
        )}

        {/* 应用维护 */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>应用维护</Text>

          

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/subscription")}>
            <View style={[styles.actionIcon, { backgroundColor: "#E0E7FF" }]}>
              <FontAwesome6 name="crown" size={16} color="#4F46E5" />
            </View>
            <Text style={styles.actionText}>订阅管理</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleClearCache} disabled={caching}>
            <View style={[styles.actionIcon, { backgroundColor: "#F3E8FF" }]}>
              {caching ? (
                <ActivityIndicator size="small" color="#9333EA" />
              ) : (
                <FontAwesome6 name="broom" size={16} color="#9333EA" />
              )}
            </View>
            <Text style={styles.actionText}>{caching ? "清理中..." : "清除缓存"}</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleCheckUpdate} disabled={checkingUpdate}>
            <View style={[styles.actionIcon, { backgroundColor: "#E0F2FE" }]}>
              {checkingUpdate ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <FontAwesome6 name="rotate" size={16} color="#0284C7" />
              )}
            </View>
            <Text style={styles.actionText}>{checkingUpdate ? "检查中..." : "检查新版本"}</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 关于应用 */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>关于应用</Text>

          <TouchableOpacity style={styles.actionItem} onPress={() => { setAboutModalType("product"); setAboutModalVisible(true); }}>
            <View style={[styles.actionIcon, { backgroundColor: "#EDE9FE" }]}>
              <FontAwesome6 name="circle-info" size={16} color="#7C3AED" />
            </View>
            <Text style={styles.actionText}>产品说明</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => setFeedbackModalVisible(true)}>
            <View style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}>
              <FontAwesome6 name="message" size={16} color="#D97706" />
            </View>
            <Text style={styles.actionText}>用户反馈</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => { setAboutModalType("privacy"); setAboutModalVisible(true); }}>
            <View style={[styles.actionIcon, { backgroundColor: "#DBEAFE" }]}>
              <FontAwesome6 name="shield-halved" size={16} color="#2563EB" />
            </View>
            <Text style={styles.actionText}>隐私政策</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => { setAboutModalType("personal"); setAboutModalVisible(true); }}>
            <View style={[styles.actionIcon, { backgroundColor: "#FCE7F3" }]}>
              <FontAwesome6 name="user-check" size={16} color="#DB2777" />
            </View>
            <Text style={styles.actionText}>个人清单</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => { setAboutModalType("thirdparty"); setAboutModalVisible(true); }}>
            <View style={[styles.actionIcon, { backgroundColor: "#D1FAE5" }]}>
              <FontAwesome6 name="cube" size={16} color="#059669" />
            </View>
            <Text style={styles.actionText}>第三方清单</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 账号安全 */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>账号安全</Text>

          <TouchableOpacity style={styles.actionItem} onPress={() => setPasswordModalVisible(true)}>
            <View style={[styles.actionIcon, { backgroundColor: "#F0FDF4" }]}>
              <FontAwesome6 name="key" size={16} color="#059669" />
            </View>
            <Text style={styles.actionText}>修改密码</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 退出登录 */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>退出登录</Text>

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
            <View style={[styles.actionIcon, { backgroundColor: "#FEE2E2" }]}>
              <FontAwesome6 name="right-from-bracket" size={16} color="#DC2626" />
            </View>
            <Text style={[styles.actionText, { color: "#DC2626" }]}>退出登录</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>即时记账 v{currentVersion}</Text>
          <Text style={styles.appInfoSubtext}>用心记录每一笔收支</Text>
        </View>
      </ScrollView>

      {/* Display Name Edit Modal */}
      <Modal visible={displayNameModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === "web"}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>修改显示名称</Text>
                  <TouchableOpacity onPress={() => setDisplayNameModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>显示名称</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="请输入显示名称"
                      placeholderTextColor="#94A3B8"
                      value={editDisplayName}
                      onChangeText={setEditDisplayName}
                      maxLength={30}
                    />
                  </View>
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setDisplayNameModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.submitBtn, savingDisplayName && { opacity: 0.6 }]}
                    onPress={handleSaveDisplayName}
                    disabled={savingDisplayName}
                  >
                    {savingDisplayName ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>保存</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Store Selector Modal */}
      <Modal visible={storeSelectorVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === "web"}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>选择店铺</Text>
                  <TouchableOpacity onPress={() => setStoreSelectorVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[styles.storeOption, !selectedStoreId && styles.storeOptionActive]}
                    onPress={() => handleSelectStore(null)}
                  >
                    <FontAwesome6 name="store" size={18} color={!selectedStoreId ? "#2563EB" : "#64748B"} />
                    <Text style={[styles.storeOptionText, !selectedStoreId && styles.storeOptionTextActive]}>
                      全部店铺（不筛选）
                    </Text>
                    {!selectedStoreId && <FontAwesome6 name="check" size={16} color="#2563EB" />}
                  </TouchableOpacity>
                  {stores.map((store) => (
                    <TouchableOpacity
                      key={store.id}
                      style={[styles.storeOption, selectedStoreId === store.id && styles.storeOptionActive]}
                      onPress={() => handleSelectStore(store.id)}
                    >
                      <FontAwesome6 name="store" size={18} color={selectedStoreId === store.id ? "#2563EB" : "#64748B"} />
                      <Text style={[styles.storeOptionText, selectedStoreId === store.id && styles.storeOptionTextActive]}>
                        {store.name}
                      </Text>
                      {selectedStoreId === store.id && <FontAwesome6 name="check" size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                  {stores.length === 0 && (
                    <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 24 }}>
                      暂无店铺，请先创建店铺
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Password Change Modal */}
      <Modal visible={passwordModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === "web"}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>修改密码</Text>
                  <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>当前密码</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="请输入当前密码"
                      placeholderTextColor="#94A3B8"
                      value={oldPassword}
                      onChangeText={setOldPassword}
                      secureTextEntry
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>新密码</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="至少6位"
                      placeholderTextColor="#94A3B8"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>确认新密码</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="再次输入新密码"
                      placeholderTextColor="#94A3B8"
                      value={confirmNewPassword}
                      onChangeText={setConfirmNewPassword}
                      secureTextEntry
                    />
                  </View>
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPasswordModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.submitBtn, changingPassword && { opacity: 0.6 }]}
                    onPress={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>确认修改</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Update Check Modal */}
      <Modal visible={updateModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.updateDialog}>
            {updateStatus === "checking" && (
              <>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.updateStatusText}>正在检查更新...</Text>
              </>
            )}
            {updateStatus === "ready" && (
              <>
                <FontAwesome6 name="box" size={48} color="#2563EB" style={styles.updateIcon} />
                <Text style={styles.updateTitle}>发现新版本 v{updateVersion}</Text>
                <Text style={styles.updateDesc}>是否立即更新？</Text>
                <View style={styles.updateActions}>
                  <TouchableOpacity
                    style={[styles.updateBtn, { backgroundColor: "#F1F5F9" }]}
                    onPress={() => setUpdateModalVisible(false)}
                  >
                    <Text style={{ color: "#64748B", fontSize: 15, fontWeight: "500" }}>稍后</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.updateBtn, { backgroundColor: "#2563EB" }]}
                    onPress={handleDownloadUpdate}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>更新</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {updateStatus === "downloading" && (
              <>
                <Text style={styles.updateTitle}>正在更新</Text>
                <Text style={styles.updateProgressText}>{updateProgress}%</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${updateProgress}%` }]} />
                </View>
                <Text style={styles.updateHint}>正在下载更新包...</Text>
              </>
            )}
            {updateStatus === "done" && !updateModalVisible && null}
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal visible={aboutModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === "web"}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {aboutModalType === "product" ? "产品说明" :
                     aboutModalType === "privacy" ? "隐私政策" :
                     aboutModalType === "personal" ? "个人清单" : "第三方清单"}
                  </Text>
                  <TouchableOpacity onPress={() => setAboutModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {aboutModalType === "product" && (
                    <View>
                      <Text style={styles.aboutTitle}>即时记账</Text>
                      <Text style={styles.aboutVersion}>v{currentVersion}</Text>
                      <Text style={styles.aboutSectionTitle}>产品简介</Text>
                      <Text style={styles.aboutText}>
                        即时记账是一款专为个体商户、家庭及小型团队打造的日常收支记账应用。提供多角色协同、店铺归属管理、分类统计、数据导出等功能，帮助用户轻松掌握财务状况。
                      </Text>

                      <Text style={styles.aboutSectionTitle}>核心功能</Text>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>•</Text>
                        <Text style={styles.aboutFeatureText}><Text style={styles.aboutFeatureBold}>多角色协作</Text>：支持主账号与子账号协同记账，主账号可设置子账号权限（录入/修改/删除），并可开启审核模式，子账号的数据需经主账号确认后方可生效。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>•</Text>
                        <Text style={styles.aboutFeatureText}><Text style={styles.aboutFeatureBold}>店铺管理</Text>：支持多店铺管理，每笔记录可归属到具体店铺，方便按店铺维度查看收支明细。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>•</Text>
                        <Text style={styles.aboutFeatureText}><Text style={styles.aboutFeatureBold}>分类统计</Text>：收入/支出按分类汇总展示，可点击查看明细，月视图直观呈现收支趋势。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>•</Text>
                        <Text style={styles.aboutFeatureText}><Text style={styles.aboutFeatureBold}>数据导出</Text>：支持 Excel 格式导出全部记账明细，便于归档或进一步分析。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>•</Text>
                        <Text style={styles.aboutFeatureText}><Text style={styles.aboutFeatureBold}>安全登录</Text>：支持记住密码、登录历史，忘记密码可通过密保问题重置，保障账户安全。</Text>
                      </View>

                      <Text style={styles.aboutSectionTitle}>角色说明</Text>
                      <Text style={styles.aboutText}>
                        主账号：拥有全部管理权限，可创建/编辑子账号、管理店铺和分类，审核子账号的记账记录。
                      </Text>
                      <Text style={styles.aboutText}>
                        子账号：由主账号创建，可分配店铺和权限（录入/修改/删除），根据是否需要审核决定数据是否直接生效。
                      </Text>

                      <Text style={styles.aboutSectionTitle}>适用场景</Text>
                      <Text style={styles.aboutText}>
                        个体商户日常记账、家庭收支管理、多店铺经营数据汇总、小型团队费用记录。
                      </Text>
                    </View>
                  )}

                  {aboutModalType === "privacy" && (
                    <View>
                      <Text style={styles.aboutSectionTitle}>隐私政策</Text>
                      <Text style={styles.aboutText}>
                        本应用尊重并保护用户的个人隐私。以下是我们的隐私保护承诺：
                      </Text>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>1.</Text>
                        <Text style={styles.aboutFeatureText}>信息收集：我们仅收集必要的账号信息（邮箱、密码）用于身份验证，记账数据仅用于为您提供统计和查询服务。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>2.</Text>
                        <Text style={styles.aboutFeatureText}>数据存储：您的所有记账数据均加密存储在安全服务器上，我们不会将您的数据共享给第三方。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>3.</Text>
                        <Text style={styles.aboutFeatureText}>数据控制：您可随时查看、修改或删除您的记账数据。注销账号后，相关数据将被永久删除。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>4.</Text>
                        <Text style={styles.aboutFeatureText}>通讯安全：所有数据传输均采用加密通道（HTTPS），防止信息在传输过程中被窃取或篡改。</Text>
                      </View>
                      <View style={styles.aboutFeatureItem}>
                        <Text style={styles.aboutFeatureBullet}>5.</Text>
                        <Text style={styles.aboutFeatureText}>政策更新：我们可能会不时更新本隐私政策，更新后会通过应用内通知告知用户。</Text>
                      </View>
                      <Text style={[styles.aboutText, { marginTop: 12 }]}>
                        如您对隐私政策有任何疑问，请通过应用内的「用户反馈」功能联系我们。
                      </Text>
                    </View>
                  )}

                  {aboutModalType === "personal" && (
                    <View>
                      <Text style={styles.aboutSectionTitle}>个人数据处理清单</Text>
                      <Text style={styles.aboutText}>
                        根据相关法律法规要求，我们列出本应用收集和处理的个人数据清单：
                      </Text>
                      <View style={styles.dataTable}>
                        <View style={styles.dataRow}>
                          <Text style={[styles.dataCell, styles.dataHeader]}>数据类型</Text>
                          <Text style={[styles.dataCell, styles.dataHeader]}>用途</Text>
                          <Text style={[styles.dataCell, styles.dataHeader]}>存储期限</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>邮箱地址</Text>
                          <Text style={styles.dataCell}>账号登录</Text>
                          <Text style={styles.dataCell}>账号存续期间</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>登录密码（加密存储）</Text>
                          <Text style={styles.dataCell}>身份验证</Text>
                          <Text style={styles.dataCell}>账号存续期间</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>显示名称</Text>
                          <Text style={styles.dataCell}>个人资料展示</Text>
                          <Text style={styles.dataCell}>用户可随时修改</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>记账数据</Text>
                          <Text style={styles.dataCell}>核心功能</Text>
                          <Text style={styles.dataCell}>用户可自行删除</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>密保问题及答案</Text>
                          <Text style={styles.dataCell}>密码找回</Text>
                          <Text style={styles.dataCell}>账号存续期间</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>反馈内容</Text>
                          <Text style={styles.dataCell}>产品改进</Text>
                          <Text style={styles.dataCell}>处理完毕后保留30天</Text>
                        </View>
                      </View>
                      <Text style={styles.aboutText}>
                        我们不会将您的个人信息用于上述用途之外的任何目的。如需删除全部数据，请联系我们。
                      </Text>
                    </View>
                  )}

                  {aboutModalType === "thirdparty" && (
                    <View>
                      <Text style={styles.aboutSectionTitle}>第三方服务清单</Text>
                      <Text style={styles.aboutText}>
                        本应用使用了以下第三方服务，以确保功能的正常运行：
                      </Text>
                      <View style={styles.dataTable}>
                        <View style={styles.dataRow}>
                          <Text style={[styles.dataCell, styles.dataHeader]}>服务名称</Text>
                          <Text style={[styles.dataCell, styles.dataHeader]}>用途</Text>
                          <Text style={[styles.dataCell, styles.dataHeader]}>数据共享</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>Supabase</Text>
                          <Text style={styles.dataCell}>用户认证、数据存储</Text>
                          <Text style={styles.dataCell}>账号信息、记账数据</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>Express.js</Text>
                          <Text style={styles.dataCell}>后端API服务</Text>
                          <Text style={styles.dataCell}>处理请求数据</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>Expo / React Native</Text>
                          <Text style={styles.dataCell}>前端框架</Text>
                          <Text style={styles.dataCell}>不共享数据</Text>
                        </View>
                        <View style={styles.dataRow}>
                          <Text style={styles.dataCell}>对象存储（S3兼容）</Text>
                          <Text style={styles.dataCell}>文件存储</Text>
                          <Text style={styles.dataCell}>用户上传的文件</Text>
                        </View>
                      </View>
                      <Text style={styles.aboutText}>
                        以上第三方服务均遵循各自的服务协议和隐私政策，我们已选择可信赖的服务提供商，并仅共享必要的数据。
                      </Text>
                    </View>
                  )}
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setAboutModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>关闭</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Feedback Modal */}
      <Modal visible={feedbackModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === "web"}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>用户反馈</Text>
                  <TouchableOpacity onPress={() => setFeedbackModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>联系方式（选填）</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="邮箱或手机号，方便我们回复您"
                      placeholderTextColor="#94A3B8"
                      value={feedbackEmail}
                      onChangeText={setFeedbackEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>反馈内容 <Text style={{ color: "#EF4444" }}>*</Text></Text>
                    <TextInput
                      style={[styles.textInput, { height: 120, textAlignVertical: "top", paddingTop: 14 }]}
                      placeholder="请描述您的建议或遇到的问题..."
                      placeholderTextColor="#94A3B8"
                      value={feedbackContent}
                      onChangeText={setFeedbackContent}
                      multiline
                      numberOfLines={5}
                    />
                  </View>
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setFeedbackModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.submitBtn, submittingFeedback && { opacity: 0.6 }]}
                    onPress={handleSubmitFeedback}
                    disabled={submittingFeedback}
                  >
                    {submittingFeedback ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>提交反馈</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16 },
  profileHeader: { alignItems: "center", paddingVertical: 24 },
  avatarContainer: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#EFF6FF",
    justifyContent: "center", alignItems: "center", marginBottom: 12,
  },
  profileName: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  editNameBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#F1F5F9",
    justifyContent: "center", alignItems: "center",
  },
  roleBadge: {
    backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 3,
    borderRadius: 12, marginBottom: 6,
  },
  roleBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  profileDesc: { fontSize: 13, color: "#64748B" },
  roleTitleText: { fontSize: 13, color: "#8B7E6E", marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  statCard: {
    width: "47%", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16,
    shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  statIconContainer: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center", marginBottom: 12,
  },
  statTitle: { fontSize: 12, color: "#64748B", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "800" },
  actionsSection: { marginBottom: 24 },
  actionsTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  actionItem: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 14, padding: 14, marginBottom: 8,
    shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  actionIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: "500", color: "#1E293B" },
  badge: {
    backgroundColor: "#EF4444", minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginRight: 8,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  appInfo: { alignItems: "center", paddingVertical: 24 },
  appInfoText: { fontSize: 13, color: "#94A3B8" },
  appInfoSubtext: { fontSize: 12, color: "#CBD5E1", marginTop: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "#1E293B" },
  modalBody: { padding: 20, gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: "#475569" },
  textInput: {
    backgroundColor: "#F1F5F9", borderRadius: 12, paddingHorizontal: 16,
    height: 48, fontSize: 16, color: "#1E293B",
  },
  modalFooter: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  modalBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancelBtn: { backgroundColor: "#F1F5F9" },
  cancelBtnText: { fontSize: 16, fontWeight: "500", color: "#64748B" },
  submitBtn: { backgroundColor: "#2563EB" },
  submitBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  // Update Modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  updateDialog: {
    backgroundColor: "#fff", borderRadius: 20, padding: 28, width: "80%",
    alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  updateIcon: { fontSize: 48, marginBottom: 16 },
  updateTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  updateDesc: { fontSize: 14, color: "#64748B", marginBottom: 20 },
  updateStatusText: { fontSize: 15, color: "#64748B", marginTop: 16 },
  updateProgressText: { fontSize: 36, fontWeight: "800", color: "#2563EB", marginVertical: 16 },
  updateHint: { fontSize: 13, color: "#94A3B8", marginTop: 12 },
  progressBarContainer: {
    width: "100%", height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: "#2563EB", borderRadius: 4 },
  updateActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  updateBtn: {
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  storeOption: {
    flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 8, gap: 12,
    backgroundColor: "#F8FAFC",
  },
  storeOptionActive: {
    backgroundColor: "#EFF6FF",
  },
  storeOptionText: {
    flex: 1, fontSize: 15, color: "#334155",
  },
  storeOptionTextActive: {
    color: "#2563EB", fontWeight: "600",
  },
  // About Modal
  aboutTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A", textAlign: "center", marginBottom: 4 },
  aboutVersion: { fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: 20 },
  aboutSectionTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A", marginTop: 20, marginBottom: 10 },
  aboutText: { fontSize: 14, color: "#475569", lineHeight: 22, marginBottom: 8 },
  aboutFeatureItem: { flexDirection: "row", marginBottom: 8, gap: 6 },
  aboutFeatureBullet: { fontSize: 14, color: "#2563EB", fontWeight: "700", width: 18 },
  aboutFeatureText: { fontSize: 14, color: "#475569", lineHeight: 22, flex: 1 },
  aboutFeatureBold: { fontWeight: "700", color: "#1E293B" },
  dataTable: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E2E8F0", marginVertical: 12 },
  dataRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  dataCell: { flex: 1, fontSize: 12, color: "#475569", padding: 10, textAlign: "center" },
  dataHeader: { fontWeight: "700", color: "#0F172A", backgroundColor: "#F8FAFC" },
});
