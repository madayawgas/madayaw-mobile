import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomNav from '../../components/navigation/BottomNav';
import DashboardDesign from '../../../assets/svg/dashboard-bg.svg';
import { salesService } from '../../services/salesService';
import { syncScheduler } from '../../sync/syncScheduler';
import { syncWorker } from '../../sync/syncWorker';
import { driverRealtimeManager } from '../../realtime/driverRealtimeManager';

const DashboardScreen = ({ user, activeTab, onSelectTab }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    trip: null,
    totalSales: 0,
    recentOrders: [],
    inventory: [],
    pendingSyncCount: 0,
    isOnline: true,
  });

  const loadData = useCallback(async () => {
    try {
      const data = await salesService.getDashboardData(user?.id);
      setDashboardData(data);
    } catch (err) {
      console.warn('[DashboardScreen] Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();

    // Subscribe to sync scheduler updates to reactively refresh on sync completion
    const unsubSync = syncScheduler.subscribe(() => {
      loadData();
    });

    // Subscribe to real-time dispatch and stock events to reload immediately
    const unsubRealtime = driverRealtimeManager.subscribe((event) => {
      if (
        event === 'TRIP_DISPATCHED' ||
        event === 'TRIP_LOAD_RECORDED' ||
        event === 'VEHICLE_STOCK_UPDATED' ||
        event === 'TRIP_COMPLETED' ||
        event === 'TRIP_CANCELLED' ||
        event === 'TRIP_RECONCILED'
      ) {
        loadData();
      }
    });

    return () => {
      if (unsubSync) unsubSync();
      if (unsubRealtime) unsubRealtime();
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (dashboardData.isOnline) {
      try {
        await syncWorker.runSyncCycle(25, user?.id);
      } catch (_e) {
        // sync error handled internally
      }
    }
    await loadData();
  }, [dashboardData.isOnline, loadData, user]);

  const activeTrip = dashboardData.trip;
  const isTripActive = Boolean(activeTrip && activeTrip.status === 'IN_PROGRESS');
  const inventoryItems = dashboardData.inventory || [];

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
        {/* Header Section with SVG Background */}
        <View className="relative w-full h-72 bg-white">
          <View className="absolute top-0 left-0 right-0 bottom-0 w-full">
            <DashboardDesign width="100%" height="100%" preserveAspectRatio="none" />
          </View>

          <View className="pt-16 px-6 flex-row justify-between items-start">
            <View>
              <Text className="text-white text-4xl font-bold">Welcome,</Text>
              <Text className="text-white text-xl mt-1">
                {user?.firstName || user?.username || 'Sales Agent'}!
              </Text>
            </View>

            {/* Network / Sync Status Pill */}
            <View
              className={`flex-row items-center px-3 py-1.5 rounded-full ${
                dashboardData.isOnline ? 'bg-emerald-500/20 border border-emerald-400/40' : 'bg-amber-500/20 border border-amber-400/40'
              }`}
            >
              <View
                className={`w-2 h-2 rounded-full mr-2 ${
                  dashboardData.isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <Text className="text-white text-[11px] font-semibold tracking-wider">
                {dashboardData.isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Main Content */}
        <View className="px-6 -mt-24 z-10">
          {/* Active Trip / Delivery Route Card */}
          <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-5">
            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-row items-center">
                <Ionicons
                  name={isTripActive ? 'navigate-circle' : 'time-outline'}
                  size={20}
                  color={isTripActive ? '#10b981' : '#64748b'}
                  className="mr-2"
                />
                <Text className="text-[#0d4761] font-bold text-sm">
                  {isTripActive ? 'ACTIVE ROUTE DELIVERY' : 'DELIVERY ASSIGNMENT'}
                </Text>
              </View>

              <View
                className={`px-2.5 py-0.5 rounded-full ${
                  isTripActive ? 'bg-emerald-100' : 'bg-slate-100'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold uppercase ${
                    isTripActive ? 'text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  {activeTrip?.status || 'STANDBY'}
                </Text>
              </View>
            </View>

            {activeTrip ? (
              <View className="space-y-2">
                <View className="flex-row justify-between items-center py-1 border-b border-gray-50">
                  <Text className="text-gray-500 text-xs font-medium">Trip Number:</Text>
                  <Text className="text-[#0d4761] text-xs font-bold">{activeTrip.trip_number}</Text>
                </View>
                <View className="flex-row justify-between items-center py-1 border-b border-gray-50">
                  <Text className="text-gray-500 text-xs font-medium">Service Zone:</Text>
                  <Text className="text-[#0d4761] text-xs font-bold">
                    {activeTrip.zone_name || activeTrip.zone_id || 'Default Route'}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center py-1 border-b border-gray-50">
                  <Text className="text-gray-500 text-xs font-medium">Driver:</Text>
                  <Text className="text-[#0d4761] text-xs font-bold">{activeTrip.driver_name}</Text>
                </View>
                <View className="flex-row justify-between items-center py-1">
                  <Text className="text-gray-500 text-xs font-medium">Vehicle Plate & Model:</Text>
                  <Text className="text-[#0d4761] text-xs font-bold">
                    {activeTrip.vehicle_plate}
                    {activeTrip.truck_model ? ` (${activeTrip.truck_model})` : ''}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="py-2 items-center">
                <Text className="text-gray-400 text-xs text-center">
                  No active delivery trip assigned today. Pull down to refresh or check with dispatch.
                </Text>
              </View>
            )}
          </View>

          {/* Total Sales Section */}
          <Text className="text-[#0d4761] font-bold mb-2">Total Sales (Active Shift):</Text>
          <View className="bg-[#f4f5f7] rounded-xl flex-row justify-between items-center px-4 py-4 mb-6">
            <View>
              <Text className="text-[#0d4761] text-3xl font-bold">
                ₱{' '}
                {(dashboardData.totalSales || 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text className="text-gray-400 text-[10px] mt-0.5">Real-time local recorded gross sales</Text>
            </View>
            <TouchableOpacity
              onPress={() => onSelectTab && onSelectTab('sales')}
              activeOpacity={0.8}
              className="bg-[#facc15] px-4 py-2.5 rounded-full shadow-sm"
            >
              <Text className="text-[#0d4761] text-xs font-bold uppercase tracking-wider">New Order</Text>
            </TouchableOpacity>
          </View>

          {/* Pending Sync Alert Banner (if any) */}
          {dashboardData.pendingSyncCount > 0 && (
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex-row items-center mb-6">
              <Ionicons name="cloud-upload-outline" size={20} color="#d97706" className="mr-2" />
              <View className="flex-1">
                <Text className="text-amber-900 font-bold text-xs">
                  {dashboardData.pendingSyncCount} record(s) queued for synchronization
                </Text>
                <Text className="text-amber-700 text-[10px] mt-0.5">
                  Transactions and offline customers will upload automatically when online.
                </Text>
              </View>
            </View>
          )}

          {/* Vehicle Inventory Section (Discrete Integer Units) */}
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-[#0d4761] font-bold">Vehicle Inventory on Board:</Text>
            <Text className="text-gray-400 text-[10px]">Remaining / Loaded</Text>
          </View>

          <View className="bg-[#f4f5f7] rounded-xl p-4 mb-6">
            {inventoryItems.length > 0 ? (
              inventoryItems.map((inv, idx) => (
                <View
                  key={inv.product_id || idx}
                  className={`flex-row justify-between items-center py-2 ${
                    idx < inventoryItems.length - 1 ? 'border-b border-gray-200/60' : ''
                  }`}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[#0d4761] font-bold text-xs">
                      {inv.product_name}
                    </Text>
                    <Text className="text-gray-400 text-[10px]">
                      Sold: {inv.quantity_sold || 0} unit(s)
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[#0d4761] font-bold text-sm">
                      {inv.quantity_remaining || 0}{' '}
                      <Text className="text-gray-400 text-xs font-normal">
                        / {inv.quantity_loaded || 0}
                      </Text>
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View className="py-2 items-center">
                <Text className="text-gray-400 text-xs">
                  Inventory not loaded yet for this shift.
                </Text>
              </View>
            )}
          </View>

          {/* Recent Transactions Section */}
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-[#0d4761] font-bold">Recent Transactions:</Text>
            {dashboardData.recentOrders?.length > 0 && (
              <Text className="text-gray-400 text-[10px]">
                Showing latest {dashboardData.recentOrders.length}
              </Text>
            )}
          </View>

          {loading ? (
            <View className="bg-[#f4f5f7] rounded-xl h-36 items-center justify-center">
              <ActivityIndicator color="#0d4761" size="small" />
            </View>
          ) : dashboardData.recentOrders && dashboardData.recentOrders.length > 0 ? (
            <View className="bg-[#f4f5f7] rounded-xl p-3 mb-6">
              {dashboardData.recentOrders.map((ord, idx) => {
                const isSynced = ord.sync_status === 'SYNCED';
                const isQuarantined = ord.sync_status === 'QUARANTINED' || ord.sync_status === 'FAILED';
                const formattedTime = ord.transacted_at
                  ? new Date(ord.transacted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <View
                    key={ord.id || idx}
                    className={`p-2.5 rounded-lg bg-white mb-2 border border-gray-100 ${
                      idx === dashboardData.recentOrders.length - 1 ? 'mb-0' : ''
                    }`}
                  >
                    <View className="flex-row justify-between items-start mb-1">
                      <View className="flex-1 pr-2">
                        <Text className="text-[#0d4761] font-bold text-xs" numberOfLines={1}>
                          {ord.receipt_number || ord.transaction_no}
                        </Text>
                        <Text className="text-gray-600 text-[11px] font-medium" numberOfLines={1}>
                          {ord.customer_name || 'Customer'}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[#0d4761] font-bold text-xs">
                          ₱ {Number(ord.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Text>
                        <Text className="text-gray-400 text-[9px]">{formattedTime}</Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between items-center mt-1 pt-1 border-t border-gray-50">
                      <View className="bg-gray-100 px-2 py-0.5 rounded">
                        <Text className="text-gray-600 text-[9px] font-bold uppercase">
                          {ord.payment_method || 'CASH'}
                        </Text>
                      </View>

                      <View
                        className={`px-2 py-0.5 rounded-full ${
                          isSynced
                            ? 'bg-emerald-100'
                            : isQuarantined
                            ? 'bg-rose-100'
                            : 'bg-amber-100'
                        }`}
                      >
                        <Text
                          className={`text-[9px] font-bold uppercase ${
                            isSynced
                              ? 'text-emerald-700'
                              : isQuarantined
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {ord.sync_status || 'PENDING'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="bg-[#f4f5f7] rounded-xl p-6 items-center justify-center mb-6">
              <Ionicons name="receipt-outline" size={32} color="#9ca3af" />
              <Text className="text-[#0d4761] font-bold text-sm mt-2">No Transactions Yet</Text>
              <Text className="text-gray-400 text-xs text-center mt-1">
                Completed orders transacted during this delivery shift will appear here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </View>
  );
};

export default DashboardScreen;
