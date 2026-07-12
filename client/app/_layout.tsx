import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox, View, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import UpdateChecker from '@/components/UpdateChecker';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

function AuthRedirect() {
  const rootState = useRootNavigationState();
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const lastPath = useRef<string>('');

  useEffect(() => {
    if (!rootState?.key || isLoading) return;

    const currentPath = segments[0] || '';
    // Prevent duplicate navigation to same path
    if (currentPath === lastPath.current) return;
    lastPath.current = currentPath;

    const inAuthGroup =
      currentPath === 'login' ||
      currentPath === 'register' ||
      currentPath === 'forgot-password';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/');
    }
  }, [rootState?.key, isAuthenticated, isLoading, segments, router]);

  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
        }}
      >
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Provider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AuthGate>
          <AuthRedirect />
          <UpdateChecker />
          <Stack
            screenOptions={{
              animation: 'fade',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              headerShown: false,
            }}
          >
            <Stack.Screen name="login" options={{ title: "登录" }} />
            <Stack.Screen name="register" options={{ title: "注册" }} />
            <Stack.Screen name="forgot-password" options={{ title: "找回密码" }} />
            <Stack.Screen name="account-manage" options={{ title: "子账号管理" }} />
            <Stack.Screen name="review" options={{ title: "审核记录" }} />
            <Stack.Screen name="stores" options={{ title: "店铺管理" }} />
            <Stack.Screen name="categories" options={{ title: "项目分类" }} />
            <Stack.Screen name="share" options={{ title: "分享应用" }} />
            <Stack.Screen name="(tabs)" options={{ title: "" }} />
          </Stack>
          <Toast />
        </AuthGate>
      </AuthProvider>
    </Provider>
  );
}
