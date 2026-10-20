This is an Expo/React Native mobile application for MadayawGas Direct Store Delivery (DSD). Prioritize mobile-first patterns, performance, and cross-platform compatibility.

---

## ðŸš¨ MANDATORY AGENT DIRECTIVES

1. **REFER TO THIS FILE FIRST**: Always review `AGENTS.md` before starting any coding, refactoring, or architectural task in this repository.
2. **MAINTAIN THIS FILE ON EVERY CHANGE**: Whenever you add, modify, or remove database tables, domain services, sync logic, environment variables, dependencies, or architectural patterns, you **MUST update `AGENTS.md`** before completing your task so it always reflects the live state of the codebase.
3. **PRESERVE EXISTING UI SCREENS**: DO NOT alter or modify `App.js` or files in `src/screens/` unless the user explicitly requests UI screen development or modifications. Keep the existing UI pristine while building or modifying the underlying services.
4. **NO TYPESCRIPT SYNTAX IN `.js` FILES**: Standard `.js` files are parsed with Babel's Flow/JS parser. Never introduce TypeScript annotations (e.g. `catch (e: any)` or type annotations) into `.js` files â€” use plain JavaScript.
5. **KNOWLEDGE GRAPH SYNCHRONIZATION**: After modifying code files in any session, run `graphify update .` to keep the graphify knowledge graph in `graphify-out/` current.
6. **VERIFICATION**: Always run `npx tsc --noEmit` to verify type checking before declaring any task done.

---

## Domain & Operational Context

* **Direct Store Delivery (DSD) Model**:
  Delivery trucks function as autonomous roving storefronts operating across Davao City, Davao del Sur, Samal Island, and Northern Mindanao routes.
* **Cabin Actors**:
  - **Delivery Truck Drivers**: Soft-bound 1:1 to vehicles with NO system login credentials.
  - **Sales Agent (`sales_user`)**: The sole authenticated operator on this device responsible for logging in, starting the shift, recording all transactions, handling payments, and syncing data.
* **Core Product Scope (Strictly Discrete Integer Units)**:
  Exactly 3 canonical SKUs are handled:
  1. `170g Butane Canisters` (handled as raw integer units in DB; crates of 24 units are strictly a UI abstraction)
  2. `11kg LPG Cylinders`
  3. `50kg LPG Cylinders`
* **Cellular Dead Zones & Disconnected Operations**:
  Delivery routes traverse rural areas with zero cellular reception for hours. The app must operate fully offline for an 8â€“10 hour shift without blocking sales, customer onboarding, canister swaps, or receipt generation.

---

## Offline-First Architecture & Local Stack

### Local SQLite Database (`madayawgas.db`)
- Created and accessed asynchronously via `expo-sqlite` with **WAL mode**, foreign keys enabled, and `PRAGMA busy_timeout = 5000;` to ensure transaction concurrency resilience (`src/database/connection.ts`). In-flight promise deduplication (`activeDashboardPromise`) protects against simultaneous query locks.
- **Core Schema Tables (`src/database/schema.ts`)**:
  - `local_active_trip`: Active shift metadata (`trip_id`, `trip_number`, `vehicle_plate`, `driver_name`, `sales_user_id`, `zone_id`, `status`, `dispatched_at`, `truck_id`, `truck_model`, `driver_id`, `sales_user_name`, `zone_name`).
  - `local_vehicle_inventory`: Truck loaded stock counters (`quantity_loaded`, `quantity_sold`, `quantity_remaining`).
  - `local_customers`: Zone customer directory (`id`, `name`, `store_name`, `address`, `phone`, `current_debt`, `zone_id`, `business_name`, `contact_person`, `contact_number`, `delivery_address`, `customer_type`, `canister_debt`, `is_locally_created`, `created_at`).
  - `local_sales_orders`: In-field sales records (`id`, `transaction_no`, `customer_id`, `customer_name`, `receipt_number`, `trip_id`, `total_amount`, `payment_method`, `payment_reference`, `transacted_at`, `synced_at`, `sync_status`, `error_code`, `error_message`).
  - `local_sales_items`: Line items for sales (`id`, `sales_order_id`, `product_id`, `product_name`, `quantity_sold`, `empties_returned`, `empties_defective`, `unit_price`, `subtotal`).
  - `local_canister_ledger`: Append-only tracking of cylinder swaps and loaned canisters.
  - `sync_queue`: Mutation queue for store-and-forward syncing (`id`, `user_id`, `endpoint`, `operation_type`, `payload`, `status`, `retry_count`, `last_attempted_at`, `error_code`, `error_message`, `last_error`, `created_at`).
  - `local_receipt_sequences`: Sequential counters for document numbers (`INV-...` for sales, `CD-...` for canister returns).
  - `local_driver_shift`: Active duty shift attendance (`id`, `driver_id`, `status`, `clock_in_time`, `clock_out_time`, `synced`).
  - `local_vehicle_telemetry`: Distance-based 5,000-km PM and odometer telemetry (`truck_id`, `plate_number`, `model`, `current_odometer`, `last_pm_odometer`, `status`, `last_serviced_at`).
  - `local_fuel_logs`: Fuel refills (`id`, `truck_id`, `driver_id`, `liters`, `total_cost`, `odometer`, `receipt_photo_uri`, `logged_at`, `synced`).
  - `local_apprehensions`: Roadside citations (`id`, `truck_id`, `driver_id`, `agency`, `citation_number`, `violation_notes`, `fine_amount`, `ticket_photo_uri`, `reported_at`, `synced`).
  - `local_incidents`: Breakdown/defect findings (`id`, `truck_id`, `driver_id`, `incident_type`, `description`, `severity`, `photo_uri`, `reported_at`, `synced`).
  - `local_service_zones`: Delivery service zones (`id`, `code`, `name`, `description`, `is_active`).
