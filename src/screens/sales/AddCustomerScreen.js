import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import InputField from '../../components/ui/InputField';
import ContactField from '../../components/ui/ContactField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';

const AddCustomerScreen = ({ onBack, onSubmit }) => {
  const [name, setName] = useState('');
  const [contact, setContact] = useState(''); // Stores raw user input e.g. "999 9999 999"
  const [address, setAddress] = useState('');

  const handleSave = () => {
    // Standardizes final output format to +(63) 999 9999 999
    const fullContactNumber = `+(63) ${contact}`;
    onSubmit({ name, contactNumber: fullContactNumber, address });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 justify-between pb-8">
          <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center mb-4">
              <TouchableOpacity
                onPress={onBack}
                className="w-12 h-12 bg-white rounded-full items-center justify-center border border-gray-100 shadow-sm mr-4"
              >
                <Ionicons name="chevron-back" size={24} color="#0d4761" />
              </TouchableOpacity>
              <Text className="text-[#0d4761] text-2xl font-bold">Add Customer</Text>
            </View>

            <View className="border-b border-gray-100 w-full mb-6" />

            <ScrollView showsVerticalScrollIndicator={false}>
              <InputField
                label="Customer Name"
                placeholder="e.g. Precious Gasoline"
                value={name}
                onChangeText={setName}
              />

              {/* Custom Contact Field */}
              <ContactField
                label="Contact Number"
                value={contact}
                onChangeText={setContact}
              />

              <InputField
                label="Address"
                placeholder="e.g. Matina Aplaya, Davao City"
                value={address}
                onChangeText={setAddress}
              />
            </ScrollView>
          </View>

          <PrimaryButton
            title="SAVE CUSTOMER"
            onPress={handleSave}
          />
        </View>
      </FadeInView>
    </SafeAreaView>
  );
};

export default AddCustomerScreen;
