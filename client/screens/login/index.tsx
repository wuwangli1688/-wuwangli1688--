import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, FlatList } from "react-native";
import { Screen } from "@/components/Screen";
import IcpFooter from "@/components/IcpFooter";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "login_history";
const MAX_HISTORY = 5;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useSafeRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const saved = await AsyncStorage.getItem(HISTORY_KEY);
      if (saved) {
        const list = JSON.parse(saved) as string[];
        setHistory(list);
        if (list.length > 0) {
          setAccount(list[0]);
          const savedPwd = await AsyncStorage.getItem(`pwd_${list[0]}`);
          if (savedPwd) {
            setPassword(savedPwd);
            setRememberPassword(true);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoaded(true);
    }
  };

  const saveHistory = async (acc: string, pwd: string) => {
    try {
      const updated = [acc, ...history.filter((h) => h !== acc)].slice(0, MAX_HISTORY);
      setHistory(updated);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

      if (rememberPassword) {
        await AsyncStorage.setItem(`pwd_${acc}`, pwd);
      } else {
        await AsyncStorage.removeItem(`pwd_${acc}`);
      }
    } catch {
      // ignore
    }
  };

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
      await saveHistory(account.trim(), password);
      router.replace("/");
    }
  };

  const handleSelectHistory = (acc: string) => {
    setAccount(acc);
    setShowHistory(false);
    AsyncStorage.getItem(`pwd_${acc}`).then((savedPwd) => {
      if (savedPwd) {
        setPassword(savedPwd);
        setRememberPassword(true);
      } else {
        setPassword("");
        setRememberPassword(false);
      }
    });
  };

  const handleDeleteHistory = async (acc: string) => {
    const updated = history.filter((h) => h !== acc);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    await AsyncStorage.removeItem(`pwd_${acc}`);
    if (account === acc) {
      setAccount("");
      setPassword("");
      setRememberPassword(false);
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
                <View className="relative" style={{ zIndex: 10 }}>
                  <TextInput
                    className="bg-[#F9FAFB] rounded-xl px-4 py-3.5 text-base text-[#111827]"
                    placeholder="手机号 / 邮箱 / 用户名"
                    placeholderTextColor="#9CA3AF"
                    value={account}
                    onChangeText={(text) => {
                      setAccount(text);
                      setShowHistory(false);
                    }}
                    onFocus={() => {
                      if (history.length > 0 && !account) {
                        setShowHistory(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowHistory(false), 200);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="default"
                    returnKeyType="next"
                  />
                  {showHistory && history.length > 0 && (
                    <View
                      className="absolute top-full left-0 right-0 bg-white border border-[#E5E7EB] rounded-xl mt-1 shadow-lg"
                      style={{ maxHeight: 200, zIndex: 20 }}
                    >
                      <FlatList
                        data={history}
                        keyExtractor={(item) => item}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            className="flex-row items-center px-4 py-3 border-b border-[#F3F4F6]"
                            onPress={() => handleSelectHistory(item)}
                          >
                            <Text className="flex-1 text-[#374151] text-base">{item}</Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteHistory(item)}
                              className="p-2"
                            >
                              <Text className="text-[#9CA3AF] text-xs">删除</Text>
                            </TouchableOpacity>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
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

              {/* 记住密码 */}
              <TouchableOpacity
                onPress={() => setRememberPassword(!rememberPassword)}
                className="flex-row items-center mb-4"
              >
                <View
                  className={`w-5 h-5 rounded border-2 items-center justify-center mr-2 ${
                    rememberPassword
                      ? "bg-[#2563EB] border-[#2563EB]"
                      : "border-[#D1D5DB]"
                  }`}
                >
                  {rememberPassword && (
                    <Text className="text-white text-xs font-bold">✓</Text>
                  )}
                </View>
                <Text className="text-[#6B7280] text-sm">记住密码</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                className="self-end mb-4 py-1 -mt-2"
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

              {Platform.OS === 'web' && (
                <View className="mt-6 pt-6 border-t border-[#E5E7EB]">
                  <Text className="text-[#9CA3AF] text-xs text-center mb-3">
                    微信用户也可登录
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/wx-login")}
                    className="flex-row items-center justify-center py-3 rounded-xl border border-[#E5E7EB]"
                  >
                    <Text className="text-[#07C160] text-sm font-medium ml-2">微信账号登录</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
          <IcpFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}