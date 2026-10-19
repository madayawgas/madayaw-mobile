import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService } from '@/services/driverService';

const EMERGENCY_TYPES = [
  { id: 'ACCIDENT', label: 'Accident / Collision', icon: 'car-sport-outline' },
  { id: 'MECHANICAL', label: 'Breakdown / Blown Tire', icon: 'construct-outline' },
  { id: 'MEDICAL', label: 'Medical Emergency', icon: 'medkit-outline' },
  { id: 'SECURITY', label: 'Security / Hazard', icon: 'shield-outline' },
  { id: 'OTHER', label: 'Other Urgent Assistance', icon: 'alert-circle-outline' },
];

const EmergencySosModal = ({ visible, onClose, user, onSosDispatched }) => {
  const [emergencyType, setEmergencyType] = useState('ACCIDENT');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmergencyType('ACCIDENT');
      setNotes('');
    }
  }, [visible]);

  const handleSendSos = async () => {
    try {
      setSubmitting(true);
      const result = await driverService.triggerEmergencySos(
        user,
        emergencyType,
        notes.trim() || `Urgent driver SOS: ${emergencyType}`
      );

      Alert.alert(
        '🚨 EMERGENCY ALERT DISPATCHED',
        'Dispatchers and supervisors have been alerted with your truck ID and GPS coordinates. A 60-second cooldown is now active in the cabin.'
      );

      if (onSosDispatched) {
        onSosDispatched(result);
      }
      onClose();
    } catch (err) {
      Alert.alert('SOS Error', err.message || 'Failed to dispatch emergency SOS');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/75 px-5">
        <View className="bg-white rounded-[28px] w-full p-6 border-2 border-red-500">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mr-3">
                <Ionicons name="warning" size={24} color="#dc2626" />
              </View>
              <View>
                <Text className="text-xl font-bold text-red-600">EMERGENCY SOS</Text>
                <Text className="text-xs text-gray-500">Immediate Dispatch Notification</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
            >
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Emergency Category */}
          <View className="my-4">
            <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-2">
              Select Situation Type:
            </Text>
            <View className="gap-2">
              {EMERGENCY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  onPress={() => setEmergencyType(type.id)}
                  className={`flex-row items-center p-3 rounded-xl border ${
                    emergencyType === type.id
                      ? 'bg-red-50 border-red-500'
                      : 'bg-[#f4f5f7] border-gray-200'
                  }`}
                >
                  <Ionicons
                    name={type.icon}
                    size={20}
                    color={emergencyType === type.id ? '#dc2626' : '#0d4761'}
                  />
                  <Text
                    className={`text-xs font-bold ml-3 ${
                      emergencyType === type.id ? 'text-red-700' : 'text-[#0d4761]'
                    }`}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Quick Notes */}
          <View className="mb-5">
            <Text className="text-xs font-bold text-[#0d4761] uppercase tracking-wider mb-1.5">
              Quick Details / Location Note (Optional):
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Near Bunawan junction, blown rear tire"
              placeholderTextColor="#9ca3af"
              className="bg-[#f4f5f7] border border-gray-200 rounded-xl p-3 text-sm text-[#0d4761]"
            />
          </View>

          {/* High-Affordance Trigger Button */}
          <TouchableOpacity
            onPress={handleSendSos}
            disabled={submitting}
            className="bg-red-600 rounded-full py-4 items-center justify-center shadow-lg"
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="radio" size={20} color="#ffffff" />
                <Text className="text-white text-base font-bold tracking-wider uppercase ml-2">
                  TRANSMIT SOS ALERT NOW
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} className="mt-3 py-2 items-center">
            <Text className="text-xs font-semibold text-gray-500">Cancel & Return</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default EmergencySosModal;
