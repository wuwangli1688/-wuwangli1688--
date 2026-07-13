import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { authFetch } from '@/lib/supabase';

interface SubAccount {
  id: string;
  username: string;
  displayName: string;
  role: string;
  role_title?: string;
  createdAt: string;
  store_ids?: string[];
}

interface Store {
  id: string;
  name: string;
  notes: string | null;
}

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function AccountManageScreen() {
  const { role } = useAuth();
  const router = useSafeRouter();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SubAccount | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleTitle, setFormRoleTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [storesList, setStoresList] = useState<Store[]>([]);

  const fetchSubAccounts = useCallback(async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/sub-accounts`);
      if (res.ok) {
        const data = await res.json();
        setSubAccounts(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`);
      if (res.ok) {
        const data = await res.json();
        const storeList = data.data || [];
        setStoresList(storeList);
      }
    } catch {
      // silently fail
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSubAccounts();
      fetchStores();
    }, [fetchSubAccounts, fetchStores])
  );

  const handleEdit = (account: SubAccount) => {
    setEditingAccount(account);
    setFormUsername(account.username || account.displayName || '');
    setFormPassword('');
    setFormRoleTitle(account.role_title || '');
    setSelectedStoreIds(account.store_ids || []);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setEditingAccount(null);
    setFormUsername('');
    setFormPassword('');
    setFormRoleTitle('');
    setSelectedStoreIds([]);
    setModalVisible(true);
  };

  const handleDelete = (account: SubAccount) => {
    Alert.alert(
      '确认删除',
      `确定要删除子账号 "${account.username || account.displayName}" 吗？该账号的所有数据将被清除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await authFetch(
                `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/sub-accounts/${account.id}`,
                { method: 'DELETE' }
              );
              if (res.ok) {
                fetchSubAccounts();
              }
            } catch {
              // silently fail
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!formUsername.trim()) {
      Alert.alert('提示', '请填写用户名');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        username: formUsername.trim(),
        displayName: formUsername.trim(),
        role_title: formRoleTitle.trim(),
        store_ids: selectedStoreIds,
      };
      if (formPassword) body.password = formPassword;

      if (editingAccount) {
        const res = await authFetch(
          `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/sub-accounts/${editingAccount.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(body),
          }
        );
        if (res.ok) {
          setModalVisible(false);
          fetchSubAccounts();
        } else {
          const err = await res.json();
          Alert.alert('错误', err.error || '更新失败');
        }
      } else {
        if (!formPassword.trim()) {
          Alert.alert('提示', '请填写密码');
          return;
        }
        if (formPassword.length < 6) {
          Alert.alert('提示', '密码长度至少6位');
          return;
        }
        const res = await authFetch(
          `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/sub-accounts`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );
        if (res.ok) {
          setModalVisible(false);
          fetchSubAccounts();
        } else {
          const err = await res.json();
          Alert.alert('错误', err.error || '创建失败');
        }
      }
    } catch {
      Alert.alert('错误', '网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  if (role !== 'parent') {
    return (
      <Screen>
        <View style={s.noAccess}>
          <FontAwesome6 name="lock" size={48} color="#94A3B8" />
          <Text style={s.noAccessText}>仅主账号可管理子账号</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backArrow}>
          <FontAwesome6 name="arrow-left" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>子账号管理</Text>
        <TouchableOpacity onPress={handleAdd} style={s.addBtn}>
          <FontAwesome6 name="plus" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : subAccounts.length === 0 ? (
        <View style={s.emptyContainer}>
          <FontAwesome6 name="users" size={48} color="#CBD5E1" />
          <Text style={s.emptyText}>暂无子账号</Text>
          <Text style={s.emptySubText}>点击右上角 + 创建子账号</Text>
        </View>
      ) : (
        <FlatList
          data={subAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleEdit(item)} activeOpacity={0.7}>
              <View style={s.accountCard}>
                <View style={s.accountAvatar}>
                  <FontAwesome6 name="user" size={20} color="#2563EB" />
                </View>
                <View style={s.accountInfo}>
                  <View style={s.accountNameRow}>
                    <Text style={s.accountName}>{item.displayName || item.username}</Text>
                    <View style={[s.roleBadge, item.role === 'parent' ? s.roleParent : s.roleChild]}>
                      <Text style={s.roleBadgeText}>{item.role === 'parent' ? '主账号' : '子账号'}</Text>
                    </View>
                  </View>
                  <Text style={s.accountEmail}>{item.username}</Text>
                  {item.role_title ? (
                    <Text style={s.roleTitle}>{item.role_title}</Text>
                  ) : null}
                </View>
                <View style={s.accountActions}>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={s.actionBtn}>
                    <FontAwesome6 name="trash" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === 'web'}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={s.modalOverlay}>
              <View style={s.modalContent}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>
                    {editingAccount ? '编辑子账号' : '创建子账号'}
                  </Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={s.inputGroup}>
                    <Text style={s.label}>用户名</Text>
                    <TextInput
                      style={s.textInput}
                      placeholder="汉字/英文/数字/手机号"
                      placeholderTextColor="#94A3B8"
                      value={formUsername}
                      onChangeText={setFormUsername}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={s.inputGroup}>
                    <Text style={s.label}>
                      {editingAccount ? '新密码（留空不修改）' : '密码'}
                    </Text>
                    <TextInput
                      style={s.textInput}
                      placeholder={editingAccount ? '留空保持不变' : '至少6位'}
                      placeholderTextColor="#94A3B8"
                      value={formPassword}
                      onChangeText={setFormPassword}
                      secureTextEntry
                    />
                  </View>

                  <View style={s.inputGroup}>
                    <Text style={s.label}>职能（如：书记员、会计、仓管）</Text>
                    <TextInput
                      style={s.textInput}
                      placeholder="填写子账号的职能角色"
                      placeholderTextColor="#94A3B8"
                      value={formRoleTitle}
                      onChangeText={setFormRoleTitle}
                    />
                  </View>

                  {storesList.length > 0 && (
                    <View style={s.inputGroup}>
                      <Text style={s.label}>关联店铺</Text>
                      <Text style={s.subLabel}>选择关联店铺后数据共享</Text>
                      <View style={s.storeList}>
                        {storesList.map((store) => {
                          const isSelected = selectedStoreIds.includes(store.id);
                          return (
                            <TouchableOpacity
                              key={store.id}
                              style={[s.storeItem, isSelected && s.storeItemActive]}
                              onPress={() => {
                                setSelectedStoreIds((prev) =>
                                  isSelected
                                    ? prev.filter((id) => id !== store.id)
                                    : [...prev, store.id]
                                );
                              }}
                            >
                              <View style={[s.storeCheckbox, isSelected && s.storeCheckboxActive]}>
                                {isSelected && (
                                  <FontAwesome6 name="check" size={12} color="#fff" />
                                )}
                              </View>
                              <Text style={[s.storeName, isSelected && s.storeNameActive]}>
                                {store.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </ScrollView>

                <View style={s.modalFooter}>
                  <TouchableOpacity
                    style={[s.modalBtn, s.cancelBtn]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={s.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalBtn, s.submitBtn, submitting && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.submitBtnText}>
                        {editingAccount ? '保存' : '创建'}
                      </Text>
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

const s = StyleSheet.create({
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  noAccessText: { fontSize: 16, color: '#64748B' },
  backBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 8 },
  backBtnText: { color: '#2563EB', fontSize: 15 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backArrow: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1E293B', textAlign: 'center' },
  addBtn: { padding: 8 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#64748B', marginTop: 12 },
  emptySubText: { fontSize: 14, color: '#94A3B8' },
  listContent: { padding: 16, gap: 12 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { flex: 1, marginLeft: 12 },
  accountNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleParent: { backgroundColor: '#DBEAFE' },
  roleChild: { backgroundColor: '#FEF3C7' },
  roleBadgeText: { fontSize: 11, fontWeight: '600' },
  accountEmail: { fontSize: 13, color: '#64748B', marginTop: 2 },
  roleTitle: {
    fontSize: 12,
    color: '#8B7E6E',
    marginTop: 2,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  accountActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1E293B' },
  modalBody: { padding: 20, gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#475569' },
  textInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    color: '#1E293B',
  },
  subLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: -2,
  },
  storeList: {
    gap: 8,
    marginTop: 4,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  storeCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCheckboxActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  storeName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  storeNameActive: {
    color: '#1E293B',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { fontSize: 16, fontWeight: '500', color: '#64748B' },
  submitBtn: { backgroundColor: '#2563EB' },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});