- **Database Reset & Re-initialization (`resetFullDatabase()`)**:
  - Disables foreign keys (`PRAGMA foreign_keys = OFF;`), drops all 14 local SQLite tables in reverse dependency order, re-enables foreign keys, and re-executes `SCHEMA_SQL` to return the client to a clean slate without foreign key constraint violations.
  - Retained as a programmatic utility in `src/database/connection.ts`. Testing-only UI reset triggers have been removed from Profile screens (`DriverProfileScreen.jsx` and `ProfileScreen.js`) for the production APK build.
  - **Explicit Logout Confirmation**: Both Driver (`DriverProfileScreen.jsx`) and Sales (`ProfileScreen.js`) profiles enforce a confirmation dialog (`Alert.alert`) before executing `onLogout`, guarding frontline operators against accidental sign-outs.

### Business Logic Invariants
- **Vehicle Manifest Scoped Catalog**: Both online and offline catalog views strictly restrict displayed products to items loaded on the active trip vehicle (`local_vehicle_inventory`), preserving data integrity so sales agents cannot sell products that were not loaded onto the vehicle. When online, metadata (prices, net weights) is enriched from `productApi.fetchProductCatalog()`.
- **Inline Frontend Stock Guard**: Visual validation in `QuantityControl.js`, `ConfirmOrderScreen.js`, and `OrderSummaryDrawer.js` prevents entering or confirming quantities greater than remaining vehicle stock (`quantity_remaining`). Exceeding stock turns the quantity pill and label red (`#ef4444`, `#dc2626`) and displays inline text `Max: X available on board` with NO popups or alert dialogs. Drawer confirmation button is disabled with label `EXCEEDS AVAILABLE STOCK`.
- **Append-Only Canister Debt & Receivables Model (`salesService.ts`, `customerRepository.ts`, `local_canister_ledger`)**:
  When a customer purchases gas products or returns empties:
  ```
  quantity_loaned = max(0, quantity_sold - empties_returned)
  quantity_returned = max(0, empties_returned - quantity_sold)
  net_balance_change = quantity_loaned - quantity_returned
  new_customer_debt = max(0, current_customer_debt + sum(net_balance_change))
  ```
  Every canister loan or return is recorded per SKU in `local_canister_ledger`. Outstanding receivables for each product reflect the net cylinders on loan (total loaned - total returned). Newly purchased products immediately record positive net balance changes and appear in the customer's Canister Receivables SKU breakdown. In `CustomerDetailsScreen`, local SQLite canister ledger records seamlessly overlay with server balances, adding pending changes without duplicate counts.
- **Permissive Selling Policy**: If the sales agent sells more stock than local inventory records show as remaining on board, warn the user but **ALLOW** the sale to proceed. Cash flow in the field takes precedence; discrepancies reconcile at the evening plant dock.
- **Monotonic Odometer Integrity**: Client-side enforcement ensuring all new odometer readings must be greater than or equal to current registered odometer (`new_odometer >= current_odometer`).
- **Mandatory Citation Photo Proof**: Block submission of roadside apprehension reports until ticket photo proof is attached and validated.
- **Emergency SOS Resilience & Foreign Key Self-Healing**: High-affordance cabin SOS button with current GPS coordinates and an immediate 60-second cooldown timer. Life-critical SOS signals always attempt rapid direct HTTP dispatch (`/operations/alerts`) first, falling back to `sync_queue` only if offline. Emergency alerts are never blocked by optional relational metadata (`trip_id`). If an active trip ID is unverified or rejected by PostgreSQL (`emergency_alerts_trip_id_fkey`), mobile automatically clears stale `local_active_trip`, strips `tripId`, and immediately re-dispatches with `tripId: null`. In the background sync queue, `syncWorker` purges unverified trip IDs and recovers from foreign key rejections without dropping alerts.
- **Web-Aligned Media Compression & Caching**: 5 MB ceiling enforcement, max 1920px dimension scaling, progressive JPEG compression (0.82 -> 0.35), and persistent offline caching in `${FileSystem.documentDirectory}offline_media/`.
- **Atomic Local Writes & Transaction Safety**: Every completed transaction decrements local vehicle inventory, updates canister debt math, logs order items, and inserts a pending mutation into `sync_queue` within a single SQLite transaction using the explicit `txn` connection.

### Store-and-Forward Sync Engine (`src/sync/`)
- **Network Sentinel (`networkSentinel.ts`)**:
  - Probes `BACKEND_HEALTH_URL` (derived dynamically from `ENV.API_URL.replace(/\/api\/?$/, '') + '/health'`) rather than public third-party WAN servers (e.g. Google `generate_204`). This ensures accurate reachability detection on private LAN development setups and offline intranet deployments.
  - **Adaptive Heartbeat Polling**: Probes `/health` every 15s while online, and every 5s while offline for rapid backend recovery detection. Probes immediately when the app returns to the foreground via `AppState`.
  - **Fail-Fast Trigger (`reportNetworkFailure()`)**: Invoked by `apiClient` and `mediaService` whenever a request encounters a network error (status 0 or 408 timeout), immediately dropping state to offline and starting rapid 5s recovery polling.
