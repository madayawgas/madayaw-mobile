import { apiClient } from '../client';
import { ServiceZone } from '@/types';

export const scheduleApi = {
  /**
   * Fetches all delivery service zones from the backend API.
   * Authorized via `route.view` or `route.view_own`.
   */
  async fetchZones(): Promise<ServiceZone[]> {
    const res = await apiClient<any>('/schedules/zones', {
      method: 'GET',
    });
    const list = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.zones) ? res.data.zones : []);
    return list;
  },
};
