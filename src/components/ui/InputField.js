import React from 'react';
import { View, Text, TextInput } from 'react-native';

const InputField = ({ label, placeholder, value, onChangeText, error, ...props }) => {
  return (
    <View className="mb-4 w-full">
      {label ? <Text className="text-[#0d4761] font-bold mb-2">{label}</Text> : null}
      <TextInput
        className={`bg-[#f4f5f7] px-4 py-4 rounded-xl text-[#0d4761] w-full ${
          error ? 'border border-red-400' : ''
        }`}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        {...props}
      />
      {error ? <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text> : null}
    </View>
  );
};
export default InputField;