- **Dual Direct-or-Queue Path & Multi-User Partitioning**:
  - When device is online: Operations attempt direct upload with short timeouts. If successful, local records are marked `synced = 1`. If upload times out or fails, mutations automatically enqueue to `sync_queue` tagged with `user_id`.
  - When device is offline: Operations instantly persist to local SQLite and enqueue to `sync_queue` tagged with `user_id` in single-digit milliseconds without triggering network timeouts.
  - **Multi-User Data Isolation on Shared Cabin Devices**: Every mutation in `sync_queue` records `user_id`. When User A logs out and User B logs in on the same roving device, sync runs strictly scoped to User B's pending mutations under User B's Bearer token. User A's items remain untouched in SQLite, preventing 403 Forbidden errors or data cross-contamination.
- **Auth-Gated Sync Coordinator (`syncScheduler.ts`)**:
  - Strictly requires an active authenticated session (`authService.getSession()`). Unauthenticated boots or logged-out states halt sync cycles completely, producing zero network calls and zero 401 Unauthorized errors.
  - On login, `syncScheduler.setActiveUser(userId)` hydrates active user context, scopes pending item counts, and triggers an immediate sync if online. On logout, active context clears and sync halts.
  - **Reactive UI Badge Updates**: Components subscribe to `syncScheduler.subscribe` to receive real-time updates for `isOnline`, `isSyncing`, and `pendingCount`. When an automatic background sync succeeds, the badge reactively drops to 0 and clears from view.
- **Cache-First Media Architecture (`mediaService.ts`)**:
  - Images are compressed and stored in persistent offline storage (`offline_media/`) first.
  - When offline, form submissions (fuel receipts, apprehension citations, incident photos) completely bypass remote uploads, queueing with the local cached `file://` URI in < 50ms.
  - When online, `mediaService.uploadMedia` races `FileSystem.uploadAsync` against a 6-second timeout to prevent 60-second native socket hangs.
- **Tri-Trigger Coordinator (`syncScheduler.ts`)**:
  1. Network connectivity restored (offline -> online transition automatically detected by 5s probe).
  2. 30-second heartbeat interval while online (authenticated only).
  3. Immediate sales trigger / Manual user trigger (`syncNow()`).
  - **Guarded Manual Syncing**: `syncNow()` verifies backend reachability and blocks execution when offline (`offline: true`). Screen UI validates `SyncResult` counts (`synced`, `failed`) to prevent false-positive success notifications.
- **Sync Worker (`syncWorker.ts`)**:
  - **In-Flight Mutex & SQLite Concurrency Locking**: Guarded by an in-memory lock (`isSyncing`) and an immediate SQLite status transition (`status = 'PROCESSING'`) on all picked queue rows. Tri-trigger invocations (network recovery, 30s heartbeat, manual "Sync Now") never fire duplicate network requests for identical queue rows.
  - Operational mutations (`CLOCK_IN`, `CLOCK_OUT`, `LOG_FUEL`, `REPORT_APPREHENSION`, `REPORT_ISSUE`, `EMERGENCY_SOS`) replay directly to their designated REST endpoints (`item.endpoint`) scoped to the active user's `user_id`.
  - Automatically checks for offline cached file URIs (`file:///`) in operational payloads, uploads the image to `/api/media/upload`, updates the payload with the storage key and remote URL, and marks the corresponding local SQLite row (`local_fuel_logs`, `local_apprehensions`, `local_incidents`, `local_driver_shift`) as `synced = 1`. If media upload fails, the mutation is kept queued for the next cycle without sending invalid local URIs to the endpoint.
  - **Itemized Partial-Success Batch Ingestion & Customer Pre-Ingestion (`POST /api/sales/sync-batch`)**:
    - Gathers pending sales orders alongside offline-created customers (`is_locally_created = 1`) to satisfy foreign key relational integrity before orders are committed.
    - Handles backend itemized responses (`success`, `partial_success`, `fail`).
    - Successfully ingested entities (`syncedTransactionIds`, `syncedCustomerIds`, including idempotently acknowledged ignored duplicates) are marked `SYNCED` in `sync_queue`, `local_sales_orders`, and `local_customers`.
    - Unrecoverable failed transactions (`INVALID_TRANSACTION_HEADER`, `INVALID_CUSTOMER_ID`, `INVALID_ITEM_PAYLOAD`, `INVALID_INVOICE_PAYLOAD`, `CANISTER_LEDGER_ERROR`, `DUPLICATE_ORDER_CONFLICT`) are quarantined (`status = 'QUARANTINED'`), recording `error_code` and `error_message`. Quarantined items are strictly excluded from subsequent automatic sweeps, permanently eliminating Head-of-Line blocking.
    - Transient database errors (`DB_CONSTRAINT_ERROR`) increment `retry_count` up to 3 before transitioning to quarantine.
