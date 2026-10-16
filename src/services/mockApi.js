import { authApi } from '../api/endpoints/authApi';
import { authService } from './authService';

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
    if (authResult?.user && authResult?.token) {
      await authService.saveSession(authResult.user, authResult.token);
      return { success: true, data: authResult.user };
    }
    throw new Error('Invalid authentication response structure');
  } catch (error) {
    // Direct fallback against local mockUsers
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

    throw new Error(error?.message || 'Invalid username or password');
  }
};