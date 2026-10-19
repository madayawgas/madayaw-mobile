import './global.css';
import React, { useState, useEffect } from 'react';
import { StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import DashboardScreen from './src/screens/sales/DashboardScreen';
import CustomerScreen from './src/screens/sales/CustomerScreen';
import OrderScreen from './src/screens/sales/OrderScreen';
import ProfileScreen from './src/screens/shared/ProfileScreen';
import DriverDashboardScreen from './src/screens/driver/DriverDashboardScreen';
import DriverMaintenanceScreen from './src/screens/driver/DriverMaintenanceScreen';
import DriverProfileScreen from './src/screens/driver/DriverProfileScreen';
import FadeInView from './src/components/ui/FadeInView';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { syncScheduler } from './src/sync';
import { getDatabase } from './src/database';
import { authService } from './src/services/authService';
import { authApi } from './src/api/endpoints/authApi';

const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#0d4761',
    secondary: '#facc15',
    error: '#ef4444',
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');

  useEffect(() => {
    let isMounted = true;

    // 1. Subscribe to reactive session state changes (handles 401 revocation across any service)
    const unsubAuth = authService.subscribe((session, reason) => {
      if (!isMounted) return;

      if (!session) {
        setUser(null);
        setCurrentTab('dashboard');
        syncScheduler.setActiveUser(null);
        if (reason === 'revoked') {
          Alert.alert(
            'Session Expired',
            'Your session has expired or is no longer valid. Please log in again.'
          );
        }
      } else {
        setUser(session);
        syncScheduler.setActiveUser(session.id);
      }
    });

    const initApp = async () => {
      try {
        // 2. Await local SQLite database schema initialization and pre-migrations
        await getDatabase();

        // 3. Hydrate persistent session if token exists
        const session = await authService.getSession();
        if (!isMounted) return;

        if (session && session.token) {
          // 4. Validate session online, preserving offline usability in cellular dead zones
          const validation = await authApi.validateSession();
          if (!isMounted) return;

          if (validation === 'revoked') {
            setUser(null);
            syncScheduler.setActiveUser(null);
            Alert.alert(
              'Session Expired',
              'Your session has expired or is no longer valid. Please log in again.'
            );
          } else {
            // 'valid' or 'offline'
            setUser(session);
            syncScheduler.setActiveUser(session.id);
          }
        } else {
          setUser(null);
          syncScheduler.setActiveUser(null);
        }
      } catch (err) {
        console.warn('[App] Initialization error:', err);
        if (isMounted) {
          syncScheduler.setActiveUser(null);
          setUser(null);
        }
      }
    };

    initApp();

    // 5. Start the Tri-Trigger Sync Engine (connectivity sentinel + 30s background sync polling)
    const cleanupSync = syncScheduler.start();

    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (cleanupSync) cleanupSync();
      if (unsubAuth) unsubAuth();
    };
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    if (userData && userData.id) {
      syncScheduler.setActiveUser(userData.id);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.clearSession('logout');
    } catch (_e) {
      // ignore
    }
    syncScheduler.setActiveUser(null);
    setUser(null);
    setCurrentTab('dashboard');
  };

  const isDriver = user?.role === 'Driver' || user?.roleNames?.includes('Driver');

  const renderActiveScreen = () => {
    let Content;

    if (isDriver) {
      switch (currentTab) {
        case 'maintenance':
          Content = (
            <DriverMaintenanceScreen
              user={user}
              activeTab={currentTab}
              onSelectTab={setCurrentTab}
            />
          );
          break;
        case 'profile':
          Content = (
            <DriverProfileScreen
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
            <DriverDashboardScreen
              user={user}
              activeTab={currentTab}
              onSelectTab={setCurrentTab}
            />
          );
          break;
      }
      return <FadeInView key={currentTab}>{Content}</FadeInView>;
    }

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
      <PaperProvider theme={paperTheme}>
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
            <LoginScreen onLogin={handleLogin} />
          </FadeInView>
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}