- **Session & Invalidation Invariants (`sessionStore.ts`, `apiClient.ts`, `authService.ts`, `App.js`)**:
  - **Acyclic Session Architecture**: Token and persistent session storage are decoupled into `sessionStore.ts` (Level 0, zero internal dependencies). Low-level `apiClient.ts` reads the active Bearer token and triggers 401 revocation via `sessionStore`, while high-level `authService.ts` coordinates authentication workflows with `authApi.ts` and delegates storage to `sessionStore`. This strictly eliminates Metro require cycles (`sessionStore` <- `client` <- `authApi` <- `authService`).
  - `apiClient` preserves authenticated sessions on `403 Forbidden` (permission denied on specific resources). Sessions are only cleared on genuine `401 Unauthorized` responses where an active token was provided, passing reason `'revoked'`.
  - **Reactive Session Subscription (`authService.ts`)**: `authService.subscribe((session, reason) => void)` emits session state changes across the application. When backend revokes a session (401), `authService.clearSession('revoked')` debounces concurrent requests with a 3-second guard to prevent alert spamming and broadcasts to subscribers.
  - **Auto-Logout & UI Synchronization (`App.js`)**: `App.js` listens to `authService.subscribe`, immediately clearing active `user`, resetting `currentTab`, halting `syncScheduler`, and displaying a clean `Alert.alert('Session Expired', ...)` prompt.
  - **Boot-Time Auto-Login Validation (`authApi.validateSession()`)**: During `initApp()`, cached credentials are validated against `GET /api/users/me` with a fast 2.5-second timeout.
    - If valid (200 OK): auto-login proceeds.
    - If revoked (401): session is purged, auto-login halts, and the user remains on `LoginScreen` with the session expired prompt.
    - If offline / timeout (408 or 0): user is allowed to proceed offline with cached session, upholding the critical offline-first DSD operational requirement.
  - Timeout defaults to 6s with clean `408 Timeout/Offline` classification and automated failover notification to `networkSentinel`.
  - **Universal First-Login Password Change Flow (`ChangePasswordScreen.js`, `authApi.ts`, `authService.ts`, `App.js`)**:
    - **Role-Agnostic Interception Invariant**: When an admin creates an account or resets credentials, the user is issued a temporary password with `mustChangePassword: true`. In `App.js`, this flag intercepts the screen lifecycle at the root level before any role evaluation (`isDriver`) or screen dispatch (`renderActiveScreen()`). Neither Drivers nor Sales Agents can view dashboards, hydrations, or tabs until the password is changed.
    - **Sync Suppression Invariant**: Background operational sync (`syncScheduler.setActiveUser`) is withheld while `mustChangePassword === true`, preventing backend `403 MUST_CHANGE_PASSWORD` errors.
    - **Session Revocation & Clean Re-login**: The user provides a new password (min. 8 characters with confirmation match), which is dispatched to `POST /api/users/change-password`. On backend success (where `must_change_password` is updated to `false` and all active sessions are revoked), the app displays a success prompt, clears local SecureStore sessions (`authService.clearSession('logout')`), and routes the operator back to `LoginScreen` to sign in cleanly with their newly established credentials.
- **Dynamic Truck & Driver Context Hydration (`driverService.ts`)**:
  - Resolves active trip assignments via `GET /api/trips/active-assignment` and vehicle telemetry via `GET /api/fleet/my-vehicle`, caching to `local_active_trip` and `local_vehicle_telemetry`.
  - **Authoritative Trip Synchronization & Constraint Integrity**: When a driver or salesperson has no assigned active trip, backend returns `{ data: { trip: null } }`. When online, `driverService.getDashboardContext` authoritatively synchronizes this state and clears stale `local_active_trip` rows, preventing ghost trips and relational foreign key errors. If a cached trip belongs to a different driver, it is purged. When active trips exist, robust multi-layer property fallbacks (`tripNumber ?? trip_number ?? TRIP-<id>`) guarantee constraint compliance.
  - **Duty Attendance UUID Invariants & Atomic Shift Closure (`driverRepository.ts`, `driverService.ts`)**:
    - Frontend shift records generate valid UUIDs (`Crypto.randomUUID()`). `driverApi.clockOut` and `syncWorker` validate `attendanceId` against UUID regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), omitting the field if non-UUID to allow backend PostgreSQL to resolve active duty cycles cleanly via `userId` without UUID syntax errors.
    - **Atomic Multi-Row Shift Closure (`closeAllDriverShifts`)**: Whenever a driver clocks out (direct HTTP, WebSocket `ATTENDANCE_DUTY_UPDATED`, or sync worker replay), all records in `local_driver_shift` matching `driver_id` where `status = 'ON_DUTY' OR clock_out_time IS NULL` are atomically updated to `status = 'OFF_DUTY'`, eliminating orphaned rows and query priority bugs.
    - **Self-Healing Reconciliation**: On app hydration (`getDashboardContext`), if backend reports no active duty cycle (`remoteShift === null` or `OFF_DUTY`) and no offline `CLOCK_IN` is pending in `sync_queue`, client automatically invokes `closeAllDriverShifts(userId)` and purges stale attendance queue items, freeing drivers from stuck loops.
    - **In-Place ID Replacement (`replaceShiftId`)**: Server-assigned shift IDs replace temporary client UUIDs in-place without duplicating records.
  - **Cabin Duty Action Pending Feedback**: Start Shift and End Shift actions in `DriverDashboardScreen.jsx` are guarded by `isDutyActionPending`, displaying loading indicators and disabling buttons to prevent double submissions and UI freezes during network latency.
  - Zero hardcoded vehicle/user UUIDs in business services; dynamic fallback based on loaded trip and cache.
  - **Zero Mock Policy**: 100% of mock fixtures, dummy generators, and mock flags (`USE_MOCK`, `EXPO_PUBLIC_USE_MOCK`) are purged. All operations strictly source from live local SQLite or backend endpoints.
