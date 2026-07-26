import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/supabase';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface SubscriptionData {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  store_limit: number;
  sub_account_limit: number;
  started_at: string | null;
  expires_at: string | null;
  plan_info: {
    name: string;
    price: number;
    price_yearly: number;
    store_limit: number;
    sub_account_limit: number;
    history_months: number;
    export_enabled: boolean;
    sub_accounts_enabled: boolean;
  };
  usage: {
    stores: number;
    store_limit: number;
    sub_accounts: number;
    sub_account_limit: number;
  };
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [ordering, setOrdering] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/my`);
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSubscription();
    }, [fetchSubscription])
  );

  const handleUpgrade = async () => {
    setOrdering(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_type: 'pro', period }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('下单失败', data.error || '请稍后重试');
        return;
      }

      const price = period === 'monthly' ? '15' : '144';
      const periodText = period === 'monthly' ? '月付' : '年付（8折）';

      Alert.alert(
        '升级到专业版',
        `订单已创建\n\n套餐：${periodText}\n金额：¥${price}\n订单号：${data.data.order.order_id}\n\n请通过以下方式支付：\n\n[支付宝/微信]\n请联系管理员确认开通`,
        [
          { text: '取消', style: 'cancel' },
          { text: '我已支付', onPress: () => handleActivate(data.data.order.order_id) },
        ]
      );
    } catch (err) {
      Alert.alert('错误', '网络请求失败');
    } finally {
      setOrdering(false);
    }
  };

  const handleActivate = async (orderId: string) => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('开通成功', '专业版已激活，感谢您的支持！');
        fetchSubscription();
      } else {
        Alert.alert('激活失败', data.error || '请联系管理员手动开通');
      }
    } catch {
      Alert.alert('错误', '网络请求失败');
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
          <Text className="text-indigo-200 mt-1">管理你的套餐和功能权限</Text>
        </View>

        {/* Current Plan Card */}
        <View className="mx-4 -mt-6 bg-white rounded-2xl shadow-lg p-6">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-gray-500">当前套餐</Text>
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
        </View>

        {/* Usage Stats */}
        <View className="mx-4 mt-4 bg-white rounded-2xl shadow-sm p-6">
          <Text className="text-base font-semibold text-gray-900 mb-4">使用情况</Text>
          <View className="flex-row">
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
              <Text className="text-2xl font-bold text-gray-900">
                {isPro ? '不限' : '3个月'}
              </Text>
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
            <View
              key={item.label}
              className={`flex-row items-center px-6 py-3.5 ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}
            >
              <FontAwesome6 name={item.icon as any} size={14} color="#6B7280" style={{ width: 20 }} />
              <Text className="flex-1 text-sm text-gray-700 ml-3">{item.label}</Text>
              <Text className={`text-xs mr-4 w-20 text-center ${isPro ? 'text-gray-400' : 'text-gray-900'}`}>
                {item.free}
              </Text>
              <Text className={`text-xs w-24 text-center ${isPro ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>
                {item.pro}
              </Text>
            </View>
          ))}
        </View>

        {/* Upgrade Section (for free users) */}
        {!isPro && (
          <View className="mx-4 mt-6 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-4">升级到专业版</Text>

            {/* Period toggle */}
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg ${period === 'monthly' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => setPeriod('monthly')}
              >
                <Text className={`text-center text-sm font-medium ${period === 'monthly' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  月付
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg ${period === 'yearly' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => setPeriod('yearly')}
              >
                <Text className={`text-center text-sm font-medium ${period === 'yearly' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  年付
                  <Text className="text-xs text-green-500"> 省¥36</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Price display */}
            <View className="items-center py-4">
              <Text className="text-4xl font-bold text-gray-900">
                ¥{period === 'monthly' ? '15' : '144'}
                <Text className="text-base font-normal text-gray-500">/{period === 'monthly' ? '月' : '年'}</Text>
              </Text>
              {period === 'yearly' && (
                <Text className="text-sm text-green-500 mt-1">相当于 ¥12/月，节省 ¥36</Text>
              )}
            </View>

            {/* Upgrade button */}
            <TouchableOpacity
              className={`bg-indigo-600 rounded-xl py-3.5 items-center ${ordering ? 'opacity-50' : ''}`}
              onPress={handleUpgrade}
              disabled={ordering}
            >
              {ordering ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">立即升级</Text>
              )}
            </TouchableOpacity>

            <Text className="text-xs text-gray-400 text-center mt-3">
              支付后请联系管理员确认开通，或稍后自动激活
            </Text>
          </View>
        )}

        {/* Pro user info */}
        {isPro && (
          <View className="mx-4 mt-6 bg-indigo-50 rounded-2xl p-6">
            <View className="flex-row items-center">
              <FontAwesome6 name="crown" size={20} color="#4F46E5" solid />
              <Text className="text-base font-semibold text-indigo-900 ml-3">感谢你的支持！</Text>
            </View>
            <Text className="text-sm text-indigo-700 mt-2 leading-5">
              你正在使用专业版，享受全部功能。到期后自动降级为免费版。
            </Text>
          </View>
        )}

        {/* Sub-account pricing info */}
        {isPro && (
          <View className="mx-4 mt-4 bg-white rounded-2xl shadow-sm p-6">
            <Text className="text-base font-semibold text-gray-900 mb-2">子账号说明</Text>
            <Text className="text-sm text-gray-600 leading-5">
              专业版主账号可创建不限数量的子账号。子账号按 ¥5/月/个 收费，费用已包含在专业版订阅中。
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}