import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import BottomNav from '../../components/navigation/BottomNav';
import DashboardDesign from '../../../assets/svg/dashboard-bg.svg';

const DashboardScreen = ({ user, activeTab, onSelectTab }) => {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  }, []);

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ffffff"
            colors={['#0d4761']}
          />
        }
      >

        {/* Header Section with SVG Background */}
        <View className="relative w-full h-72 bg-white">
          <View className="absolute top-0 left-0 right-0 bottom-0 w-full">
            <DashboardDesign width="100%" height="100%" preserveAspectRatio="none" />
          </View>

          <View className="pt-16 px-6">
            <Text className="text-white text-4xl font-bold">Welcome,</Text>
            <Text className="text-white text-xl mt-1">{user?.firstName}!</Text>
          </View>
        </View>

        {/* Main Content */}
        <View className="px-6 -mt-24 z-10">

          {/* Total Sales Section */}
          <Text className="text-[#0d4761] font-bold mb-2">Total Sales:</Text>
          <View className="bg-[#f4f5f7] rounded-xl flex-row justify-between items-center px-4 py-4 mb-6">
            <Text className="text-[#0d4761] text-3xl font-bold">₱ 123, 456</Text>
            <TouchableOpacity className="bg-[#facc15] px-4 py-2 rounded-full">
              <Text className="text-[#0d4761] text-xs font-bold uppercase">New Order</Text>
            </TouchableOpacity>
          </View>

          {/* Fleet Details Section */}
          <Text className="text-[#0d4761] font-bold mb-2">Fleet Details:</Text>
          <View className="bg-[#f4f5f7] rounded-xl p-4 mb-6">
            <View className="flex-row justify-between mb-2">
              <Text className="text-[#0d4761] font-bold text-xs">Driver:</Text>
              <Text className="text-[#0d4761] font-bold text-xs">Leshka Alcontin</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[#0d4761] font-bold text-xs">Plate No.:</Text>
              <Text className="text-[#0d4761] font-bold text-xs">ABC 1234</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[#0d4761] font-bold text-xs">Fleet Model:</Text>
              <Text className="text-[#0d4761] font-bold text-xs">Hanabi Kagura</Text>
            </View>
          </View>

          {/* Recent Transactions Section */}
          <Text className="text-[#0d4761] font-bold mb-2">Recent Transactions:</Text>
          <View className="bg-[#f4f5f7] rounded-xl h-48 w-full"></View>
        </View>

      </ScrollView>

      {/* Floating Bottom Nav */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </View>
  );
};

export default DashboardScreen;
