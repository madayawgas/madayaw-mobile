import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../../components/navigation/BottomNav';

const OrderScreen = ({ activeTab, onSelectTab }) => {
  return (
    <SafeAreaView className="flex-1 bg-[#f9fafb]">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-[#0d4761] text-[40px] font-bold mb-6 tracking-tight">Orders</Text>
      </View>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </SafeAreaView>
  );
};

export default OrderScreen;
