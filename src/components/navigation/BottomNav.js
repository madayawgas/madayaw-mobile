import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NavTab = ({ iconName, activeIconName, label, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View
        style={{ transform: [{ scale: scaleAnim }] }}
        className={`items-center justify-center px-4 py-2 rounded-full ${
          isActive ? 'bg-[#0d4761]' : ''
        }`}
      >
        <Ionicons
          name={isActive ? activeIconName : iconName}
          size={24}
          color={isActive ? '#facc15' : '#0d4761'}
        />
        {!isActive && (
          <Text className="text-[10px] text-[#0d4761] font-bold mt-1 uppercase">
            {label}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const DEFAULT_TABS = [
  { id: 'dashboard', label: 'Home', iconName: 'server-outline', activeIconName: 'server' },
  { id: 'sales', label: 'Sales', iconName: 'cart-outline', activeIconName: 'cart' },
  { id: 'profile', label: 'Profile', iconName: 'person-circle-outline', activeIconName: 'person-circle' },
];

const BottomNav = ({ activeTab = 'dashboard', onSelectTab, tabs = DEFAULT_TABS }) => {
  return (
    <View className="absolute bottom-20 self-center flex-row bg-white rounded-[2rem] shadow-lg border border-gray-200 px-4 py-2 items-center justify-between w-11/12 z-20">
      {tabs.map((tab) => (
        <NavTab
          key={tab.id}
          label={tab.label}
          iconName={tab.iconName}
          activeIconName={tab.activeIconName}
          isActive={activeTab === tab.id || (tab.id === 'sales' && activeTab === 'customer')}
          onPress={() => onSelectTab && onSelectTab(tab.id)}
        />
      ))}
    </View>
  );
};

export default BottomNav;
