import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/supabase";
import { useSafeRouter } from "@/hooks/useSafeRouter";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useSafeRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    setError("");
    const trimmedAccount = account.trim();
    const trimmedQuestion = securityQuestion.trim();
    const trimmedAnswer = securityAnswer.trim();

    if (!trimmedAccount) {
      setError("请输入账号（手机号/邮箱/用户名）");
      return;
    }
    if (password.length < 8) {
      setError("密码至少8位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (!trimmedQuestion) {
      setError("请设置安全问题");
      return;
    }
    if (!trimmedAnswer) {
      setError("请填写安全问题答案");
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(trimmedAccount, password);
    setLoading(false);

    if (signUpError) {
      setError(signUpError.includes("already") ? "该账号已被注册" : "注册失败，请重试");
      return;
    }

    // After successful signUp, save the security question
    setLoading(true);
    try {
      const res = await authFetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/accounts/set-security-question`,
        {
          method: "POST",
          body: JSON.stringify({ question: trimmedQuestion, answer: trimmedAnswer }),
        }
      );

      if (!res.ok) {
        setError("注册成功，但安全问题保存失败，请稍后重试");
        return;
      }
    } catch {
      setError("注册成功，但安全问题保存失败，请稍后重试");
      return;
    } finally {
      setLoading(false);
    }

    Alert.alert("注册成功", "请牢记您的安全问题，用于找回密码");
    router.replace("/");
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
              <Text className="text-2xl font-bold text-[#111827]">创建账号</Text>
              <Text className="text-[#6B7280] text-sm mt-1">注册主账号，开始记账</Text>
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
                <Text className="text-xs text-[#9CA3AF] mt-1.5 ml-1">
                  支持手机号、邮箱或任意用户名
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  密码
                </Text>
                <View className="relative">
                  <TextInput
                    className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 pr-12 text-base text-[#111827]"
                    placeholder="至少8位密码"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
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

              <View className="mb-6">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  确认密码
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="再次输入密码"
                  placeholderTextColor="#9CA3AF"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  安全问题
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="设置安全问题（如：您最喜欢的颜色是什么？）"
                  placeholderTextColor="#9CA3AF"
                  value={securityQuestion}
                  onChangeText={setSecurityQuestion}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View className="mb-6">
                <Text className="text-sm font-medium text-[#374151] mb-2">
                  安全问题答案
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                  placeholder="请填写安全问题答案"
                  placeholderTextColor="#9CA3AF"
                  value={securityAnswer}
                  onChangeText={setSecurityAnswer}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
              </View>

              <TouchableOpacity
                onPress={handleRegister}
                disabled={loading}
                className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-base font-semibold">注册</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                className="py-2 items-center"
              >
                <Text className="text-[#6B7280] text-sm">返回登录</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
