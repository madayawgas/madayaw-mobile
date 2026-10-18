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

const ISSUE_TYPES = [
  'Tire Puncture',
  'Brake System',
  'Engine / Overheating',
  'Electrical',
  'Transmission',
  'Other',
];

const SEVERITIES = [
  { id: 'LOW', label: 'Low (Driveable)', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300' },
  { id: 'MEDIUM', label: 'Medium (Caution)', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' },
  { id: 'HIGH', label: 'High (Ground Truck)', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' },
];

const VehicleIssueModal = ({ visible, onClose, user, telemetry, onSuccess }) => {
  const [incidentType, setIncidentType] = useState('Tire Puncture');
  const [severity, setSeverity] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setIncidentType('Tire Puncture');
      setSeverity('MEDIUM');
      setDescription('');
      setPhotoUri(null);
    }
  }, [visible]);

  const handleCapturePhoto = async () => {
    try {
      setPhotoLoading(true);
      const uri = await mediaService.capturePhoto();
      if (uri) setPhotoUri(uri);
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
      if (uri) setPhotoUri(uri);
    } catch (err) {
      Alert.alert('Gallery Error', err.message || 'Unable to select photo');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please describe the vehicle issue or symptoms.');
      return;
    }

    try {
      setSubmitting(true);
      const issue = await driverService.reportVehicleIssue(user, {
        incidentType,
        description: description.trim(),
        severity,
        photoUri,
        truckId: telemetry?.truck_id,
      });

      Alert.alert(
        'Vehicle Issue Logged',
        `Incident reported under "${incidentType}" (${severity} severity). Fleet maintenance has been alerted.`
      );
      if (onSuccess) onSuccess(issue);
      onClose();
    } catch (err) {
      Alert.alert('Submission Error', err.message || 'Failed to submit issue report');
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
              <Text className="text-xl font-bold text-[#0d4761]">Report Vehicle Finding</Text>
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
            {/* Issue Type Selector */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                Issue Category *
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {ISSUE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setIncidentType(type)}
                    className={`px-3 py-2 rounded-xl border ${
                      incidentType === type
                        ? 'bg-[#0d4761] border-[#0d4761]'
                        : 'bg-[#f4f5f7] border-gray-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        incidentType === type ? 'text-white' : 'text-[#0d4761]'
                      }`}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Severity Level */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                Severity Level *
              </Text>
              <View className="flex-row gap-2">
                {SEVERITIES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSeverity(s.id)}
                    className={`flex-1 py-2.5 rounded-xl border items-center justify-center ${
                      severity === s.id
                        ? `${s.bg} ${s.border}`
                        : 'bg-[#f4f5f7] border-gray-200'
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${
                        severity === s.id ? s.color : 'text-gray-500'
                      }`}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
                Issue Description & Symptoms *
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what you observed (e.g. Unusual grinding noise on front brake rotor)"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="bg-[#f4f5f7] border border-gray-200 rounded-xl p-3 text-sm text-[#0d4761] min-h-[80px]"
              />
            </View>

            {/* Optional Photo Attachment */}
            <View className="mb-6">
              <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
                Photo of Defect (Optional)
              </Text>

              {photoLoading ? (
                <View className="bg-[#f4f5f7] rounded-xl p-6 items-center justify-center border border-dashed border-gray-300">
                  <ActivityIndicator color="#0d4761" />
                  <Text className="text-xs text-gray-500 font-medium mt-2">Compressing photo...</Text>
                </View>
              ) : photoUri ? (
                <View className="relative bg-[#f4f5f7] rounded-xl p-2 border border-gray-200">
                  <Image
                    source={{ uri: photoUri }}
                    className="w-full h-44 rounded-lg"
                    resizeMode="cover"
                  />
                  <View className="flex-row justify-between items-center mt-2 px-1">
                    <Text className="text-[11px] text-green-700 font-semibold">Photo Attached</Text>
                    <TouchableOpacity
                      onPress={() => setPhotoUri(null)}
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
              disabled={submitting || !description.trim()}
              className={`rounded-full py-4 items-center justify-center ${
                submitting || !description.trim() ? 'bg-gray-300' : 'bg-[#0d4761]'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-base font-bold tracking-wide uppercase">
                  Submit Issue Report
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default VehicleIssueModal;
