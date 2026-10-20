import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QuantityControl from '../../components/sales/QuantityControl';
import OrderSummaryDrawer from '../../components/sales/OrderSummaryDrawer';
import FadeInView from '../../components/ui/FadeInView';
import { useBackHandler } from '../../hooks/useBackHandler';

const ConfirmOrderScreen = ({
  selectedProducts: initialProducts = [],
  allProducts = [],
  customer,
  initialQuantities = {},
  isSubmitting = false,
  onBack,
  onConfirm,
  onQuantitiesChange,
  onAddMoreProducts,
}) => {
  const [products, setProducts] = useState(initialProducts);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [quantities, setQuantities] = useState(() => {
    const initial = {};
    initialProducts.forEach((item) => {
      initial[item.id] =
        initialQuantities[item.id] !== undefined && initialQuantities[item.id] > 0
          ? initialQuantities[item.id]
          : 1;
    });
    return initial;
  });

  // Sync if initialProducts changes (e.g. returning from catalog selection)
  useEffect(() => {
    setProducts((currentProducts) => {
      const prevIds = currentProducts.map((p) => p.id).sort().join(',');
      const newIds = initialProducts.map((p) => p.id).sort().join(',');
      if (prevIds !== newIds) {
        return initialProducts;
      }
      return currentProducts;
    });

    setQuantities((prev) => {
      const next = {};
      initialProducts.forEach((item) => {
        next[item.id] =
          prev[item.id] !== undefined && prev[item.id] > 0
            ? prev[item.id]
            : initialQuantities[item.id] !== undefined && initialQuantities[item.id] > 0
            ? initialQuantities[item.id]
            : 1;
      });
      return next;
    });
  }, [initialProducts, initialQuantities]);

  const handleUpdateQuantity = (id, newQty) => {
    const updated = { ...quantities, [id]: Math.max(0, newQty) };
    setQuantities(updated);
    if (onQuantitiesChange) {
      onQuantitiesChange(updated, products.map((p) => p.id));
    }
  };

  const handleRemoveProduct = (id) => {
    const updatedProducts = products.filter((item) => item.id !== id);
    const updated = { ...quantities };
    delete updated[id];
    setProducts(updatedProducts);
    setQuantities(updated);
    if (onQuantitiesChange) {
      onQuantitiesChange(updated, updatedProducts.map((p) => p.id));
    }
  };

  const handleQuickAddProduct = (productToAdd) => {
    if (typeof productToAdd.quantityRemaining === 'number' && productToAdd.quantityRemaining <= 0) {
      return;
    }
    const max = typeof productToAdd.quantityRemaining === 'number' ? productToAdd.quantityRemaining : 9999;
    const initialQty = Math.min(
      initialQuantities[productToAdd.id] !== undefined && initialQuantities[productToAdd.id] > 0
        ? initialQuantities[productToAdd.id]
        : 1,
      max
    );
    const updatedProducts = [...products, productToAdd];
    const updated = { ...quantities, [productToAdd.id]: initialQty };
    setProducts(updatedProducts);
    setQuantities(updated);
    if (onQuantitiesChange) {
      onQuantitiesChange(updated, updatedProducts.map((p) => p.id));
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack(quantities, products.map((p) => p.id));
    }
  };

  const handleBrowseCatalog = () => {
    if (onAddMoreProducts) {
      onAddMoreProducts(quantities, products.map((p) => p.id));
    } else if (onBack) {
      onBack(quantities, products.map((p) => p.id));
    }
  };

  useBackHandler(() => {
    if (showAddProductModal) {
      setShowAddProductModal(false);
      return true;
    }
    handleBack();
    return true;
  }, true);

  const unselectedProducts = (allProducts || []).filter(
    (ap) => !products.some((p) => p.id === ap.id)
  );

  const calculateTotalAmount = () => {
    return products.reduce((sum, item) => {
      return sum + item.price * (quantities[item.id] || 0);
    }, 0);
  };

  const handleDrawerConfirm = (paymentData) => {
    const totalQty = Object.values(quantities).reduce((acc, q) => acc + (q || 0), 0);
    if (totalQty === 0) {
      Alert.alert(
        'Empty Quantities',
        'Please enter a quantity of at least 1 for your selected products.'
      );
      return;
    }

    const total = calculateTotalAmount();
    if (total <= 0) {
      Alert.alert('Invalid Order', 'Total order amount must be greater than zero.');
      return;
    }

    // Guard against any product exceeding remaining stock on board
    const overstockedItem = products.find((item) => {
      const max = item.quantityRemaining;
      return typeof max === 'number' && (quantities[item.id] || 0) > max;
    });
    if (overstockedItem) {
      // Non-intrusive inline block
      return;
    }

    onConfirm({
      quantities,
      total,
      paymentMethod: paymentData.paymentMethod || 'CASH',
      receiptPhotoUri: paymentData.receiptPhotoUri || null,
    });
  };

  // Clean customer identity
  const customerContactPerson = (customer?.contact_person || customer?.contactPerson || '').trim();
  const customerBusinessName = (customer?.business_name || customer?.businessName || customer?.store_name || '').trim();
  const customerName = (customer?.name || '').trim();
  const customerType = customer?.customer_type || customer?.customerType || 'RETAIL';

  const primaryCustomerTitle = customerContactPerson || customerName || customerBusinessName || 'Customer';
  const secondaryStoreTitle = customerBusinessName && customerBusinessName !== primaryCustomerTitle ? customerBusinessName : null;
  const customerDisplayName = customerBusinessName && customerContactPerson ? `${customerContactPerson} (${customerBusinessName})` : primaryCustomerTitle;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 relative">
          {/* Header Row */}
          <View className="flex-row items-center mb-2">
            <TouchableOpacity
              onPress={handleBack}
              disabled={isSubmitting}
              className="w-12 h-12 bg-white rounded-full items-center justify-center border border-[#D9D9D9] shadow-sm mr-4"
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={24} color="#0d4761" />
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="text-[#0d4761] text-2xl font-bold tracking-tight">
                Confirm Order
              </Text>
              <Text className="text-gray-400 text-xs">
                Review products & adjust quantities
              </Text>
            </View>
          </View>

          {/* Active Customer Identity Banner */}
          <View className="bg-[#f0f7fa] border border-[#0d4761]/20 rounded-2xl px-4 py-2.5 mb-3 flex-row items-center justify-between shadow-2xs">
            <View className="flex-1 mr-2">
              <View className="flex-row items-center">
                <Ionicons name="person-circle" size={17} color="#0d4761" className="mr-1.5" />
                <Text className="text-[#0d4761] font-bold text-xs" numberOfLines={1}>
                  {primaryCustomerTitle}
                </Text>
              </View>
              {secondaryStoreTitle ? (
                <Text className="text-gray-500 text-[11px] font-medium ml-5 mt-0.5" numberOfLines={1}>
                  Store: {secondaryStoreTitle}
                </Text>
              ) : null}
            </View>
            <View className="bg-white border border-[#0d4761]/20 px-2.5 py-0.5 rounded-full shadow-2xs">
              <Text className="text-[#0d4761] text-[10px] font-bold uppercase tracking-wider">
                {customerType}
              </Text>
            </View>
          </View>

          {/* Separator Line */}
          <View className="border-b border-[#D9D9D9] w-full mb-3" />

          {/* Section Header with direct Add Product trigger */}
          <View className="flex-row items-center justify-between mb-2 px-1">
            <Text className="text-[#0d4761] text-xs font-bold uppercase tracking-wider">
              Selected Products ({products.length})
            </Text>
            {unselectedProducts.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowAddProductModal(true)}
                activeOpacity={0.8}
                className="bg-[#0d4761] px-3 py-1 rounded-full flex-row items-center shadow-2xs"
              >
                <Ionicons name="add" size={14} color="#facc15" />
                <Text className="text-white text-xs font-bold ml-1">Add Product</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Scrollable Products List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: products.length > 0 ? 360 : 100,
            }}
          >
            {products.length === 0 ? (
              <View className="py-10 items-center justify-center">
                <Ionicons name="cart-outline" size={48} color="#cbd5e1" />
                <Text className="text-center text-gray-500 font-bold text-sm mt-3">
                  All products removed from order
                </Text>
                <Text className="text-center text-gray-400 text-xs mt-1">
                  Add products below or return to catalog.
                </Text>
              </View>
            ) : (
              products.map((item) => (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: '#D9D9D9',
                  }}
                  className="bg-white p-4 mb-3 flex-row items-center shadow-xs"
                >
                  {/* Left Side: Image Placeholder */}
                  <View className="w-16 h-16 mr-3 items-center justify-center bg-gray-50 rounded-xl">
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
                        disabled={isSubmitting}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="trash-outline" size={20} color="#0d4761" />
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-[#0d4761] text-xs font-semibold">
                        ₱ {item.price ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                      </Text>
                      {item.quantityRemaining !== undefined && (
                        <Text
                          className={`text-[10px] font-medium ${
                            item.quantityRemaining <= 0 ? 'text-red-500 font-bold' : 'text-gray-400'
                          }`}
                        >
                          {item.quantityRemaining <= 0 ? 'Out of stock' : `${item.quantityRemaining} on board`}
                        </Text>
                      )}
                    </View>

                    {/* Quantity Control Pill with Stock Guard */}
                    <QuantityControl
                      quantity={quantities[item.id] ?? 1}
                      maxQuantity={item.quantityRemaining}
                      onUpdateQuantity={(newQty) =>
                        handleUpdateQuantity(item.id, newQty)
                      }
                    />
                  </View>
                </View>
              ))
            )}

            {/* Direct "+ Add Another Product" Callout Button */}
            {unselectedProducts.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowAddProductModal(true)}
                activeOpacity={0.8}
                className="border border-dashed border-[#0d4761]/40 bg-sky-50/60 rounded-2xl py-3 px-4 mb-4 flex-row items-center justify-center shadow-2xs"
              >
                <Ionicons name="add-circle" size={18} color="#0d4761" className="mr-1.5" />
                <Text className="text-[#0d4761] font-bold text-xs uppercase tracking-wider">
                  + Add Another Product to Order
                </Text>
              </TouchableOpacity>
            )}

            {/* Quick Add Section for Unselected Products */}
            {unselectedProducts.length > 0 && (
              <View className="mt-2 mb-6">
                <View className="flex-row items-center justify-between mb-3 px-1">
                  <View className="flex-row items-center">
                    <Ionicons name="add-circle-outline" size={16} color="#0d4761" />
                    <Text className="text-[#0d4761] text-xs font-bold uppercase tracking-wider ml-1.5">
                      Available to Add ({unselectedProducts.length})
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleBrowseCatalog}
                    activeOpacity={0.7}
                    className="flex-row items-center bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full"
                  >
                    <Ionicons name="grid-outline" size={12} color="#0d4761" />
                    <Text className="text-[#0d4761] text-[11px] font-bold ml-1">
                      Browse Catalog
                    </Text>
                  </TouchableOpacity>
                </View>

                {unselectedProducts.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                    className="bg-gray-50/80 p-3 mb-2 flex-row items-center justify-between shadow-2xs"
                  >
                    <View className="flex-1 mr-3">
                      <Text
                        className="text-[#0d4761] font-bold text-sm"
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <Text className="text-[#0d4761] text-xs font-semibold mr-2">
                          ₱ {p.price ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                        </Text>
                        {p.quantityRemaining !== undefined && (
                          <Text
                            className={`text-[10px] ${
                              p.quantityRemaining <= 0 ? 'text-red-500 font-bold' : 'text-gray-400'
                            }`}
                          >
                            {p.quantityRemaining <= 0 ? 'Out of stock' : `${p.quantityRemaining} on board`}
                          </Text>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleQuickAddProduct(p)}
                      disabled={isSubmitting || p.quantityRemaining === 0}
                      style={{ opacity: p.quantityRemaining === 0 ? 0.4 : 1 }}
                      activeOpacity={0.8}
                      className="bg-[#0d4761] px-3.5 py-2 rounded-full flex-row items-center shadow-xs"
                    >
                      <Ionicons name="add" size={16} color="#ffffff" />
                      <Text className="text-white text-xs font-bold ml-1">
                        {p.quantityRemaining === 0 ? 'Out' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* If all products are already selected, provide Browse Catalog link */}
            {unselectedProducts.length === 0 && products.length > 0 && (
              <View className="mt-3 mb-4 items-center">
                <TouchableOpacity
                  onPress={handleBrowseCatalog}
                  activeOpacity={0.7}
                  className="flex-row items-center py-2 px-4 rounded-full border border-gray-200 bg-gray-50"
                >
                  <Ionicons name="grid-outline" size={14} color="#64748b" />
                  <Text className="text-gray-600 text-xs font-semibold ml-1.5">
                    Browse Full Catalog
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Modal: Quick Add Product from Catalog */}
          <Modal
            visible={showAddProductModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowAddProductModal(false)}
          >
            <View className="flex-1 bg-black/60 justify-end">
              <View className="bg-white rounded-t-3xl max-h-[80%] pt-4 pb-8 px-6">
                {/* Modal Header */}
                <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 mb-3">
                  <View>
                    <Text className="text-[#0d4761] font-bold text-lg">Add Products to Order</Text>
                    <Text className="text-gray-400 text-xs">Select from vehicle inventory</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowAddProductModal(false)}
                    className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color="#0d4761" />
                  </TouchableOpacity>
                </View>

                {/* Unselected Products List */}
                <ScrollView showsVerticalScrollIndicator={false} className="max-h-[350px]">
                  {unselectedProducts.map((p) => (
                    <View
                      key={p.id}
                      className="flex-row items-center justify-between p-3 mb-2 bg-gray-50 rounded-2xl border border-gray-200"
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className="w-12 h-12 bg-white rounded-xl items-center justify-center border border-gray-100 mr-3">
                          <Image
                            source={require('../../../assets/images/placeholder.png')}
                            style={{ width: 28, height: 28, resizeMode: 'contain' }}
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[#0d4761] font-bold text-sm" numberOfLines={1}>
                            {p.name}
                          </Text>
                          <View className="flex-row items-center mt-0.5">
                            <Text className="text-[#0d4761] text-xs font-semibold mr-2">
                              ₱ {p.price ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                            </Text>
                            {p.quantityRemaining !== undefined && (
                              <Text
                                className={`text-[10px] ${
                                  p.quantityRemaining <= 0 ? 'text-red-500 font-bold' : 'text-gray-400'
                                }`}
                              >
                                {p.quantityRemaining <= 0 ? 'Out of stock' : `${p.quantityRemaining} on board`}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        onPress={() => {
                          handleQuickAddProduct(p);
                          if (unselectedProducts.length <= 1) {
                            setShowAddProductModal(false);
                          }
                        }}
                        disabled={p.quantityRemaining === 0}
                        style={{ opacity: p.quantityRemaining === 0 ? 0.4 : 1 }}
                        activeOpacity={0.8}
                        className="bg-[#0d4761] px-4 py-2 rounded-full flex-row items-center shadow-xs"
                      >
                        <Ionicons name="add" size={16} color="#ffffff" />
                        <Text className="text-white text-xs font-bold ml-1">
                          {p.quantityRemaining === 0 ? 'Out' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => setShowAddProductModal(false)}
                  activeOpacity={0.8}
                  className="w-full bg-[#0d4761] py-3 rounded-full items-center mt-3"
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Draggable Bottom Sheet Drawer */}
          {products.length > 0 && (
            <OrderSummaryDrawer
              customerName={customerDisplayName}
              selectedProducts={products}
              quantities={quantities}
              totalAmount={calculateTotalAmount()}
              isSubmitting={isSubmitting}
              onConfirm={handleDrawerConfirm}
            />
          )}
        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default ConfirmOrderScreen;
