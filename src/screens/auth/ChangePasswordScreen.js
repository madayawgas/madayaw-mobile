import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PasswordField from '../../components/ui/PasswordField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import LoginDesign from '../../../assets/svg/login-bg.svg';
import Logo2 from '../../../assets/svg/logo2.svg';
import { authService } from '../../services/authService';
import { useBackHandler } from '../../hooks/useBackHandler';

const ChangePasswordScreen = ({ user, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isMinLength = newPassword.length >= 8;
  const isMatching = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Incomplete Form', 'Please enter and confirm your new password.');
      return;
    }

    if (!isMinLength) {
      Alert.alert('Password Too Short', 'Your new password must be at least 8 characters long.');
      return;
    }

    if (!isMatching) {
      Alert.alert('Passwords Do Not Match', 'The confirmation password does not match the new password.');
      return;
    }

    setLoading(true);

    try {
      await authService.changePassword(newPassword);

      Alert.alert(
        'Password Changed',
        'Your password has been changed successfully. Please log in with your new password to continue.',
        [
          {
            text: 'Log In',
            onPress: async () => {
              try {
                await authService.clearSession('logout');
              } catch (_e) {
                // ignore
              }
              if (onLogout) {
                onLogout();
              }
            },
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      Alert.alert(
        'Update Failed',
        error.message || 'Unable to update password. Please check your internet connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLogout = () => {
    Alert.alert(
      'Log Out?',
      'You are logging in with a temporary password. If you exit now, you will need to log in again before accessing the system.',
      [
        { text: 'Stay Here', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.clearSession('logout');
            } catch (_e) {
              // ignore
            }
            if (onLogout) {
              onLogout();
            }
          },
        },
      ]
    );
  };

  useBackHandler(() => {
    handleCancelLogout();
    return true;
  }, true);

  const userRole = user?.role || (user?.roleNames && user?.roleNames[0]) || 'Operator';
  const username = user?.username || 'User';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 bg-white"
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
      >
        {/* Header Branding */}
        <View className="relative w-full h-56 bg-white">
          <View className="absolute top-0 left-0 right-0 bottom-0 w-full">
            <LoginDesign width="100%" height="100%" preserveAspectRatio="none" />
          </View>

          <View className="flex-1 items-center justify-center pt-6">
            <Logo2 width={180} height={90} />
          </View>
        </View>

        {/* Security Alert Header */}
        <View className="px-6 pt-2 pb-4">
          <View className="flex-row items-center mb-2">
            <View className="w-10 h-10 rounded-full bg-[#fef3c7] items-center justify-center mr-3">
              <Ionicons name="key-outline" size={22} color="#b45309" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-[#0d4761]">Change Password</Text>
              <Text className="text-xs font-semibold text-[#b45309] uppercase tracking-wider">
                First Login Requirement
              </Text>
            </View>
          </View>

          <Text className="text-[#4b5563] text-sm leading-5 mt-1">
            Your account was initialized with a temporary password. To secure your account, you must create a new password before accessing system operations.
          </Text>

          {/* User Identity Pill */}
          <View className="flex-row items-center bg-[#f4f5f7] rounded-xl px-4 py-3 mt-4 border border-[#e5e7eb]">
            <Ionicons name="person-circle-outline" size={24} color="#0d4761" />
            <View className="ml-2.5 flex-1">
              <Text className="text-xs text-[#6b7280] font-medium">Logged in as</Text>
              <Text className="text-sm font-bold text-[#0d4761]">
                {username} <Text className="text-xs font-normal text-[#6b7280]">({userRole})</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Password Form */}
        <View className="px-6 pt-2">
          <PasswordField
            label="New Password"
            placeholder="Enter new password (min. 8 characters)"
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <PasswordField
            label="Confirm New Password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {/* Dynamic Validation Checklist */}
          <View className="bg-[#f9fafb] p-3.5 rounded-xl border border-[#e5e7eb] mb-6">
            <Text className="text-xs font-bold text-[#374151] mb-2 uppercase tracking-wide">
              Password Requirements
            </Text>

            <View className="flex-row items-center mb-1.5">
              <Ionicons
                name={isMinLength ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={isMinLength ? '#16a34a' : '#9ca3af'}
              />
              <Text
                className={`text-xs ml-2 font-medium ${
                  isMinLength ? 'text-[#16a34a]' : 'text-[#6b7280]'
                }`}
              >
                At least 8 characters
              </Text>
            </View>

            <View className="flex-row items-center">
              <Ionicons
                name={isMatching ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={isMatching ? '#16a34a' : '#9ca3af'}
              />
              <Text
                className={`text-xs ml-2 font-medium ${
                  isMatching ? 'text-[#16a34a]' : 'text-[#6b7280]'
                }`}
              >
                Passwords match
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <PrimaryButton
            title="SET NEW PASSWORD"
            onPress={handleChangePassword}
            loading={loading}
          />

          <View className="mt-2">
            <PrimaryButton
              title="CANCEL & LOG OUT"
              variant="outline"
              borderColor="border-[#DFE8EF]"
              onPress={handleCancelLogout}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ChangePasswordScreen;
