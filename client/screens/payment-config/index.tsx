import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authFetch } from '@/lib/supabase';
import { useSafeRouter } from '@/hooks/useSafeRouter';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function PaymentConfigScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alipayQrcodeUrl, setAlipayQrcodeUrl] = useState('');
  const [wechatQrcodeUrl, setWechatQrcodeUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/payment-config`);
      if (res.ok) {
        const data = await res.json();
        const config = data.data;
        if (config) {
          setAlipayQrcodeUrl(config.alipay_qrcode_url || '');
          setWechatQrcodeUrl(config.wechat_qrcode_url || '');
          setContactInfo(config.contact_info || '');
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchConfig();
    }, [fetchConfig])
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/payment-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alipay_qrcode_url: alipayQrcodeUrl || null,
          wechat_qrcode_url: wechatQrcodeUrl || null,
          contact_info: contactInfo || '请联系管理员',
        }),
      });
      if (res.ok) {
        Alert.alert('保存成功', '支付配置已更新');
      } else {
        const data = await res.json();
        Alert.alert('保存失败', data.error || '请稍后重试');
      }
    } catch {
      Alert.alert('错误', '网络请求失败');
    } finally {
      setSaving(false);
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

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1 bg-gray-50"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View className="bg-amber-600 px-6 pt-6 pb-10">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3">
              <FontAwesome6 name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text className="text-2xl font-bold text-white">支付配置</Text>
              <Text className="text-amber-200 mt-1">设置收款二维码，用户扫码支付后自动开通</Text>
            </View>
          </View>
        </View>

        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}>
          {/* Alipay QR Code */}
          <View className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <View className="flex-row items-center mb-3">
              <FontAwesome6 name="alipay" size={20} color="#1677FF" />
              <Text className="text-base font-semibold text-gray-900 ml-3">支付宝收款码</Text>
            </View>
            <Text className="text-xs text-gray-500 mb-2">请上传支付宝收款二维码图片链接</Text>
            <TextInput
              className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900 border border-gray-200"
              placeholder="https://example.com/alipay-qrcode.png"
              placeholderTextColor="#9CA3AF"
              value={alipayQrcodeUrl}
              onChangeText={setAlipayQrcodeUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-xs text-gray-400 mt-2">
              提示：将收款码图片上传到图床或服务器，获取图片链接填入
            </Text>
          </View>

          {/* WeChat QR Code */}
          <View className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <View className="flex-row items-center mb-3">
              <FontAwesome6 name="weixin" size={20} color="#07C160" />
              <Text className="text-base font-semibold text-gray-900 ml-3">微信收款码</Text>
            </View>
            <Text className="text-xs text-gray-500 mb-2">请上传微信收款二维码图片链接</Text>
            <TextInput
              className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900 border border-gray-200"
              placeholder="https://example.com/wechat-qrcode.png"
              placeholderTextColor="#9CA3AF"
              value={wechatQrcodeUrl}
              onChangeText={setWechatQrcodeUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-xs text-gray-400 mt-2">
              提示：将收款码图片上传到图床或服务器，获取图片链接填入
            </Text>
          </View>

          {/* Contact Info */}
          <View className="bg-white rounded-2xl shadow-sm p-5 mb-6">
            <View className="flex-row items-center mb-3">
              <FontAwesome6 name="phone" size={20} color="#6B7280" />
              <Text className="text-base font-semibold text-gray-900 ml-3">联系方式</Text>
            </View>
            <Text className="text-xs text-gray-500 mb-2">用户支付遇到问题时的联系信息</Text>
            <TextInput
              className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900 border border-gray-200"
              placeholder="微信号 / 手机号"
              placeholderTextColor="#9CA3AF"
              value={contactInfo}
              onChangeText={setContactInfo}
              autoCapitalize="none"
            />
          </View>

          {/* Save button */}
          <TouchableOpacity
            className={`bg-amber-600 rounded-xl py-3.5 items-center ${saving ? 'opacity-50' : ''}`}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">保存配置</Text>
            )}
          </TouchableOpacity>

          {/* Instructions */}
          <View className="mt-6 bg-blue-50 rounded-xl px-4 py-4">
            <Text className="text-sm font-semibold text-blue-800 mb-2">如何获取收款码图片链接？</Text>
            <Text className="text-xs text-blue-700 leading-5">
              方法一：将收款码图片上传到服务器{'\n'}
              {`  SCP命令: scp /本地路径/收款码.jpg root@118.195.198.69:/tmp/`}{'\n'}
              {`  然后访问: https://wuwanli.online/tmp/收款码.jpg`}{'\n\n'}
              方法二：使用图床服务（如 sm.ms、阿里云OSS等）{'\n\n'}
              方法三：联系开发者帮忙上传
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}