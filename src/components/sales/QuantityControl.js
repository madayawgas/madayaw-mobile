import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const QuantityControl = ({ quantity, onUpdateQuantity, maxQuantity }) => {
  const hasMax = typeof maxQuantity === 'number';
  const isAtLimit = hasMax && (quantity || 0) >= maxQuantity;

  const handleTextChange = (text) => {
    const cleanNumber = text.replace(/[^0-9]/g, '');
    const rawValue = cleanNumber === '' ? 0 : parseInt(cleanNumber, 10);
    const cappedValue = hasMax ? Math.min(rawValue, maxQuantity) : rawValue;
    onUpdateQuantity(cappedValue);
  };

  const adjustQuantity = (delta) => {
    let nextQty = (quantity || 0) + delta;
    if (nextQty < 0) nextQty = 0;
    if (hasMax && nextQty > maxQuantity) nextQty = maxQuantity;
    onUpdateQuantity(nextQty);
  };

  return (
    <View className="items-end">
      {/* Light Grey Pill Container (Turns Red at Limit) */}
      <View
        style={{
          borderRadius: 9999,
          backgroundColor: isAtLimit ? '#fef2f2' : '#E5E7EB',
          borderWidth: 1,
          borderColor: isAtLimit ? '#ef4444' : '#D9D9D9',
        }}
        className="flex-row items-center justify-between px-3 py-1.5"
      >
        <TouchableOpacity
          onPress={() => adjustQuantity(-1)}
          disabled={(quantity || 0) <= 0}
          style={{ opacity: (quantity || 0) <= 0 ? 0.35 : 1 }}
          className="w-7 h-7 bg-white rounded-full items-center justify-center border border-[#D9D9D9]"
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={14} color={isAtLimit ? '#dc2626' : '#0d4761'} />
        </TouchableOpacity>

        <TextInput
          style={{ color: isAtLimit ? '#dc2626' : '#0d4761' }}
          className="font-bold text-sm text-center px-2 py-0 min-w-[40px]"
          keyboardType="number-pad"
          value={String(quantity ?? 0)}
          onChangeText={handleTextChange}
          selectTextOnFocus
        />

        <TouchableOpacity
          onPress={() => adjustQuantity(1)}
          disabled={isAtLimit}
          style={{ opacity: isAtLimit ? 0.35 : 1 }}
          className="w-7 h-7 bg-white rounded-full items-center justify-center border border-[#D9D9D9]"
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={14} color={isAtLimit ? '#dc2626' : '#0d4761'} />
        </TouchableOpacity>
      </View>

      {/* Inline Non-Intrusive Limit Notice */}
      {hasMax && isAtLimit && (
        <Text className="text-red-500 text-[10px] font-semibold mt-1">
          Max: {maxQuantity} available on board
        </Text>
      )}
    </View>
  );
};

export default QuantityControl;