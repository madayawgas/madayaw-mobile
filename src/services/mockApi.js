import { authApi } from '../api/endpoints/authApi';
import { authService } from './authService';
import { ENV } from '../config';

const mockUsers = [
  {
    id: '3c987654-3210-4cba-fed0-987654321cba',
    username: 'sales_user',
    password: 'SalesPass123!',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    phone: '+639170000004',
    birthdate: '1992-06-15',
    role: 'Sales Person',
    roleId: 'role-sales-person-001',
  },
  {
    id: 'd8bb9909-ae9a-4d08-a845-4a497e1bf596',
    username: 'driver_user',
    password: 'DriverPass123!',
    firstName: 'Danilo',
    lastName: 'Driver',
    phone: '+639170000005',
    birthdate: '1988-11-20',
    role: 'Driver',
    roleId: 'role-driver-001',
    roleNames: ['Driver'],
    permissions: [
      'attendance.record',
      'attendance.view_own',
      'apprehensions.create',
      'apprehensions.view_own',
      'fuel.create',
      'fuel.view_own',
      'alerts.trigger',
      'alerts.view_own',
      'route.view_own',
      'fleet.view_own',
    ],
  },
  {
    id: '101',
    username: 'sperson',
    password: 'salesperson123',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    phone: '+639123456789',
    birthdate: '1990-05-14',
    role: 'SalesPerson',
    roleId: 'ROLE_SALES_02',
  },
];


/**
 * Universal login bridge for madayawgas-mobile.
 * Authenticates against authApi (handling both mock data and live backend based on config),
 * persists session token into SecureStore, and falls back to local mockUsers if needed.
 */
export const loginUser = async (username, password) => {
  try {
    const authResult = await authApi.login({ username, password });
    if (authResult?.user) {
      const token = authResult.token || `session-${authResult.user.id}`;
      await authService.saveSession(authResult.user, token);
      return { success: true, data: authResult.user };
    }
    throw new Error('Invalid authentication response structure');
  } catch (error) {
    if (ENV.USE_MOCK) {
      // Direct fallback against local mockUsers ONLY when ENV.USE_MOCK is true
      const user = mockUsers.find(
        (u) => u.username === username && u.password === password
      );
      if (user) {
        const { password: _p, ...userData } = user;
        await authService.saveSession(
          userData,
          `mock_jwt_session_token_${user.id}`
        ).catch(() => {});
        return { success: true, data: userData };
      }
    }

    throw new Error(error?.message || 'Invalid username or password');
  }
};