- **Frontline Real-Time WebSocket Engine (`src/realtime/`)**:
  - **Socket.IO v4.8.x Architecture (`socketClient.ts`)**:
    - Connects to backend Socket.IO server via `['polling', 'websocket']` transports with session Bearer token in handshake `auth`, `Authorization` header, and fallback whitelisted origin on native platforms to ensure seamless connectivity across development tunnels (`npx expo start --tunnel`), firewalls, and production deployments.
    - Reactive lifecycle bound to `authService.subscribe` (connects on login, disconnects on logout) and `networkSentinel` (disconnects when entering cellular dead zones, reconnects on `networkSentinel.onOnlineTransition()`).
    - Standardized application envelope `{ event, data, meta }` with safe parsing.
    - Central listener for `AUTH_SESSION_REVOKED`: immediately terminates socket connection, invokes `authService.clearSession('revoked')`, and routes back to login.
  - **Frontline Driver Event Dispatcher (`driverRealtimeManager.ts`)**:
    - **Live Trip Lifecycle**: Handles `TRIP_DISPATCHED`, `TRIP_LOAD_RECORDED`, `TRIP_COMPLETED`, `TRIP_CANCELLED`, and `TRIP_RECONCILED`. Automatically hydrates `local_active_trip` in SQLite and reactively updates `DriverDashboardScreen` from idle standby to active trip delivery.
    - **Fleet Readiness & Grounding**: Handles `FLEET_VEHICLE_GROUNDED` and `FLEET_VEHICLE_RELEASED`, updating `local_vehicle_telemetry.status` in SQLite. Reactively renders or dismisses the prominent red `VEHICLE GROUNDED` exception banner in `DriverMaintenanceScreen` without pull-to-refresh.
    - **Emergency SOS Supervisor Triage**: Handles `EMERGENCY_ALERT_STATUS_UPDATED`, immediately notifying frontline drivers via alerts/prompts when supervisors acknowledge or resolve their emergency alerts.
    - **Additive Write Independence**: Sockets are strictly additive observers. All field mutations (orders, SOS alerts, shifts) persist atomically to local SQLite and `sync_queue` regardless of socket connection state.
- **Sales Person Dashboard Context & Invariants (`salesService.ts`, `DashboardScreen.js`)**:
  - **Authoritative Sales User Trip Binding & Auto-Purging (`salesService.resolveActiveTripForUser`)**:
    - Validates trip details from backend (`GET /api/trips/active-assignment` when online) or SQLite cache (`local_active_trip` when offline).
    - **Strict User Binding Invariant**: Verifies that the authenticated sales person is strictly bound to the trip (`trip.sales_user_id === userId`) and status is active (`status === 'IN_PROGRESS'`).
    - **Multi-User Isolation on Shared Devices**: If a cached or returned trip belongs to another sales person or driver, or if the user has no active trip assigned, `local_active_trip` and `local_vehicle_inventory` are automatically purged immediately, returning `null`. Newly created sales persons or unassigned operators never inherit another operator's inventory or shift metrics.
    - If bound, saves to SQLite and authoritatively ingests stock manifest via `inventoryRepository.syncTripInventory(tripId, stockItems)`.
  - **Trip-Scoped Transactions & Shift Metrics (`salesRepository.ts`, `salesService.ts`)**:
    - Shift gross sales counters (`salesRepository.getTotalSalesAmount(tripId)`) and recent transactions (`salesRepository.getRecentOrders(5, tripId)`) are strictly scoped to the active `trip_id`.
    - When no active trip is bound, total sales is strictly `â‚± 0.00`, recent transactions is empty (`[]`), and vehicle inventory on board is empty (`[]`).
  - **Active Trip Requirement for Field Sales**:
    - Sales agents cannot initiate, browse catalog, or record orders without an active delivery trip.
    - `salesService.processSale` and `salesService.createOrder` throw an explicit error if `!activeTrip || activeTrip.status !== 'IN_PROGRESS'`.
    - `salesService.getProductCatalog` returns an empty array (`[]`) without an active trip manifest.
    - UI triggers ("New Order" on `DashboardScreen.js` and "ADD ORDER" on `CustomerDetailsScreen.js`) are disabled and visually indicated as inactive when no trip is active.
  - **Offline Sales Preservation**: During sync, `syncTripInventory` queries `local_sales_items` for the active `trip_id`, ensuring in-flight offline sales made in the field correctly deduct from loaded inventory: `quantity_remaining = max(0, quantity_loaded - quantity_sold)`.
  - **Real-time reactivity**: `DashboardScreen.js` subscribes to `driverRealtimeManager` on mount, immediately reloading when `TRIP_DISPATCHED`, `TRIP_LOAD_RECORDED`, or `VEHICLE_STOCK_UPDATED` events fire without requiring a manual pull-to-refresh.
  - **Vehicle Fleet Terminology Standardization**: User-facing references across the application use "Vehicle" instead of "Truck" (e.g., "Vehicle Inventory on Board", "Vehicle Plate & Model") to accurately reflect MadayawGas's diverse fleet.
  - **Reactive Badge & Connectivity**: Subscribes to `syncScheduler` to reflect live online/offline state and pending queue mutation counts.
