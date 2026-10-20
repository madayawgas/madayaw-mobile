import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';
import { customerApi } from '../../api/endpoints/customerApi';
import { customerRepository } from '../../database';
import { networkSentinel } from '../../sync/networkSentinel';

const CustomerDetailsScreen = ({ customer, activeTrip, onBack, onEdit, onAddOrder }) => {
  const [localCustomer, setLocalCustomer] = useState(customer);
  const [localBalances, setLocalBalances] = useState([]);
  const [enrichedData, setEnrichedData] = useState(null);
  const [fetchingRemote, setFetchingRemote] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadLocalAndRemoteData = async () => {
      if (!customer?.id) return;

      // 1. Authoritative local SQLite customer and canister ledger balances
      try {
        const [dbCustomer, dbBalances] = await Promise.all([
          customerRepository.getCustomerById(customer.id),
          customerRepository.getCustomerCanisterBalances(customer.id),
        ]);
        if (isMounted) {
          if (dbCustomer) setLocalCustomer(dbCustomer);
          if (dbBalances) setLocalBalances(dbBalances);
        }
      } catch (err) {
        console.warn('[CustomerDetailsScreen] Failed to load local customer data:', err);
      }

      // 2. If customer has a server UUID and device is online, fetch detailed remote enriched data
      if (!customer?.is_locally_created && networkSentinel.isOnline()) {
        try {
          setFetchingRemote(true);
          const remoteDetails = await customerApi.getCustomerById(customer.id);
          if (isMounted && remoteDetails) {
            setEnrichedData(remoteDetails);
          }
        } catch (_err) {
          // Silent fallback to local customer data
        } finally {
          if (isMounted) setFetchingRemote(false);
        }
      }
    };

    loadLocalAndRemoteData();

    return () => {
      isMounted = false;
    };
  }, [customer?.id, customer?.is_locally_created]);

  const activeCustomer = localCustomer || customer;

  const displayName =
    activeCustomer?.business_name || activeCustomer?.name || activeCustomer?.contact_person || 'Customer';
  const contactPerson = activeCustomer?.contact_person || activeCustomer?.contactPerson;
  const showContactPerson = contactPerson && contactPerson !== displayName;

  const contactNumber =
    activeCustomer?.contactNumber || activeCustomer?.contact_number || activeCustomer?.phone || 'N/A';
  const altContact =
    activeCustomer?.alternateContactNumber || activeCustomer?.alternate_contact_number || null;
  const address =
    activeCustomer?.delivery_address || activeCustomer?.address || activeCustomer?.deliveryAddress || 'No address specified';
  const customerType =
    activeCustomer?.customerType || activeCustomer?.customer_type || 'RETAIL';
  const tinNumber = activeCustomer?.tin || enrichedData?.tin || null;

  const zoneName =
    activeCustomer?.zone_name ||
    enrichedData?.zone?.name ||
    activeCustomer?.zone?.name ||
    activeCustomer?.zone_id ||
    activeTrip?.zone_name ||
    activeTrip?.zone_id ||
    'Standard Zone';

  const canisterBalances = useMemo(() => {
    const balanceMap = new Map();

    // 1. Remote balances from backend if available
    (enrichedData?.canisterBalances || []).forEach((item) => {
      if (item && item.productId) {
        balanceMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName || 'Gas Product',
          netBalance: Number(item.netBalance || item.quantityLoaned || 0),
        });
      }
    });

    // 2. Overlay / add local SQLite canister ledger balances (authoritative for in-field movements)
    (localBalances || []).forEach((item) => {
      if (item && item.productId) {
        const existing = balanceMap.get(item.productId);
        if (existing) {
          // If remote already provided this product, add only the pending (un-synced) balance
          // to avoid double counting once synced.
          const pendingChange = Number(item.pendingBalance || 0);
          balanceMap.set(item.productId, {
            ...existing,
            netBalance: existing.netBalance + pendingChange,
          });
        } else {
          // Product not in remote (new product, or offline mode):
          balanceMap.set(item.productId, {
            productId: item.productId,
            productName: item.productName || 'Gas Product',
            netBalance: Number(item.netBalance || item.pendingBalance || 0),
          });
        }
      }
    });

    return Array.from(balanceMap.values()).filter((b) => b.netBalance > 0);
  }, [enrichedData?.canisterBalances, localBalances]);

  const totalCanisterDebt = useMemo(() => {
    const rawDebt =
      activeCustomer?.canister_debt !== undefined && activeCustomer?.canister_debt !== null
        ? Number(activeCustomer.canister_debt)
        : (enrichedData?.totalNetCanisterDebt !== undefined && enrichedData?.totalNetCanisterDebt !== null
            ? Number(enrichedData.totalNetCanisterDebt)
            : Number(activeCustomer?.canisterDebt ?? 0));

    if (rawDebt === 0 && canisterBalances.length > 0) {
      return canisterBalances.reduce((sum, b) => sum + (Number(b.netBalance) || 0), 0);
    }
    return rawDebt;
  }, [activeCustomer?.canister_debt, activeCustomer?.canisterDebt, enrichedData?.totalNetCanisterDebt, canisterBalances]);

  const createdDate = activeCustomer?.createdAt || activeCustomer?.created_at;
  const formattedCreatedDate = createdDate
    ? new Date(createdDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recently';

  const getTypeColor = (type) => {
    switch (type?.toUpperCase()) {
      case 'COMMERCIAL':
        return 'bg-blue-100 text-blue-800';
      case 'WHOLESALE':
        return 'bg-amber-100 text-amber-800';
      case 'HOUSEHOLD':
        return 'bg-purple-100 text-purple-800';
      case 'RETAIL':
      default:
        return 'bg-emerald-100 text-emerald-800';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f9fafb]">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 pb-6">
          {/* Back Header */}
          <View className="flex-row items-center mb-3">
            <TouchableOpacity
              onPress={onBack}
              activeOpacity={0.7}
              className="w-12 h-12 bg-white rounded-full items-center justify-center border border-gray-100 shadow-sm mr-4"
            >
              <Ionicons name="chevron-back" size={24} color="#0d4761" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-[#0d4761] text-2xl font-bold">Customer Details</Text>
              <Text className="text-gray-400 text-xs">Profile & Receivables Overview</Text>
            </View>
            {fetchingRemote ? (
              <ActivityIndicator color="#0d4761" size="small" />
            ) : onEdit ? (
              <TouchableOpacity
                onPress={() => onEdit(activeCustomer)}
                activeOpacity={0.7}
                className="flex-row items-center bg-[#0d4761]/10 px-3.5 py-2 rounded-full border border-[#0d4761]/20"
              >
                <Ionicons name="create-outline" size={15} color="#0d4761" style={{ marginRight: 4 }} />
                <Text className="text-[#0d4761] text-xs font-bold">Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View className="border-b border-[#D9D9D9] w-full mb-4" />

          {/* Scrollable Details Body */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Customer Profile Card */}
            <View className="bg-white border border-gray-100 rounded-3xl p-5 items-center shadow-xs mb-4">
              <View className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 items-center justify-center mb-3 border border-gray-100">
                <Image
                  source={require('../../../assets/images/placeholder.png')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>

              <Text className="text-[#0d4761] text-xl font-bold text-center mb-0.5">
                {displayName}
              </Text>

              {showContactPerson ? (
                <View className="flex-row items-center justify-center mt-1 mb-2 bg-[#0d4761]/5 px-3 py-1 rounded-full">
                  <Ionicons name="person-circle-outline" size={14} color="#0d4761" style={{ marginRight: 4 }} />
                  <Text className="text-[#0d4761] text-xs font-semibold">
                    Customer: {contactPerson}
                  </Text>
                </View>
              ) : null}

              {/* Status & Type Badges */}
              <View className="flex-row items-center gap-2 mt-1">
                <View className={`px-3 py-1 rounded-full ${getTypeColor(customerType)}`}>
                  <Text className="text-[10px] font-bold uppercase tracking-wider">
                    {customerType}
                  </Text>
                </View>

                <View className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <Text className="text-emerald-700 text-[10px] font-bold uppercase">Active</Text>
                </View>

                {activeCustomer?.is_locally_created && (
                  <View className="bg-amber-50 border border-amber-200 px-3 py-1 rounded-full flex-row items-center">
                    <Ionicons name="cloud-offline-outline" size={12} color="#d97706" style={{ marginRight: 3 }} />
                    <Text className="text-amber-700 text-[10px] font-bold uppercase">Pending Sync</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Contact & Delivery Details Card */}
            <View className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs mb-4">
              <Text className="text-[#0d4761] font-bold text-xs uppercase tracking-wider mb-3">
                Contact & Delivery Details
              </Text>

              {/* Primary Contact Number */}
              <View className="flex-row items-center py-2 border-b border-gray-50">
                <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
                  <Ionicons name="call-outline" size={16} color="#0d4761" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-[10px]">Primary Contact</Text>
                  <Text className="text-[#0d4761] text-sm font-semibold">{contactNumber}</Text>
                </View>
              </View>

              {/* Alternate Contact Number (if present) */}
              {altContact && (
                <View className="flex-row items-center py-2 border-b border-gray-50">
                  <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
                    <Ionicons name="phone-portrait-outline" size={16} color="#0d4761" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-400 text-[10px]">Alternate Contact</Text>
                    <Text className="text-[#0d4761] text-sm font-semibold">{altContact}</Text>
                  </View>
                </View>
              )}

              {/* Delivery Address */}
              <View className="flex-row items-start py-2 border-b border-gray-50">
                <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3 mt-0.5">
                  <Ionicons name="location-outline" size={16} color="#0d4761" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-[10px]">Delivery Address</Text>
                  <Text className="text-[#0d4761] text-sm font-medium leading-relaxed">
                    {address}
                  </Text>
                </View>
              </View>

              {/* Service Zone */}
              <View className="flex-row items-center py-2 border-b border-gray-50">
                <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
                  <Ionicons name="map-outline" size={16} color="#0d4761" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-[10px]">Assigned Service Zone</Text>
                  <Text className="text-[#0d4761] text-sm font-semibold">{zoneName}</Text>
                </View>
              </View>

              {/* Tax Identification Number (TIN) (if present) */}
              {tinNumber && (
                <View className="flex-row items-center py-2">
                  <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
                    <Ionicons name="document-text-outline" size={16} color="#0d4761" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-400 text-[10px]">Tax ID (TIN)</Text>
                    <Text className="text-[#0d4761] text-sm font-semibold">{tinNumber}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Canister Receivables & Balances Card */}
            <View className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs mb-4">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-[#0d4761] font-bold text-xs uppercase tracking-wider">
                  Canister Receivables
                </Text>
                <Text className="text-gray-400 text-[10px]">Cylinders on loan</Text>
              </View>

              {/* Total Debt Number Banner */}
              <View className="bg-[#f4f5f7] rounded-xl p-3 flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-gray-500 text-xs">Total Running Canister Debt</Text>
                  <Text className="text-[10px] text-gray-400">Net unreturned cylinders</Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`text-2xl font-bold ${
                      totalCanisterDebt > 0 ? 'text-amber-600' : 'text-[#0d4761]'
                    }`}
                  >
                    {totalCanisterDebt}{' '}
                    <Text className="text-xs font-normal text-gray-500">canisters</Text>
                  </Text>
                </View>
              </View>

              {/* SKU Breakdown (if available from backend) */}
              {canisterBalances.length > 0 ? (
                <View className="mt-1 pt-2 border-t border-gray-100">
                  <Text className="text-gray-500 text-[11px] font-semibold mb-2">
                    Receivables by Product SKU:
                  </Text>
                  {canisterBalances.map((item, idx) => (
                    <View
                      key={item.productId || idx}
                      className="flex-row justify-between items-center py-1.5 border-b border-gray-50"
                    >
                      <Text className="text-gray-700 text-xs">{item.productName}</Text>
                      <Text className="text-[#0d4761] text-xs font-bold">
                        {item.netBalance} loaned
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Member Registration Date */}
              <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-gray-50">
                <Text className="text-gray-400 text-[11px]">Customer Since:</Text>
                <Text className="text-gray-600 text-[11px] font-medium">{formattedCreatedDate}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Action Button */}
          <PrimaryButton title="ADD ORDER" onPress={onAddOrder} />
        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default CustomerDetailsScreen;
