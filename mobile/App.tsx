import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import type { RootStackParamList } from './src/nav';
import { AuthContext } from './src/auth';
import { SyncProvider } from './src/SyncContext';
import { pendingCount, wipeLocalData } from './src/db';
import { colors } from './src/theme';
import { t } from './src/strings';
import LoginScreen from './src/screens/LoginScreen';
import JobListScreen from './src/screens/JobListScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';
import ScanScreen from './src/screens/ScanScreen';
import SignatureScreen from './src/screens/SignatureScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('token')
      .then((tok) => setLoggedIn(!!tok))
      .finally(() => setReady(true));
  }, []);

  const logout = useCallback(async (force = false) => {
    if (!force && (await pendingCount()) > 0) {
      Alert.alert(t.logoutBlockedTitle, t.logoutBlockedBody);
      return;
    }
    await SecureStore.deleteItemAsync('token');
    await wipeLocalData();
    setLoggedIn(false);
  }, []);

  const auth = useMemo(
    () => ({ logout, onLoggedIn: () => setLoggedIn(true) }),
    [logout],
  );

  if (!ready) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthContext.Provider value={auth}>
        <NavigationContainer>
          {loggedIn ? (
            <SyncProvider onAuthExpired={() => logout(true)}>
              <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}>
                <Stack.Screen name="Jobs" component={JobListScreen} options={{ title: t.jobsTitle }} />
                <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: t.jobTitle }} />
                <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t.scanTitle }} />
                <Stack.Screen name="Signature" component={SignatureScreen} options={{ title: t.signatureTitle }} />
              </Stack.Navigator>
            </SyncProvider>
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Login" component={LoginScreen} />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
