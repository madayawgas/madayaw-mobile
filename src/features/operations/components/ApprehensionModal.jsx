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

const AGENCIES = ['CTTMO', 'LTO', 'PNP', 'OTHER'];

const ApprehensionModal = ({ visible, onClose, user, telemetry, onSuccess }) => {
  const [agency, setAgency] = useState('CTTMO');
  const [citationNumber, setCitationNumber] = useState('');
  const [violationNotes, setViolationNotes] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [ticketPhotoUri, setTicketPhotoUri] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAgency('CTTMO');
      setCitationNumber('');
      setViolationNotes('');
      setFineAmount('');
      setTicketPhotoUri(null);
    }
  }, [visible]);

  const handleCapturePhoto = async () => {
    try {
      setPhotoLoading(true);
      const uri = await mediaService.capturePhoto();
      if (uri) {
        setTicketPhotoUri(uri);
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
        setTicketPhotoUri(uri);
      }
    } catch (err) {
      Alert.alert('Gallery Error', err.message || 'Unable to select photo');
    } finally {
      setPhotoLoading(false);
    }
  };

  const isFormValid = Boolean(violationNotes.trim()) && Boolean(ticketPhotoUri);

  const handleSubmit = async () => {
    if (!violationNotes.trim()) {
      Alert.alert('Validation Error', 'Please describe the violation remarks.');
      return;
    }
    if (!ticketPhotoUri) {
      Alert.alert(
        'Mandatory Photo Proof',
        'A clear photo of the roadside apprehension/citation ticket is mandatory before submitting.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const report = await driverService.reportApprehension(user, {
        agency,
        violationType: violationNotes.trim() || 'TRAFFIC_CITATION',
        violationNotes: violationNotes.trim(),
        citationNumber: citationNumber.trim() || null,
        fineAmount: fineAmount ? parseFloat(fineAmount) : null,
        ticketPhotoUri,
        truckId: telemetry?.truck_id,
      });

      Alert.alert(
        'Citation Reported',
        `Apprehension report under ${agency} recorded successfully. Logistics supervisors will review the ticket.`
      );
      if (onSuccess) {
        onSuccess(report);
      }
      onClose();
    } catch (err) {
      Alert.alert('Submission Error', err.message || 'Failed to submit citation report');
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
              <Text className="text-xl font-bold text-[#0d4761]">Report Citation</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Truck: <Text className="font-bold text-[#0d4761]">{telemetry?.plate_number || 'ABC-1001'}</Text>
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
            {/* Apprehending Agency Selector */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                Apprehending Agency *
              </Text>
              <View className="flex-row gap-2">
                {AGENCIES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setAgency(item)}
                    className={`flex-1 py-2.5 rounded-xl border items-center justify-center ${
                      agency === item
                        ? 'bg-[#0d4761] border-[#0d4761]'
                        : 'bg-[#f4f5f7] border-gray-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        agency === item ? 'text-white' : 'text-[#0d4761]'
                      }`}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Citation Number */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Citation / Ticket Number (Optional)
              </Text>
              <TextInput
                value={citationNumber}
                onChangeText={setCitationNumber}
                placeholder="e.g. CTTMO-2026-0814"
                placeholderTextColor="#9ca3af"
                className="bg-[#f4f5f7] border border-gray-200 rounded-xl px-4 py-3 text-base text-[#0d4761] font-semibold"
              />
            </View>

            {/* Fine Amount */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Fine Amount (Optional)
              </Text>
              <View className="flex-row items-center bg-[#f4f5f7] border border-gray-200 rounded-xl px-4 py-3">
                <Text className="text-base font-bold text-[#0d4761] mr-2">₱</Text>
                <TextInput
                  value={fineAmount}
                  onChangeText={setFineAmount}
                  placeholder="e.g. 1000.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="flex-1 text-base text-[#0d4761] font-semibold p-0"
                />
              </View>
            </View>

            {/* Violation Remarks */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Violation Remarks / Notes *
              </Text>
              <TextInput
                value={violationNotes}
                onChangeText={setViolationNotes}
                placeholder="Describe reason for citation (e.g. Obstructed loading zone on Macarthur Hwy)"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="bg-[#f4f5f7] border border-gray-200 rounded-xl p-3 text-sm text-[#0d4761] min-h-[80px]"
              />
            </View>

            {/* Mandatory Ticket Photo Proof */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider">
                  Ticket Photo Proof *
                </Text>
                <Text className="text-[11px] text-red-600 font-bold">MANDATORY</Text>
              </View>

              {photoLoading ? (
                <View className="bg-[#f4f5f7] rounded-xl p-6 items-center justify-center border border-dashed border-gray-300">
                  <ActivityIndicator color="#0d4761" />
                  <Text className="text-xs text-gray-500 font-medium mt-2">Compressing photo...</Text>
                </View>
              ) : ticketPhotoUri ? (
                <View className="relative bg-[#f4f5f7] rounded-xl p-2 border border-gray-200">
                  <Image
                    source={{ uri: ticketPhotoUri }}
                    className="w-full h-44 rounded-lg"
                    resizeMode="cover"
                  />
                  <View className="flex-row justify-between items-center mt-2 px-1">
                    <View className="flex-row items-center">
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text className="text-[11px] text-green-700 font-semibold ml-1">
                        Ticket Proof Attached
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setTicketPhotoUri(null)}
                      className="px-2 py-1 bg-red-50 rounded"
                    >
                      <Text className="text-xs font-bold text-red-600">Retake</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleCapturePhoto}
                    className="flex-1 bg-red-50/50 border border-dashed border-red-300 rounded-xl py-4 items-center justify-center"
                  >
                    <Ionicons name="camera-outline" size={24} color="#dc2626" />
                    <Text className="text-xs font-bold text-red-600 mt-1">Capture Ticket</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handlePickGallery}
                    className="flex-1 bg-red-50/50 border border-dashed border-red-300 rounded-xl py-4 items-center justify-center"
                  >
                    <Ionicons name="images-outline" size={24} color="#dc2626" />
                    <Text className="text-xs font-bold text-red-600 mt-1">Photo Library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Submit Action */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !isFormValid}
              className={`rounded-full py-4 items-center justify-center ${
                submitting || !isFormValid ? 'bg-gray-300' : 'bg-red-600'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-base font-bold tracking-wide uppercase">
                  {!ticketPhotoUri ? 'Attach Ticket Photo to Submit' : 'Submit Citation Report'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default ApprehensionModal;
