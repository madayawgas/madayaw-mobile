import React from 'react';
import { View, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const QuantityControl = ({ quantity, onUpdateQuantity }) => {
  const handleTextChange = (text) => {
    const cleanNumber = text.replace(/[^0-9]/g, '');
    const numericValue = cleanNumber === '' ? 0 : parseInt(cleanNumber, 10);
    onUpdateQuantity(numericValue);
  };

  const adjustQuantity = (delta) => {
    onUpdateQuantity(Math.max(0, (quantity || 0) + delta));
  };

  return (
    /* Light Grey Pill Container */
    <View
      style={{
        borderRadius: 9999,
        backgroundColor: '#E5E7EB',
        borderWidth: 1,
        borderColor: '#D9D9D9',
      }}
      className="flex-row items-center justify-between px-3 py-1.5"
    >
      <TouchableOpacity
        onPress={() => adjustQuantity(-1)}
        className="w-7 h-7 bg-white rounded-full items-center justify-center border border-[#D9D9D9]"
        activeOpacity={0.7}
      >
        <Ionicons name="remove" size={14} color="#0d4761" />
      </TouchableOpacity>

      <TextInput
        className="text-[#0d4761] font-bold text-sm text-center px-2 py-0 min-w-[40px]"
        keyboardType="number-pad"
        value={String(quantity)}
        onChangeText={handleTextChange}
        selectTextOnFocus
      />

      <TouchableOpacity
        onPress={() => adjustQuantity(1)}
        className="w-7 h-7 bg-white rounded-full items-center justify-center border border-[#D9D9D9]"
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={14} color="#0d4761" />
      </TouchableOpacity>
    </View>
  );
};

export default QuantityControl;