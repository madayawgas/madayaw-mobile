import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService } from '@/services/driverService';
import { mediaService } from '@/services/mediaService';

const FuelEntryModal = ({ visible, onClose, user, telemetry, onSuccess }) => {
  const [liters, setLiters] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const currentOdo = telemetry?.current_odometer || 0;

  useEffect(() => {
    if (visible) {
      setLiters('');
      setTotalCost('');
      setOdometer(currentOdo > 0 ? String(currentOdo) : '');
      setReceiptPhotoUri(null);
      setValidationError('');
    }
  }, [visible, currentOdo]);

  const handleOdometerChange = (val) => {
    setOdometer(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num < currentOdo) {
      setValidationError(
        `Odometer must be ≥ ${currentOdo.toLocaleString()} km`
      );
    } else {
      setValidationError('');
    }
  };

  const handleCapturePhoto = async () => {
    try {
      setPhotoLoading(true);
      const uri = await mediaService.capturePhoto();
      if (uri) {
        setReceiptPhotoUri(uri);
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message || 'Unable to open camera');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handlePickGallery = async () => {
    try {
      setPhotoLoading(true);
      const uri = await mediaService.pickFromGallery();
      if (uri) {
        setReceiptPhotoUri(uri);
      }
    } catch (err) {
      Alert.alert('Gallery Error', err.message || 'Unable to select photo');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSubmit = async () => {
    const parsedLiters = parseFloat(liters);
    const parsedCost = parseFloat(totalCost);
    const parsedOdo = parseInt(odometer, 10);

    if (isNaN(parsedLiters) || parsedLiters <= 0) {
      Alert.alert('Validation', 'Please enter a valid volume of liters pumped.');
      return;
    }
    if (isNaN(parsedCost) || parsedCost <= 0) {
      Alert.alert('Validation', 'Please enter a valid total monetary cost.');
      return;
    }
    if (isNaN(parsedOdo) || parsedOdo < currentOdo) {
      Alert.alert(
        'Monotonic Odometer Error',
        `Current odometer reading cannot be lower than registered odometer (${currentOdo.toLocaleString()} km).`
      );
      return;
    }

    try {
      setSubmitting(true);
      const result = await driverService.logFuel(user, {
        liters: parsedLiters,
        totalCost: parsedCost,
        odometer: parsedOdo,
        receiptPhotoUri,
        truckId: telemetry?.truck_id,
      });

      Alert.alert(
        'Refill Recorded',
        `Logged ${parsedLiters} L (₱${parsedCost.toLocaleString()}). Vehicle odometer updated to ${parsedOdo.toLocaleString()} km.`
      );
      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      Alert.alert('Submission Error', err.message || 'Failed to record fuel intake');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-white rounded-t-[32px] max-h-[90%] p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-gray-100">
            <View>
              <Text className="text-xl font-bold text-[#0d4761]">Log Fuel Refill</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Assigned Truck: <Text className="font-bold text-[#0d4761]">{telemetry?.plate_number || 'ABC-1001'}</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <Ionicons name="close" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
          >
            {/* Odometer Info Banner */}
            <View className="bg-[#f4f5f7] rounded-xl p-3 mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="speedometer-outline" size={18} color="#0d4761" />
                <Text className="text-xs text-gray-600 font-medium ml-2">Registered Odometer:</Text>
              </View>
              <Text className="text-xs font-bold text-[#0d4761]">{currentOdo.toLocaleString()} km</Text>
            </View>

            {/* Liters Pumped */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Liters Pumped (L) *
              </Text>
              <View className="flex-row items-center bg-[#f4f5f7] border border-gray-200 rounded-xl px-4 py-3">
                <TextInput
                  value={liters}
                  onChangeText={setLiters}
                  placeholder="e.g. 45.5"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="flex-1 text-base text-[#0d4761] font-semibold p-0"
                />
                <Text className="text-sm font-bold text-gray-400">Liters</Text>
              </View>
            </View>

            {/* Total Monetary Cost */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Total Cost (PHP) *
              </Text>
              <View className="flex-row items-center bg-[#f4f5f7] border border-gray-200 rounded-xl px-4 py-3">
                <Text className="text-base font-bold text-[#0d4761] mr-2">₱</Text>
                <TextInput
                  value={totalCost}
                  onChangeText={setTotalCost}
                  placeholder="e.g. 2500.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="flex-1 text-base text-[#0d4761] font-semibold p-0"
                />
              </View>
            </View>

            {/* Current Odometer Reading */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Current Odometer Reading *
              </Text>
              <View
                className={`flex-row items-center bg-[#f4f5f7] border rounded-xl px-4 py-3 ${
                  validationError ? 'border-red-500' : 'border-gray-200'
                }`}
              >
                <TextInput
                  value={odometer}
                  onChangeText={handleOdometerChange}
                  placeholder={`Min ${currentOdo}`}
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="flex-1 text-base text-[#0d4761] font-semibold p-0"
                />
                <Text className="text-sm font-bold text-gray-400">km</Text>
              </View>
              {validationError ? (
                <Text className="text-xs text-red-500 font-semibold mt-1">
                  {validationError}
                </Text>
              ) : null}
            </View>

            {/* Receipt Photo (Optional) */}
            <View className="mb-6">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                Fuel Receipt Photo (Optional)
              </Text>

              {photoLoading ? (
                <View className="bg-[#f4f5f7] rounded-xl p-6 items-center justify-center border border-dashed border-gray-300">
                  <ActivityIndicator color="#0d4761" />
                  <Text className="text-xs text-gray-500 font-medium mt-2">Compressing photo...</Text>
                </View>
              ) : receiptPhotoUri ? (
                <View className="relative bg-[#f4f5f7] rounded-xl p-2 border border-gray-200">
                  <Image
                    source={{ uri: receiptPhotoUri }}
                    className="w-full h-44 rounded-lg"
                    resizeMode="cover"
                  />
                  <View className="flex-row justify-between items-center mt-2 px-1">
                    <View className="flex-row items-center">
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text className="text-[11px] text-green-700 font-semibold ml-1">
                        Receipt Attached
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setReceiptPhotoUri(null)}
                      className="px-2 py-1 bg-red-50 rounded"
                    >
                      <Text className="text-xs font-bold text-red-600">Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleCapturePhoto}
                    className="flex-1 bg-[#f4f5f7] border border-dashed border-gray-300 rounded-xl py-4 items-center justify-center"
                  >
                    <Ionicons name="camera-outline" size={22} color="#0d4761" />
                    <Text className="text-xs font-bold text-[#0d4761] mt-1">Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handlePickGallery}
                    className="flex-1 bg-[#f4f5f7] border border-dashed border-gray-300 rounded-xl py-4 items-center justify-center"
                  >
                    <Ionicons name="images-outline" size={22} color="#0d4761" />
                    <Text className="text-xs font-bold text-[#0d4761] mt-1">Photo Library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Submit Action */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || Boolean(validationError)}
              className={`rounded-full py-4 items-center justify-center ${
                submitting || Boolean(validationError) ? 'bg-gray-300' : 'bg-[#0d4761]'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-base font-bold tracking-wide uppercase">
                  Confirm Fuel Refill
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default FuelEntryModal;
