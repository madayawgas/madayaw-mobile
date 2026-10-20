import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import InputField from '../../components/ui/InputField';
import ContactField from '../../components/ui/ContactField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';
import { zoneRepository } from '../../database';
import { useBackHandler } from '../../hooks/useBackHandler';

const CUSTOMER_TYPES = [
  { id: 'RETAIL', label: 'Retail' },
  { id: 'COMMERCIAL', label: 'Commercial' },
  { id: 'WHOLESALE', label: 'Wholesale' },
  { id: 'HOUSEHOLD', label: 'Household' },
];

const extractTenDigits = (num) => {
  if (!num) return '';
  const digits = num.replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length >= 12) return digits.slice(2, 12);
  if (digits.startsWith('0') && digits.length >= 11) return digits.slice(1, 11);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

const AddCustomerScreen = ({ activeTrip, initialCustomer, onBack, onSubmit }) => {
  const isEditMode = Boolean(initialCustomer && initialCustomer.id);

  const [availableZones, setAvailableZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(
    initialCustomer?.zone_id || initialCustomer?.zoneId || activeTrip?.zone_id || ''
  );
  const [showZonePicker, setShowZonePicker] = useState(false);

  useEffect(() => {
    let isMounted = true;
    zoneRepository.getAllZones().then((zones) => {
      if (isMounted) {
        setAvailableZones(zones || []);
        setSelectedZoneId((prev) => (!prev && activeTrip?.zone_id ? activeTrip.zone_id : prev));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [activeTrip?.zone_id]);

  const [customerType, setCustomerType] = useState(
    initialCustomer?.customerType || initialCustomer?.customer_type || 'RETAIL'
  );
  const [contactPerson, setContactPerson] = useState(
    initialCustomer?.contact_person || initialCustomer?.contactPerson || initialCustomer?.name || ''
  );
  const [businessName, setBusinessName] = useState(
    initialCustomer?.business_name || initialCustomer?.businessName || ''
  );
  const [contact, setContact] = useState(
    extractTenDigits(initialCustomer?.contactNumber || initialCustomer?.contact_number || initialCustomer?.phone)
  );
  const [altContact, setAltContact] = useState(
    extractTenDigits(initialCustomer?.alternateContactNumber || initialCustomer?.alternate_contact_number)
  );
  const [address, setAddress] = useState(
    initialCustomer?.delivery_address || initialCustomer?.deliveryAddress || initialCustomer?.address || ''
  );
  const [tin, setTin] = useState(initialCustomer?.tin || '');

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialContact = extractTenDigits(
    initialCustomer?.contactNumber || initialCustomer?.contact_number || initialCustomer?.phone
  );
  const initialAltContact = extractTenDigits(
    initialCustomer?.alternateContactNumber || initialCustomer?.alternate_contact_number
  );
  const initialContactPerson =
    initialCustomer?.contact_person || initialCustomer?.contactPerson || initialCustomer?.name || '';
  const initialBusinessName =
    initialCustomer?.business_name || initialCustomer?.businessName || '';
  const initialAddress =
    initialCustomer?.delivery_address || initialCustomer?.deliveryAddress || initialCustomer?.address || '';
  const initialTin = initialCustomer?.tin || '';

  const hasUnsavedChanges =
    contactPerson !== initialContactPerson ||
    businessName !== initialBusinessName ||
    contact !== initialContact ||
    altContact !== initialAltContact ||
    address !== initialAddress ||
    tin !== initialTin;

  const handleBackPress = () => {
    if (showZonePicker) {
      setShowZonePicker(false);
      return;
    }
    if (hasUnsavedChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them and go back?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onBack },
        ]
      );
      return;
    }
    if (onBack) onBack();
  };

  useBackHandler(() => {
    handleBackPress();
    return true;
  }, true);

  const validate = () => {
    const errs = {};

    if (!contactPerson || contactPerson.trim().length === 0) {
      errs.contactPerson = 'Customer / Contact person name is required.';
    } else if (contactPerson.trim().length > 255) {
      errs.contactPerson = 'Name cannot exceed 255 characters.';
    }

    const cleanedContact = contact.replace(/\D/g, '');
    if (!cleanedContact || cleanedContact.length === 0) {
      errs.contact = 'Primary contact number is required.';
    } else if (cleanedContact.length !== 10) {
      errs.contact = 'Please enter a valid 10-digit mobile number (e.g. 917 123 4567).';
    }

    if (altContact) {
      const cleanedAlt = altContact.replace(/\D/g, '');
      if (cleanedAlt.length > 0 && cleanedAlt.length !== 10) {
        errs.altContact = 'Alternate contact must be 10 digits or left empty.';
      }
    }

    if (!address || address.trim().length === 0) {
      errs.address = 'Delivery address is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      const cleanedContact = contact.replace(/\D/g, '');
      const fullContactNumber = `+63${cleanedContact}`;

      const cleanedAlt = altContact ? altContact.replace(/\D/g, '') : '';
      const fullAltContact = cleanedAlt ? `+63${cleanedAlt}` : undefined;

      const customerPayload = {
        customerType,
        contactPerson: contactPerson.trim(),
        businessName: businessName.trim() || undefined,
        name: businessName.trim() || contactPerson.trim(),
        contactNumber: fullContactNumber,
        alternateContactNumber: fullAltContact,
        deliveryAddress: address.trim(),
        address: address.trim(),
        tin: tin.trim() || undefined,
        zoneId: selectedZoneId || activeTrip?.zone_id || null,
        zone_id: selectedZoneId || activeTrip?.zone_id || null,
      };

      await onSubmit(customerPayload, initialCustomer?.id);
    } catch (err) {
      console.warn('[AddCustomerScreen] Submission failed:', err);
      Alert.alert(isEditMode ? 'Update Error' : 'Registration Error', err?.message || 'Could not save customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentZone = availableZones.find((z) => z.id === selectedZoneId);
  const currentZoneName =
    currentZone?.name ||
    (activeTrip && selectedZoneId === activeTrip.zone_id ? activeTrip.zone_name : null) ||
    initialCustomer?.zone_name ||
    (selectedZoneId ? 'Selected Zone' : 'Select Delivery Zone');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FadeInView>
        <View className="flex-1 px-6 pt-4 justify-between pb-6">
          <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center mb-3">
              <TouchableOpacity
                onPress={handleBackPress}
                disabled={isSubmitting}
                activeOpacity={0.7}
                className="w-12 h-12 bg-white rounded-full items-center justify-center border border-gray-100 shadow-sm mr-4"
              >
                <Ionicons name="chevron-back" size={24} color="#0d4761" />
              </TouchableOpacity>
              <View className="flex-1">
                <Text className="text-[#0d4761] text-2xl font-bold">
                  {isEditMode ? 'Edit Customer' : 'Add Customer'}
                </Text>
                <Text className="text-gray-400 text-xs">
                  {isEditMode ? 'Update customer profile details' : 'Register new customer profile'}
                </Text>
              </View>
            </View>

            <View className="border-b border-gray-100 w-full mb-4" />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Interactive Delivery Zone Selector */}
              <Text className="text-[#0d4761] font-bold mb-2">Delivery Zone *</Text>
              <TouchableOpacity
                onPress={() => setShowZonePicker(true)}
                activeOpacity={0.8}
                className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-4 flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-9 h-9 rounded-full bg-[#0d4761]/10 items-center justify-center mr-3">
                    <Ionicons name="navigate-outline" size={18} color="#0d4761" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center flex-wrap">
                      <Text className="text-[#0d4761] text-sm font-bold mr-2" numberOfLines={1}>
                        {currentZoneName}
                      </Text>
                      {activeTrip && selectedZoneId === activeTrip.zone_id && (
                        <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                          <Text className="text-emerald-700 text-[9px] font-bold">CURRENT ROUTE</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-gray-400 text-[11px] mt-0.5">
                      Tap to choose or change delivery service zone
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {/* Customer Type Selector */}
              <Text className="text-[#0d4761] font-bold mb-2">Customer Segment *</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {CUSTOMER_TYPES.map((type) => {
                  const isSelected = customerType === type.id;
                  return (
                    <TouchableOpacity
                      key={type.id}
                      onPress={() => setCustomerType(type.id)}
                      activeOpacity={0.8}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? 'bg-[#0d4761] border-[#0d4761]'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-gray-600'
                        }`}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Contact Person / Customer Name */}
              <InputField
                label="Customer / Contact Person Name *"
                placeholder="e.g. Juan Dela Cruz"
                value={contactPerson}
                onChangeText={(text) => {
                  setContactPerson(text);
                  if (errors.contactPerson) setErrors((prev) => ({ ...prev, contactPerson: null }));
                }}
                error={errors.contactPerson}
              />

              {/* Business / Store Name */}
              <InputField
                label="Store or Business Name (Optional)"
                placeholder="e.g. Davao Central Bakery"
                value={businessName}
                onChangeText={setBusinessName}
              />

              {/* Primary Contact Number */}
              <ContactField
                label="Primary Contact Number *"
                value={contact}
                onChangeText={(text) => {
                  setContact(text);
                  if (errors.contact) setErrors((prev) => ({ ...prev, contact: null }));
                }}
                error={errors.contact}
              />

              {/* Alternate Contact Number */}
              <ContactField
                label="Alternate Contact Number (Optional)"
                value={altContact}
                onChangeText={(text) => {
                  setAltContact(text);
                  if (errors.altContact) setErrors((prev) => ({ ...prev, altContact: null }));
                }}
                error={errors.altContact}
              />

              {/* Delivery Address */}
              <InputField
                label="Delivery Address *"
                placeholder="e.g. Corner San Pedro St, Davao City"
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  if (errors.address) setErrors((prev) => ({ ...prev, address: null }));
                }}
                error={errors.address}
                multiline
                numberOfLines={2}
              />

              {/* Tax Identification Number (TIN) */}
              <InputField
                label="Tax Identification Number (TIN) (Optional)"
                placeholder="e.g. 123-456-789-000"
                value={tin}
                onChangeText={setTin}
              />
            </ScrollView>
          </View>

          {/* Save Button */}
          <PrimaryButton
            title={
              isSubmitting
                ? isEditMode
                  ? 'UPDATING CUSTOMER...'
                  : 'SAVING CUSTOMER...'
                : isEditMode
                ? 'UPDATE CUSTOMER'
                : 'SAVE CUSTOMER'
            }
            loading={isSubmitting}
            onPress={handleSave}
          />
        </View>
      </FadeInView>

      {/* Zone Picker Modal */}
      <Modal
        visible={showZonePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowZonePicker(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[75%] shadow-xl">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-4 border-b border-gray-100 mb-3">
              <View>
                <Text className="text-[#0d4761] text-lg font-bold">Select Delivery Zone</Text>
                <Text className="text-gray-400 text-xs">Choose the service zone for this customer</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowZonePicker(false)}
                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Zone Options List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {availableZones.map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                const isCurrentRoute = Boolean(activeTrip && zone.id === activeTrip.zone_id);
                return (
                  <TouchableOpacity
                    key={zone.id}
                    onPress={() => {
                      setSelectedZoneId(zone.id);
                      setShowZonePicker(false);
                    }}
                    activeOpacity={0.7}
                    className={`flex-row items-center justify-between p-3.5 mb-2 rounded-2xl border ${
                      isSelected
                        ? 'bg-[#0d4761]/5 border-[#0d4761]'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center flex-wrap">
                        <Text
                          className={`text-sm font-bold mr-2 ${
                            isSelected ? 'text-[#0d4761]' : 'text-gray-800'
                          }`}
                        >
                          {zone.name}
                        </Text>
                        {isCurrentRoute && (
                          <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Text className="text-emerald-700 text-[9px] font-bold">CURRENT ROUTE</Text>
                          </View>
                        )}
                      </View>
                      {zone.description && (
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                          {zone.description}
                        </Text>
                      )}
                    </View>
                    <View
                      className={`w-5 h-5 rounded-full border items-center justify-center ${
                        isSelected ? 'border-[#0d4761] bg-[#0d4761]' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default AddCustomerScreen;
