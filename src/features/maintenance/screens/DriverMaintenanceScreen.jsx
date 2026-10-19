import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';
import BottomNav from '../../../components/navigation/BottomNav';
import { driverService } from '@/services/driverService';
import FuelEntryModal from '../../operations/components/FuelEntryModal';

const DRIVER_TABS = [
  { id: 'dashboard', label: 'Cabin', iconName: 'speedometer-outline', activeIconName: 'speedometer' },
  { id: 'maintenance', label: 'Vehicle', iconName: 'construct-outline', activeIconName: 'construct' },
  { id: 'profile', label: 'Profile', iconName: 'person-circle-outline', activeIconName: 'person-circle' },
];

const DriverMaintenanceScreen = ({ user, activeTab = 'maintenance', onSelectTab }) => {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('pm'); // 'pm' | 'service' | 'fuel'
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await driverService.getVehicleHealthData();
      setHealthData(data);
    } catch (e) {
      console.warn('[DriverMaintenanceScreen] Error loading data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (e) {
      console.warn('[DriverMaintenanceScreen] Error refreshing:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Frontline Vehicle Fleet Real-Time Events Listener
  useEffect(() => {
    const unsubscribe = driverService.subscribeRealtime((event, data) => {
      switch (event) {
        case 'FLEET_VEHICLE_GROUNDED':
          loadData();
          Alert.alert(
            '⚠️ Vehicle Grounded',
            `Truck ${data?.plateNumber || ''} has been grounded for maintenance (${data?.findings || data?.reason || 'Failed inspection'}). Do not depart yard until cleared.`
          );
          break;

        case 'FLEET_VEHICLE_RELEASED':
          loadData();
          Alert.alert(
            '✅ Vehicle Cleared',
            `Maintenance servicing complete. Truck ${data?.plateNumber || ''} has been cleared and released for active route operations!`
          );
          break;

        case 'VEHICLE_STATUS_UPDATED':
        case 'VEHICLE_DRIVER_ASSIGNED':
          loadData();
          break;

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [loadData]);

  const telemetry = healthData?.telemetry;
  const fuelLogs = Array.isArray(healthData?.fuelLogs) ? healthData.fuelLogs : [];
  const maintenanceLogs = Array.isArray(healthData?.maintenanceLogs) ? healthData.maintenanceLogs : [];

  const currentOdo = telemetry?.current_odometer || 0;
  const lastPmOdo = telemetry?.last_pm_odometer || 0;
  const distanceSinceLastPm = Math.max(0, currentOdo - lastPmOdo);
  const isPmDue = distanceSinceLastPm >= 5000;
  const remainingKm = Math.max(0, 5000 - distanceSinceLastPm);
  const progressRatio = Math.min(1, distanceSinceLastPm / 5000);
  const isGrounded = telemetry?.status === 'UNDER_MAINTENANCE';

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ffffff"
            colors={['#0d4761']}
          />
        }
      >
        {/* Header Section */}
        <View className="bg-[#0d4761] pt-14 pb-8 px-6 rounded-b-[32px]">
          <View className="flex-row justify-between items-center mb-3">
            <View>
              <Text className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                Fleet Diagnostics & Health
              </Text>
              <Text className="text-white text-3xl font-bold mt-0.5">
                Vehicle Status
              </Text>
            </View>
            <View className="bg-[#facc15] px-3 py-1.5 rounded-full flex-row items-center">
              <Ionicons name="bus" size={14} color="#0d4761" />
              <Text className="text-[#0d4761] text-xs font-bold ml-1.5 uppercase">
                {telemetry?.plate_number || 'ABC-1001'}
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0d4761" />
            <Text className="text-xs text-gray-500 font-semibold mt-3">Loading vehicle diagnostics...</Text>
          </View>
        ) : (
          <View className="px-6 -mt-4 z-10">
            {/* Grounding State Notice (Strict exception alert) */}
            {isGrounded && (
              <View className="bg-red-50 border-2 border-red-500 rounded-2xl p-4 mb-4 flex-row items-center">
                <Ionicons name="alert-circle" size={28} color="#dc2626" />
                <View className="ml-3 flex-1">
                  <Text className="text-red-700 text-sm font-bold uppercase">
                    VEHICLE GROUNDED
                  </Text>
                  <Text className="text-red-600 text-xs mt-0.5">
                    This truck is currently flagged UNDER_MAINTENANCE. Do not depart yard until cleared by maintenance supervisor.
                  </Text>
                </View>
              </View>
            )}

            {/* Vehicle Telemetry Card */}
            <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text className="text-xs text-gray-400 font-medium">Model / Make</Text>
                  <Text className="text-base font-bold text-[#0d4761]">
                    {telemetry?.model || 'Hanabi Kagura / Isuzu Forward'}
                  </Text>
                </View>
                <View
                  className={`px-3 py-1 rounded-full ${
                    isGrounded
                      ? 'bg-red-100'
                      : 'bg-emerald-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isGrounded ? 'text-red-800' : 'text-emerald-800'
                    }`}
                  >
                    {isGrounded ? 'UNDER MAINTENANCE' : 'ACTIVE / READY'}
                  </Text>
                </View>
              </View>

              {/* Odometer Display */}
              <View className="bg-[#f4f5f7] rounded-xl p-4 flex-row justify-between items-center">
                <View>
                  <Text className="text-xs text-gray-500 font-semibold">Registered Odometer</Text>
                  <Text className="text-2xl font-extrabold text-[#0d4761] mt-0.5">
                    {currentOdo.toLocaleString()} km
                  </Text>
                </View>
                <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center">
                  <Ionicons name="speedometer-outline" size={20} color="#0d4761" />
                </View>
              </View>
            </View>

            {/* 5,000-km Preventive Maintenance (PM) Card */}
            <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row items-center">
                  <Ionicons name="shield-checkmark-outline" size={18} color="#0d4761" />
                  <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider ml-1.5">
                    5,000-km Preventive Maintenance
                  </Text>
                </View>
                {isPmDue ? (
                  <View className="bg-red-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-red-700 text-[11px] font-bold">PM OVERDUE</Text>
                  </View>
                ) : (
                  <View className="bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-emerald-700 text-[11px] font-bold">ON TRACK</Text>
                  </View>
                )}
              </View>

              {/* Progress metrics */}
              <View className="flex-row justify-between items-baseline my-2">
                <Text className="text-xl font-bold text-[#0d4761]">
                  {distanceSinceLastPm.toLocaleString()}{' '}
                  <Text className="text-xs text-gray-400 font-medium">/ 5,000 km</Text>
                </Text>
                <Text className="text-xs font-bold text-gray-500">
                  {Math.round(progressRatio * 100)}% reached
                </Text>
              </View>

              {/* Paper Progress Bar */}
              <ProgressBar
                progress={progressRatio}
                color={isPmDue ? '#dc2626' : progressRatio > 0.8 ? '#f59e0b' : '#0d4761'}
                style={{ height: 10, borderRadius: 5, backgroundColor: '#e5e7eb' }}
              />

              <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-gray-100">
                <Text className="text-xs text-gray-500">Remaining to PM Check:</Text>
                <Text
                  className={`text-xs font-bold ${
                    isPmDue ? 'text-red-600 font-extrabold' : 'text-[#0d4761]'
                  }`}
                >
                  {isPmDue ? 'Maintenance Due Now!' : `${remainingKm.toLocaleString()} km remaining`}
                </Text>
              </View>

              {isPmDue && (
                <View className="mt-3 bg-red-50 p-2.5 rounded-xl flex-row items-center">
                  <Ionicons name="information-circle" size={18} color="#dc2626" />
                  <Text className="text-xs text-red-700 font-semibold ml-2 flex-1">
                    Please notify Logistics Supervisor Danilo / Fleet Plant for scheduled inspection.
                  </Text>
                </View>
              )}
            </View>

            {/* Segmented Switcher: Service History vs Fuel Logs */}
            <View className="flex-row bg-[#f4f5f7] p-1 rounded-2xl mb-4 border border-gray-200">
              <TouchableOpacity
                onPress={() => setActiveSubTab('service')}
                className={`flex-1 py-2.5 rounded-xl items-center ${
                  activeSubTab === 'service' ? 'bg-[#0d4761]' : ''
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    activeSubTab === 'service' ? 'text-white' : 'text-[#0d4761]'
                  }`}
                >
                  Service History
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveSubTab('fuel')}
                className={`flex-1 py-2.5 rounded-xl items-center ${
                  activeSubTab === 'fuel' ? 'bg-[#0d4761]' : ''
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    activeSubTab === 'fuel' ? 'text-white' : 'text-[#0d4761]'
                  }`}
                >
                  Fuel Log History
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab 1: Service History */}
            {activeSubTab === 'service' && (
              <View className="space-y-3">
                <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                  Completed Work Orders & Maintenance
                </Text>
                {maintenanceLogs.length === 0 ? (
                  <View className="bg-[#f4f5f7] rounded-xl p-6 items-center">
                    <Text className="text-xs text-gray-500 font-medium">No service records found.</Text>
                  </View>
                ) : (
                  maintenanceLogs.map((item) => (
                    <View
                      key={item.id}
                      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-3"
                    >
                      <View className="flex-row justify-between items-start mb-1">
                        <Text className="text-sm font-bold text-[#0d4761] flex-1 mr-2">
                          {item.title}
                        </Text>
                        <View className="bg-blue-50 px-2 py-0.5 rounded">
                          <Text className="text-[10px] font-bold text-[#0d4761]">
                            {item.serviceType}
                          </Text>
                        </View>
                      </View>
                      {item.description ? (
                        <Text className="text-xs text-gray-600 mb-2">{item.description}</Text>
                      ) : null}
                      <View className="flex-row justify-between items-center pt-2 border-t border-gray-100">
                        <Text className="text-[11px] text-gray-400">
                          {new Date(item.completedAt).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <Text className="text-[11px] font-bold text-[#0d4761]">
                          @ {item.odometerAtService.toLocaleString()} km
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Tab 2: Fuel Log History */}
            {activeSubTab === 'fuel' && (
              <View className="space-y-3">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider">
                    Past Refills ({fuelLogs.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowFuelModal(true)}
                    className="bg-[#0d4761] px-3 py-1.5 rounded-full flex-row items-center"
                  >
                    <Ionicons name="add" size={14} color="#facc15" />
                    <Text className="text-white text-xs font-bold ml-1">+ Log Refill</Text>
                  </TouchableOpacity>
                </View>

                {fuelLogs.length === 0 ? (
                  <View className="bg-[#f4f5f7] rounded-xl p-6 items-center">
                    <Text className="text-xs text-gray-500 font-medium">No fuel logs recorded yet.</Text>
                  </View>
                ) : (
                  fuelLogs.map((log) => (
                    <View
                      key={log.id}
                      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-3"
                    >
                      <View className="flex-row justify-between items-center mb-1">
                        <View className="flex-row items-center">
                          <Ionicons name="water" size={16} color="#0d4761" />
                          <Text className="text-sm font-bold text-[#0d4761] ml-1.5">
                            {log.liters} Liters
                          </Text>
                        </View>
                        <Text className="text-sm font-extrabold text-[#0d4761]">
                          ₱{log.total_cost.toLocaleString()}
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center pt-2 border-t border-gray-100">
                        <Text className="text-[11px] text-gray-400">
                          {new Date(log.logged_at).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <Text className="text-[11px] font-bold text-gray-500">
                          {log.odometer.toLocaleString()} km
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Nav for Driver */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} tabs={DRIVER_TABS} />

      {/* Fuel Entry Modal */}
      <FuelEntryModal
        visible={showFuelModal}
        onClose={() => setShowFuelModal(false)}
        user={user}
        telemetry={telemetry}
        onSuccess={() => loadData()}
      />
    </View>
  );
};

export default DriverMaintenanceScreen;
