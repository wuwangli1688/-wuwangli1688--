import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { authFetch } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

interface Store {
  id: string;
  name: string;
}

interface TransactionDetail {
  id: number;
  amount: string;
  type: 'income' | 'expense';
  category_id: string;
  note: string | null;
  date: string;
  status: string;
  user_id: string;
  store_id: string | null;
  created_at: string;
  updated_at?: string;
  categories: { name: string; icon: string; color: string } | null;
  stores: { name: string } | null;
}

export default function DetailScreen() {
  const { id } = useSafeSearchParams<{ id: number }>();
  const router = useSafeRouter();
  const { role } = useAuth();
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [editType, setEditType] = useState<'income' | 'expense'>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`
      );
      if (res.ok) {
        const data = await res.json();
        setDetail(data.data);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('加载失败', err.error || '无法加载记录');
        router.back();
      }
    } catch {
      Alert.alert('网络错误', '请检查网络连接');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchDetail();
    }, [fetchDetail])
  );

  const handleDelete = () => {
    Alert.alert('删除记录', '确定要删除这条记录吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await authFetch(
              `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`,
              { method: 'DELETE' }
            );
            if (res.ok) {
              Alert.alert('已删除', '记录已删除', [
                { text: '返回', onPress: () => router.back() },
              ]);
            } else {
              const err = await res.json().catch(() => ({}));
              Alert.alert('删除失败', err.error || '无法删除记录');
            }
          } catch {
            Alert.alert('网络错误', '请检查网络连接');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const openEditModal = async () => {
    if (!detail) return;

    // Set initial values
    setEditType(detail.type);
    setEditAmount(detail.amount);
    setEditCategoryId(detail.category_id);
    setEditNote(detail.note || '');
    setEditDate(detail.date);
    setEditStoreId(detail.store_id);

    // Fetch categories and stores
    try {
      const [catRes, storeRes] = await Promise.all([
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/categories`),
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.data || []);
      }
      if (storeRes.ok) {
        const storeData = await storeRes.json();
        setStores(storeData.data || []);
      }
    } catch {
      // silently fail - form will still work with empty selectors
    }

    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!detail) return;

    // Validate
    if (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      Alert.alert('请输入有效金额');
      return;
    }
    if (!editCategoryId) {
      Alert.alert('请选择分类');
      return;
    }
    if (!editDate) {
      Alert.alert('请选择日期');
      return;
    }

    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: editType,
        amount: editAmount,
        category_id: editCategoryId,
        note: editNote || null,
        date: editDate,
        store_id: editStoreId || null,
      };

      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        Alert.alert('修改成功', '记录已更新', [
          { text: '确定', onPress: () => {
            setEditModalVisible(false);
            fetchDetail(); // Refresh detail
          }},
        ]);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('修改失败', err.error || '无法更新记录');
      }
    } catch {
      Alert.alert('网络错误', '请检查网络连接');
    } finally {
      setEditSaving(false);
    }
  };

  // Filter categories by type
  const filteredCategories = categories.filter(c => c.type === editType);

  if (loading) {
    return (
      <Screen>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={s.loadingText}>加载中...</Text>
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen>
        <View style={s.center}>
          <FontAwesome6 name="circle-exclamation" size={48} color="#94A3B8" />
          <Text style={s.emptyText}>记录不存在</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const isIncome = detail.type === 'income';
  const amount = parseFloat(detail.amount);
  const catName = detail.categories?.name || '未分类';
  const catIcon = detail.categories?.icon || 'circle';
  const catColor = detail.categories?.color || '#8B7E6E';
  const storeName = detail.stores?.name || null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}年${m}月${day}日`;
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
  };

  return (
    <Screen>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <FontAwesome6 name="arrow-left" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>交易详情</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
        {/* Amount Card */}
        <View style={s.amountCard}>
          <Text style={[s.amountLabel, { color: isIncome ? '#10B981' : '#EF4444' }]}>
            {isIncome ? '收入' : '支出'}
          </Text>
          <Text style={[s.amountValue, { color: isIncome ? '#10B981' : '#EF4444' }]}>
            {isIncome ? '+' : '-'}¥{amount.toFixed(2)}
          </Text>
        </View>

        {/* Info Card */}
        <View style={s.infoCard}>
          {/* Category */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>分类</Text>
            <View style={s.infoValueRow}>
              <View style={[s.catIconWrap, { backgroundColor: `${catColor}20` }]}>
                <FontAwesome6 name={catIcon as any} size={16} color={catColor} />
              </View>
              <Text style={s.infoValue}>{catName}</Text>
            </View>
          </View>

          <View style={s.divider} />

          {/* Date */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>日期</Text>
            <Text style={s.infoValue}>{formatDate(detail.date)}</Text>
          </View>

          <View style={s.divider} />

          {/* Store */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>店铺</Text>
            <Text style={s.infoValue}>{storeName || '无'}</Text>
          </View>

          <View style={s.divider} />

          {/* Note */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>备注</Text>
            <Text style={[s.infoValue, s.noteText]}>{detail.note || '无'}</Text>
          </View>

          <View style={s.divider} />

          {/* Status */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>状态</Text>
            <View style={s.statusBadge}>
              <Text style={s.statusText}>
                {detail.status === 'approved' ? '已通过' : detail.status === 'pending' ? '待审核' : '已拒绝'}
              </Text>
            </View>
          </View>

          <View style={s.divider} />

          {/* Created At */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>创建时间</Text>
            <Text style={s.infoValue}>{formatDateTime(detail.created_at)}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        {role === 'parent' && (
          <View style={s.actions}>
            <TouchableOpacity style={s.editBtn} onPress={openEditModal}>
              <FontAwesome6 name="pen-to-square" size={16} color="#4F46E5" />
              <Text style={s.editBtnText}>编辑记录</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <FontAwesome6 name="trash-can" size={16} color="#EF4444" />
                  <Text style={s.deleteBtnText}>删除记录</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === 'web'}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={s.modalOverlay}>
              <View style={s.modalContent}>
                {/* Header */}
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>编辑记录</Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <FontAwesome6 name="xmark" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={s.modalBody} contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
                  {/* Type Selector */}
                  <View>
                    <Text style={s.fieldLabel}>类型</Text>
                    <View style={s.typeRow}>
                      <TouchableOpacity
                        style={[s.typeBtn, editType === 'expense' && s.typeBtnActive]}
                        onPress={() => setEditType('expense')}
                      >
                        <FontAwesome6 name="arrow-down" size={14} color={editType === 'expense' ? '#EF4444' : '#64748B'} />
                        <Text style={[s.typeBtnText, editType === 'expense' && { color: '#EF4444' }]}>支出</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.typeBtn, editType === 'income' && s.typeIncomeActive]}
                        onPress={() => setEditType('income')}
                      >
                        <FontAwesome6 name="arrow-up" size={14} color={editType === 'income' ? '#10B981' : '#64748B'} />
                        <Text style={[s.typeBtnText, editType === 'income' && { color: '#10B981' }]}>收入</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Amount */}
                  <View>
                    <Text style={s.fieldLabel}>金额</Text>
                    <TextInput
                      style={s.input}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  {/* Category */}
                  <View>
                    <Text style={s.fieldLabel}>分类</Text>
                    <View style={s.catGrid}>
                      {filteredCategories.map((cat) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            s.catItem,
                            editCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color },
                          ]}
                          onPress={() => setEditCategoryId(cat.id)}
                        >
                          <FontAwesome6 name={cat.icon as any} size={18} color={cat.color} />
                          <Text style={s.catItemText}>{cat.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredCategories.length === 0 && (
                        <Text style={{ color: '#94A3B8', fontSize: 14 }}>暂无分类</Text>
                      )}
                    </View>
                  </View>

                  {/* Date */}
                  <View>
                    <Text style={s.fieldLabel}>日期</Text>
                    <TextInput
                      style={s.input}
                      value={editDate}
                      onChangeText={setEditDate}
                      placeholder="2025-01-15"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                    />
                    <Text style={s.fieldHint}>格式：YYYY-MM-DD</Text>
                  </View>

                  {/* Store */}
                  <View>
                    <Text style={s.fieldLabel}>店铺（可选）</Text>
                    <View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.storeRow}>
                      <TouchableOpacity
                        style={[s.storeChip, editStoreId === null && s.storeChipActive]}
                        onPress={() => setEditStoreId(null)}
                      >
                        <Text style={[s.storeChipText, editStoreId === null && s.storeChipTextActive]}>无</Text>
                      </TouchableOpacity>
                      {stores.map((store) => (
                        <TouchableOpacity
                          key={store.id}
                          style={[s.storeChip, editStoreId === store.id && s.storeChipActive]}
                          onPress={() => setEditStoreId(store.id)}
                        >
                          <Text style={[s.storeChipText, editStoreId === store.id && s.storeChipTextActive]}>
                            {store.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    </View>
                  </View>

                  {/* Note */}
                  <View>
                    <Text style={s.fieldLabel}>备注（可选）</Text>
                    <TextInput
                      style={[s.input, s.noteInput]}
                      value={editNote}
                      onChangeText={setEditNote}
                      placeholder="添加备注..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </ScrollView>

                {/* Footer */}
                <View style={s.modalFooter}>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={s.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.saveBtn}
                    onPress={handleSaveEdit}
                    disabled={editSaving}
                  >
                    {editSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={s.saveBtnText}>保存</Text>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 15,
    color: '#4F46E5',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 20,
  },
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  amountLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  infoLabel: {
    fontSize: 15,
    color: '#64748B',
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoValue: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  noteText: {
    color: '#475569',
    fontWeight: '400',
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  statusBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  editBtnText: {
    fontSize: 15,
    color: '#4F46E5',
    fontWeight: '500',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  deleteBtnText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  modalBody: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1E293B',
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeBtnActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  typeIncomeActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  typeBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catItemText: {
    fontSize: 14,
    color: '#1E293B',
  },
  storeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  storeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  storeChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  storeChipText: {
    fontSize: 14,
    color: '#64748B',
  },
  storeChipTextActive: {
    color: '#4F46E5',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});