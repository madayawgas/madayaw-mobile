import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import InputField from '../../components/ui/InputField';
import PasswordField from '../../components/ui/PasswordField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import LoginDesign from '../../../assets/svg/login-bg.svg';
import Logo2 from '../../../assets/svg/logo2.svg';
import { loginUser } from '../../services/mockApi';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please enter credentials");
      return;
    }

    setLoading(true);

    try {
      const response = await loginUser(username, password);
      onLogin(response.data);
    } catch (error) {
      Alert.alert("Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-white"
      bounces={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 30 }}
    >
      {/* Top Header Section with SVGs */}
      <View className="relative w-full h-80 bg-white">
        <View className="absolute top-0 left-0 right-0 bottom-0 w-full">
          <LoginDesign width="100%" height="100%" preserveAspectRatio="none" />
        </View>

        <View className="flex-1 items-center justify-center pt-10">
          <Logo2 width={200} height={120} />
        </View>
      </View>

      {/* Form Section */}
      <View className="flex-1 px-8 py-6 items-center">
        <Text className="text-3xl font-bold text-[#0d4761] mb-2">Let’s get started!</Text>
        <Text className="text-[#6b7280] font-medium mb-8">Let’s save lives and properties</Text>

        <InputField
          label="Username"
          placeholder="Enter username"
          value={username}
          onChangeText={setUsername}
        />

        <PasswordField
          label="Password"
          placeholder="Enter password"
          value={password}
          onChangeText={setPassword}
        />

        <PrimaryButton
          title="Log In"
          onPress={handleLogin}
          loading={loading}
        />

        <TouchableOpacity className="mt-auto">
          <Text className="text-[#0d4761] font-semibold text-base">Forgot Password?</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default LoginScreen;
