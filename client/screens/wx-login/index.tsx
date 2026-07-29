import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { useAuth } from "@/contexts/AuthContext";

const EXPO_PUBLIC_BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "";

export default function WxLoginScreen() {
  const router = useSafeRouter();
  const { signIn } = useAuth();
  const [openid, setOpenid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleWxLogin = async () => {
    if (!openid.trim()) {
      setError("请输入微信账号ID");
      return;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const virtualEmail = `${openid.trim()}@wechat.local`;
      const wxPassword = `wx_${openid.trim()}_pwd_2024`;

      const res = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/wx-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: virtualEmail,
            password: wxPassword,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败，请检查账号和密码");
        return;
      }

      await signIn(data.access_token, data.refresh_token);
      router.replace("/");
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          className="flex-1 bg-[#F3F4F6]"
        >
          <View className="flex-1 justify-center px-6 py-12">
            <View className="items-center mb-10">
              <View className="w-16 h-16 bg-[#07C160] rounded-2xl items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">微</Text>
              </View>
              <Text className="text-2xl font-bold text-[#111827]">微信账号登录</Text>
              <Text className="text-[#6B7280] text-sm mt-1">使用微信小程序账号登录</Text>
            </View>

            <View className="bg-white rounded-2xl p-6 shadow-sm">
              {error ? (
                <View className="bg-red-50 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm text-center">{error}</Text>
                </View>
              ) : null}

              {/* 提示信息 */}
              <View className="bg-[#F0FDF4] rounded-xl p-3 mb-4 border border-[#BBF7D0]">
                <Text className="text-[#166534] text-sm leading-5">
                  如果您已经在微信小程序注册过账号，可以在这里登录。
                  您的微信账号ID可以在小程序「个人中心」页面查看。
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  微信账号ID
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="请输入微信账号ID"
                  placeholderTextColor="#9CA3AF"
                  value={openid}
                  onChangeText={setOpenid}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  密码
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="输入密码"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleWxLogin}
                />
              </View>

              <TouchableOpacity
                onPress={handleWxLogin}
                disabled={loading}
                className="bg-[#07C160] rounded-xl py-3.5 items-center mb-4"
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-base font-semibold">登录</Text>
                )}
              </TouchableOpacity>

              <View className="flex-row justify-center items-center gap-2">
                <Text className="text-[#6B7280] text-sm">
                  还没有微信账号？
                </Text>
                <TouchableOpacity onPress={() => router.push("/register")}>
                  <Text className="text-[#07C160] text-sm font-medium">
                    注册新账号
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="mt-4 pt-4 border-t border-[#E5E7EB]">
                <Text className="text-[#9CA3AF] text-xs text-center leading-5">
                  提示：如果您已在微信小程序使用过「即时记账」，可以直接在微信小程序
                  「个人中心」→「账号绑定」中设置密码，然后使用账号和密码在此登录。
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push("/login")}
              className="mt-4 items-center py-2"
            >
              <Text className="text-[#6B7280] text-sm">
                返回账号密码登录
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}