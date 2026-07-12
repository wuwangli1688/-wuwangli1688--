import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Store {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

interface SubAccount {
  id: string;
  email: string;
  display_name: string;
  role: string;
  permissions: string[]; // store IDs
}

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isParent = user?.role === "parent";

  const [stores, setStores] = useState<Store[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeNotes, setStoreNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Permission modal
  const [permModalVisible, setPermModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SubAccount | null>(null);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const fetchStores = useCallback(async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`);
      const json = await res.json();
      setStores(json.data || []);
    } catch (err) {
      console.error("Failed to fetch stores:", err);
    }
  }, []);

  const fetchSubAccounts = useCallback(async () => {
    if (!isParent) return;
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/sub-accounts`);
      const data = await res.json();
      setSubAccounts(data.data || []);
    } catch (err) {
      console.error("Failed to fetch sub accounts:", err);
    }
  }, [isParent]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([fetchStores(), fetchSubAccounts()]).finally(() => setLoading(false));
    }, [fetchStores, fetchSubAccounts])
  );

  const handleAddStore = () => {
    setEditingStore(null);
    setStoreName("");
    setStoreNotes("");
    setStoreModalVisible(true);
  };

  const handleEditStore = (store: Store) => {
    setEditingStore(store);
    setStoreName(store.name);
    setStoreNotes(store.notes || "");
    setStoreModalVisible(true);
  };

  const handleSaveStore = async () => {
    if (!storeName.trim()) {
      Alert.alert("提示", "请输入店铺名称");
      return;
    }

    setSaving(true);
    try {
      if (editingStore) {
        /**
         * 服务端文件：server/src/routes/stores.ts
         * 接口：PUT /api/v1/stores/:id
         * Body 参数：name: string, notes?: string
         */
        const res = await authFetch(
          `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/${editingStore.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: storeName.trim(), notes: storeNotes.trim() || null }),
          }
        );
        if (!res.ok) throw new Error("更新失败");
      } else {
        /**
         * 服务端文件：server/src/routes/stores.ts
         * 接口：POST /api/v1/stores
         * Body 参数：name: string, notes?: string
         */
        const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: storeName.trim(), notes: storeNotes.trim() || null }),
        });
        if (!res.ok) throw new Error("创建失败");
      }

      setStoreModalVisible(false);
      fetchStores();
    } catch (err) {
      Alert.alert("错误", err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStore = (store: Store) => {
    Alert.alert("确认删除", `确定要删除店铺「${store.name}」吗？相关数据不会被删除。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            /**
             * 服务端文件：server/src/routes/stores.ts
             * 接口：DELETE /api/v1/stores/:id
             * Path 参数：id: string
             */
            const res = await authFetch(
              `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/${store.id}`,
              { method: "DELETE" }
            );
            if (!res.ok) throw new Error("删除失败");
            fetchStores();
          } catch (err) {
            Alert.alert("错误", err instanceof Error ? err.message : "删除失败");
          }
        },
      },
    ]);
  };

  const handleManagePermission = (account: SubAccount) => {
    setSelectedAccount(account);
    setSelectedStoreIds(account.permissions || []);
    setPermModalVisible(true);
  };

  const handleSavePermission = async () => {
    if (!selectedAccount) return;
    try {
      /**
       * 服务端文件：server/src/routes/stores.ts
       * 接口：POST /api/v1/stores/permissions
       * Body 参数：user_id: string, store_ids: string[]
       */
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/permissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: selectedAccount.id,
            store_ids: selectedStoreIds,
          }),
        }
      );
      if (!res.ok) throw new Error("保存失败");
      setPermModalVisible(false);
      fetchSubAccounts();
    } catch (err) {
      Alert.alert("错误", err instanceof Error ? err.message : "保存失败");
    }
  };

  const toggleStorePermission = (storeId: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    );
  };

  return (
    <Screen>
      <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>店铺管理</Text>
          {isParent && (
            <TouchableOpacity style={styles.addBtn} onPress={handleAddStore}>
              <FontAwesome6 name="plus" size={16} color="#0284C7" />
              <Text style={styles.addBtnText}>新增店铺</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Store List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>我的店铺</Text>
              {stores.length === 0 ? (
                <View style={styles.emptyCard}>
                  <FontAwesome6 name="store" size={32} color="#CBD5E1" />
                  <Text style={styles.emptyText}>暂无店铺</Text>
                  <Text style={styles.emptyHint}>点击上方按钮添加店铺</Text>
                </View>
              ) : (
                stores.map((store) => (
                  <View key={store.id} style={styles.storeCard}>
                    <View style={styles.storeIconContainer}>
                      <FontAwesome6 name="store" size={18} color="#0284C7" />
                    </View>
                    <View style={styles.storeInfo}>
                      <Text style={styles.storeName}>{store.name}</Text>
                      {store.notes ? (
                        <Text style={styles.storeNotes} numberOfLines={1}>{store.notes}</Text>
                      ) : null}
                    </View>
                    {isParent && (
                      <View style={styles.storeActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleEditStore(store)}
                        >
                          <FontAwesome6 name="pen" size={14} color="#64748B" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleDeleteStore(store)}
                        >
                          <FontAwesome6 name="trash" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>

            {/* Sub Account Permissions (Parent only) */}
            {isParent && subAccounts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>子账号权限</Text>
                {subAccounts.map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    style={styles.accountCard}
                    onPress={() => handleManagePermission(account)}
                  >
                    <View style={styles.accountIconContainer}>
                      <FontAwesome6 name="user" size={18} color="#6366F1" />
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={styles.accountName}>{account.display_name}</Text>
                      <Text style={styles.accountEmail}>{account.email}</Text>
                    </View>
                    <View style={styles.permBadge}>
                      <Text style={styles.permBadgeText}>
                        {account.permissions?.length || 0} 个店铺
                      </Text>
                    </View>
                    <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* Add/Edit Store Modal */}
        <Modal visible={storeModalVisible} transparent animationType="slide">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setStoreModalVisible(false)}
            disabled={Platform.OS === "web"}
          >
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editingStore ? "编辑店铺" : "新增店铺"}
                    </Text>
                    <TouchableOpacity onPress={() => setStoreModalVisible(false)}>
                      <FontAwesome6 name="xmark" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalBody}>
                    <Text style={styles.inputLabel}>店铺名称</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="请输入店铺名称"
                      placeholderTextColor="#94A3B8"
                      value={storeName}
                      onChangeText={setStoreName}
                      maxLength={50}
                    />
                    <Text style={[styles.inputLabel, { marginTop: 16 }]}>备注</Text>
                    <TextInput
                      style={[styles.textInput, styles.notesInput]}
                      placeholder="填写店铺备注信息（可选）"
                      placeholderTextColor="#94A3B8"
                      value={storeNotes}
                      onChangeText={setStoreNotes}
                      maxLength={200}
                      multiline
                    />
                  </View>

                  <View style={styles.modalFooter}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.cancelBtn]}
                      onPress={() => setStoreModalVisible(false)}
                    >
                      <Text style={styles.cancelBtnText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.saveBtn, saving && styles.saveBtnDisabled]}
                      onPress={handleSaveStore}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>{saving ? "保存中..." : "保存"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>

        {/* Permission Modal */}
        <Modal visible={permModalVisible} transparent animationType="slide">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPermModalVisible(false)}
            disabled={Platform.OS === "web"}
          >
            <View style={styles.modalContainer}>
              <View style={[styles.modalContent, { maxHeight: "80%" }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>分配店铺权限</Text>
                  <TouchableOpacity onPress={() => setPermModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.permSubtitle}>
                    {selectedAccount?.display_name} 可查看以下店铺的数据：
                  </Text>
                  {stores.length === 0 ? (
                    <Text style={styles.emptyHint}>暂无店铺可分配</Text>
                  ) : (
                    stores.map((store) => {
                      const isSelected = selectedStoreIds.includes(store.id);
                      return (
                        <TouchableOpacity
                          key={store.id}
                          style={[styles.permItem, isSelected && styles.permItemSelected]}
                          onPress={() => toggleStorePermission(store.id)}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              isSelected && styles.checkboxSelected,
                            ]}
                          >
                            {isSelected && (
                              <FontAwesome6 name="check" size={12} color="#FFFFFF" />
                            )}
                          </View>
                          <Text style={styles.permItemText}>{store.name}</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={() => setPermModalVisible(false)}
                  >
                    <Text style={styles.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.saveBtn]}
                    onPress={handleSavePermission}
                  >
                    <Text style={styles.saveBtnText}>保存</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0284C7",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#94A3B8",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyText: {
    fontSize: 15,
    color: "#64748B",
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 4,
  },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  storeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
  },
  storeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  storeNotes: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  storeActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  accountIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  accountEmail: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  permBadge: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  permBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  saveBtn: {
    backgroundColor: "#0284C7",
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  permSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 16,
  },
  permItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  permItemSelected: {
    backgroundColor: "#F0F9FF",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  permItemText: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "500",
  },
});
