import React, { useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, Dimensions, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../ui/PrimaryButton';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// 80px leaves room for header and divider line
const HEADER_OFFSET = 80;
const DRAWER_HEIGHT = SCREEN_HEIGHT - HEADER_OFFSET;

// Resting peek height accommodating the new taller bottom anchored block
const PEEK_HEIGHT = 245;

const EXPANDED_OFFSET = 0;
const PEEK_OFFSET = DRAWER_HEIGHT - PEEK_HEIGHT;

const OrderSummaryDrawer = ({
  customerName = 'Precious Gasoline',
  selectedProducts = [],
  quantities = {},
  totalAmount = 0,
  onConfirm,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Gcash');
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);

  // Starts minimized at PEEK_OFFSET
  const translateY = useRef(new Animated.Value(PEEK_OFFSET)).current;
  const currentOffset = useRef(PEEK_OFFSET);

  // Interpolate counter-translation so the bottom block remains stationary on screen
  const bottomTranslateY = translateY.interpolate({
    inputRange: [EXPANDED_OFFSET, PEEK_OFFSET],
    outputRange: [0, -PEEK_OFFSET],
    extrapolate: 'clamp',
  });

  const animateToOffset = (toValue) => {
    currentOffset.current = toValue;
    setIsExpanded(toValue === EXPANDED_OFFSET);
    // Hide payment options if drawer is dismissed
    if (toValue !== EXPANDED_OFFSET) setShowPaymentOptions(false);

    Animated.spring(translateY, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        let newY = currentOffset.current + gestureState.dy;
        if (newY < EXPANDED_OFFSET) newY = EXPANDED_OFFSET;
        if (newY > PEEK_OFFSET) newY = PEEK_OFFSET;
        translateY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -40 || gestureState.vy < -0.5) {
          animateToOffset(EXPANDED_OFFSET);
        } else if (gestureState.dy > 40 || gestureState.vy > 0.5) {
          animateToOffset(PEEK_OFFSET);
        } else {
          const closest =
            Math.abs(currentOffset.current - EXPANDED_OFFSET) <
            Math.abs(currentOffset.current - PEEK_OFFSET)
              ? EXPANDED_OFFSET
              : PEEK_OFFSET;
          animateToOffset(closest);
        }
      },
    })
  ).current;

  const handleActionPress = () => {
    if (!isExpanded) {
      animateToOffset(EXPANDED_OFFSET); // Slide up below header
    } else {
      onConfirm(paymentMethod); // Pass selected payment method up
    }
  };

  return (
    /* Outer Shadow & Animated Wrapper */
    <Animated.View
      style={{
        transform: [{ translateY }],
        height: DRAWER_HEIGHT,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 20,
      }}
      className="absolute bottom-0 left-0 right-0 bg-transparent"
    >
      {/* Inner Rounded Top Container */}
      <View
        style={{
          borderTopLeftRadius: 40,
          borderTopRightRadius: 40,
          borderWidth: 1,
          borderColor: '#D9D9D9',
          borderBottomWidth: 0,
        }}
        className="flex-1 bg-white pt-3 relative overflow-hidden"
      >
        {/* Scrollable Content Area (Only visible when expanded) */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 220, paddingHorizontal: 24 }}
          bounces={false}
        >
          {/* Top Drag Handle */}
          <View {...panResponder.panHandlers} className="w-full items-center pt-1 pb-4 bg-white">
            <View className="w-14 h-1.5 bg-[#0d4761] rounded-full mb-2" />
            <Text className="text-gray-400 text-[10px] italic">Order details</Text>
          </View>

          {/* Expanded Content View */}
          {isExpanded && (
            <View className="mt-2">
              <Text className="text-[#0d4761] font-bold text-lg mb-4">Order Summary</Text>

              {/* Product List */}
              {selectedProducts.map((p) => {
                const qty = quantities[p.id] || 0;
                const lineTotal = qty * p.price;
                return (
                  <View key={p.id} className="flex-row items-center mb-5">
                    {/* Placeholder Image container */}
                    <View className="w-16 h-16 rounded-2xl border border-gray-100 bg-white items-center justify-center shadow-xs mr-4">
                      <Image
                        source={require('../../../assets/images/placeholder.png')}
                        style={{ width: 40, height: 40, resizeMode: 'contain' }}
                      />
                    </View>

                    {/* Product Details */}
                    <View className="flex-1 justify-center">
                      <Text className="text-[#0d4761] font-bold text-sm mb-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-[#0d4761] text-xs font-semibold">
                        Qty: {qty}
                      </Text>
                    </View>

                    {/* Price */}
                    <Text className="text-[#0d4761] font-medium text-sm">
                      ₱ {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}

              {/* Payment Method Section (Fixed Alignment) */}
              <View className="mt-6 mb-3 flex-row items-center">
                <Text className="text-[#0d4761] font-bold text-base mr-2">Payment Method</Text>
                <Text className="text-gray-400 text-[10px] italic">Select a payment method</Text>
              </View>

              {!showPaymentOptions ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPaymentOptions(true)}
                  className="flex-row items-center justify-between border border-gray-200 rounded-full py-3.5 px-6"
                >
                  <View className="flex-row items-center">
                    <Text className="text-[#0d4761] font-bold text-sm mr-2">{paymentMethod}</Text>
                    <Text className="text-gray-400 text-[11px] italic">
                      {paymentMethod === 'Gcash' ? '(Online Payment)' : '(Pay on Delivery)'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={16} color="#0d4761" />
                </TouchableOpacity>
              ) : (
                <View className="border border-gray-200 rounded-[24px] overflow-hidden">
                  {/* Gcash Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setPaymentMethod('Gcash');
                      setShowPaymentOptions(false);
                    }}
                    className={`flex-row items-center justify-between py-4 px-6 border-b border-gray-100 ${paymentMethod === 'Gcash' ? 'bg-[#f0f7fa]' : 'bg-white'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-[#0d4761] font-bold text-sm mr-2">Gcash</Text>
                      <Text className="text-gray-400 text-[11px] italic">(Online Payment)</Text>
                    </View>
                    {paymentMethod === 'Gcash' && <Ionicons name="checkmark-circle" size={20} color="#0d4761" />}
                  </TouchableOpacity>

                  {/* Cash Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setPaymentMethod('Cash');
                      setShowPaymentOptions(false);
                    }}
                    className={`flex-row items-center justify-between py-4 px-6 ${paymentMethod === 'Cash' ? 'bg-[#f0f7fa]' : 'bg-white'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-[#0d4761] font-bold text-sm mr-2">Cash</Text>
                      <Text className="text-gray-400 text-[11px] italic">(Pay on Delivery)</Text>
                    </View>
                    {paymentMethod === 'Cash' && <Ionicons name="checkmark-circle" size={20} color="#0d4761" />}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Fixed Position Bottom Block (Customer, Total, Button) */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            right: 24,
            transform: [{ translateY: bottomTranslateY }],
            backgroundColor: 'white',
          }}
        >
          {/* Fading Top Gradient */}
          <View className="absolute -top-6 left-0 right-0 h-6 bg-white opacity-90" />

          {/* Customer Name Row */}
          <View className="flex-row justify-between items-center mb-3 px-2">
            <Text className="text-[#8c9fAB] text-sm">Customer Name</Text>
            <Text className="text-[#0d4761] font-bold text-sm">{customerName}</Text>
          </View>

          {/* Total Capsule */}
          <View className="bg-white border border-[#D9D9D9] rounded-full px-6 py-4 flex-row items-center justify-between mb-4">
            <Text className="text-[#0d4761] font-medium text-sm">Order Total</Text>
            <Text className="text-[#0d4761] font-bold text-[22px] tracking-tight">
              ₱ {totalAmount.toLocaleString('en-US')}
            </Text>
          </View>

          {/* Action Button */}
          <PrimaryButton
            title={isExpanded ? 'CONFIRM' : 'PROCEED'}
            onPress={handleActionPress}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
};

export default OrderSummaryDrawer;