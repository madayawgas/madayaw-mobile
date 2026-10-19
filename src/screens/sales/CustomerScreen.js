import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomerCard from '../../components/sales/CustomerCard';
import BottomNav from '../../components/navigation/BottomNav';
import AddCustomerScreen from './AddCustomerScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import NewOrderScreen from './NewOrderScreen';
import ConfirmOrderScreen from './ConfirmOrderScreen';
import { fetchCustomers } from '../../services/mockCustomerApi';
import { fetchProducts } from '../../services/mockProductApi';
import { createOrder } from '../../services/mockOrderApi';
import { salesService } from '../../services/salesService';

const CustomerScreen = ({ activeTab, onSelectTab }) => {
  const [customers, setCustomers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sub-screen navigation states: 'list' | 'add' | 'details' | 'new_order' | 'confirm'
  const [subStep, setSubStep] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [customerRes, productData] = await Promise.all([
        fetchCustomers(),
        fetchProducts(),
      ]);
      setCustomers(customerRes.data.customers);
      setAllProducts(productData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const filteredCustomers = customers.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProductsList = allProducts.filter((p) =>
    selectedProductIds.includes(p.id)
  );

  const handleConfirmOrder = async (orderSummaryData) => {
    try {
      const formattedItems = Object.keys(orderSummaryData.quantities).map((pId) => {
        const product = allProducts.find((p) => p.id === pId);
        return {
          id: pId,
          name: product?.name || 'Unknown Product',
          price: product?.price || 0,
          quantity: orderSummaryData.quantities[pId],
        };
      });

      const payload = {
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        items: formattedItems,
        totalAmount: orderSummaryData.total,
      };

      const result = await createOrder(payload);

      if (result.success) {
        Alert.alert(
          'Order Placed!',
          `Order ID: ${result.data.orderId}\nTotal: ₱ ${result.data.totalAmount.toLocaleString()}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setSubStep('details');
                setSelectedProductIds([]);
              },
            },
          ]
        );
      }
    } catch (err) {
      console.error('Order creation failed:', err);
    }
  };

  const handleAddCustomer = async (customerData) => {
    try {
      const newCust = await salesService.registerOfflineCustomer({
        businessName: customerData.name,
        contactPerson: customerData.name,
        contactNumber: customerData.contactNumber,
        deliveryAddress: customerData.address,
        customerType: 'RETAIL',
      });
      setCustomers((prev) => [
        {
          id: newCust.id,
          name: newCust.business_name,
          address: newCust.delivery_address,
          contactNumber: newCust.contact_number,
          customerType: newCust.customer_type,
          canister_debt: 0,
          isActive: true,
          createdAt: newCust.created_at,
        },
        ...prev,
      ]);
      setSubStep('list');
      Alert.alert('Customer Added', `Customer "${customerData.name}" has been registered.`);
    } catch (e) {
      console.warn('Failed to add customer:', e);
      Alert.alert('Error', 'Could not register customer offline.');
    }
  };

  if (subStep === 'add') {
    return <AddCustomerScreen onBack={() => setSubStep('list')} onSubmit={handleAddCustomer} />;
  }

  if (subStep === 'details') {
    return (
      <CustomerDetailsScreen
        customer={selectedCustomer}
        onBack={() => setSubStep('list')}
        onAddOrder={() => setSubStep('new_order')}
      />
    );
  }

  if (subStep === 'new_order') {
    return (
      <NewOrderScreen
        onBack={() => setSubStep('details')}
        onContinue={(productIds) => {
          setSelectedProductIds(productIds);
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
        onBack={() => setSubStep('new_order')}
        onConfirm={handleConfirmOrder}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f9fafb]">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-[#0d4761] text-[40px] font-bold mb-4 tracking-tight">Customer</Text>

        <View className="flex-row justify-between mb-4">
          <View className="flex-1 flex-row items-center bg-gray-100/80 rounded-full px-4 py-2.5 mr-3">
            <Ionicons name="search" size={20} color="#9ca3af" className="mr-2" />
            <TextInput
              className="flex-1 text-sm text-[#0d4761]"
              placeholder="Search Customer..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <TouchableOpacity className="flex-row items-center border border-gray-200 bg-white rounded-full px-4 py-1.5">
            <Ionicons name="funnel-outline" size={14} color="#0d4761" className="mr-2" />
            <Text className="text-[#0d4761] text-[10px] font-bold tracking-wider">ALPHABETICAL</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-gray-400 text-xs italic mb-4">Customer List</Text>

        {loading ? (
          <ActivityIndicator color="#0d4761" size="large" className="mt-12" />
        ) : (
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0d4761"
                colors={['#0d4761']}
              />
            }
            renderItem={({ item }) => (
              <CustomerCard
                name={item.name}
                contact={item.contactNumber}
                dateString={item.createdAt}
                onPress={() => {
                  setSelectedCustomer(item);
                  setSubStep('details');
                }}
              />
            )}
          />
        )}
      </View>

      <TouchableOpacity
        onPress={() => setSubStep('add')}
        className="absolute bottom-60 right-6 w-14 h-14 bg-white border border-gray-200 rounded-full items-center justify-center shadow-sm z-10"
      >
        <Ionicons name="add" size={28} color="#0d4761" />
      </TouchableOpacity>

      <BottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </SafeAreaView>
  );
};

export default CustomerScreen;
