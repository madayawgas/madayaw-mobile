import { LoginResponseData } from '@/types';

export const MOCK_SEED_USERS: Record<string, { password: string; response: LoginResponseData }> = {
  sales_user: {
    password: 'SalesPass123!',
    response: {
      user: {
        id: '3c987654-3210-4cba-fed0-987654321cba',
        username: 'sales_user',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        phone: '+639170000004',
        birthdate: '1992-06-15',
        role: 'Sales Person',
        roleId: 'role-sales-person-001',
        roleNames: ['Sales Person'],
        roles: [
          {
            id: 'role-sales-person-001',
            name: 'Sales Person',
            isPrimary: true,
          },
        ],
        isActive: true,
        isBlocked: false,
        mustChangePassword: false,
        permissions: [
          'dashboard.view',
          'route.view_own',
          'sales.view_own',
          'sales.create',
          'sales.update',
          'delivery.view_own',
          'delivery.update_own',
        ],
      },
      token: 'mock_jwt_sales_user_session_token_xyz987',
    },
  },
  driver_user: {
    password: 'DriverPass123!',
    response: {
      user: {
        id: 'd8bb9909-ae9a-4d08-a845-4a497e1bf596',
        username: 'driver_user',
        firstName: 'Danilo',
        lastName: 'Driver',
        phone: '+639170000005',
        birthdate: '1988-11-20',
        role: 'Driver',
        roleId: 'role-driver-001',
        roleNames: ['Driver'],
        roles: [
          {
            id: 'role-driver-001',
            name: 'Driver',
            isPrimary: true,
          },
        ],
        isActive: true,
        isBlocked: false,
        mustChangePassword: false,
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
      token: 'mock_jwt_driver_user_session_token_xyz123',
    },
  },
  // Legacy / fallback test user supported for backward compatibility
  sperson: {

    password: 'salesperson123',
    response: {
      user: {
        id: '101',
        username: 'sperson',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        phone: '+639123456789',
        birthdate: '1990-05-14',
        role: 'Sales Person',
        roleId: 'ROLE_SALES_02',
        roleNames: ['Sales Person'],
        roles: [
          {
            id: 'ROLE_SALES_02',
            name: 'Sales Person',
            isPrimary: true,
          },
        ],
        isActive: true,
        isBlocked: false,
        mustChangePassword: false,
        permissions: [
          'dashboard.view',
          'route.view_own',
          'sales.view_own',
          'sales.create',
          'sales.update',
          'delivery.view_own',
          'delivery.update_own',
        ],
      },
      token: 'mock_jwt_sperson_session_token_legacy',
    },
  },
};