- **Customer Catalog & Zone Filter Controls (`CustomerScreen.js`, `customerRepository.ts`, `zoneRepository.ts`, `salesService.ts`)**:
  - **All Zones by Default**: The catalog displays all zones by default (`selectedZoneFilter = 'ALL'`) rather than auto-locking to the active delivery route.
  - **Human-Readable Zone Name Resolution**: Zone filter chips display actual human-readable zone names (e.g. `All Zones`, `Route: Toril District`, `Bankerohan Hub`, `Buhangin Corridor`, `Matina Crossing`, `Panacan Industrial`) by joining with `local_service_zones` and querying `zoneRepository`. Raw UUIDs are completely eliminated.
  - **Zone Filter Chips & Sort Controls**: Provides an intuitive horizontal filter bar with clickable chips alongside dynamic sorting options (`A-Z`, `Z-A`, `RECENT`).
  - **Contextual Empty-State Reset**: If a selected zone filter returns zero matching customers, an explanatory empty-state prompt appears detailing the active filter with an immediate one-tap reset button ("View Customers in All Zones").
  - **Interactive Multi-Field Search**: Supports live search across customer name, business name, contact person, phone number, and delivery address.
- **Customer Details & Dynamic Canister Receivables (`CustomerDetailsScreen.js`, `customerApi.ts`)**:
  - Instant local rendering from SQLite (`local_customers`) for sub-millisecond navigation.
  - When online, asynchronously enriches profile with dynamic canister receivables breakdown by product SKU via `GET /api/sales/customers/:id`.
  - Displays customer segment badges (`RETAIL`, `COMMERCIAL`, `WHOLESALE`, `HOUSEHOLD`), contact persons, primary & alternate phone numbers, delivery addresses, and pending sync indicators.
  - **Customer Profile Editing**: Header includes an "Edit" button routing to `AddCustomerScreen` in edit mode (`initialCustomer`). Sales users can update customer details (name, contact person, numbers, address, TIN, customer type) via `PATCH /api/sales/customers/:id` or local offline SQLite updates. In accordance with backend RBAC, customer deletion is strictly disallowed and excluded from the UI.
- **Offline-First Customer Registration & Interactive Zone Picker (`AddCustomerScreen.js`, `salesService.ts`, `zoneRepository.ts`)**:
  - **Delivery Zone Selection**: Interactive zone picker card with a modal selector allowing sales agents to select or change the delivery zone for new or edited customers, defaulting to the current delivery route zone.
  - Complete backend contract coverage: `contactPerson`, `businessName`, `customerType`, `contactNumber`, `alternateContactNumber`, `deliveryAddress`, `tin`, and route `zoneId`.
  - Phone numbers standardized to canonical E.164 (`+639XXXXXXXXX`), with automatic 10-digit extraction when pre-populating existing phone numbers.
  - Dual direct-or-queue pattern: attempts direct API calls (`POST /api/sales/customers` or `PATCH /api/sales/customers/:id`) when online; persists locally with `is_locally_created = 1` and client UUID when offline or on network failure, allowing immediate in-field operations and subsequent batch synchronization via `/api/sales/sync-batch`.
