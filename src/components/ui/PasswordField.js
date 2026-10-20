import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PasswordField = ({ label, placeholder, value, onChangeText }) => {
  const [isSecure, setIsSecure] = useState(true);
  return (
    <View className="mb-6 w-full">
      <Text className="text-[#0d4761] font-bold mb-2">{label}</Text>
      <View className="flex-row items-center bg-[#f4f5f7] rounded-xl px-4">
        <TextInput
          className="flex-1 py-4 text-[#0d4761]"
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={() => setIsSecure(!isSecure)}>
          <Ionicons name={isSecure ? "eye-off" : "eye"} size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </View>
  );
};
export default PasswordField;