import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, Alert, Platform, Dimensions,
} from 'react-native';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Screen } from '@/components/Screen';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

const TABS = [
  { key: 'dashboard', label: '总览', icon: 'chart-simple' },
  { key: 'users', label: '用户', icon: 'users' },
  { key: 'feedbacks', label: '反馈', icon: 'comment' },
  { key: 'orders', label: '订单', icon: 'receipt' },
];

type DashboardData = {
  totalUsers: number; parentUsers: number; childUsers: number;
  proSubscriptions: number; totalOrders: number; paidOrders: number;
  totalRevenue: number; monthRevenue: number; totalFeedbacks: number;
  activeToday: number; activeWeek: number;
};

type User = {
  id: string; displayName: string; role: string; roleTitle: string;
  platform: string; createdAt: string;
  subscription: { planType: string; status: string; expiresAt: string; storeLimit: number; subAccountLimit: number } | null;
  stats: { totalTransactions: number; weekTransactions: number; storeCount: number; childCount: number; lastActive: string | null };
};

type Feedback = { id: number; userId: string; userName: string; content: string; contact: string; createdAt: string };
type Order = { id: string; orderId: string; userId: string; userName: string; planType: string; period: string; amount: number; status: string; createdAt: string; paidAt: string | null; activatedAt: string | null };