- **Unified Sales Workflow & Navigation Consolidation (`SalesScreen.js`, `BottomNav.js`, `ReceiptScreen.js`)**:
  - **3-Tab Navigation Architecture**: The Sales Agent role uses a clean 3-tab layout (**Home**, **Sales** with cart icon, and **Profile**), eliminating the redundant dummy `OrderScreen.js` and mirroring the Driver role's 3-tab layout.
  - **Customer Card Name & Identity Resolution (`CustomerCard.js`, `SalesScreen.js`)**:
    - `CustomerCard` reliably resolves customer identity through prioritized fallbacks (`customer?.business_name || customer?.name || customer?.store_name || name`), contact info (`contact_person` with contact number), customer type badges, and local creation offline indicator icons (`is_locally_created`), ensuring customer names are never blank in the directory.
    - **Avatar Asset Architecture**: Employs lightweight static image assets (`assets/images/placeholder.png`) rather than complex SVGs with embedded base64 filters or patterns, preventing native layout clipping blowouts and blank white box rendering.
  - **Floating Action Button & BottomNav Stacking Invariant (`SalesScreen.js`, `BottomNav.js`)**:
    - The floating Add Customer button in `SalesScreen` is positioned at `bottom-40` with `z-30` and `elevation: 6`, maintaining a clean 16px vertical clearance above the persistent floating `BottomNav` pill (`bottom-20 z-20`) to prevent visual or interactive overlap.
    - Customer catalog `FlatList` specifies `contentContainerStyle={{ paddingBottom: 170 }}` alongside parent `pb-0`, ensuring the terminal item can scroll completely above both `BottomNav` and the Add Customer FAB without occlusion.
  - **End-to-End Field Sales Pipeline**: Catalog & Zone Search -> Customer Details -> Product Selection (`NewOrderScreen.js`) -> Line Item Quantities & Summary Drawer (`ConfirmOrderScreen.js`, `OrderSummaryDrawer.js`) -> Atomic Local Persistence -> Dedicated Full-Screen Receipt (`ReceiptScreen.js`).
  - **Seamless Product Addition & Quantity Preservation Across Screens (`ConfirmOrderScreen.js`, `NewOrderScreen.js`, `SalesScreen.js`)**:
    - **In-Screen Quick Add**: For the 3 canonical SKUs (170g Butane Canister, 11kg LPG Cylinder, 50kg LPG Cylinder), `ConfirmOrderScreen` provides an inline "Add More Products" section displaying unselected catalog items with single-tap `[+ Add]` buttons that immediately append products to the active order without leaving the confirmation screen.
    - **Quantity & Selection Preservation**: Returning to `NewOrderScreen` via "+ Browse Catalog" or back navigation maintains all pre-selected products (`initialSelectedProductIds`) and preserves previously entered custom quantities without data loss. Newly added products default to 1 unit.
  - **Cash & GCash Payment Settlement**:
    - **Cash**: Direct confirmation via "CONFIRM CASH PAYMENT", recorded as `payment_method = 'CASH'`. Guarded by in-flight submission lock to prevent duplicate orders.
    - **Mandatory GCash Payment Evidence**: Capturing or selecting a photo of the customer's payment receipt via `mediaService.capturePhoto()` or `mediaService.pickFromGallery()` is strictly mandatory. Confirmation is blocked and disabled until an image is provided. Manual GCash reference text inputs are eliminated.
    - **Cache-First Offline Media**: GCash receipts are compressed and cached in `${FileSystem.documentDirectory}offline_media/`. The local file URI is stored in `local_sales_orders.payment_reference`.
  - **Media & Transaction Synchronization Invariant (`syncWorker.ts`)**:
    - When online, `salesService.processSale` attempts eager upload to `POST /api/media/upload` (domain: `'sales/payments'`) and attaches `paymentProofKey`.
    - In background sync sweeps (`POST /api/sales/sync-batch`), `syncWorker` validates that every GCash transaction possesses a valid `paymentProofKey`. If offline or missing, `syncWorker` uploads the cached local image first. If media upload fails, the transaction is deferred to the next cycle and **never sent without its payment proof key**.
  - **Dedicated Full-Screen Receipt (`ReceiptScreen.js`)**:
    - Replaces generic alert dialogs with a full-screen official slip for Madayaw Gas Petroleum and Gas Corporation.
    - Renders itemized product rows with unit prices and line subtotals, grand total, document control number (`INV-...` or `CD-...`), transaction reference (`TX-...`), customer details, and dynamic sync badge (`SYNCED` vs `RECORDED (OFFLINE / PENDING SYNC)`).
    - For GCash transactions, displays payment proof thumbnail with a tap-to-inspect full-screen modal viewer.
    - Includes one-tap "Done / Back to Sales" navigation reset and native text receipt sharing (`Share.share`).
- **Manual Pull-to-Refresh Fallback**:
  - `RefreshControl` is implemented on operational screens (`DriverDashboardScreen.jsx`, `DriverMaintenanceScreen.jsx`, `SalesScreen.js`, `DashboardScreen.js`) to allow field operators to manually refetch authoritative state and trigger sync upload if real-time sockets or network connectivity experienced temporary latency. Profile screens are intentionally excluded.
- **Hierarchical Android System Back Button Navigation Architecture (`src/hooks/useBackHandler.ts`, `App.js`, `SalesScreen.js`, `ConfirmOrderScreen.js`, `OrderSummaryDrawer.js`, `AddCustomerScreen.js`, `ChangePasswordScreen.js`)**:
  - **Custom Architecture Adaptation**: Because the app uses a custom React state-based navigation architecture rather than third-party navigators (React Navigation / Expo Router), hardware back button presses on Android are coordinated hierarchically through a custom `useBackHandler` hook preserving React Native's LIFO event stack.
  - **Root Double-Tap Exit Debounce (`App.js`)**: When an authenticated user is on the main `dashboard` tab and presses the Android hardware Back button, an Android toast (`"Press back again to exit"`) is displayed. Pressing Back again within 2,000ms exits the application (`BackHandler.exitApp()`) cleanly. Single back presses never terminate the session, trigger logouts, or abandon active shift telemetry.
  - **Tab History Stack Navigation (`App.js`)**: Secondary tab navigation (`sales`, `customer`, `profile`, `maintenance`) records a visited tab stack (`tabHistory`). Pressing Back on any secondary tab pops backwards through visited tabs until reaching the default `dashboard` tab, where exit debouncing activates. Explicitly tapping `dashboard` clears the tab history.
  - **Workflow Sub-Screen Reversals (`SalesScreen.js`, `ConfirmOrderScreen.js`)**: Pressing Back inside field sales reverses the active workflow: `receipt` returns to customer `list` (clearing completed order context), `confirm` returns to `new_order` (preserving selected products and custom line item quantities), `new_order` returns to `details`, `edit` returns to `details`, and `details` returns to `list`. When at `list`, if a `searchQuery` is active, Back clears the search; if empty, it propagates to `App.js` to pop the tab.
  - **Leaf Drawer & Modal Dismissal (`OrderSummaryDrawer.js`, `<Modal onRequestClose>`)**: When the PanResponder-based `OrderSummaryDrawer` is expanded, Back collapses it to peek (`PEEK_OFFSET`) without exiting the screen. Native `<Modal>` dialogs across both driver operations and sales implement `onRequestClose` to dismiss cleanly on hardware Back press.
  - **Unsaved Form Protection (`AddCustomerScreen.js`)**: Dirty state tracking checks for unsaved form input in both new registration and edit modes. Back presses (hardware button or header chevron) trigger an alert confirmation dialog (`"Discard Changes?"`) before navigation occurs, protecting frontline operators from accidental data loss.
  - **Mandatory Password Reset Guard (`ChangePasswordScreen.js`)**: Intercepts Back presses to show an explicit confirmation prompt (`"Log Out?"`), preventing operators from getting stuck or bypassing the mandatory password change.

