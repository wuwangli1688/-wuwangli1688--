import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeRouter } from "@/hooks/useSafeRouter";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useSafeRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!account.trim()) {
      setError("请输入账号");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }

    setLoading(true);
    const { error } = await signIn(account.trim(), password);
    setLoading(false);

    if (error) {
      if (error.includes("Invalid") || error.includes("credentials")) {
        setError("账号或密码错误");
      } else {
        setError("登录失败，请重试");
      }
    } else {
      router.replace("/");
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
              <View className="w-16 h-16 bg-[#2563EB] rounded-2xl items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">记</Text>
              </View>
              <Text className="text-2xl font-bold text-[#111827]">收支记账</Text>
              <Text className="text-[#6B7280] text-sm mt-1">登录您的账号</Text>
            </View>

            <View className="bg-white rounded-2xl p-6 shadow-sm">
              {error ? (
                <View className="bg-red-50 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm text-center">{error}</Text>
                </View>
              ) : null}

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  账号
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="手机号 / 邮箱 / 用户名"
                  placeholderTextColor="#9CA3AF"
                  value={account}
                  onChangeText={setAccount}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  returnKeyType="next"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  密码
                </Text>
                <View className="relative">
                  <TextInput
                    className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 pr-12 text-base text-[#111827]"
                    placeholder="输入密码"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 p-1"
                  >
                    <Text className="text-[#9CA3AF] text-sm">
                      {showPassword ? "隐藏" : "显示"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                className="self-end mb-4 py-1"
              >
                <Text className="text-[#2563EB] text-sm">忘记密码？</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-base font-semibold">登录</Text>
                )}
              </TouchableOpacity>

              <View className="flex-row justify-center items-center gap-2">
                <Text className="text-[#6B7280] text-sm">还没有账号？</Text>
                <TouchableOpacity onPress={() => router.push("/register")}>
                  <Text className="text-[#2563EB] text-sm font-medium">立即注册</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
