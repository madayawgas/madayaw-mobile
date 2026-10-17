import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PlaceholderSvg from '../../../assets/svg/placeholder.svg';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';

const CustomerDetailsScreen = ({ customer, onBack, onAddOrder }) => {
  return (
    <SafeAreaView className="flex-1 bg-[#f9fafb]">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 justify-between pb-8">
          <View>
            {/* Back Header */}
            <View className="flex-row items-center mb-2">
              <TouchableOpacity
                onPress={onBack}
                className="w-12 h-12 bg-white rounded-full items-center justify-center border border-gray-100 shadow-sm mr-4"
              >
                <Ionicons name="chevron-back" size={24} color="#0d4761" />
              </TouchableOpacity>
              <Text className="text-[#0d4761] text-2xl font-bold">Customer Details</Text>
            </View>

            {/* Separator Line */}
            <View className="border-b border-[#D9D9D9] w-full mb-6" />

            {/* Customer Profile Card */}
            <View className="bg-white border border-gray-100 rounded-3xl p-6 items-center shadow-sm mb-4">
              <View className="w-24 h-24 rounded-full overflow-hidden bg-[#0d4761] items-center justify-center mb-4">
                <PlaceholderSvg width="100%" height="100%" />
              </View>
              <Text className="text-[#0d4761] text-xl font-bold">{customer?.name}</Text>
              <Text className="text-gray-400 text-xs mt-1">{customer?.contactNumber}</Text>
            </View>

            {/* Empty Details Container */}
            <View className="bg-white border border-gray-100 rounded-3xl h-64 p-4 relative">
              <Text className="absolute top-4 right-6 text-gray-400 text-[10px] italic">
                3 days ago
              </Text>
            </View>
          </View>

          <PrimaryButton title="ADD ORDER" onPress={onAddOrder} />
        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default CustomerDetailsScreen;
