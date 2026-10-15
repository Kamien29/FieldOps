import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, NetworkError, login } from '../api';
import { useAuth } from '../auth';
import { Btn } from '../ui';
import { colors, s } from '../theme';
import { t } from '../strings';

export default function LoginScreen() {
  const { onLoggedIn } = useAuth();
  const [email, setEmail] = useState('jan@fieldops.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await login(email.trim(), password);
      onLoggedIn();
    } catch (e) {
      const msg = e instanceof NetworkError ? t.loginNeedsNetwork
        : e instanceof ApiError && e.status === 401 ? t.invalidCredentials : String(e);
      Alert.alert(t.loginFailed, msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={[s.h1, { fontSize: 28, color: colors.primary, marginBottom: 4 }]}>FieldOps</Text>
        <Text style={[s.muted, { marginBottom: 24 }]}>Mobilny pomocnik serwisanta</Text>
        <View style={{ gap: 12 }}>
          <TextInput style={s.input} placeholder={t.email} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
          <TextInput style={s.input} placeholder={t.password} value={password} onChangeText={setPassword} secureTextEntry />
          <Btn title={t.login} onPress={submit} busy={busy} disabled={!email || !password} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
