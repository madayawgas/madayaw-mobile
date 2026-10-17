import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import PlaceholderSvg from '../../../assets/svg/placeholder.svg';

const CustomerCard = ({ name, contact, dateString, onPress }) => {
  const getTimeAgo = (date) => {
    const diffDays = Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center border border-gray-200 rounded-full p-2 mb-3 bg-white"
    >
      {/* SVG Avatar */}
      <View className="w-14 h-14 rounded-full overflow-hidden bg-[#0d4761] items-center justify-center mr-4">
        <PlaceholderSvg width="100%" height="100%" />
      </View>

      {/* Customer Info */}
      <View className="flex-1 justify-center">
        <Text className="text-[#0d4761] font-bold text-base leading-tight mb-1">{name}</Text>
        <Text className="text-gray-400 text-[11px]">{contact}</Text>
      </View>

      {/* Time Label */}
      <Text className="text-gray-400 text-[10px] italic pr-4">
        {getTimeAgo(dateString)}
      </Text>
    </TouchableOpacity>
  );
};

export default CustomerCard;