// ============ 子组件：订阅编辑 Modal ============
function SubscriptionEditModal({ visible, user, onClose, onSave }: {
  visible: boolean; user: User | null; onClose: () => void; onSave: (userId: string, data: any) => void;
}) {
  const [planType, setPlanType] = useState('free');
  const [status, setStatus] = useState('active');
  const [initialized, setInitialized] = useState(false);

  // 当 modal 打开且 user 变化时，重置表单
  if (visible && user && !initialized) {
    setPlanType(user.subscription?.planType || 'free');
    setStatus(user.subscription?.status || 'active');
    setInitialized(true);
  }
  if (!visible && initialized) {
    setInitialized(false);
  }

  if (!user) return null;
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 16 }}>
            编辑订阅 - {user.displayName || user.id.slice(0, 8)}
          </Text>

          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 6 }}>套餐类型</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {['free', 'pro'].map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setPlanType(p)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: planType === p ? '#4F46E5' : '#f3f4f6',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: planType === p ? '#fff' : '#374151', fontWeight: '600' }}>
                  {p === 'free' ? '免费版' : '专业版'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 6 }}>状态</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            {['active', 'canceled', 'expired'].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: status === s ? '#4F46E5' : '#f3f4f6',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: status === s ? '#fff' : '#374151', fontWeight: '600', fontSize: 12 }}>
                  {s === 'active' ? '激活' : s === 'canceled' ? '取消' : '过期'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }}
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSave(user.id, { planType, status })}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#4F46E5', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============ 主页面 ============
export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [searchUser, setSearchUser] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [subEditVisible, setSubEditVisible] = useState(false);

  // Feedbacks
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [feedbacksTotal, setFeedbacksTotal] = useState(0);
  const [fbPage, setFbPage] = useState(1);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [orderFilter, setOrderFilter] = useState('');

  const fetchDashboard = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/dashboard`, { credentials: 'include' });
      const data = await res.json();
      if (data.error) { Alert.alert('错误', data.error); return; }
      setDashboard(data);
    } catch (e: any) {
      console.error('fetchDashboard error:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchUsers = useCallback(async (page = 1, search = '') => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/users?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.error) { Alert.alert('错误', data.error); return; }
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
      setUsersPage(page);
    } catch (e: any) {
      console.error('fetchUsers error:', e);
    }
  }, []);

  const fetchFeedbacks = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/feedbacks?page=${page}&limit=20`, { credentials: 'include' });
      const data = await res.json();
      if (data.error) { Alert.alert('错误', data.error); return; }
      setFeedbacks(data.feedbacks || []);
      setFeedbacksTotal(data.total || 0);
      setFbPage(page);
    } catch (e: any) {
      console.error('fetchFeedbacks error:', e);
    }
  }, []);

  const fetchOrders = useCallback(async (page = 1, status = '') => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/orders?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.error) { Alert.alert('错误', data.error); return; }
      setOrders(data.orders || []);
      setOrdersTotal(data.total || 0);
      setOrdersPage(page);
    } catch (e: any) {
      console.error('fetchOrders error:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'dashboard') fetchDashboard();
      else if (activeTab === 'users') fetchUsers(1, searchUser);
      else if (activeTab === 'feedbacks') fetchFeedbacks(1);
      else if (activeTab === 'orders') fetchOrders(1, orderFilter);
    }, [activeTab])
  );

  const handleUpdateSubscription = async (userId: string, data: any) => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/users/${userId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.error) { Alert.alert('错误', result.error); return; }
      Alert.alert('成功', '订阅已更新');
      setSubEditVisible(false);
      fetchUsers(usersPage, searchUser);
    } catch (e: any) {
      Alert.alert('错误', e.message);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    Alert.alert('确认付款', '确认该订单已付款并激活订阅？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认', onPress: async () => {
          try {
            const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/admin/orders/${orderId}/confirm`, {
              method: 'POST',
              credentials: 'include',
            });
            const result = await res.json();
            if (result.error) { Alert.alert('错误', result.error); return; }
            Alert.alert('成功', result.message || '订单已确认');
            fetchOrders(ordersPage, orderFilter);
          } catch (e: any) {
            Alert.alert('错误', e.message);
          }
        },
      },
    ]);
  };

  const onRefresh = () => {
    if (activeTab === 'dashboard') fetchDashboard();
    else if (activeTab === 'users') fetchUsers(usersPage, searchUser);
    else if (activeTab === 'feedbacks') fetchFeedbacks(fbPage);
    else if (activeTab === 'orders') fetchOrders(ordersPage, orderFilter);
  };

  // ============ 渲染各 Tab 内容 ============

  const renderDashboard = () => {
    if (!dashboard) return <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>加载中...</Text>;
    const cards = [
      { label: '总用户', value: dashboard.totalUsers, icon: 'users', color: '#4F46E5' },
      { label: '主账号', value: dashboard.parentUsers, icon: 'user', color: '#059669' },
      { label: '子账号', value: dashboard.childUsers, icon: 'user-plus', color: '#D97706' },
      { label: '专业版订阅', value: dashboard.proSubscriptions, icon: 'crown', color: '#DC2626' },
      { label: '今日活跃', value: dashboard.activeToday, icon: 'fire', color: '#F97316' },
      { label: '本周活跃', value: dashboard.activeWeek, icon: 'calendar', color: '#8B5CF6' },
      { label: '总订单', value: dashboard.totalOrders, icon: 'receipt', color: '#06B6D4' },
      { label: '总收款', value: `¥${dashboard.totalRevenue}`, icon: 'yen-sign', color: '#059669' },
      { label: '本月收款', value: `¥${dashboard.monthRevenue}`, icon: 'money-bill', color: '#16A34A' },
      { label: '未读反馈', value: dashboard.totalFeedbacks, icon: 'comment', color: '#EC4899' },
    ];

    return (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 }}>
          {cards.map((card, i) => (
            <View key={i} style={{
              width: (SCREEN_WIDTH - 48) / 2,
              backgroundColor: '#fff', borderRadius: 14, padding: 16,
              shadowColor: card.color, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8,
              elevation: 4,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FontAwesome6 name={card.icon as any} size={16} color={card.color} />
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{card.label}</Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#1f2937' }}>{card.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderUsers = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
          <TextInput
            style={{
              flex: 1, height: 40, borderRadius: 10, backgroundColor: '#f3f4f6',
              paddingHorizontal: 14, fontSize: 14,
            }}
            placeholder="搜索用户(名称或ID)"
            value={searchUser}
            onChangeText={setSearchUser}
            onSubmitEditing={() => fetchUsers(1, searchUser)}
          />
          <TouchableOpacity
            onPress={() => fetchUsers(1, searchUser)}
            style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' }}
          >
            <FontAwesome6 name="magnifying-glass" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {users.map((user) => (
            <View key={user.id} style={{ backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1f2937' }}>
                    {user.displayName || '未命名'}
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}> ({user.role === 'parent' ? '主账号' : '子账号'})</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>ID: {user.id.slice(0, 12)}...</Text>
                </View>
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: user.subscription?.planType === 'pro' ? '#FEE2E2' : '#F3F4F6',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: user.subscription?.planType === 'pro' ? '#DC2626' : '#6B7280' }}>
                    {user.subscription?.planType === 'pro' ? '专业版' : '免费版'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                <StatBadge icon="pen" label="记账" value={String(user.stats.totalTransactions)} color="#4F46E5" />
                <StatBadge icon="calendar" label="近7天" value={String(user.stats.weekTransactions)} color="#F97316" />
                <StatBadge icon="store" label="门店" value={String(user.stats.storeCount)} color="#059669" />
                <StatBadge icon="users" label="子账号" value={String(user.stats.childCount)} color="#8B5CF6" />
                <StatBadge icon="clock" label="最后活跃" value={user.stats.lastActive ? new Date(user.stats.lastActive).toLocaleDateString() : '从未'} color="#9CA3AF" />
              </View>

              <TouchableOpacity
                onPress={() => { setEditingUser(user); setSubEditVisible(true); }}
                style={{ marginTop: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, color: '#4F46E5', fontWeight: '600' }}>编辑订阅</Text>
              </TouchableOpacity>
            </View>
          ))}

          {usersTotal > 20 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 16 }}>
              <TouchableOpacity
                onPress={() => fetchUsers(usersPage - 1, searchUser)}
                disabled={usersPage <= 1}
                style={{ padding: 10, opacity: usersPage <= 1 ? 0.4 : 1 }}
              >
                <Text style={{ color: '#4F46E5' }}>上一页</Text>
              </TouchableOpacity>
              <Text style={{ color: '#6b7280', padding: 10 }}>{usersPage} / {Math.ceil(usersTotal / 20)}</Text>
              <TouchableOpacity
                onPress={() => fetchUsers(usersPage + 1, searchUser)}
                disabled={usersPage >= Math.ceil(usersTotal / 20)}
                style={{ padding: 10, opacity: usersPage >= Math.ceil(usersTotal / 20) ? 0.4 : 1 }}
              >
                <Text style={{ color: '#4F46E5' }}>下一页</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <SubscriptionEditModal
          visible={subEditVisible}
          user={editingUser}
          onClose={() => setSubEditVisible(false)}
          onSave={handleUpdateSubscription}
        />
      </View>
    );
  };

  const renderFeedbacks = () => {
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {feedbacks.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>暂无反馈</Text>
        ) : (
          feedbacks.map((fb) => (
            <View key={fb.id} style={{ backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1f2937' }}>{fb.userName}</Text>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(fb.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={{ fontSize: 14, color: '#4b5563', lineHeight: 20 }}>{fb.content}</Text>
              {fb.contact ? (
                <Text style={{ fontSize: 12, color: '#8B5CF6', marginTop: 6 }}>联系方式: {fb.contact}</Text>
              ) : null}
            </View>
          ))
        )}

        {feedbacksTotal > 20 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 16 }}>
            <TouchableOpacity onPress={() => fetchFeedbacks(fbPage - 1)} disabled={fbPage <= 1} style={{ padding: 10, opacity: fbPage <= 1 ? 0.4 : 1 }}>
              <Text style={{ color: '#4F46E5' }}>上一页</Text>
            </TouchableOpacity>
            <Text style={{ color: '#6b7280', padding: 10 }}>{fbPage} / {Math.ceil(feedbacksTotal / 20)}</Text>
            <TouchableOpacity onPress={() => fetchFeedbacks(fbPage + 1)} disabled={fbPage >= Math.ceil(feedbacksTotal / 20)} style={{ padding: 10, opacity: fbPage >= Math.ceil(feedbacksTotal / 20) ? 0.4 : 1 }}>
              <Text style={{ color: '#4F46E5' }}>下一页</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderOrders = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
          {['', 'pending', 'paid'].map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => { setOrderFilter(s); fetchOrders(1, s); }}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: orderFilter === s ? '#4F46E5' : '#f3f4f6',
              }}
            >
              <Text style={{ color: orderFilter === s ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>
                {s === '' ? '全部' : s === 'pending' ? '待付款' : '已付款'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {orders.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>暂无订单</Text>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={{ backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1f2937' }}>{order.userName}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>订单号: {order.orderId}</Text>
                  </View>
                  <View style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                    backgroundColor: order.status === 'paid' ? '#D1FAE5' : '#FEF3C7',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: order.status === 'paid' ? '#059669' : '#D97706' }}>
                      {order.status === 'paid' ? '已付款' : '待付款'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                  <Text style={{ fontSize: 13, color: '#6b7280' }}>
                    {order.planType === 'pro' ? '专业版' : '免费版'} · {order.period === 'year' ? '年付' : '月付'}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#DC2626' }}>¥{order.amount}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(order.createdAt).toLocaleString()}</Text>
                  {order.status === 'pending' && (
                    <TouchableOpacity
                      onPress={() => handleConfirmOrder(order.id)}
                      style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#059669' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>确认收款</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {order.paidAt && (
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>付款时间: {new Date(order.paidAt).toLocaleString()}</Text>
                )}
              </View>
            ))
          )}

          {ordersTotal > 20 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 16 }}>
              <TouchableOpacity onPress={() => fetchOrders(ordersPage - 1, orderFilter)} disabled={ordersPage <= 1} style={{ padding: 10, opacity: ordersPage <= 1 ? 0.4 : 1 }}>
                <Text style={{ color: '#4F46E5' }}>上一页</Text>
              </TouchableOpacity>
              <Text style={{ color: '#6b7280', padding: 10 }}>{ordersPage} / {Math.ceil(ordersTotal / 20)}</Text>
              <TouchableOpacity onPress={() => fetchOrders(ordersPage + 1, orderFilter)} disabled={ordersPage >= Math.ceil(ordersTotal / 20)} style={{ padding: 10, opacity: ordersPage >= Math.ceil(ordersTotal / 20) ? 0.4 : 1 }}>
                <Text style={{ color: '#4F46E5' }}>下一页</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <Screen>
      {/* Tab 栏 */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1, alignItems: 'center', paddingVertical: 12,
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab.key ? '#4F46E5' : 'transparent',
            }}
          >
            <FontAwesome6 name={tab.icon as any} size={16} color={activeTab === tab.key ? '#4F46E5' : '#9ca3af'} />
            <Text style={{ fontSize: 11, marginTop: 4, color: activeTab === tab.key ? '#4F46E5' : '#6b7280', fontWeight: activeTab === tab.key ? '700' : '400' }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 内容区域 */}
      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'feedbacks' && renderFeedbacks()}
      {activeTab === 'orders' && renderOrders()}
    </Screen>
  );
}

function StatBadge({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <FontAwesome6 name={icon as any} size={10} color={color} />
      <Text style={{ fontSize: 11, color: '#6b7280' }}>{label}: <Text style={{ fontWeight: '600', color: '#1f2937' }}>{value}</Text></Text>
    </View>
  );
}