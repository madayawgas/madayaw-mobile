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
