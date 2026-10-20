import './global.css';
import React, { useState, useEffect, useRef } from 'react';
import { StatusBar, Alert, BackHandler, ToastAndroid, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from './src/screens/auth/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import ChangePasswordScreen from './src/screens/auth/ChangePasswordScreen';
import DashboardScreen from './src/screens/sales/DashboardScreen';
import SalesScreen from './src/screens/sales/SalesScreen';
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
import { useBackHandler } from './src/hooks/useBackHandler';

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
  const [tabHistory, setTabHistory] = useState(['dashboard']);
  const lastBackPressRef = useRef(0);

  const handleSelectTab = (tab) => {
    if (tab === currentTab) return;
    if (tab === 'dashboard') {
      setTabHistory(['dashboard']);
    } else {
      setTabHistory((prev) => [...prev.filter((t) => t !== tab), tab]);
    }
    setCurrentTab(tab);
  };

  // Hardware Back Press Handler: Tab navigation history & root exit debounce
  useBackHandler(() => {
    if (!user || user.mustChangePassword) {
      return false;
    }

    if (currentTab !== 'dashboard') {
      if (tabHistory.length > 1) {
        const nextHistory = [...tabHistory];
        nextHistory.pop();
        const prevTab = nextHistory[nextHistory.length - 1] || 'dashboard';
        setTabHistory(nextHistory);
        setCurrentTab(prevTab);
        return true;
      }
      setTabHistory(['dashboard']);
      setCurrentTab('dashboard');
      return true;
    }

    const now = Date.now();
    if (now - lastBackPressRef.current < 2000) {
      BackHandler.exitApp();
      return true;
    }

    lastBackPressRef.current = now;
    if (Platform.OS === 'android') {
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
    }
    return true;
  }, isReady && Boolean(user) && !user.mustChangePassword);

  useEffect(() => {
    let isMounted = true;

    // 1. Subscribe to reactive session state changes (handles 401 revocation across any service)
    const unsubAuth = authService.subscribe((session, reason) => {
      if (!isMounted) return;

      if (!session) {
        setUser(null);
        setCurrentTab('dashboard');
        setTabHistory(['dashboard']);
        syncScheduler.setActiveUser(null);
        if (reason === 'revoked') {
          Alert.alert(
            'Session Expired',
            'Your session has expired or is no longer valid. Please log in again.'
          );
        }
      } else {
        setUser(session);
        if (!session.mustChangePassword) {
          syncScheduler.setActiveUser(session.id);
        } else {
          syncScheduler.setActiveUser(null);
        }
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
            if (!session.mustChangePassword) {
              syncScheduler.setActiveUser(session.id);
            } else {
              syncScheduler.setActiveUser(null);
            }
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
    setTabHistory(['dashboard']);
    setCurrentTab('dashboard');
    if (userData && userData.id && !userData.mustChangePassword) {
      syncScheduler.setActiveUser(userData.id);
    } else {
      syncScheduler.setActiveUser(null);
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
    setTabHistory(['dashboard']);
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
              onSelectTab={handleSelectTab}
            />
          );
          break;
        case 'profile':
          Content = (
            <DriverProfileScreen
              user={user}
              onLogout={handleLogout}
              activeTab={currentTab}
              onSelectTab={handleSelectTab}
            />
          );
          break;
        case 'dashboard':
        default:
          Content = (
            <DriverDashboardScreen
              user={user}
              activeTab={currentTab}
              onSelectTab={handleSelectTab}
            />
          );
          break;
      }
      return <FadeInView key={currentTab}>{Content}</FadeInView>;
    }

    switch (currentTab) {
      case 'sales':
      case 'customer':
        Content = <SalesScreen activeTab={currentTab} onSelectTab={handleSelectTab} />;
        break;
      case 'profile':
        Content = (
          <ProfileScreen
            user={user}
            onLogout={handleLogout}
            activeTab={currentTab}
            onSelectTab={handleSelectTab}
          />
        );
        break;
      case 'dashboard':
      default:
        Content = (
          <DashboardScreen
            user={user}
            activeTab={currentTab}
            onSelectTab={handleSelectTab}
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
        ) : !user ? (
          <FadeInView key="login">
            <LoginScreen onLogin={handleLogin} />
          </FadeInView>
        ) : user.mustChangePassword ? (
          <FadeInView key="change-password">
            <ChangePasswordScreen
              user={user}
              onLogout={handleLogout}
            />
          </FadeInView>
        ) : (
          renderActiveScreen()
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
