import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QuantityControl from '../../components/sales/QuantityControl';
import OrderSummaryDrawer from '../../components/sales/OrderSummaryDrawer';
import FadeInView from '../../components/ui/FadeInView';

const ConfirmOrderScreen = ({ selectedProducts: initialProducts = [], customer, onBack, onConfirm }) => {
  const [products, setProducts] = useState(initialProducts);
  const [quantities, setQuantities] = useState(() => {
    const initial = {};
    initialProducts.forEach((item) => {
      initial[item.id] = 10;
    });
    return initial;
  });

  const handleUpdateQuantity = (id, newQty) => {
    setQuantities((prev) => ({ ...prev, [id]: newQty }));
  };

  const handleRemoveProduct = (id) => {
    setProducts((prev) => prev.filter((item) => item.id !== id));
    setQuantities((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const calculateTotalAmount = () => {
    return products.reduce((sum, item) => {
      return sum + item.price * (quantities[item.id] || 0);
    }, 0);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 relative">
          {/* Header Row */}
          <View className="flex-row items-center mb-2">
            <TouchableOpacity
              onPress={onBack}
              className="w-12 h-12 bg-white rounded-full items-center justify-center border border-[#D9D9D9] shadow-sm mr-4"
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={24} color="#0d4761" />
            </TouchableOpacity>

            <Text className="text-[#0d4761] text-2xl font-bold tracking-tight">
              Confirm Order
            </Text>
          </View>

          {/* Separator Line */}
          <View className="border-b border-[#D9D9D9] w-full mb-5" />

          {/* Subtitle */}
          <Text className="text-center text-gray-400 text-xs italic mb-3">
            Product orders
          </Text>

          {/* Scrollable Products List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 300 }}
          >
            {products.length === 0 ? (
              <Text className="text-center text-gray-400 text-sm py-10 italic">
                No products selected
              </Text>
            ) : (
              products.map((item) => (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: '#D9D9D9',
                  }}
                  className="bg-white p-4 mb-4 flex-row items-center"
                >
                  {/* Left Side: Image Placeholder */}
                  <View className="w-16 h-16 mr-4 items-center justify-center">
                    <Image
                      source={require('../../../assets/images/placeholder.png')}
                      className="w-full h-full"
                      resizeMode="contain"
                    />
                  </View>

                  {/* Right Side: Product Details & Controls */}
                  <View className="flex-1 justify-center">
                    <View className="flex-row justify-between items-center mb-0.5">
                      <Text
                        className="text-[#0d4761] font-bold text-base flex-1 mr-2"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>

                      {/* Trash Delete Icon */}
                      <TouchableOpacity
                        onPress={() => handleRemoveProduct(item.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="trash-outline" size={20} color="#0d4761" />
                      </TouchableOpacity>
                    </View>

                    <Text className="text-[#0d4761] text-xs font-semibold mb-2">
                      ₱ {item.price.toFixed(2)}
                    </Text>

                    {/* Quantity Control Pill */}
                    <QuantityControl
                      quantity={quantities[item.id] ?? 1}
                      onUpdateQuantity={(newQty) =>
                        handleUpdateQuantity(item.id, newQty)
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Draggable Bottom Sheet Drawer */}
          <OrderSummaryDrawer
            customerName={customer?.name}
            selectedProducts={products}
            quantities={quantities}
            totalAmount={calculateTotalAmount()}
            onConfirm={() =>
              onConfirm({ quantities, total: calculateTotalAmount() })
            }
          />
        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default ConfirmOrderScreen;
