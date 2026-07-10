import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeRouter } from "@/hooks/useSafeRouter";

export default function ForgotPasswordScreen() {
  const { resetPasswordRequest, resetPassword } = useAuth();
  const router = useSafeRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSendCode = async () => {
    setError("");
    if (!account.trim()) {
      setError("请输入注册时的账号");
      return;
    }
    setLoading(true);
    const { error } = await resetPasswordRequest(account.trim());
    setLoading(false);
    if (error) {
      setError("发送失败，请检查账号是否正确");
    } else {
      setSuccess("验证码已发送，请查收");
      setStep("verify");
    }
  };

  const handleResetPassword = async () => {
    setError("");
    if (!code.trim()) {
      setError("请输入验证码");
      return;
    }
    if (newPassword.length < 8) {
      setError("新密码至少8位");
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(account.trim(), code.trim(), newPassword);
    setLoading(false);
    if (error) {
      setError("重置失败，验证码可能已过期");
    } else {
      setSuccess("密码重置成功，请登录");
      setTimeout(() => router.replace("/login"), 1500);
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
                {step === "request" ? "输入账号获取验证码" : "输入验证码和新密码"}
              </Text>
            </View>

            <View className="bg-white rounded-2xl p-6 shadow-sm">
              {error ? (
                <View className="bg-red-50 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm text-center">{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View className="bg-green-50 rounded-xl p-3 mb-4">
                  <Text className="text-green-600 text-sm text-center">{success}</Text>
                </View>
              ) : null}

              {step === "request" ? (
                <>
                  <View className="mb-6">
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
                      returnKeyType="done"
                      onSubmitEditing={handleSendCode}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={loading}
                    className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
                    style={{ opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white text-base font-semibold">
                        发送验证码
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View className="mb-4">
                    <Text className="text-sm font-medium text-[#374151] mb-2">
                      验证码
                    </Text>
                    <TextInput
                      className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                      placeholder="输入6位验证码"
                      placeholderTextColor="#9CA3AF"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="next"
                    />
                  </View>

                  <View className="mb-6">
                    <Text className="text-sm font-medium text-[#374151] mb-2">
                      新密码
                    </Text>
                    <TextInput
                      className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                      placeholder="至少8位新密码"
                      placeholderTextColor="#9CA3AF"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleResetPassword}
                    disabled={loading}
                    className="bg-[#2563EB] rounded-xl py-3.5 items-center mb-4"
                    style={{ opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white text-base font-semibold">
                        重置密码
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setStep("request");
                      setSuccess("");
                      setError("");
                    }}
                    className="py-2 items-center"
                  >
                    <Text className="text-[#6B7280] text-sm">重新发送验证码</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                onPress={() => router.back()}
                className="py-2 items-center mt-2"
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