---

## Configuration & Live Environment (`.env` / `src/config/`)

- Environment variables are statically inlined via `process.env.EXPO_PUBLIC_*` in `src/config/env.ts`.
- **EAS Build Cloud Environment Configuration (`eas.json`)**:
  - Remote cloud builds (`preview` APK and `production` AAB) execute in isolated containers where local `.env` is omitted by `.gitignore`.
  - Build profiles in `eas.json` define the authoritative build-time `env` block (`EXPO_PUBLIC_API_URL: https://madayawgas-api.onrender.com/api`, `EXPO_PUBLIC_API_TIMEOUT_MS`, `EXPO_PUBLIC_SYNC_INTERVAL_MS`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_DEFAULT_ZONE_ID`).
  - `src/config/env.ts` enforces a safe remote fallback to `https://madayawgas-api.onrender.com/api` instead of `localhost:5000`, preventing physical device `ConnectException` loopback failures if env variables are omitted.
- **Zero Mock Data Policy**: 100% of legacy mock files (`mockApi.js`, `mockCustomerApi.js`, `mockOrderApi.js`, `mockProductApi.js`) have been permanently deleted. All authentication, customer catalog, order creation, and inventory operations strictly source from authoritative live endpoints or local SQLite tables.
- **Default Authentication Credentials**:
  - `sales_user` / `SalesPass123!` (Canonical backend sales agent)
  - `sperson` / `salesperson123` (Legacy test account)
  - `driver_user` / `DriverPass123!` (Canonical frontline driver assigned to `ABC-1001`)
- Handled directly in `src/services/authService.ts` (`authService.login`) connecting `LoginScreen.js` to `src/api/endpoints/authApi.ts`.
- **Remote Product Catalog Integration & Vehicle Manifest Filtering (`salesService.getProductCatalog`, `src/api/endpoints/productApi.ts`)**:
  - When online, queries `GET /api/inventory/products` under the sales agent's Bearer token (authorized via `['inventory.view', 'sales.view', 'sales.view_own', 'sales.create']`).
  - Safely maps remote product catalog items with canonical standard SKU pricing (`Butane Canister`: â‚±100, `11kg LPG Cylinder`: â‚±1,000, `50kg LPG Cylinder`: â‚±4,200) and net weights.
  - Strictly filters remote catalog items by matching against the loaded active trip vehicle inventory (`local_vehicle_inventory`). In-plant products not loaded onto the truck are completely excluded from the product catalog in both online and offline modes.
  - Transparently falls back to loaded vehicle inventory in local SQLite (`local_vehicle_inventory`) when offline or disconnected.

---

## Expo has changed â€” do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt â€” an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

---

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add â€” resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

---

## Navigation, Screens & Codebase Structure

- **Screen Organization (`src/screens/` and `src/features/`)**:
  - `auth/`: Pre-login screens (`LoginScreen.js`, `SplashScreen.js`).
  - `shared/`: Screens shared across roles (`ProfileScreen.js`).
  - `sales/`: Unified sales flow screens (`DashboardScreen.js`, `SalesScreen.js`, `CustomerScreen.js` [compat re-export], `CustomerDetailsScreen.js`, `AddCustomerScreen.js`, `NewOrderScreen.js`, `ConfirmOrderScreen.js`, `ReceiptScreen.js`). Redundant standalone `OrderScreen.js` is permanently removed.
  - `driver/`: Driver screens (`DriverDashboardScreen.jsx`, `DriverMaintenanceScreen.jsx`, `DriverProfileScreen.jsx`).
  - `features/`:
    - `dashboard/screens/DriverDashboardScreen.jsx`: Shift attendance, trip status, emergency SOS with 60s cooldown, cabin quick-actions.
    - `maintenance/screens/DriverMaintenanceScreen.jsx`: Telemetry, 5,000-km PM progress bar, grounding banner, service history, fuel refills.
    - `profile/screens/DriverProfileScreen.jsx`: Driver credentials, truck plate & model, logout.
    - `operations/components/`: Operational forms (`FuelEntryModal.jsx`, `ApprehensionModal.jsx`, `VehicleIssueModal.jsx`, `EmergencySosModal.jsx`).
- **Component Organization (`src/components/`)**:
  - `ui/`: Universal UI primitives (`FadeInView.js`, `InputField.js`, `PasswordField.js`, `PrimaryButton.js`, `ContactField.js`).
  - `navigation/`: Dynamic navigation components (`BottomNav.js`).
  - `sales/`: Sales domain widgets (`CustomerCard.js`, `OrderSummaryDrawer.js`, `ProductOrderCard.js`, `QuantityControl.js`).
  - `driver/`: Reserved directory for driver domain widgets.
- **App Entry (`App.js`)**:
  - Root coordinator managing top-level session, PaperProvider theming, and role-based screen routing (`isDriver` -> Driver Dashboard/Maintenance/Profile vs Sales Agent flow).


---

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) â€” no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

---

## Native Code & Build Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand â€” configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
