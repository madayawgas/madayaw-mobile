import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInView from '../../components/ui/FadeInView';
import { printService } from '../../services/printService';

const ReceiptScreen = ({ orderData, onDone }) => {
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const order = orderData?.order || {};
  const items = orderData?.items || [];
  const customer = orderData?.customer || null;
  const trip = orderData?.trip || null;
  const paymentProofUri = orderData?.paymentProofUri || order?.payment_reference || null;

  const isZeroSale = order?.receipt_number?.startsWith('CD-');
  const docTitle = isZeroSale ? 'CANISTER RETURN DECLARATION' : 'OFFICIAL SALES INVOICE';
  const isSynced = order?.sync_status === 'SYNCED';

  const customerName =
    customer?.business_name ||
    customer?.name ||
    order?.customer_name ||
    'Valued Customer';
  const customerAddress =
    customer?.delivery_address ||
    customer?.address ||
    'On-Route Direct Delivery';
  const customerPhone =
    customer?.contact_number ||
    customer?.contactNumber ||
    customer?.phone ||
    null;

  const formattedDate = order?.transacted_at
    ? new Date(order.transacted_at).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleString();

  const handleShareReceipt = async () => {
    try {
      const receiptText = printService.generateReceiptText({
        order,
        items,
        customer,
        trip,
      });

      await Share.share({
        message: receiptText,
        title: `Receipt - ${order?.receipt_number || 'MadayawGas'}`,
      });
    } catch (err) {
      console.warn('[ReceiptScreen] Share error:', err);
      Alert.alert('Share Failed', 'Could not share the receipt text.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f4f6f8]">
      <FadeInView className="flex-1">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
        >
          {/* Official Receipt Card */}
          <View
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 4,
            }}
            className="p-6 mb-5"
          >
            {/* Business Header */}
            <View className="items-center pb-4 border-b border-gray-100">
              <View className="w-14 h-14 bg-[#0d4761]/10 rounded-full items-center justify-center mb-2">
                <Ionicons name="receipt" size={28} color="#0d4761" />
              </View>
              <Text className="text-[#0d4761] font-bold text-lg text-center tracking-tight">
                Madayaw Gas Petroleum and Gas Corporation
              </Text>
              <Text className="text-gray-500 text-xs text-center mt-0.5">
                Central Plant, Bunawan Yard, Davao City
              </Text>
              <Text className="text-gray-400 text-[11px] text-center">
                TIN: 009-876-543-00000-VAT
              </Text>
              <Text className="text-[#0d4761] font-bold text-[11px] uppercase tracking-wider mt-1.5">
                {docTitle}
              </Text>

              {/* Sync Status Badge */}
              <View
                className={`mt-3 px-3 py-1 rounded-full flex-row items-center ${
                  isSynced
                    ? 'bg-emerald-50 border border-emerald-300'
                    : 'bg-amber-50 border border-amber-300'
                }`}
              >
                <Ionicons
                  name={isSynced ? 'checkmark-circle' : 'cloud-offline-outline'}
                  size={14}
                  color={isSynced ? '#16a34a' : '#d97706'}
                  className="mr-1.5"
                />
                <Text
                  className={`text-[11px] font-bold ${
                    isSynced ? 'text-emerald-800' : 'text-amber-800'
                  }`}
                >
                  {isSynced ? 'SYNCED (SERVER CONFIRMED)' : 'RECORDED (OFFLINE / PENDING SYNC)'}
                </Text>
              </View>
              {!isSynced && (
                <Text className="text-amber-700/80 text-[10px] text-center mt-1">
                  Saved securely in local database. Will sync automatically when connected.
                </Text>
              )}
            </View>

            {/* Document Identifiers */}
            <View className="py-4 border-b border-gray-100 space-y-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-500 text-xs font-medium">Document No.:</Text>
                <Text className="text-[#0d4761] text-xs font-bold font-mono">
                  {order?.receipt_number || 'INV-PENDING'}
                </Text>
              </View>

              <View className="flex-row justify-between items-center">
                <Text className="text-gray-500 text-xs font-medium">Transaction Ref:</Text>
                <Text className="text-[#0d4761] text-xs font-bold font-mono">
                  {order?.transaction_no || 'TX-PENDING'}
                </Text>
              </View>

              <View className="flex-row justify-between items-center">
                <Text className="text-gray-500 text-xs font-medium">Date & Time:</Text>
                <Text className="text-gray-700 text-xs font-medium">{formattedDate}</Text>
              </View>

              {trip?.vehicle_plate && (
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-500 text-xs font-medium">Delivery Vehicle:</Text>
                  <Text className="text-gray-700 text-xs font-medium">{trip.vehicle_plate}</Text>
                </View>
              )}
            </View>

            {/* Customer Information */}
            <View className="py-4 border-b border-gray-100">
              <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                Customer Details
              </Text>
              <Text className="text-[#0d4761] font-bold text-sm">{customerName}</Text>
              <Text className="text-gray-600 text-xs mt-0.5">{customerAddress}</Text>
              {customerPhone && (
                <Text className="text-gray-500 text-xs mt-0.5">Contact: {customerPhone}</Text>
              )}
            </View>

            {/* Itemized Line Items */}
            <View className="py-4 border-b border-gray-100">
              <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                Purchased Items
              </Text>

              {items.length === 0 ? (
                <Text className="text-gray-400 text-xs italic py-2">No line items recorded.</Text>
              ) : (
                items.map((item, idx) => {
                  const qty = item.quantity || item.quantity_sold || item.quantitySold || 0;
                  const price = item.price || item.unit_price || item.unitPrice || 0;
                  const subtotal = item.subtotal || item.subtotalAmount || (qty * price);

                  return (
                    <View key={item.id || idx} className="py-2 border-b border-gray-50">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-[#0d4761] font-semibold text-xs flex-1 mr-2" numberOfLines={1}>
                          {item.name || item.product_name || item.productName || 'Product SKU'}
                        </Text>
                        <Text className="text-[#0d4761] font-bold text-xs">
                          ₱ {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center mt-0.5">
                        <Text className="text-gray-500 text-[11px]">
                          {qty} unit(s) × ₱{price.toLocaleString()}
                        </Text>
                        {(item.empties_returned || item.emptiesReturned) ? (
                          <Text className="text-emerald-700 text-[10px] font-medium">
                            Returns: {item.empties_returned || item.emptiesReturned}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Financial Summary */}
            <View className="py-4 border-b border-gray-100 space-y-2">
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-600 text-sm font-medium">Total Amount:</Text>
                <Text className="text-[#0d4761] text-2xl font-bold tracking-tight">
                  ₱ {(order?.total_amount || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>

              <View className="flex-row justify-between items-center pt-1">
                <Text className="text-gray-500 text-xs font-medium">Payment Method:</Text>
                <View className="flex-row items-center">
                  <Ionicons
                    name={order?.payment_method === 'GCASH' ? 'phone-portrait-outline' : 'cash-outline'}
                    size={14}
                    color="#0d4761"
                    className="mr-1"
                  />
                  <Text className="text-[#0d4761] font-bold text-xs">
                    {order?.payment_method === 'GCASH' ? 'GCash' : 'Cash'}
                  </Text>
                </View>
              </View>

              <View className="flex-row justify-between items-center">
                <Text className="text-gray-500 text-xs font-medium">Payment Status:</Text>
                <Text className="text-emerald-700 font-bold text-xs">PAID (UNVERIFIED)</Text>
              </View>
            </View>

            {/* GCash Payment Evidence Preview (if GCash transaction) */}
            {order?.payment_method === 'GCASH' && (
              <View className="pt-4">
                <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                  GCash Payment Evidence
                </Text>

                {paymentProofUri ? (
                  <View className="bg-[#f8fafc] border border-blue-100 rounded-xl p-3 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 mr-2">
                      <Image
                        source={{ uri: paymentProofUri }}
                        style={{ width: 48, height: 48, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                      <View className="ml-3 flex-1">
                        <Text className="text-[#0d4761] font-bold text-xs" numberOfLines={1}>
                          Payment Proof Attached
                        </Text>
                        <Text className="text-gray-400 text-[10px]">
                          Available for audit & reconciliation
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => setShowPhotoModal(true)}
                      activeOpacity={0.7}
                      className="bg-[#0d4761] px-3 py-1.5 rounded-lg flex-row items-center"
                    >
                      <Ionicons name="eye-outline" size={13} color="#ffffff" className="mr-1" />
                      <Text className="text-white text-xs font-semibold">Inspect</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text className="text-gray-400 text-xs italic">
                    No payment receipt image found.
                  </Text>
                )}
              </View>
            )}

            {/* Official Slip Notice */}
            <View className="mt-5 pt-3 border-t border-dashed border-gray-200 items-center">
              <Text className="text-gray-400 text-[10.5px] italic text-center">
                Thank you for your business! Direct Store Delivery (DSD)
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="space-y-3">
            <PrimaryButton title="DONE / BACK TO SALES" onPress={onDone} />

            <TouchableOpacity
              onPress={handleShareReceipt}
              activeOpacity={0.8}
              className="w-full bg-white border border-[#0d4761] py-3.5 px-4 rounded-full flex-row items-center justify-center mt-2"
            >
              <Ionicons name="share-social-outline" size={18} color="#0d4761" className="mr-2" />
              <Text className="text-[#0d4761] font-bold text-sm tracking-wide">
                SHARE RECEIPT
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Modal: High-Resolution Payment Evidence Inspector */}
        <Modal
          visible={showPhotoModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPhotoModal(false)}
        >
          <View className="flex-1 bg-black/90 justify-center items-center px-4">
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
                {paymentProofUri && (
                  <Image
                    source={{ uri: paymentProofUri }}
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
      </FadeInView>
    </SafeAreaView>
  );
};

export default ReceiptScreen;
