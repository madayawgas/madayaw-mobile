import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BottomNav from '../../../components/navigation/BottomNav';
import ProfileBg from '../../../../assets/svg/profile-bg.svg';
import { driverRepository, resetFullDatabase } from '@/database';
import { driverService } from '@/services/driverService';

const DRIVER_TABS = [
  { id: 'dashboard', label: 'Cabin', iconName: 'speedometer-outline', activeIconName: 'speedometer' },
  { id: 'maintenance', label: 'Vehicle', iconName: 'construct-outline', activeIconName: 'construct' },
  { id: 'profile', label: 'Profile', iconName: 'person-circle-outline', activeIconName: 'person-circle' },
];

const formatPhoneNumber = (phone) => {
  if (!phone) return '+63 917 000 0005';
  const cleaned = phone.replace(/[^\d+]/g, '');
  const match = cleaned.match(/^(\+63)(\d{3})(\d{4})(\d{3})$/);
  if (match) {
    return `+(63) ${match[2]} ${match[3]} ${match[4]}`;
  }
  return phone;
};

const DriverProfileScreen = ({
  user,
  onLogout,
  activeTab = 'profile',
  onSelectTab,
}) => {
  const [vehicle, setVehicle] = useState(null);
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
              setVehicle(null);
              Alert.alert('Database Reset', 'Local database has been reinitialized to a clean state. You can now refresh or restart the cabin.');
            } catch (err) {
              Alert.alert('Reset Failed', err?.message || 'Failed to reset local database.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    let isMounted = true;
    const loadVehicle = () => {
      driverRepository.getVehicleTelemetry().then((v) => {
        if (isMounted && v) {
          setVehicle(v);
        }
      }).catch(() => {});
    };

    loadVehicle();

    const unsubRealtime = driverService.subscribeRealtime((event) => {
      if (event === 'VEHICLE_DRIVER_ASSIGNED' || event === 'VEHICLE_STATUS_UPDATED' || event === 'FLEET_VEHICLE_RELEASED') {
        loadVehicle();
      }
    });

    return () => {
      isMounted = false;
      unsubRealtime();
    };
  }, []);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Danilo Driver';
  const birthdate = user?.birthdate || '1988-11-20';
  const username = user?.username || 'driver_user';
  const phone = formatPhoneNumber(user?.phone);

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header Section with SVG Background */}
        <View className="relative h-[290px] w-full">
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

          <SafeAreaView
            edges={['top']}
            className="absolute left-0 right-0 top-0 z-10"
          >
            <View className="flex-row justify-between items-center px-6 mt-6">
              <Text className="text-3xl font-bold tracking-tight text-white">
                Driver Profile
              </Text>
              <View className="bg-[#facc15] px-3 py-1 rounded-full">
                <Text className="text-[#0d4761] text-xs font-bold uppercase">Frontline Driver</Text>
              </View>
            </View>
          </SafeAreaView>

          {/* Profile Avatar */}
          <View className="absolute left-0 right-0 top-[135px] z-10 items-center">
            <View
              style={{
                height: 104,
                width: 104,
                borderRadius: 52,
                backgroundColor: '#0d4761',
                borderWidth: 4,
                borderColor: '#FFFFFF',
                overflow: 'hidden',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={require('../../../../assets/images/placeholder.png')}
                style={{ height: '100%', width: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>
        </View>

        {/* Profile Information */}
        <View className="px-5 pt-3">
          {/* Driver Information Card */}
          <View className="mb-4 rounded-[28px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5 shadow-sm">
            <Text className="mb-4 text-xs font-bold uppercase tracking-wider text-[#7893A8]">
              Driver Details
            </Text>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Full Name</Text>
              <Text numberOfLines={1} className="flex-1 text-sm font-bold text-[#104D6B]">
                {fullName}
              </Text>
            </View>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Contact No.</Text>
              <Text numberOfLines={1} className="flex-1 text-sm font-bold text-[#104D6B]">
                {phone}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Birthdate</Text>
              <Text numberOfLines={1} className="flex-1 text-sm font-bold text-[#104D6B]">
                {birthdate}
              </Text>
            </View>
          </View>

          {/* Assigned Fleet Truck Card */}
          <View className="mb-4 rounded-[28px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5 shadow-sm">
            <Text className="mb-4 text-xs font-bold uppercase tracking-wider text-[#7893A8]">
              Assigned Vehicle
            </Text>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Plate Number</Text>
              <View className="flex-1 flex-row items-center">
                <Ionicons name="bus" size={14} color="#0d4761" />
                <Text className="ml-1 text-sm font-extrabold text-[#0d4761]">
                  {vehicle?.plate_number || 'ABC-1001'}
                </Text>
              </View>
            </View>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Truck Model</Text>
              <Text numberOfLines={1} className="flex-1 text-sm font-bold text-[#104D6B]">
                {vehicle?.model || 'Isuzu Elf Dropside'}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Operational Role</Text>
              <Text className="flex-1 text-xs font-bold text-emerald-700">
                Frontline Route Driver
              </Text>
            </View>
          </View>

          {/* Account Credentials */}
          <View className="mb-5 rounded-[28px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5 shadow-sm">
            <Text className="mb-4 text-xs font-bold uppercase tracking-wider text-[#7893A8]">
              Account & System
            </Text>

            <View className="mb-3 flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">Username</Text>
              <Text numberOfLines={1} className="flex-1 text-sm font-bold text-[#104D6B]">
                {username}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Text className="flex-1 text-xs text-[#8299AB]">App Build</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500">
                Madayaw Mobile v1.0.0 (DSD Offline)
              </Text>
            </View>
          </View>

          {/* Local Database & Diagnostics Card */}
          <View className="mb-4 rounded-[28px] border border-[#DFE8EF] bg-white px-5 pb-5 pt-5 shadow-sm">
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-[#7893A8]">
              Diagnostics & Data Management
            </Text>
            <Text className="mb-4 text-xs text-gray-500">
              Clear local cached trips, reset stuck sync queues, and reinitialize a pristine local database instance.
            </Text>
            <TouchableOpacity
              onPress={handleResetDatabase}
              disabled={isResetting}
              className="rounded-full border border-amber-300 bg-amber-50 py-3.5 items-center justify-center flex-row"
            >
              {isResetting ? (
                <ActivityIndicator size="small" color="#d97706" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="refresh-circle-outline" size={18} color="#d97706" />
              )}
              <Text className="ml-2 text-xs font-bold text-amber-700 uppercase tracking-wider">
                {isResetting ? 'Resetting Local Database...' : 'Reset Local Database (Clean Slate)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Log Out Button */}
          <TouchableOpacity
            onPress={onLogout}
            className="rounded-full border border-red-200 bg-red-50/70 py-4 items-center justify-center flex-row shadow-sm"
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text className="ml-2 text-sm font-bold text-red-600 uppercase tracking-wider">
              Log Out of Cabin
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} tabs={DRIVER_TABS} />
    </View>
  );
};

export default DriverProfileScreen;
