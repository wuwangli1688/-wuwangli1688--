import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

function AuthRedirect() {
  const rootState = useRootNavigationState();
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!rootState?.key || isLoading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/');
    }
  }, [rootState?.key, isAuthenticated, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <Provider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AuthRedirect />
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            headerShown: false
          }}
        >
          <Stack.Screen name="login" options={{ title: "登录" }} />
          <Stack.Screen name="register" options={{ title: "注册" }} />
          <Stack.Screen name="account-manage" options={{ title: "子账号管理" }} />
          <Stack.Screen name="review" options={{ title: "审核记录" }} />
          <Stack.Screen name="stores" options={{ title: "店铺管理" }} />
          <Stack.Screen name="share" options={{ title: "分享应用" }} />
          <Stack.Screen name="(tabs)" options={{ title: "" }} />
        </Stack>
        <Toast />
      </AuthProvider>
    </Provider>
  );
}
