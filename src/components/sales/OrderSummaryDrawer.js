import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../ui/PrimaryButton';
import { mediaService } from '../../services/mediaService';
import { useBackHandler } from '../../hooks/useBackHandler';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// 80px leaves room for header and divider line
const HEADER_OFFSET = 80;
const DRAWER_HEIGHT = SCREEN_HEIGHT - HEADER_OFFSET;

// Resting peek height accommodating the bottom anchored block
const PEEK_HEIGHT = 245;

const EXPANDED_OFFSET = 0;
const PEEK_OFFSET = DRAWER_HEIGHT - PEEK_HEIGHT;

const OrderSummaryDrawer = ({
  customerName = 'Customer',
  selectedProducts = [],
  quantities = {},
  totalAmount = 0,
  isSubmitting = false,
  onConfirm,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'GCASH'
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [receiptPhotoUri, setReceiptPhotoUri] = useState(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

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

  useBackHandler(() => {
    if (isExpanded) {
      animateToOffset(PEEK_OFFSET);
      return true;
    }
    return false;
  }, isExpanded);

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

  const handleCapturePhoto = async () => {
    try {
      setIsProcessingMedia(true);
      const uri = await mediaService.capturePhoto();
      if (uri) {
        setReceiptPhotoUri(uri);
      }
    } catch (err) {
      console.warn('[OrderSummaryDrawer] Camera capture error:', err);
      Alert.alert('Camera Error', err?.message || 'Could not access the camera.');
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      setIsProcessingMedia(true);
      const uri = await mediaService.pickFromGallery();
      if (uri) {
        setReceiptPhotoUri(uri);
      }
    } catch (err) {
      console.warn('[OrderSummaryDrawer] Gallery pick error:', err);
      Alert.alert('Gallery Error', err?.message || 'Could not access photo library.');
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const hasOverstockedItems = selectedProducts.some((item) => {
    const max = item.quantityRemaining;
    return typeof max === 'number' && (quantities[item.id] || 0) > max;
  });

  const handleActionPress = () => {
    if (hasOverstockedItems) return;

    if (!isExpanded) {
      animateToOffset(EXPANDED_OFFSET); // Slide up below header
    } else {
      if (isSubmitting) return;

      if (paymentMethod === 'GCASH' && !receiptPhotoUri) {
        Alert.alert(
          'Receipt Photo Required',
          'Please take or select a photo of the GCash payment receipt before confirming.'
        );
        return;
      }

      onConfirm({
        paymentMethod,
        receiptPhotoUri,
      });
    }
  };

  const isGcashValid = paymentMethod !== 'GCASH' || Boolean(receiptPhotoUri);
  const isButtonDisabled = isSubmitting || hasOverstockedItems || (isExpanded && !isGcashValid);

  const getButtonTitle = () => {
    if (isSubmitting) return 'PROCESSING...';
    if (hasOverstockedItems) return 'EXCEEDS AVAILABLE STOCK';
    if (!isExpanded) return 'PROCEED';
    if (paymentMethod === 'CASH') return 'CONFIRM CASH PAYMENT';
    if (paymentMethod === 'GCASH') {
      return receiptPhotoUri ? 'CONFIRM GCASH PAYMENT' : 'RECEIPT PHOTO REQUIRED';
    }
    return 'CONFIRM';
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
          contentContainerStyle={{ paddingBottom: 240, paddingHorizontal: 24 }}
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
                  <View key={p.id} className="flex-row items-center mb-4">
                    {/* Placeholder Image container */}
                    <View className="w-14 h-14 rounded-2xl border border-gray-100 bg-white items-center justify-center shadow-xs mr-3">
                      <Image
                        source={require('../../../assets/images/placeholder.png')}
                        style={{ width: 36, height: 36, resizeMode: 'contain' }}
                      />
                    </View>

                    {/* Product Details */}
                    <View className="flex-1 justify-center">
                      <Text className="text-[#0d4761] font-bold text-sm mb-0.5" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-[#0d4761] text-xs font-semibold">
                        Qty: {qty} × ₱{p.price?.toLocaleString()}
                      </Text>
                    </View>

                    {/* Price */}
                    <Text className="text-[#0d4761] font-bold text-sm">
                      ₱ {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}

              {/* Payment Method Section */}
              <View className="mt-5 mb-2 flex-row items-center">
                <Text className="text-[#0d4761] font-bold text-base mr-2">Payment Method</Text>
                <Text className="text-gray-400 text-[10px] italic">Select Cash or GCash</Text>
              </View>

              {!showPaymentOptions ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPaymentOptions(true)}
                  className="flex-row items-center justify-between border border-gray-200 rounded-full py-3.5 px-6 mb-3"
                >
                  <View className="flex-row items-center">
                    <Ionicons
                      name={paymentMethod === 'GCASH' ? 'phone-portrait-outline' : 'cash-outline'}
                      size={18}
                      color="#0d4761"
                      className="mr-2"
                    />
                    <Text className="text-[#0d4761] font-bold text-sm mr-2">
                      {paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}
                    </Text>
                    <Text className="text-gray-400 text-[11px] italic">
                      {paymentMethod === 'GCASH' ? '(Online Payment Proof)' : '(Pay on Delivery)'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={16} color="#0d4761" />
                </TouchableOpacity>
              ) : (
                <View className="border border-gray-200 rounded-[24px] overflow-hidden mb-3">
                  {/* Cash Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setPaymentMethod('CASH');
                      setShowPaymentOptions(false);
                    }}
                    className={`flex-row items-center justify-between py-4 px-6 border-b border-gray-100 ${
                      paymentMethod === 'CASH' ? 'bg-[#f0f7fa]' : 'bg-white'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="cash-outline" size={20} color="#0d4761" className="mr-3" />
                      <View>
                        <Text className="text-[#0d4761] font-bold text-sm">Cash</Text>
                        <Text className="text-gray-400 text-[11px] italic">Pay directly on delivery</Text>
                      </View>
                    </View>
                    {paymentMethod === 'CASH' && (
                      <Ionicons name="checkmark-circle" size={20} color="#0d4761" />
                    )}
                  </TouchableOpacity>

                  {/* GCash Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setPaymentMethod('GCASH');
                      setShowPaymentOptions(false);
                    }}
                    className={`flex-row items-center justify-between py-4 px-6 ${
                      paymentMethod === 'GCASH' ? 'bg-[#f0f7fa]' : 'bg-white'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="phone-portrait-outline" size={20} color="#0d4761" className="mr-3" />
                      <View>
                        <Text className="text-[#0d4761] font-bold text-sm">GCash</Text>
                        <Text className="text-gray-400 text-[11px] italic">Mandatory payment receipt photo</Text>
                      </View>
                    </View>
                    {paymentMethod === 'GCASH' && (
                      <Ionicons name="checkmark-circle" size={20} color="#0d4761" />
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Mandatory GCash Payment Evidence Capture Card */}
              {paymentMethod === 'GCASH' && (
                <View className="mt-2 bg-[#f8fafc] border border-blue-200 rounded-2xl p-4 mb-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <Ionicons name="receipt-outline" size={18} color="#0284c7" className="mr-1.5" />
                      <Text className="text-[#0d4761] font-bold text-sm">
                        GCash Receipt Photo
                      </Text>
                    </View>
                    <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                      <Text className="text-amber-800 text-[10px] font-bold uppercase">Mandatory</Text>
                    </View>
                  </View>

                  <Text className="text-gray-500 text-xs mb-3">
                    Capture or select a clear photo of the customer&apos;s GCash receipt as transaction evidence.
                  </Text>

                  {isProcessingMedia ? (
                    <View className="py-6 items-center justify-center">
                      <ActivityIndicator size="small" color="#0d4761" />
                      <Text className="text-gray-500 text-xs mt-2 font-medium">Processing receipt image...</Text>
                    </View>
                  ) : receiptPhotoUri ? (
                    <View className="bg-white rounded-xl p-3 border border-gray-200 shadow-2xs">
                      <View className="flex-row items-center">
                        <TouchableOpacity
                          onPress={() => setShowPhotoModal(true)}
                          activeOpacity={0.8}
                          className="relative"
                        >
                          <Image
                            source={{ uri: receiptPhotoUri }}
                            style={{ width: 70, height: 70, borderRadius: 8 }}
                            resizeMode="cover"
                          />
                          <View className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1">
                            <Ionicons name="scan-outline" size={10} color="#ffffff" />
                          </View>
                        </TouchableOpacity>
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Ionicons name="checkmark-circle" size={16} color="#16a34a" className="mr-1" />
                            <Text className="text-emerald-700 font-bold text-xs">Receipt Photo Attached</Text>
                          </View>
                          <Text className="text-gray-400 text-[10px] mt-0.5" numberOfLines={1}>
                            Tap photo to inspect & verify
                          </Text>
                          <View className="flex-row mt-2 space-x-2">
                            <TouchableOpacity
                              onPress={() => setShowPhotoModal(true)}
                              activeOpacity={0.7}
                              className="bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-md flex-row items-center mr-1.5"
                            >
                              <Ionicons name="eye-outline" size={12} color="#0d4761" className="mr-1" />
                              <Text className="text-[#0d4761] text-[10px] font-bold">Inspect</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleCapturePhoto}
                              activeOpacity={0.7}
                              className="bg-gray-100 px-2.5 py-1 rounded-md flex-row items-center mr-1.5"
                            >
                              <Ionicons name="camera-outline" size={12} color="#0d4761" className="mr-1" />
                              <Text className="text-[#0d4761] text-[10px] font-semibold">Retake</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handlePickFromGallery}
                              activeOpacity={0.7}
                              className="bg-gray-100 px-2.5 py-1 rounded-md flex-row items-center"
                            >
                              <Ionicons name="images-outline" size={12} color="#0d4761" className="mr-1" />
                              <Text className="text-[#0d4761] text-[10px] font-semibold">Gallery</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className="space-y-2">
                      <View className="flex-row space-x-2">
                        <TouchableOpacity
                          onPress={handleCapturePhoto}
                          activeOpacity={0.8}
                          className="flex-1 bg-[#0d4761] py-3 px-3 rounded-xl flex-row items-center justify-center mr-2 shadow-xs"
                        >
                          <Ionicons name="camera" size={16} color="#facc15" className="mr-1.5" />
                          <Text className="text-white font-bold text-xs">Take Photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handlePickFromGallery}
                          activeOpacity={0.8}
                          className="flex-1 bg-white border border-[#0d4761] py-3 px-3 rounded-xl flex-row items-center justify-center shadow-xs"
                        >
                          <Ionicons name="images-outline" size={16} color="#0d4761" className="mr-1.5" />
                          <Text className="text-[#0d4761] font-bold text-xs">Choose Photo</Text>
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row items-center mt-2 bg-amber-50 border border-amber-200/80 rounded-lg p-2">
                        <Ionicons name="alert-circle-outline" size={14} color="#b45309" className="mr-1.5" />
                        <Text className="text-amber-800 text-[10.5px] flex-1 font-medium">
                          Receipt image must be readable before confirming GCash payment.
                        </Text>
                      </View>
                    </View>
                  )}
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
            <Text className="text-[#0d4761] font-bold text-sm" numberOfLines={1}>
              {customerName}
            </Text>
          </View>

          {/* Total Capsule */}
          <View className="bg-white border border-[#D9D9D9] rounded-full px-6 py-4 flex-row items-center justify-between mb-4">
            <Text className="text-[#0d4761] font-medium text-sm">Order Total</Text>
            <Text className="text-[#0d4761] font-bold text-[22px] tracking-tight">
              ₱ {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Action Button */}
          <PrimaryButton
            title={getButtonTitle()}
            disabled={isButtonDisabled}
            onPress={handleActionPress}
          />
        </Animated.View>

        {/* Modal: High-Resolution Payment Evidence Inspector */}
        <Modal
          visible={showPhotoModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPhotoModal(false)}
        >
          <View className="flex-1 bg-black/95 justify-center items-center px-4">
            <SafeAreaView className="w-full h-full justify-between py-6">
              <View className="flex-row justify-between items-center px-2">
                <Text className="text-white font-bold text-base">GCash Receipt Photo</Text>
                <TouchableOpacity
                  onPress={() => setShowPhotoModal(false)}
                  className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <View className="flex-1 justify-center items-center my-4">
                {receiptPhotoUri && (
                  <Image
                    source={{ uri: receiptPhotoUri }}
                    style={{ width: '100%', height: '80%', borderRadius: 12 }}
                    resizeMode="contain"
                  />
                )}
              </View>

              <View className="items-center px-4">
                <TouchableOpacity
                  onPress={() => setShowPhotoModal(false)}
                  className="bg-white/20 px-6 py-2.5 rounded-full"
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">Close Preview</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      </View>
    </Animated.View>
  );
};

export default OrderSummaryDrawer;