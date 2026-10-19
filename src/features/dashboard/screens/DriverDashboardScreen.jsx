import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomNav from '../../../components/navigation/BottomNav';
import { driverService } from '@/services/driverService';
import { syncScheduler } from '@/sync/syncScheduler';
import { socketClient } from '@/realtime';
import FuelEntryModal from '../../operations/components/FuelEntryModal';
import ApprehensionModal from '../../operations/components/ApprehensionModal';
import VehicleIssueModal from '../../operations/components/VehicleIssueModal';
import EmergencySosModal from '../../operations/components/EmergencySosModal';

const DRIVER_TABS = [
  { id: 'dashboard', label: 'Cabin', iconName: 'speedometer-outline', activeIconName: 'speedometer' },
  { id: 'maintenance', label: 'Vehicle', iconName: 'construct-outline', activeIconName: 'construct' },
  { id: 'profile', label: 'Profile', iconName: 'person-circle-outline', activeIconName: 'person-circle' },
];

const DriverDashboardScreen = ({ user, activeTab = 'dashboard', onSelectTab }) => {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Shift Attendance & Timer State
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDutyActionPending, setIsDutyActionPending] = useState(false);
  const timerRef = useRef(null);

  // Emergency SOS Cooldown State (60 seconds)
  const [sosCooldown, setSosCooldown] = useState(0);
  const cooldownTimerRef = useRef(null);

  // Modals
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showApprehensionModal, setShowApprehensionModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load operational context
  const loadDashboardData = useCallback(async () => {
    try {
      const data = await driverService.getDashboardContext(user);
      setContext(data);

      if (data.shift && data.shift.status === 'ON_DUTY') {
        setIsOnDuty(true);
        if (data.shift.clock_in_time) {
          const startTime = new Date(data.shift.clock_in_time).getTime();
          const elapsed = !isNaN(startTime)
            ? Math.max(0, Math.floor((Date.now() - startTime) / 1000))
            : 0;
          setElapsedSeconds(elapsed);
        } else {
          setElapsedSeconds(0);
        }
      } else {
        setIsOnDuty(false);
        setElapsedSeconds(0);
      }
    } catch (e) {
      console.warn('[DriverDashboardScreen] Error loading data:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboardData();
      if (isOnline) {
        await syncScheduler.syncNow();
      }
    } catch (e) {
      console.warn('[DriverDashboardScreen] Error refreshing:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboardData, isOnline]);

  // Sync engine & network status listener
  useEffect(() => {
    const unsubscribe = syncScheduler.subscribe((status) => {
      setIsOnline(status.isOnline);
      setIsSyncing(status.isSyncing);
      setContext((prev) => (prev ? { ...prev, pendingSyncCount: status.pendingCount } : prev));
    });
    return () => unsubscribe();
  }, []);

  // Real-Time Socket Connection & Frontline Events Listener
  useEffect(() => {
    const unsubSocket = socketClient.subscribeConnection((connected) => {
      setIsSocketConnected(connected);
    });

    const unsubRealtime = driverService.subscribeRealtime((event, data) => {
      console.log('[DriverDashboardScreen] Realtime event received:', event);

      switch (event) {
        case 'TRIP_DISPATCHED':
          loadDashboardData();
          Alert.alert(
            '🚚 New Trip Dispatched',
            `Trip ${data?.tripNumber || ''} has been assigned and dispatched to your cabin. Have a safe route delivery!`
          );
          break;

        case 'TRIP_LOAD_RECORDED':
          loadDashboardData();
          Alert.alert(
            '📦 Load Slip Recorded',
            `Slip ${data?.slipNumber || ''} recorded with ${data?.itemCount || 0} unit(s). Onboard inventory updated.`
          );
          break;

        case 'TRIP_COMPLETED':
        case 'TRIP_RECONCILED':
          loadDashboardData();
          break;

        case 'TRIP_CANCELLED':
          loadDashboardData();
          Alert.alert(
            '⚠️ Route Trip Cancelled',
            `Trip ${data?.tripNumber || ''} was cancelled by logistics dispatch. Reason: ${data?.reason || 'Route cancelled'}.`
          );
          break;

        case 'ATTENDANCE_DUTY_UPDATED':
          loadDashboardData();
          break;

        case 'VEHICLE_DRIVER_ASSIGNED':
          loadDashboardData();
          Alert.alert(
            '🚛 Vehicle Assigned',
            `You have been assigned to delivery vehicle ${data?.plateNumber || ''}. Telemetry updated.`
          );
          break;

        case 'EMERGENCY_ALERT_STATUS_UPDATED':
          if (data?.status === 'ACKNOWLEDGED') {
            Alert.alert(
              '🚨 Emergency SOS Acknowledged',
              `Supervisor ${data?.acknowledgedByName || 'Supervisor'} has acknowledged your emergency alert. Operations team is responding!`
            );
          } else if (data?.status === 'RESOLVED') {
            Alert.alert(
              '✅ Emergency SOS Resolved',
              `Your emergency SOS has been marked resolved: ${data?.resolutionNotes || 'Situation resolved'}.`
            );
          }
          break;

        default:
          break;
      }
    });

    return () => {
      unsubSocket();
      unsubRealtime();
    };
  }, [loadDashboardData]);

  // Initial load
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Active shift elapsed timer
  useEffect(() => {
    if (isOnDuty) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOnDuty]);

  // SOS Cooldown timer
  useEffect(() => {
    if (sosCooldown > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setSosCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [sosCooldown]);

  const formatElapsedTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // Shift Attendance Handlers
  const handleStartShift = async () => {
    if (isDutyActionPending) return;
    setIsDutyActionPending(true);
    try {
      const shift = await driverService.clockIn(user, context?.telemetry?.truck_id);
      setIsOnDuty(true);
      setElapsedSeconds(0);
      setContext((prev) => (prev ? { ...prev, shift } : prev));
      Alert.alert('Shift Started', 'Duty attendance recorded. Have a safe route delivery!');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to start shift');
    } finally {
      setIsDutyActionPending(false);
    }
  };

  const handleEndShift = () => {
    if (isDutyActionPending) return;
    Alert.alert(
      'End Shift',
      'Are you sure you want to clock out and end your duty shift for today?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm End Shift',
          style: 'destructive',
          onPress: async () => {
            setIsDutyActionPending(true);
            try {
              const shift = await driverService.clockOut(user);
              setIsOnDuty(false);
              setElapsedSeconds(0);
              setContext((prev) => (prev ? { ...prev, shift } : prev));
              Alert.alert('Shift Ended', 'You are now off-duty. Rest well!');
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to end shift');
            } finally {
              setIsDutyActionPending(false);
            }
          },
        },
      ]
    );
  };

  const handleSosDispatched = () => {
    setSosCooldown(60); // 60-second debounce cooldown
  };

  const handleManualSync = async () => {
    if (isSyncing) return;

    if (!isOnline) {
      Alert.alert(
        'Offline Mode',
        'Backend server is currently unreachable. Your logs and orders are safely stored on this device and will automatically upload once connection is restored.'
      );
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncScheduler.syncNow();
      await loadDashboardData();

      if (result.offline) {
        Alert.alert(
          'Offline Mode',
          'Backend server is currently unreachable. Items remain safely stored on this device.'
        );
      } else if (result.synced === 0 && result.failed > 0) {
        Alert.alert(
          'Sync Incomplete',
          'Could not reach server or upload media. Items remain queued offline and will retry automatically.'
        );
      } else if (result.synced > 0 && result.failed > 0) {
        Alert.alert(
          'Partial Sync',
          `Successfully synced ${result.synced} item(s). ${result.failed} item(s) remain queued.`
        );
      } else if (result.synced > 0 && result.failed === 0) {
        Alert.alert(
          'Sync Complete',
          `All ${result.synced} queued item(s) uploaded successfully.`
        );
      } else {
        Alert.alert('Queue Empty', 'All records are already up to date.');
      }
    } catch (e) {
      Alert.alert('Sync Notice', e.message || 'Sync cycle completed. Check connectivity if items remain queued.');
      await loadDashboardData();
    } finally {
      setIsSyncing(false);
    }
  };

  const activeTrip = context?.trip;
  const telemetry = context?.telemetry;
  const plateNumber = telemetry?.plate_number || activeTrip?.vehicle_plate || 'ABC-1001';

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
        {/* Top App Bar / Header */}
        <View className="bg-[#0d4761] pt-14 pb-8 px-6 rounded-b-[32px]">
          <View className="flex-row justify-between items-center mb-4">
            {/* Status / Online indicator */}
            <View className="flex-row items-center bg-white/10 px-3 py-1.5 rounded-full">
              <View
                className={`w-2 h-2 rounded-full mr-2 ${
                  isOnline ? (isSocketConnected ? 'bg-emerald-400' : 'bg-emerald-300') : 'bg-amber-400'
                }`}
              />
              <Text className="text-white text-xs font-semibold">
                {isOnline ? (isSocketConnected ? 'Live' : 'Online') : 'Offline Mode'}
              </Text>
              {context?.pendingSyncCount && context.pendingSyncCount > 0 ? (
                <TouchableOpacity
                  onPress={handleManualSync}
                  disabled={isSyncing}
                  className={`${
                    isOnline ? 'bg-amber-400' : 'bg-amber-400/80'
                  } px-2 py-0.5 rounded-full ml-2 flex-row items-center active:opacity-75`}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#0d4761" style={{ transform: [{ scale: 0.6 }], marginRight: 2 }} />
                  ) : (
                    <Ionicons
                      name={isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
                      size={11}
                      color="#0d4761"
                      style={{ marginRight: 2 }}
                    />
                  )}
                  <Text className="text-[#0d4761] text-[10px] font-bold">
                    {context.pendingSyncCount} queued
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Assigned Truck Badge */}
            <View className="flex-row items-center bg-[#facc15] px-3 py-1.5 rounded-full">
              <Ionicons name="bus" size={14} color="#0d4761" />
              <Text className="text-[#0d4761] text-xs font-bold ml-1.5 uppercase">
                {plateNumber}
              </Text>
            </View>
          </View>

          {/* Greeting */}
          <Text className="text-white/80 text-sm font-medium">Driver Cabin Control</Text>
          <Text className="text-white text-3xl font-bold mt-0.5">
            Good day, {user?.firstName || 'Danilo'}!
          </Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0d4761" />
            <Text className="text-xs text-gray-500 font-semibold mt-3">Loading cabin telemetry...</Text>
          </View>
        ) : (
          <View className="px-6 -mt-4 z-10">
            {/* Shift Attendance Banner */}
            <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                  <View
                    className={`w-3 h-3 rounded-full mr-2 ${
                      isOnDuty ? 'bg-emerald-500' : 'bg-gray-400'
                    }`}
                  />
                  <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Shift Attendance
                  </Text>
                </View>

                {isOnDuty ? (
                  <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <Text className="text-emerald-700 text-xs font-bold">ACTIVE SHIFT</Text>
                  </View>
                ) : (
                  <View className="bg-gray-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-gray-600 text-xs font-semibold">Off-Duty</Text>
                  </View>
                )}
              </View>

              {isOnDuty ? (
                <View className="flex-row items-center justify-between pt-1">
                  <View>
                    <Text className="text-gray-400 text-xs font-medium">Elapsed Duty Time</Text>
                    <Text className="text-[#0d4761] text-3xl font-extrabold tracking-tight">
                      {formatElapsedTime(elapsedSeconds)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleEndShift}
                    disabled={isDutyActionPending}
                    className={`bg-red-50 border border-red-200 px-5 py-3 rounded-xl flex-row items-center ${
                      isDutyActionPending ? 'opacity-50' : 'active:opacity-80'
                    }`}
                  >
                    {isDutyActionPending ? (
                      <ActivityIndicator size="small" color="#dc2626" style={{ marginRight: 6 }} />
                    ) : (
                      <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                    )}
                    <Text className="text-red-600 text-xs font-bold uppercase ml-1.5">
                      {isDutyActionPending ? 'Ending...' : 'End Shift'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="pt-1">
                  <Text className="text-gray-600 text-xs mb-3">
                    You are currently off-duty. Start your shift to activate attendance and route dispatch tracking.
                  </Text>
                  <TouchableOpacity
                    onPress={handleStartShift}
                    disabled={isDutyActionPending}
                    className={`bg-[#0d4761] py-3.5 rounded-xl flex-row items-center justify-center shadow-sm ${
                      isDutyActionPending ? 'opacity-50' : 'active:opacity-90'
                    }`}
                  >
                    {isDutyActionPending ? (
                      <ActivityIndicator size="small" color="#facc15" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons name="play" size={16} color="#facc15" />
                    )}
                    <Text className="text-white text-sm font-bold uppercase ml-2 tracking-wider">
                      {isDutyActionPending ? 'Starting Duty...' : 'Start Shift (Clock In)'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Emergency SOS Action Button */}
            <View className="mb-4">
              <TouchableOpacity
                onPress={() => setShowSosModal(true)}
                disabled={sosCooldown > 0}
                className={`py-4 px-5 rounded-2xl flex-row items-center justify-between shadow-md border ${
                  sosCooldown > 0
                    ? 'bg-amber-500 border-amber-600'
                    : 'bg-red-600 border-red-700'
                }`}
              >
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-full bg-white/20 items-center justify-center mr-3">
                    <Ionicons
                      name={sosCooldown > 0 ? 'time-outline' : 'warning'}
                      size={24}
                      color="#ffffff"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-base font-extrabold uppercase tracking-wide">
                      {sosCooldown > 0
                        ? `Dispatchers Notified (${sosCooldown}s)`
                        : 'Emergency Cabin SOS'}
                    </Text>
                    <Text className="text-white/80 text-xs">
                      {sosCooldown > 0
                        ? 'Alert transmitted with GPS. Cooldown active.'
                        : 'Tap for immediate roadside & medical assistance'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Active / Scheduled Trip Summary Card */}
            <View className="bg-[#f4f5f7] rounded-2xl p-5 mb-5 border border-gray-200">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider">
                  Trip Dispatch Status
                </Text>
                {activeTrip ? (
                  <View className="bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-emerald-800 text-[11px] font-bold">DISPATCHED</Text>
                  </View>
                ) : (
                  <View className="bg-gray-200 px-2.5 py-0.5 rounded-full">
                    <Text className="text-gray-600 text-[11px] font-semibold">IDLE AT YARD</Text>
                  </View>
                )}
              </View>

              {activeTrip ? (
                <View className="space-y-2">
                  <View className="flex-row justify-between py-1 border-b border-gray-200/60">
                    <Text className="text-xs text-gray-500">Route Zone:</Text>
                    <Text className="text-xs font-bold text-[#0d4761]">
                      {activeTrip.zone_name || activeTrip.zone_id || 'Assigned Zone'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-1 border-b border-gray-200/60">
                    <Text className="text-xs text-gray-500">Sales Partner:</Text>
                    <Text className="text-xs font-bold text-[#0d4761]">
                      {activeTrip.sales_user_name || 'Assigned Sales Agent'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-xs text-gray-500">Departure Window:</Text>
                    <Text className="text-xs font-bold text-[#0d4761]">
                      {new Date(activeTrip.dispatched_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="py-2 items-center">
                  <Text className="text-xs text-gray-600 text-center font-medium">
                    No active route dispatch at this moment. Truck is in yard standby.
                  </Text>
                </View>
              )}
            </View>

            {/* Cabin Quick-Action Bar */}
            <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2.5">
              Cabin Quick Actions
            </Text>
            <View className="flex-row gap-3">
              {/* Log Fuel */}
              <TouchableOpacity
                onPress={() => setShowFuelModal(true)}
                className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 items-center justify-center shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center mb-2">
                  <Ionicons name="water-outline" size={24} color="#0d4761" />
                </View>
                <Text className="text-xs font-bold text-[#0d4761] text-center">Log Fuel</Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">Record refill</Text>
              </TouchableOpacity>

              {/* Report Citation */}
              <TouchableOpacity
                onPress={() => setShowApprehensionModal(true)}
                className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 items-center justify-center shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-amber-50 items-center justify-center mb-2">
                  <Ionicons name="document-text-outline" size={24} color="#d97706" />
                </View>
                <Text className="text-xs font-bold text-[#0d4761] text-center">Report Citation</Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">Traffic ticket</Text>
              </TouchableOpacity>

              {/* Report Issue */}
              <TouchableOpacity
                onPress={() => setShowIssueModal(true)}
                className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 items-center justify-center shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-red-50 items-center justify-center mb-2">
                  <Ionicons name="construct-outline" size={24} color="#dc2626" />
                </View>
                <Text className="text-xs font-bold text-[#0d4761] text-center">Report Issue</Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">Breakdown finding</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Nav for Driver */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} tabs={DRIVER_TABS} />

      {/* Operational Modals */}
      <FuelEntryModal
        visible={showFuelModal}
        onClose={() => setShowFuelModal(false)}
        user={user}
        telemetry={telemetry}
        onSuccess={() => loadDashboardData()}
      />

      <ApprehensionModal
        visible={showApprehensionModal}
        onClose={() => setShowApprehensionModal(false)}
        user={user}
        telemetry={telemetry}
        onSuccess={() => loadDashboardData()}
      />

      <VehicleIssueModal
        visible={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        user={user}
        telemetry={telemetry}
        onSuccess={() => loadDashboardData()}
      />

      <EmergencySosModal
        visible={showSosModal}
        onClose={() => setShowSosModal(false)}
        user={user}
        onSosDispatched={handleSosDispatched}
      />
    </View>
  );
};

export default DriverDashboardScreen;
