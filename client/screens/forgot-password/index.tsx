import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { Screen } from "@/components/Screen";
import IcpFooter from "@/components/IcpFooter";
import { useSafeRouter } from "@/hooks/useSafeRouter";

/**
 * Convert a flexible account input to a valid email for the backend.
 * Matches the same logic in AuthContext.toSupabaseEmail.
 */
function toEmail(account: string): string {
  const trimmed = account.trim();
  if (trimmed.includes("@") && trimmed.includes(".")) {
    return trimmed.toLowerCase();
  }
  const encoded = encodeURIComponent(trimmed).toLowerCase();
  return `${encoded}@jizhangapp.local`;
}

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function ForgotPasswordScreen() {
  const router = useSafeRouter();

  // Step tracking
  const [step, setStep] = useState<"account" | "reset" | "success">("account");

  // Step 1: Account
  const [account, setAccount] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(false);

  // Step 2: Security question & new password
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingReset, setLoadingReset] = useState(false);

  // Shared error
  const [error, setError] = useState("");

  /** Step 1: Look up the account and get its security question */
  const handleGetSecurityQuestion = async () => {
    setError("");
    if (!account.trim()) {
      setError("请输入账号");
      return;
    }

    setLoadingAccount(true);
    try {
      const email = toEmail(account);
      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/get-security-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError("该账户未设置安全问题，请联系管理员");
        return;
      }

      // Found the security question
      setSecurityQuestion(data.question || "");
      if (!data.question) {
        setError("该账户未设置安全问题，请联系管理员");
        return;
      }
      setStep("reset");
    } catch {
      setError("网络请求失败，请检查网络连接");
    } finally {
      setLoadingAccount(false);
    }
  };

  /** Step 2: Verify answer + set new password */
  const handleResetPassword = async () => {
    setError("");
    if (!securityAnswer.trim()) {
      setError("请输入安全问题答案");
      return;
    }
    if (newPassword.length < 8) {
      setError("新密码至少8位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }

    setLoadingReset(true);
    try {
      const email = toEmail(account);
      const res = await fetch(`${BACKEND_BASE_URL}/api/v1/accounts/reset-password-with-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, answer: securityAnswer.trim(), newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === "WRONG_ANSWER" ? "安全问题答案错误" : (data.error || "重置失败，请重试"));
        return;
      }

      // Success
      setStep("success");
      Alert.alert("密码已重置", "请使用新密码登录");
      setTimeout(() => router.replace("/login"), 1500);
    } catch {
      setError("网络请求失败，请检查网络连接");
    } finally {
      setLoadingReset(false);
    }
  };

  /** Render the form content based on current step */
  const renderFormContent = () => {
    switch (step) {
      case "account":
        return (
          <>
            {/* Step 1: Enter account */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-[#374151] mb-2">账号</Text>
              <TextInput
                className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                placeholder="手机号 / 邮箱 / 用户名"
                placeholderTextColor="#9CA3AF"
                value={account}
                onChangeText={setAccount}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleGetSecurityQuestion}
              />
            </View>

            <TouchableOpacity
              onPress={handleGetSecurityQuestion}
              disabled={loadingAccount}
              className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
              style={{ opacity: loadingAccount ? 0.7 : 1 }}
            >
              {loadingAccount ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-semibold">下一步</Text>
              )}
            </TouchableOpacity>
          </>
        );

      case "reset":
        return (
          <>
            {/* Security question display */}
            <View className="bg-blue-50 rounded-xl p-4 mb-4">
              <Text className="text-sm font-medium text-[#2563EB] mb-1">安全问题</Text>
              <Text className="text-base text-[#111827]">{securityQuestion}</Text>
            </View>

            {/* Security answer */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-[#374151] mb-2">安全问题答案</Text>
              <TextInput
                className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                placeholder="输入您的答案"
                placeholderTextColor="#9CA3AF"
                value={securityAnswer}
                onChangeText={setSecurityAnswer}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* New password */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-[#374151] mb-2">新密码</Text>
              <TextInput
                className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                placeholder="至少8位新密码"
                placeholderTextColor="#9CA3AF"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>

            {/* Confirm password */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-[#374151] mb-2">确认密码</Text>
              <TextInput
                className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                placeholder="再次输入新密码"
                placeholderTextColor="#9CA3AF"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleResetPassword}
              />
            </View>

            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={loadingReset}
              className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
              style={{ opacity: loadingReset ? 0.7 : 1 }}
            >
              {loadingReset ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-semibold">验证并重置密码</Text>
              )}
            </TouchableOpacity>
          </>
        );

      case "success":
        return (
          <View className="items-center py-4">
            <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <Text className="text-green-600 text-3xl">✓</Text>
            </View>
            <Text className="text-lg font-bold text-[#111827] mb-2">密码已重置</Text>
            <Text className="text-[#6B7280] text-sm text-center mb-6">
              请使用新密码登录
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/login")}
              className="bg-[#2563EB] rounded-xl py-3.5 px-10 items-center"
            >
              <Text className="text-white text-base font-semibold">返回登录</Text>
            </TouchableOpacity>
          </View>
        );
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
              <Text className="text-2xl font-bold text-[#111827]">找回密码</Text>
              <Text className="text-[#6B7280] text-sm mt-1">
                {step === "account"
                  ? "输入账号获取安全问题"
                  : step === "reset"
                  ? "回答安全问题并设置新密码"
                  : "密码已成功重置"}
              </Text>
            </View>

            <View className="bg-white rounded-2xl p-6 shadow-sm">
              {error ? (
                <View className="bg-red-50 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm text-center">{error}</Text>
                </View>
              ) : null}

              {renderFormContent()}

              {/* Back to login link (hidden on success page since it has its own button) */}
              {step !== "success" && (
                <TouchableOpacity
                  onPress={() => router.back()}
                  className="py-2 items-center mt-2"
                >
                  <Text className="text-[#6B7280] text-sm">返回登录</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <IcpFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}