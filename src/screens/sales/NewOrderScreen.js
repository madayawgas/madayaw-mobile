import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProductOrderCard from '../../components/sales/ProductOrderCard';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';
import { salesService } from '../../services/salesService';

const NewOrderScreen = ({
  customer,
  initialSelectedProductIds = [],
  initialQuantities = {},
  onBack,
  onContinue,
}) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState(initialSelectedProductIds);

  useEffect(() => {
    salesService.getProductCatalog().then((data) => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const toggleSelectProduct = (id) => {
    setSelectedProductIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const selectedCount = selectedProductIds.length;
  
  // Extract clean customer identity
  const customerContactPerson = (customer?.contact_person || customer?.contactPerson || '').trim();
  const customerBusinessName = (customer?.business_name || customer?.businessName || customer?.store_name || '').trim();
  const customerName = (customer?.name || '').trim();
  const customerType = customer?.customer_type || customer?.customerType || 'RETAIL';

  const primaryCustomerTitle = customerContactPerson || customerName || customerBusinessName || 'Customer';
  const secondaryStoreTitle = customerBusinessName && customerBusinessName !== primaryCustomerTitle ? customerBusinessName : null;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FadeInView className="flex-1">
        <View className="flex-1 px-6 pt-4 relative">

          {/* Header Row */}
          <View className="flex-row items-center mb-3">
            <TouchableOpacity
              onPress={onBack}
              className="w-12 h-12 bg-white rounded-full items-center justify-center border border-[#D9D9D9] shadow-sm mr-4"
              activeOpacity={0.8}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color="#0d4761"
              />
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="text-[#0d4761] text-2xl font-bold tracking-tight">
                New Order
              </Text>
              <Text className="text-gray-400 text-xs">
                Select products from vehicle inventory
              </Text>
            </View>
          </View>

          {/* Active Customer Identity Banner */}
          <View className="bg-[#f0f7fa] border border-[#0d4761]/20 rounded-2xl px-4 py-3 mb-3 flex-row items-center justify-between shadow-2xs">
            <View className="flex-1 mr-2">
              <View className="flex-row items-center">
                <Ionicons name="person-circle" size={18} color="#0d4761" className="mr-1.5" />
                <Text className="text-[#0d4761] font-bold text-sm" numberOfLines={1}>
                  {primaryCustomerTitle}
                </Text>
              </View>
              {secondaryStoreTitle ? (
                <Text className="text-gray-500 text-xs font-medium ml-6 mt-0.5" numberOfLines={1}>
                  Store: {secondaryStoreTitle}
                </Text>
              ) : null}
            </View>
            <View className="bg-white border border-[#0d4761]/20 px-2.5 py-1 rounded-full shadow-2xs">
              <Text className="text-[#0d4761] text-[10px] font-bold uppercase tracking-wider">
                {customerType}
              </Text>
            </View>
          </View>

          {/* Separator Line */}
          <View className="border-b border-[#D9D9D9] w-full mb-3" />

          {/* Subtitle */}
          <Text className="text-center text-gray-400 text-xs italic mb-3">
            Tap to select or deselect products
          </Text>

          {/* Product Cards Grid */}
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#0d4761" size="large" />
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: selectedCount > 0 ? 100 : 16,
              }}
            >
              <View className="flex-row flex-wrap justify-between">
                {products.map((item) => (
                  <ProductOrderCard
                    key={item.id}
                    item={item}
                    isSelected={selectedProductIds.includes(item.id)}
                    quantity={initialQuantities[item.id] || 0}
                    onPress={() => toggleSelectProduct(item.id)}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {/* Floating Continue Button */}
          {selectedCount > 0 && (
            <View
              style={{
                position: 'absolute',
                bottom: 8,
                left: 24,
                right: 24,
                zIndex: 20,
                elevation: 8,
              }}
            >
              <FadeInView duration={250}>
                <PrimaryButton
                  title="CONTINUE"
                  onPress={() => onContinue(selectedProductIds)}
                />
              </FadeInView>
            </View>
          )}

        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default NewOrderScreen;
