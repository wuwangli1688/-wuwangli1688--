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
  const { user, role, email, signOut, refreshProfile } = useAuth();

// Derive account name from email
const accountName = email
  ? (email.endsWith('@jizhangapp.local')
    ? decodeURIComponent(email.replace('@jizhangapp.local', ''))
    : email.split('@')[0])
  : '';
  const router = useSafeRouter();
  const [summary, setSummary] = useState<Summary>({ total_income: "0.00", total_expense: "0.00", balance: "0.00" });

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
  const [pendingCount, setPendingCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [caching, setCaching] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<"checking" | "ready" | "downloading" | "done">("checking");
  const [updateVersion, setUpdateVersion] = useState("");
  const [currentVersion, setCurrentVersion] = useState("1.0.1");
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
        await AsyncStorage.setItem("app_version", "1.0.1");
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

  const fetchPendingCount = useCallback(async () => {
    if (role !== "parent") return;
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/pending`);
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.length);
      }
    } catch {
      // silently fail
    }
  }, [role]);

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
      fetchPendingCount();
      fetchStores();
    }, [fetchAllTimeStats, fetchPendingCount, fetchStores])
  );

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
    setExporting(true);
    try {
      const url = `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/export/transactions`;
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = url;
        link.download = "";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const now = new Date();
        const fileName = `记账明细_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;
        const fileUri = `${(FileSystem as any).documentDirectory}${fileName}`;
        const downloadResult = await (FileSystem as any).downloadAsync(url, fileUri);
        if (downloadResult.status !== 200) {
          Alert.alert("导出失败", "下载文件失败，请稍后重试");
          return;
        }
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "导出记账明细",
            UTI: "org.openxmlformats.spreadsheetml.sheet",
          });
        } else {
          Alert.alert("提示", "文件已保存到本地");
        }
      }
    } catch {
      Alert.alert("导出失败", "导出过程中发生错误");
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
    const currentName = (user as any)?.user_metadata?.display_name || email?.split('@')[0] || "";
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
      // 获取本地存储的版本号
      const storedVersion = await AsyncStorage.getItem("app_version");
      // 如果服务器版本比本地存储的版本新，则提示更新
      if (compareVersions(serverVersion, storedVersion || "1.0.1") > 0) {
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
            <Text style={styles.profileName}>{(user as any)?.user_metadata?.display_name || email?.split('@')[0] || "我的账本"}</Text>
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

            {pendingCount > 0 && (
              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/review")}>
                <View style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}>
                  <FontAwesome6 name="clipboard-check" size={16} color="#D97706" />
                </View>
                <Text style={styles.actionText}>待审核记录</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
                <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}

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

        {/* System */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>系统</Text>

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

          <TouchableOpacity style={styles.actionItem} onPress={() => setPasswordModalVisible(true)}>
            <View style={[styles.actionIcon, { backgroundColor: "#F0FDF4" }]}>
              <FontAwesome6 name="key" size={16} color="#059669" />
            </View>
            <Text style={styles.actionText}>修改密码</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
            <View style={[styles.actionIcon, { backgroundColor: "#FEE2E2" }]}>
              <FontAwesome6 name="right-from-bracket" size={16} color="#DC2626" />
            </View>
            <Text style={[styles.actionText, { color: "#DC2626" }]}>退出登录</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
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
});
