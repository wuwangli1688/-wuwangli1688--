import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, Platform, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/supabase';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface UsageInfo {
  stores: number;
  store_limit: number;
  sub_accounts: number;
  sub_account_limit: number;
}

interface SubscriptionData {
  plan_type: string;
  status: string;
  expires_at: string | null;
  plan_info: {
    name: string;
    price: number;
    store_limit: number;
    sub_account_limit: number;
    history_months: number;
    export_enabled: boolean;
    sub_accounts_enabled: boolean;
  };
  usage: UsageInfo;
}

interface OrderRecord {
  order_id: string;
  plan_type: string;
  period: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  paid_at: string | null;
}

interface SubAccountSub {
  id: string;
  email: string;
  display_name: string;
  plan_type: string;
  status: string;
  expires_at: string | null;
}

export default function SubscriptionScreen() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccountSub[]>([]);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [ordering, setOrdering] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [showAlipay, setShowAlipay] = useState(true);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [cartType, setCartType] = useState<'self' | 'sub' | 'multi-store'>('self');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [subRes, ordersRes, subsRes] = await Promise.all([
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/my`),
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/orders`),
        role === 'parent'
          ? authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/sub-accounts`)
          : Promise.resolve(null),
      ]);
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscription(data.data);
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.data || []);
      }
      if (subsRes && subsRes.ok) {
        const data = await subsRes.json();
        setSubAccounts(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleUpgrade = async (targetUserId?: string) => {
    setOrdering(true);
    try {
      const body: any = { plan_type: 'pro', period };
      if (targetUserId) body.target_user_id = targetUserId;

      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('下单失败', data.error || '请稍后重试');
        return;
      }

      setPaymentInfo(data.data);
      setShowAlipay(true);
      setPaymentModalVisible(true);
    } catch {
      Alert.alert('错误', '网络请求失败');
    } finally {
      setOrdering(false);
    }
  };

  const handlePurchaseMultiStore = async () => {
    setOrdering(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_type: 'pro', period, item: 'multi-store' }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('下单失败', data.error || '请稍后重试');
        return;
      }
      setPaymentInfo(data.data);
      setShowAlipay(true);
      setPaymentModalVisible(true);
    } catch {
      Alert.alert('错误', '网络请求失败');
    } finally {
      setOrdering(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentInfo) return;
    setConfirming(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: paymentInfo.order_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setPaymentModalVisible(false);
        setPaymentInfo(null);
        Alert.alert('开通成功', '已成功开通！');
        fetchAll();
      } else {
        Alert.alert('激活失败', data.error || '请联系管理员手动开通');
      }
    } catch {
      Alert.alert('错误', '网络请求失败');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </Screen>
    );
  }

  const isPro = subscription?.plan_type === 'pro';
  const isExpired = subscription?.status === 'expired';

  return (
    <Screen>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="bg-indigo-600 px-6 pt-6 pb-10">
          <Text className="text-2xl font-bold text-white">订阅管理</Text>
          <Text className="text-indigo-200 mt-1">查看订阅信息和使用情况</Text>
        </View>

        {/* Current Plan Card */}
        <View className="mx-4 -mt-6 bg-white rounded-2xl shadow-lg p-6">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-gray-500">我的套餐</Text>
              <Text className="text-2xl font-bold mt-1" style={{ color: isPro ? '#4F46E5' : '#6B7280' }}>
                {isPro ? '专业版' : isExpired ? '已过期' : '免费版'}
              </Text>
            </View>
            <View className={`w-14 h-14 rounded-full items-center justify-center ${isPro ? 'bg-indigo-100' : 'bg-gray-100'}`}>
              <FontAwesome6 name={isPro ? 'crown' : 'user'} size={24} color={isPro ? '#4F46E5' : '#9CA3AF'} solid={isPro} />
            </View>
          </View>

          {isPro && subscription?.expires_at && (
            <View className="mt-3 bg-indigo-50 rounded-xl px-4 py-3">
              <Text className="text-sm text-indigo-700">
                有效期至：{new Date(subscription.expires_at).toLocaleDateString('zh-CN')}
              </Text>
            </View>
          )}
          {isExpired && (
            <View className="mt-3 bg-red-50 rounded-xl px-4 py-3">
              <Text className="text-sm text-red-600">套餐已过期，请续费以继续使用全部功能</Text>
            </View>
          )}

          {/* Usage */}
          <View className="flex-row mt-4 pt-4 border-t border-gray-100">
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-gray-900">{subscription?.usage.stores || 0}</Text>
              <Text className="text-xs text-gray-500 mt-1">门店 / {isPro ? '不限' : subscription?.usage.store_limit || 1}</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-gray-900">{subscription?.usage.sub_accounts || 0}</Text>
              <Text className="text-xs text-gray-500 mt-1">子账号 / {isPro ? '不限' : subscription?.usage.sub_account_limit || 0}</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="flex-1 items-center">
              <Text className="text-2xl font-bold text-gray-900">{isPro ? '不限' : '3个月'}</Text>
              <Text className="text-xs text-gray-500 mt-1">历史查询</Text>
            </View>
          </View>
        </View>

        {/* Feature Comparison */}
        <View className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
          <View className="px-6 py-4 border-b border-gray-100">
            <Text className="text-base font-semibold text-gray-900">功能对比</Text>
          </View>
          {[
            { icon: 'pen-to-square', label: '基础记账', free: '✓ 不限', pro: '✓ 不限' },
            { icon: 'chart-simple', label: '统计报表', free: '近3个月', pro: '✓ 全部历史' },
            { icon: 'store', label: '多门店管理', free: '1个门店', pro: '✓ 不限' },
            { icon: 'users', label: '子账号', free: '✗ 不支持', pro: '✓ 不限数量' },
            { icon: 'file-export', label: '数据导出', free: '✗', pro: '✓ Excel导出' },
            { icon: 'check-to-slot', label: '审核功能', free: '✗', pro: '✓' },
            { icon: 'cloud', label: '数据同步', free: '✓', pro: '✓' },
          ].map((item, i) => (
            <View key={item.label} className={`flex-row items-center px-6 py-3.5 ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
              <FontAwesome6 name={item.icon as any} size={14} color="#6B7280" style={{ width: 20 }} />
              <Text className="flex-1 text-sm text-gray-700 ml-3">{item.label}</Text>
              <Text className={`text-xs mr-4 w-20 text-center ${isPro ? 'text-gray-400' : 'text-gray-900'}`}>{item.free}</Text>
              <Text className={`text-xs w-24 text-center ${isPro ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>{item.pro}</Text>
            </View>
          ))}
        </View>

        {/* ---- Upgrade Section ---- */}
        {!isPro && (
          <View className="mx-4 mt-6 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-4">升级到专业版</Text>
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg ${period === 'monthly' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => setPeriod('monthly')}
              >
                <Text className={`text-center text-sm font-medium ${period === 'monthly' ? 'text-indigo-600' : 'text-gray-500'}`}>月付</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg ${period === 'yearly' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => setPeriod('yearly')}
              >
                <Text className={`text-center text-sm font-medium ${period === 'yearly' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  年付 <Text className="text-xs text-green-500">省¥36</Text>
                </Text>
              </TouchableOpacity>
            </View>
            <View className="items-center py-4">
              <Text className="text-4xl font-bold text-gray-900">
                ¥{period === 'monthly' ? '15' : '144'}
                <Text className="text-base font-normal text-gray-500">/{period === 'monthly' ? '月' : '年'}</Text>
              </Text>
              {period === 'yearly' && <Text className="text-sm text-green-500 mt-1">相当于 ¥12/月，节省 ¥36</Text>}
            </View>
            <TouchableOpacity
              className={`bg-indigo-600 rounded-xl py-3.5 items-center ${ordering ? 'opacity-50' : ''}`}
              onPress={() => handleUpgrade()}
              disabled={ordering}
            >
              {ordering ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">立即升级</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Main Account: Multi-Store & Sub-Account Upgrades ---- */}
        {role === 'parent' && isPro && (
          <View className="mx-4 mt-6 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-4">增值服务</Text>
            <TouchableOpacity
              className="flex-row items-center bg-orange-50 rounded-xl p-4 mb-3"
              onPress={handlePurchaseMultiStore}
              disabled={ordering}
            >
              <FontAwesome6 name="store" size={20} color="#EA580C" />
              <View className="ml-3 flex-1">
                <Text className="text-sm font-medium text-gray-900">购买多店铺功能</Text>
                <Text className="text-xs text-gray-500 mt-0.5">解锁不限门店数量</Text>
              </View>
              <Text className="text-sm font-bold text-orange-600">¥{period === 'monthly' ? '15' : '144'}</Text>
            </TouchableOpacity>

            {subAccounts.length > 0 && (
              <>
                <Text className="text-sm font-semibold text-gray-900 mb-3">帮子账号升级</Text>
                {subAccounts.map((sub) => (
                  <View key={sub.id} className="flex-row items-center bg-gray-50 rounded-xl p-3 mb-2">
                    <FontAwesome6 name="user" size={16} color="#6B7280" />
                    <View className="ml-3 flex-1">
                      <Text className="text-sm text-gray-900">{sub.display_name || sub.email}</Text>
                      <Text className={`text-xs mt-0.5 ${sub.plan_type === 'pro' ? 'text-indigo-500' : 'text-gray-400'}`}>
                        {sub.plan_type === 'pro' ? '专业版' : '免费版'}
                      </Text>
                    </View>
                    {sub.plan_type !== 'pro' && (
                      <TouchableOpacity
                        className="bg-indigo-600 px-4 py-1.5 rounded-lg"
                        onPress={() => handleUpgrade(sub.id)}
                        disabled={ordering}
                      >
                        <Text className="text-white text-xs font-medium">帮升级</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ---- Sub-Accounts' Subscriptions (Main Account view) ---- */}
        {role === 'parent' && subAccounts.length > 0 && (
          <View className="mx-4 mt-6 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-4">子账号订阅情况</Text>
            {subAccounts.map((sub) => (
              <View key={sub.id} className="flex-row items-center border-b border-gray-100 py-3 last:border-0">
                <FontAwesome6 name="user" size={16} color="#6B7280" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm text-gray-900">{sub.display_name || sub.email}</Text>
                  <Text className="text-xs text-gray-500 mt-0.5">
                    {sub.plan_type === 'pro' ? '专业版' : '免费版'}
                    {sub.expires_at ? ` · 到期 ${new Date(sub.expires_at).toLocaleDateString('zh-CN')}` : ''}
                  </Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${sub.plan_type === 'pro' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <Text className={`text-xs ${sub.plan_type === 'pro' ? 'text-indigo-600' : 'text-gray-500'}`}>
                    {sub.plan_type === 'pro' ? '专业版' : '免费版'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---- Purchase History ---- */}
        {orders.length > 0 && (
          <View className="mx-4 mt-6 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-4">购买记录</Text>
            {orders.map((order) => (
              <View key={order.order_id} className="border-b border-gray-100 py-3 last:border-0">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-900">{order.description || '专业版升级'}</Text>
                  <Text className="text-sm font-semibold text-gray-900">¥{order.amount}</Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Text className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('zh-CN')}</Text>
                  <View className={`ml-2 px-2 py-0.5 rounded-full ${order.status === 'paid' ? 'bg-green-100' : 'bg-yellow-100'}`}>
                    <Text className={`text-xs ${order.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {order.status === 'paid' ? '已付款' : '待付款'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Pro user thank you */}
        {isPro && (
          <View className="mx-4 mt-6 bg-indigo-50 rounded-2xl p-6">
            <View className="flex-row items-center">
              <FontAwesome6 name="crown" size={20} color="#4F46E5" solid />
              <Text className="text-base font-semibold text-indigo-900 ml-3">感谢你的支持！</Text>
            </View>
            <Text className="text-sm text-indigo-700 mt-2 leading-5">你正在使用专业版，享受全部功能。</Text>
          </View>
        )}
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === 'web'}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="flex-1 bg-black/50 justify-end">
              <View className="bg-white rounded-t-3xl p-6" style={{ paddingBottom: 40 }}>
                <View className="items-center mb-6">
                  <View className="w-12 h-1 bg-gray-300 rounded-full mb-4" />
                  <Text className="text-lg font-bold text-gray-900">扫码支付</Text>
                  <Text className="text-sm text-gray-500 mt-1">
                    应付金额：<Text className="font-bold text-indigo-600">¥{paymentInfo?.amount || 0}</Text>
                  </Text>
                </View>

                {/* Payment method tabs */}
                <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
                  <TouchableOpacity
                    className={`flex-1 py-2.5 rounded-lg ${showAlipay ? 'bg-white shadow-sm' : ''}`}
                    onPress={() => setShowAlipay(true)}
                  >
                    <Text className={`text-center text-sm font-medium ${showAlipay ? 'text-indigo-600' : 'text-gray-500'}`}>支付宝</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 py-2.5 rounded-lg ${!showAlipay ? 'bg-white shadow-sm' : ''}`}
                    onPress={() => setShowAlipay(false)}
                  >
                    <Text className={`text-center text-sm font-medium ${!showAlipay ? 'text-indigo-600' : 'text-gray-500'}`}>微信</Text>
                  </TouchableOpacity>
                </View>

                {/* QR Code or instructions */}
                <View className="items-center py-4">
                  <View className="bg-gray-100 w-40 h-40 rounded-xl items-center justify-center mb-3">
                    <FontAwesome6 name="qrcode" size={60} color="#4F46E5" />
                  </View>
                  <Text className="text-xs text-gray-500 text-center leading-5">
                    请使用{showAlipay ? '支付宝' : '微信'}扫码支付{paymentInfo?.note || ''}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-2">支付后请点击下方确认按钮</Text>
                </View>

                <TouchableOpacity
                  className={`bg-green-600 rounded-xl py-3.5 items-center mb-3 ${confirming ? 'opacity-50' : ''}`}
                  onPress={handleConfirmPayment}
                  disabled={confirming}
                >
                  {confirming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold text-base">已付款，确认开通</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity className="py-3 items-center" onPress={() => setPaymentModalVisible(false)}>
                  <Text className="text-gray-500 text-sm">取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </Screen>
  );
}