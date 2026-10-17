import './global.css';
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import DashboardScreen from './src/screens/sales/DashboardScreen';
import CustomerScreen from './src/screens/sales/CustomerScreen';
import OrderScreen from './src/screens/sales/OrderScreen';
import ProfileScreen from './src/screens/shared/ProfileScreen';
import FadeInView from './src/components/ui/FadeInView';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => {
    setUser(null);
    setCurrentTab('dashboard');
  };

  const renderActiveScreen = () => {
    let Content;
    switch (currentTab) {
      case 'order':
        Content = <OrderScreen activeTab={currentTab} onSelectTab={setCurrentTab} />;
        break;
      case 'customer':
        Content = <CustomerScreen activeTab={currentTab} onSelectTab={setCurrentTab} />;
        break;
      case 'profile':
        Content = (
          <ProfileScreen
            user={user}
            onLogout={handleLogout}
            activeTab={currentTab}
            onSelectTab={setCurrentTab}
          />
        );
        break;
      case 'dashboard':
      default:
        Content = (
          <DashboardScreen
            user={user}
            activeTab={currentTab}
            onSelectTab={setCurrentTab}
          />
        );
        break;
    }

    return <FadeInView key={currentTab}>{Content}</FadeInView>;
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        backgroundColor={user ? "#0d4761" : (isReady ? "#ffffff" : "#0d4761")}
        barStyle={isReady && !user ? "dark-content" : "light-content"}
      />
      {!isReady ? (
        <SplashScreen />
      ) : user ? (
        renderActiveScreen()
      ) : (
        <FadeInView key="login">
          <LoginScreen onLogin={(userData) => setUser(userData)} />
        </FadeInView>
      )}
    </SafeAreaProvider>
  );
}