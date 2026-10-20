import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CustomerCard = ({
  customer,
  name,
  contact,
  dateString,
  customerType,
  isLocallyCreated,
  onPress,
}) => {
  const getTimeAgo = (date) => {
    if (!date) return 'Recently';
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return 'Recently';
    const diffDays = Math.floor((new Date() - parsed) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const rawBusinessName = (customer?.business_name || customer?.businessName || customer?.store_name || '').trim();
  const rawContactPerson = (customer?.contact_person || customer?.contactPerson || '').trim();
  const rawCustomerName = (customer?.name || name || '').trim();

  // Determine distinct personal name vs store/business name
  let storeName = '';
  let personalName = '';

  if (rawBusinessName && rawContactPerson && rawBusinessName.toLowerCase() !== rawContactPerson.toLowerCase()) {
    storeName = rawBusinessName;
    personalName = rawContactPerson;
  } else if (rawBusinessName && rawCustomerName && rawBusinessName.toLowerCase() !== rawCustomerName.toLowerCase()) {
    storeName = rawBusinessName;
    personalName = rawCustomerName;
  } else if (rawContactPerson && rawCustomerName && rawContactPerson.toLowerCase() !== rawCustomerName.toLowerCase()) {
    storeName = rawCustomerName;
    personalName = rawContactPerson;
  } else if (rawBusinessName) {
    storeName = rawBusinessName;
    personalName = rawContactPerson || rawCustomerName || '';
  } else {
    personalName = rawContactPerson || rawCustomerName || 'Customer';
  }

  // Heading logic: Store Name is title if present, otherwise Personal Name
  const primaryTitle = storeName || personalName;
  // Sub-heading: Display the customer personal name prominently when storeName is title
  const customerPersonSubtitle = storeName && personalName && storeName.toLowerCase() !== personalName.toLowerCase()
    ? personalName
    : null;

  const rawPhone = customer?.contact_number || customer?.contactNumber || customer?.phone || contact || '';
  const displayDate = customer?.created_at || customer?.createdAt || dateString;
  const displayType = customer?.customer_type || customer?.customerType || customerType;
  const isOffline =
    customer?.is_locally_created === 1 ||
    customer?.is_locally_created === true ||
    Boolean(isLocallyCreated);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center border border-gray-200 rounded-2xl p-3 mb-3 bg-white shadow-sm"
    >
      {/* Customer Avatar */}
      <View className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 items-center justify-center mr-3.5 shrink-0 border border-gray-100">
        <Image
          source={require('../../../assets/images/placeholder.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>

      {/* Customer Info */}
      <View className="flex-1 justify-center pr-2">
        <View className="flex-row items-center">
          <Text className="text-[#0d4761] font-bold text-base leading-tight mb-0.5 flex-1" numberOfLines={1}>
            {primaryTitle}
          </Text>
          {isOffline && (
            <Ionicons name="cloud-upload-outline" size={13} color="#f59e0b" style={{ marginLeft: 4 }} />
          )}
        </View>

        {/* Customer Personal Name Row (if different from store/title) */}
        {customerPersonSubtitle ? (
          <View className="flex-row items-center mt-0.5 mb-0.5">
            <Ionicons name="person-circle-outline" size={13} color="#0d4761" style={{ marginRight: 4 }} />
            <Text className="text-[#0d4761] font-semibold text-xs flex-1" numberOfLines={1}>
              Customer: {customerPersonSubtitle}
            </Text>
          </View>
        ) : null}

        {/* Contact info & customer classification */}
        <View className="flex-row items-center mt-0.5">
          <Text className="text-gray-500 text-[11px]" numberOfLines={1}>
            {rawPhone ? `${rawPhone}` : 'No phone'}
            {displayType ? ` • ${displayType}` : ''}
          </Text>
        </View>
      </View>

      {/* Time Label */}
      <Text className="text-gray-400 text-[10px] italic pr-2 shrink-0">
        {getTimeAgo(displayDate)}
      </Text>
    </TouchableOpacity>
  );
};

export default CustomerCard;
