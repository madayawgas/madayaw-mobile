import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ProductOrderCard = ({
  item,
  isSelected = false,
  onPress,
  imageSource = require('../../../assets/images/placeholder.png'),
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        borderRadius: 28,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? '#0d4761' : '#D9D9D9',
        backgroundColor: isSelected ? '#f0f7fa' : '#FFFFFF',
        height: 250,
        overflow: 'hidden',
      }}
      className="w-[48%] p-4 mb-4 justify-between relative shadow-xs"
    >
      {/* Top Right Selection Indicator */}
      <View
        style={{
          position: 'absolute',
          top: 13,
          left: 10,
          zIndex: 10,
        }}
      >
        {isSelected ? (
          <Ionicons
            name="checkmark-circle"
            size={22}
            color="#0d4761"
          />
        ) : (
          <Ionicons
            name="ellipse-outline"
            size={22}
            color="#d1d5db"
          />
        )}
      </View>

      {/* Centered Product Image */}
      <View className="flex-1 items-center justify-center pt-2">
        <Image
          source={imageSource}
          className="w-20 h-20"
          resizeMode="contain"
        />
      </View>

      {/* Product Name & Price */}
      <View className="pt-2 pl-1 pb-2">
        <Text
          className="text-[#0d4761] font-bold text-base mb-0.5"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-[#0d4761] text-xs font-semibold">
          ₱ {item.price.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default ProductOrderCard;