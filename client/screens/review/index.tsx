import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { authFetch } from '@/lib/supabase';

interface PendingTransaction {
  id: number;
  amount: string;
  type: string;
  note: string;
  date: string;
  project?: string;
  categories?: { name: string; icon: string; color: string };
  stores?: { name: string };
  user_profiles?: { display_name: string };
  status: string;
  created_at: string;
  pending_edit_data?: {
    amount: string;
    type: string;
    category_id: number;
    note: string | null;
    project: string | null;
    date: string;
    store_id: string | null;
  };
}

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function ReviewScreen() {
  const { role } = useAuth();
  const router = useSafeRouter();
  const [pendingList, setPendingList] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/pending`
      );
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        setPendingList(list);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPending();
    }, [fetchPending])
  );

  const handleApprove = async (id: number) => {
    setProcessingId(id);
    try {
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/review/${id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        }
      );
      if (res.ok) {
        fetchPending();
      }
    } catch {
      Alert.alert('错误', '网络错误');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (item: PendingTransaction) => {
    const isDelete = item.status === 'pending_delete';
    Alert.alert(
      isDelete ? '拒绝删除' : '拒绝记录',
      isDelete ? '确定要拒绝删除请求，保留该记录吗？' : '确定要拒绝这条记录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: isDelete ? '保留记录' : '拒绝',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(item.id);
            try {
              const res = await authFetch(
                `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/review/${item.id}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'reject' }),
                }
              );
              if (res.ok) {
                fetchPending();
              }
            } catch {
              Alert.alert('错误', '网络错误');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  if (role !== 'parent') {
    return (
      <Screen>
        <View style={s.noAccess}>
          <FontAwesome6 name="lock" size={48} color="#94A3B8" />
          <Text style={s.noAccessText}>仅主账号可审核记录</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <Screen>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backArrow}>
          <FontAwesome6 name="arrow-left" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>待审核记录</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : pendingList.length === 0 ? (
        <View style={s.emptyContainer}>
          <FontAwesome6 name="circle-check" size={48} color="#10B981" />
          <Text style={s.emptyText}>暂无待审核记录</Text>
          <Text style={s.emptySubText}>所有记录已处理</Text>
        </View>
      ) : (
        <FlatList
          data={pendingList}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={[s.categoryDot, { backgroundColor: (item.categories?.color || '#6B7280') + '20' }]}>
                  <FontAwesome6
                    name={(item.categories?.icon || 'circle') as any}
                    size={16}
                    color={item.categories?.color || '#6B7280'}
                  />
                </View>
                <View style={s.cardInfo}>
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardCategory}>{item.categories?.name || '未分类'}</Text>
                    {item.status === 'pending_delete' ? (
                      <View style={s.deleteBadge}>
                        <Text style={s.deleteBadgeText}>删除</Text>
                      </View>
                    ) : item.pending_edit_data ? (
                      <View style={s.editBadge}>
                        <Text style={s.editBadgeText}>修改</Text>
                      </View>
                    ) : (
                      <View style={s.newBadge}>
                        <Text style={s.newBadgeText}>新增</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.cardMeta}>
                    {item.user_profiles?.display_name || '未知'} · {formatDate(item.date)}
                  </Text>
                  {item.project ? (
                    <Text style={s.cardProject}>项目: {item.project}</Text>
                  ) : null}
                  {item.note ? <Text style={s.cardNote}>{item.note}</Text> : null}
                </View>
                <Text
                  style={[
                    s.cardAmount,
                    { color: item.type === 'income' ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {item.type === 'income' ? '+' : '-'}¥{parseFloat(item.amount).toFixed(2)}
                </Text>
              </View>
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={[s.actionBtn, s.rejectBtn]}
                  onPress={() => handleReject(item)}
                  disabled={processingId === item.id}
                >
                  <FontAwesome6 name="xmark" size={14} color="#EF4444" />
                  <Text style={s.rejectBtnText}>
                    {item.status === 'pending_delete' ? '保留' : '拒绝'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.approveBtn]}
                  onPress={() => handleApprove(item.id)}
                  disabled={processingId === item.id}
                >
                  {processingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <FontAwesome6 name="check" size={14} color="#fff" />
                      <Text style={s.approveBtnText}>
                        {item.status === 'pending_delete' ? '删除' : '通过'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#64748B', marginTop: 12 },
  emptySubText: { fontSize: 14, color: '#94A3B8' },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  categoryDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardCategory: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  cardMeta: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  cardAmount: { fontSize: 17, fontWeight: '700' },
  cardNote: { fontSize: 13, color: '#64748B', marginTop: 8 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejectBtn: { backgroundColor: '#FEF2F2' },
  rejectBtnText: { fontSize: 14, fontWeight: '500', color: '#EF4444' },
  approveBtn: { backgroundColor: '#2563EB' },
  approveBtnText: { fontSize: 14, fontWeight: '500', color: '#fff' },
cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardProject: { fontSize: 12, color: '#64748B', marginTop: 3 },
  deleteBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deleteBadgeText: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  editBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editBadgeText: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
  newBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
});
