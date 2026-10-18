import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNav from '../../components/navigation/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ProfileBg from '../../../assets/svg/profile-bg.svg';
import { resetFullDatabase } from '../../database';

const formatPhoneNumber = (phone) => {
  if (!phone) return 'N/A';
  const cleaned = phone.replace(/[^\d+]/g, '');
  const match = cleaned.match(/^(\+63)(\d{3})(\d{4})(\d{3})$/);
  if (match) {
    return `+(63) ${match[2]} ${match[3]} ${match[4]}`;
  }
  return phone;
};

const ProfileScreen = ({
  user,
  onLogout,
  activeTab,
  onSelectTab,
}) => {
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'N/A';
  const birthdate = user?.birthdate || 'DD/MM/YYYY';
  const username = user?.username || 'N/A';
  const phone = formatPhoneNumber(user?.phone);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetDatabase = () => {
    Alert.alert(
      'Reset Local Database',
      'Are you sure you want to completely reset the local SQLite database? All queued offline mutations and cached data will be cleared and the schema reinitialized to a pristine state.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Database',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResetting(true);
              await resetFullDatabase();
              Alert.alert('Database Reset', 'Local database has been reinitialized to a clean state. You can now refresh data or restart the app.');
            } catch (err) {
              Alert.alert('Reset Failed', err && err.message ? err.message : 'Failed to reset local database.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* HEADER */}
        <View className="relative h-[310px] w-full">

          {/* PROFILE BACKGROUND SVG */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <ProfileBg
              width="100%"
              height="100%"
              preserveAspectRatio="none"
            />
          </View>

          {/* HEADER TITLE */}
          <SafeAreaView
            edges={['top']}
            className="absolute left-0 right-0 top-0 z-10"
          >
            <Text className="ml-6 mt-10 text-[32px] font-bold tracking-tight text-white">
              My Profile
            </Text>
          </SafeAreaView>

          {/* PROFILE IMAGE */}
          <View className="absolute left-0 right-0 top-[140px] z-10 items-center">
            <View
              style={{
                height: 110,
                width: 110,
                borderRadius: 55,
                backgroundColor: '#333333',
                borderWidth: 4,
                borderColor: '#FFFFFF',
                overflow: 'hidden',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={require('../../../assets/images/placeholder.png')}
                style={{ height: '100%', width: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>
        </View>

        {/* PROFILE INFORMATION */}
        <View className="px-5 pt-[6px]">
          {/* BASIC INFORMATION */}
          <View className="mb-4 rounded-[34px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5">
            <Text className="mb-5 text-[14px] font-bold text-[#7893A8]">
              Basic Information
            </Text>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 pl-5 text-[13px] text-[#8299AB]">Name</Text>
              <Text numberOfLines={1} className="flex-1 text-[13px] font-bold text-[#104D6B]">
                {fullName}
              </Text>
            </View>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 pl-5 text-[13px] text-[#8299AB]">Birthday</Text>
              <Text numberOfLines={1} className="flex-1 text-[13px] font-bold text-[#104D6B]">
                {birthdate}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Text className="flex-1 pl-5 text-[13px] text-[#8299AB]">Mobile No.</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className="flex-1 text-[13px] font-bold text-[#104D6B]">
                {phone}
              </Text>
            </View>
          </View>

          {/* ACCOUNT INFORMATION */}
          <View className="mb-3 rounded-[34px] border border-[#DFE8EF] bg-white px-5 pb-8 pt-5">
            <Text className="mb-5 text-[14px] font-bold text-[#7893A8]">
              Account Information
            </Text>

            <View className="mb-5 flex-row items-center">
              <Text className="flex-1 pl-5 text-[13px] text-[#8299AB]">Username</Text>
              <Text numberOfLines={1} className="flex-1 text-[13px] font-bold text-[#104D6B]">
                {username}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Text className="flex-1 pl-5 text-[13px] text-[#8299AB]">Password</Text>
              <Text className="flex-1 text-[13px] font-bold tracking-widest text-[#104D6B]">
                ••••••••••••
              </Text>
            </View>
          </View>

          {/* DATABASE & DIAGNOSTICS */}
          <View className="mb-6 rounded-[34px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5">
            <Text className="mb-2 text-[14px] font-bold text-[#7893A8]">
              Data & Diagnostics
            </Text>
            <Text className="mb-4 text-xs text-[#8299AB]">
              Clear local cached trips, orders, and stuck sync queues to reinitialize a clean local database.
            </Text>
            <PrimaryButton
              title={isResetting ? "RESETTING DATABASE..." : "RESET LOCAL DATABASE"}
              variant="outline"
              borderColor="border-amber-400"
              onPress={handleResetDatabase}
              loading={isResetting}
            />
          </View>

          {/* ACTION BUTTONS */}
          <View className="px-1 -mt-2">
            <PrimaryButton
              title="EDIT PROFILE"
              variant="outline"
              borderColor="border-[#DFE8EF]"
              textSize="text-base"
              onPress={() => {}}
            />

            <PrimaryButton
              title="LOG OUT"
              variant="outline"
              borderColor="border-[#DFE8EF]"
              textSize="text-base"
              onPress={onLogout}
            />
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </View>
  );
};

export default ProfileScreen;
