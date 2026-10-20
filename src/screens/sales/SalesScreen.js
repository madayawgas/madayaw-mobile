import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomerCard from '../../components/sales/CustomerCard';
import BottomNav from '../../components/navigation/BottomNav';
import AddCustomerScreen from './AddCustomerScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import NewOrderScreen from './NewOrderScreen';
import ConfirmOrderScreen from './ConfirmOrderScreen';
import ReceiptScreen from './ReceiptScreen';
import { salesService } from '../../services/salesService';
import { tripRepository, customerRepository } from '../../database';
import { useBackHandler } from '../../hooks/useBackHandler';

const SalesScreen = ({ activeTab = 'sales', onSelectTab }) => {
  const [customers, setCustomers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active delivery and zone filter context (default 'ALL' to display all zones)
  const [activeTrip, setActiveTrip] = useState(null);
  const [availableZones, setAvailableZones] = useState([]);
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('ASC'); // 'ASC' | 'DESC' | 'RECENT'

  // Sub-screen navigation states: 'list' | 'add' | 'edit' | 'details' | 'new_order' | 'confirm' | 'receipt'
  const [subStep, setSubStep] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [orderQuantities, setOrderQuantities] = useState({});
  const [completedOrderData, setCompletedOrderData] = useState(null);

  // 1. Load active delivery trip context and available service zones with friendly names
  const loadTripContext = useCallback(async () => {
    try {
      const [trip, allZones, custZones] = await Promise.all([
        salesService.resolveActiveTripForUser(),
        salesService.syncZones(),
        customerRepository.getAvailableZones(),
      ]);
      setActiveTrip(trip);

      // Combine service zones and customer zone associations into a distinct named list
      const zoneMap = new Map();
      (allZones || []).forEach((z) => {
        if (z && z.id) {
          zoneMap.set(z.id, { id: z.id, name: z.name || z.code || z.id, code: z.code });
        }
      });
      (custZones || []).forEach((cz) => {
        if (cz && cz.id && !zoneMap.has(cz.id)) {
          zoneMap.set(cz.id, { id: cz.id, name: cz.name || cz.id, code: cz.code });
        }
      });

      setAvailableZones(Array.from(zoneMap.values()));
    } catch (err) {
      console.warn('[SalesScreen] Failed to load active trip / zones:', err);
    }
  }, []);

  // 2. Load customer catalog and products
  const loadData = useCallback(async (zoneIdOverride, sortOverride) => {
    try {
      const effectiveZone = zoneIdOverride !== undefined ? zoneIdOverride : selectedZoneFilter;
      const effectiveSort = sortOverride !== undefined ? sortOverride : sortOrder;

      const [customerRes, productData] = await Promise.all([
        salesService.getCustomers(effectiveZone, searchQuery, effectiveSort),
        salesService.getProductCatalog(),
      ]);

      setCustomers(customerRes?.customers || []);
      setAllProducts(productData || []);
    } catch (error) {
      console.error('[SalesScreen] Error loading customer data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, selectedZoneFilter, sortOrder]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await loadTripContext();
      await loadData();
    };
    init();
  }, [loadTripContext, loadData]);

  // Reload data when zone filter or sort order changes
  const handleZoneFilterChange = (newZone) => {
    setSelectedZoneFilter(newZone);
    loadData(newZone, sortOrder);
  };

  const handleToggleSort = () => {
    let nextSort = 'ASC';
    if (sortOrder === 'ASC') nextSort = 'DESC';
    else if (sortOrder === 'DESC') nextSort = 'RECENT';
    else nextSort = 'ASC';

    setSortOrder(nextSort);
    loadData(selectedZoneFilter, nextSort);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTripContext();
    await loadData();
  }, [loadData, loadTripContext]);

  // Search filtering in UI
  const filteredCustomers = customers.filter((item) => {
    if (!searchQuery || searchQuery.trim() === '') return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = (item.name || '').toLowerCase().includes(query);
    const businessMatch = (item.business_name || '').toLowerCase().includes(query);
    const contactPersonMatch = (item.contact_person || '').toLowerCase().includes(query);
    const phoneMatch = (item.contactNumber || item.contact_number || '').includes(query);
    const addressMatch = (item.delivery_address || item.address || '').toLowerCase().includes(query);
    return nameMatch || businessMatch || contactPersonMatch || phoneMatch || addressMatch;
  });

  const selectedProductsList = allProducts.filter((p) =>
    selectedProductIds.includes(p.id)
  );

  // Hardware Back Press Navigation Handler for Sales sub-steps
  useBackHandler(() => {
    if (subStep === 'receipt') {
      handleDoneReceipt();
      return true;
    }
    if (subStep === 'confirm') {
      setSubStep('new_order');
      return true;
    }
    if (subStep === 'new_order') {
      setSubStep('details');
      return true;
    }
    if (subStep === 'edit') {
      setSubStep('details');
      return true;
    }
    if (subStep === 'add') {
      setSubStep('list');
      return true;
    }
    if (subStep === 'details') {
      setSubStep('list');
      return true;
    }
    if (subStep === 'list') {
      if (searchQuery && searchQuery.trim().length > 0) {
        setSearchQuery('');
        return true;
      }
      return false;
    }
    return false;
  }, activeTab === 'sales' || activeTab === 'customer');

  const handleConfirmOrder = async (orderSummaryData) => {
    if (isSubmitting) return;

    if (!activeTrip || activeTrip.status !== 'IN_PROGRESS') {
      Alert.alert(
        'No Active Trip',
        'You cannot complete a transaction without an assigned active delivery trip.'
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const formattedItems = Object.keys(orderSummaryData.quantities)
        .filter((pId) => (orderSummaryData.quantities[pId] || 0) > 0)
        .map((pId) => {
          const product = allProducts.find((p) => p.id === pId);
          return {
            id: pId,
            productId: pId,
            name: product?.name || 'Unknown Product',
            price: product?.price || 0,
            quantity: orderSummaryData.quantities[pId],
            quantitySold: orderSummaryData.quantities[pId],
            emptiesReturned: 0,
            emptiesDefective: 0,
            unitPrice: product?.price || 0,
            subtotal: (orderSummaryData.quantities[pId] || 0) * (product?.price || 0),
          };
        });

      if (formattedItems.length === 0) {
        Alert.alert('Empty Order', 'Please select at least one product with a quantity.');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.business_name || selectedCustomer?.name,
        items: formattedItems,
        totalAmount: orderSummaryData.total,
        paymentMethod: orderSummaryData.paymentMethod || 'CASH',
        paymentProofUri: orderSummaryData.receiptPhotoUri || null,
      };

      const result = await salesService.createOrder(payload);

      if (result.success) {
        const updatedCustomer = selectedCustomer
          ? {
              ...selectedCustomer,
              canister_debt:
                result.data?.newCustomerDebt !== undefined
                  ? result.data.newCustomerDebt
                  : selectedCustomer.canister_debt,
            }
          : selectedCustomer;

        if (updatedCustomer) {
          setSelectedCustomer(updatedCustomer);
          setCustomers((prev) =>
            prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
          );
        }

        setCompletedOrderData({
          order: result.data ? {
            id: result.data.orderId,
            transaction_no: result.data.transactionNo || `TX-${result.data.orderId.slice(0, 8)}`,
            receipt_number: result.data.receiptNumber,
            total_amount: result.data.totalAmount,
            payment_method: payload.paymentMethod,
            payment_reference: payload.paymentProofUri,
            customer_id: selectedCustomer?.id,
            customer_name: payload.customerName,
            transacted_at: result.data.createdAt || new Date().toISOString(),
            sync_status: result.data.status || 'PENDING',
          } : null,
          items: formattedItems,
          customer: updatedCustomer,
          trip: activeTrip,
          paymentProofUri: orderSummaryData.receiptPhotoUri,
        });

        setSubStep('receipt');
      } else {
        Alert.alert('Order Failed', result?.message || 'Could not record sale.');
      }
    } catch (err) {
      console.error('[SalesScreen] Order creation failed:', err);
      Alert.alert('Transaction Error', err?.message || 'Failed to complete sales transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDoneReceipt = () => {
    setSubStep('list');
    setSelectedProductIds([]);
    setOrderQuantities({});
    setSelectedCustomer(null);
    setCompletedOrderData(null);
    loadData();
  };

  const handleAddCustomer = async (customerData) => {
    try {
      const newCust = await salesService.registerCustomer(customerData);
      setCustomers((prev) => [newCust, ...prev]);
      setSubStep('list');
      Alert.alert(
        'Customer Added',
        newCust.is_locally_created
          ? `Customer "${newCust.name}" saved offline. Will sync automatically when online.`
          : `Customer "${newCust.name}" has been registered.`
      );
    } catch (e) {
      console.warn('[SalesScreen] Failed to add customer:', e);
      Alert.alert('Registration Failed', e?.message || 'Could not register customer.');
    }
  };

  const handleUpdateCustomer = async (customerData, customerId) => {
    try {
      const updated = await salesService.updateCustomer(customerId, customerData);
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...updated } : c)));
      setSelectedCustomer((prev) => (prev && prev.id === customerId ? { ...prev, ...updated } : prev));
      setSubStep('details');
      Alert.alert('Customer Updated', `Customer "${updated.name}" has been updated.`);
    } catch (e) {
      console.warn('[SalesScreen] Failed to update customer:', e);
      Alert.alert('Update Failed', e?.message || 'Could not update customer details.');
    }
  };

  if (subStep === 'receipt' && completedOrderData) {
    return (
      <ReceiptScreen
        orderData={completedOrderData}
        onDone={handleDoneReceipt}
      />
    );
  }

  if (subStep === 'add') {
    return (
      <AddCustomerScreen
        activeTrip={activeTrip}
        onBack={() => setSubStep('list')}
        onSubmit={handleAddCustomer}
      />
    );
  }

  if (subStep === 'edit') {
    return (
      <AddCustomerScreen
        initialCustomer={selectedCustomer}
        activeTrip={activeTrip}
        onBack={() => setSubStep('details')}
        onSubmit={handleUpdateCustomer}
      />
    );
  }

  if (subStep === 'details') {
    return (
      <CustomerDetailsScreen
        customer={selectedCustomer}
        activeTrip={activeTrip}
        onBack={() => setSubStep('list')}
        onEdit={() => setSubStep('edit')}
        onAddOrder={() => {
          if (!activeTrip || activeTrip.status !== 'IN_PROGRESS') {
            Alert.alert(
              'No Active Trip',
              'You cannot make a sale without an assigned active delivery trip. Please check your trip assignment.'
            );
            return;
          }
          setSelectedProductIds([]);
          setOrderQuantities({});
          setSubStep('new_order');
        }}
      />
    );
  }

  if (subStep === 'new_order') {
    return (
      <NewOrderScreen
        customer={selectedCustomer}
        initialSelectedProductIds={selectedProductIds}
        initialQuantities={orderQuantities}
        onBack={() => setSubStep('details')}
        onContinue={(productIds) => {
          setSelectedProductIds(productIds);
          setOrderQuantities((prev) => {
            const next = {};
            productIds.forEach((id) => {
              next[id] =
                orderQuantities[id] !== undefined && orderQuantities[id] > 0
                  ? orderQuantities[id]
                  : prev[id] !== undefined && prev[id] > 0
                  ? prev[id]
                  : 1;
            });
            return next;
          });
          setSubStep('confirm');
        }}
      />
    );
  }

  if (subStep === 'confirm') {
    return (
      <ConfirmOrderScreen
        customer={selectedCustomer}
        selectedProducts={selectedProductsList}
        allProducts={allProducts}
        initialQuantities={orderQuantities}
        isSubmitting={isSubmitting}
        onQuantitiesChange={(newQtys, newProductIds) => {
          setOrderQuantities(newQtys);
          if (newProductIds) {
            setSelectedProductIds(newProductIds);
          }
        }}
        onAddMoreProducts={(currentQtys, currentProductIds) => {
          if (currentQtys) {
            setOrderQuantities(currentQtys);
          }
          if (currentProductIds) {
            setSelectedProductIds(currentProductIds);
          }
          setSubStep('new_order');
        }}
        onBack={(currentQtys, currentProductIds) => {
          if (currentQtys) {
            setOrderQuantities(currentQtys);
          }
          if (currentProductIds) {
            setSelectedProductIds(currentProductIds);
          }
          setSubStep('new_order');
        }}
        onConfirm={handleConfirmOrder}
      />
    );
  }

  const getSortLabel = () => {
    if (sortOrder === 'ASC') return 'A - Z';
    if (sortOrder === 'DESC') return 'Z - A';
    return 'RECENT';
  };

  const activeFilterZone = availableZones.find((z) => z.id === selectedZoneFilter);
  const activeZoneLabel =
    activeFilterZone?.name ||
    (activeTrip && selectedZoneFilter === activeTrip.zone_id
      ? activeTrip.zone_name || 'Active Route'
      : selectedZoneFilter);

  const zoneOptions = [
    { id: 'ALL', label: 'All Zones', isActiveTrip: false },
    ...(activeTrip && activeTrip.zone_id
      ? [
          {
            id: activeTrip.zone_id,
            label: `Route: ${
              activeTrip.zone_name ||
              availableZones.find((z) => z.id === activeTrip.zone_id)?.name ||
              'Current Route'
            }`,
            isActiveTrip: true,
          },
        ]
      : []),
    ...availableZones
      .filter((z) => !activeTrip || z.id !== activeTrip.zone_id)
      .map((z) => ({
        id: z.id,
        label: z.name || z.code || z.id,
        isActiveTrip: false,
      })),
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#f9fafb]">
      <View className="flex-1 px-6 pt-4 pb-0">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-[#0d4761] text-3xl font-bold tracking-tight">Sales</Text>
            <Text className="text-gray-400 text-xs">Customer directory & field sales register</Text>
          </View>

          {/* Quick Route Status Pill */}
          {activeTrip ? (
            <View className="bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
              <Text className="text-emerald-800 text-[11px] font-bold">
                {activeTrip.trip_number || 'ACTIVE TRIP'}
              </Text>
            </View>
          ) : (
            <View className="bg-gray-100 border border-gray-300 px-3 py-1 rounded-full flex-row items-center">
              <Text className="text-gray-600 text-[11px] font-medium">Standby</Text>
            </View>
          )}
        </View>

        {/* Search Bar & Sort Button */}
        <View className="flex-row items-center space-x-2 mb-3">
          <View className="flex-1 flex-row items-center bg-white border border-[#D9D9D9] rounded-full px-4 py-2.5 shadow-sm mr-2">
            <Ionicons name="search" size={18} color="#0d4761" className="mr-2" />
            <TextInput
              placeholder="Search customer, store, address..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 text-[#0d4761] text-sm py-0"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Toggle Button */}
          <TouchableOpacity
            onPress={handleToggleSort}
            activeOpacity={0.8}
            className="bg-white border border-[#D9D9D9] px-3 py-2.5 rounded-full flex-row items-center shadow-sm"
          >
            <Ionicons name="swap-vertical" size={16} color="#0d4761" className="mr-1" />
            <Text className="text-[#0d4761] text-xs font-bold">{getSortLabel()}</Text>
          </TouchableOpacity>
        </View>

        {/* Zone Horizontal Filter Bar */}
        <View className="mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16 }}
            className="flex-row"
          >
            {zoneOptions.map((opt) => {
              const isSelected = selectedZoneFilter === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleZoneFilterChange(opt.id)}
                  activeOpacity={0.7}
                  className={`px-3.5 py-1.5 rounded-full mr-2 border flex-row items-center ${
                    isSelected
                      ? 'bg-[#0d4761] border-[#0d4761]'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {opt.isActiveTrip && (
                    <Ionicons
                      name="navigate"
                      size={12}
                      color={isSelected ? '#facc15' : '#0d4761'}
                      className="mr-1"
                    />
                  )}
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Customer Catalog List */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0d4761" />
            <Text className="text-gray-400 text-xs mt-2">Loading customer directory...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CustomerCard
                customer={item}
                name={item.business_name || item.name}
                contact={item.contact_person || item.phone || item.contact_number}
                dateString={item.created_at}
                customerType={item.customer_type}
                isLocallyCreated={item.is_locally_created === 1 || item.is_locally_created === true}
                onPress={() => {
                  setSelectedCustomer(item);
                  setSubStep('details');
                }}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 170 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0d4761"
                colors={['#0d4761']}
              />
            }
            ListEmptyComponent={
              <View className="py-12 items-center justify-center">
                <Ionicons name="people-outline" size={48} color="#cbd5e1" />
                <Text className="text-gray-500 font-bold text-sm mt-3">No customers found</Text>
                <Text className="text-gray-400 text-xs text-center mt-1 px-4">
                  {searchQuery
                    ? `No matches for "${searchQuery}" in ${activeZoneLabel}.`
                    : `No customers registered under ${activeZoneLabel}.`}
                </Text>

                {selectedZoneFilter !== 'ALL' && (
                  <TouchableOpacity
                    onPress={() => handleZoneFilterChange('ALL')}
                    activeOpacity={0.8}
                    className="mt-4 bg-[#0d4761] px-4 py-2 rounded-full"
                  >
                    <Text className="text-white text-xs font-bold">View Customers in All Zones</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}

        {/* Floating Add Customer Button */}
        <TouchableOpacity
          onPress={() => setSubStep('add')}
          activeOpacity={0.8}
          className="absolute right-6 bottom-40 w-14 h-14 bg-[#0d4761] rounded-full items-center justify-center shadow-lg border border-white z-30"
          style={{ elevation: 6 }}
        >
          <Ionicons name="person-add" size={24} color="#facc15" />
        </TouchableOpacity>
      </View>

      {/* Persistent Bottom Navigation */}
      <BottomNav activeTab="sales" onSelectTab={onSelectTab} />
    </SafeAreaView>
  );
};

export default SalesScreen;
