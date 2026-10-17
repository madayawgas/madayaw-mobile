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
import { fetchProducts } from '../../services/mockProductApi';

const NewOrderScreen = ({ onBack, onContinue }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  useEffect(() => {
    fetchProducts().then((data) => {
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

            <Text className="text-[#0d4761] text-2xl font-bold tracking-tight">
              New Order
            </Text>
          </View>

          {/* Separator Line */}
          <View className="border-b border-[#D9D9D9] w-full mb-6" />

          {/* Subtitle */}
          <Text className="text-center text-gray-400 text-xs italic mb-4">
            Choose your order here
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
