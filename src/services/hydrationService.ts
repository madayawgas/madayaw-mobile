import { tripApi, customerApi, productApi } from '@/api';
import { tripRepository, inventoryRepository, customerRepository, resetShiftDatabase } from '@/database';
import { ActiveTrip, VehicleInventory } from '@/types';

export interface ShiftHydrationResult {
  success: boolean;
  trip: ActiveTrip;
  inventoryCount: number;
  customerCount: number;
  message?: string;
}

export const hydrationService = {
  /**
   * Orchestrates the Morning Shift Hydration ("Start Shift"):
   * 1. Fetches active assignment and truck loaded stock manifest from backend.
   * 2. Clears stale shift data from local SQLite.
   * 3. Seeds active trip, loaded stock, and route zone customers.
   */
  async hydrateShift(): Promise<ShiftHydrationResult> {
    try {
      // 1. Fetch active assignment
      const assignmentData = await tripApi.fetchActiveAssignment();
      const tripRaw = assignmentData.trip;

      // 2. Fetch loaded stock for this trip
      const stockItems = await tripApi.fetchTripStock(tripRaw.id);

      // 3. Clear stale shift data from SQLite
      await resetShiftDatabase();

      // 4. Save Active Trip
      const activeTrip: ActiveTrip = {
        trip_id: tripRaw.id,
        trip_number: tripRaw.tripNumber,
        vehicle_plate: tripRaw.truckPlateNumber,
        driver_name: tripRaw.driverName,
        sales_user_id: tripRaw.salesUserId,
        zone_id: tripRaw.zoneId,
        status: tripRaw.status,
        dispatched_at: tripRaw.departureTime,
      };
      await tripRepository.saveActiveTrip(activeTrip);

      // 5. Seed Vehicle Inventory
      const inventoryToSeed: VehicleInventory[] = stockItems.map((item) => ({
        product_id: item.productId,
        sku: item.sku as any,
        product_name: item.productName,
        quantity_loaded: item.quantityUnits,
        quantity_sold: 0,
        quantity_remaining: item.quantityUnits,
      }));
      await inventoryRepository.seedInventory(inventoryToSeed);

      // 6. Fetch and seed Zone Customers
      const zoneCustomers = await customerApi.fetchZoneCustomers(tripRaw.zoneId);
      await customerRepository.upsertCustomers(zoneCustomers);

      return {
        success: true,
        trip: activeTrip,
        inventoryCount: inventoryToSeed.length,
        customerCount: zoneCustomers.length,
        message: 'Shift hydrated successfully. You are ready to start route deliveries.',
      };
    } catch (error: any) {
      console.error('[HydrationService] Error during shift hydration:', error);
      throw new Error(error.message || 'Failed to hydrate morning shift data');
    }
  },

  async isShiftActive(): Promise<boolean> {
    const trip = await tripRepository.getActiveTrip();
    return Boolean(trip && trip.status === 'IN_PROGRESS');
  },
};
