This is an Expo/React Native mobile application for MadayawGas Direct Store Delivery (DSD). Prioritize mobile-first patterns, performance, and cross-platform compatibility.

---

## 🚨 MANDATORY AGENT DIRECTIVES

1. **REFER TO THIS FILE FIRST**: Always review `AGENTS.md` before starting any coding, refactoring, or architectural task in this repository.
2. **MAINTAIN THIS FILE ON EVERY CHANGE**: Whenever you add, modify, or remove database tables, domain services, sync logic, environment variables, dependencies, or architectural patterns, you **MUST update `AGENTS.md`** before completing your task so it always reflects the live state of the codebase.
3. **PRESERVE EXISTING UI SCREENS**: DO NOT alter or modify `App.js` or files in `src/screens/` unless the user explicitly requests UI screen development or modifications. Keep the existing UI pristine while building or modifying the underlying services.
4. **NO TYPESCRIPT SYNTAX IN `.js` FILES**: Standard `.js` files are parsed with Babel's Flow/JS parser. Never introduce TypeScript annotations (e.g. `catch (e: any)` or type annotations) into `.js` files — use plain JavaScript.
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
  Delivery routes traverse rural areas with zero cellular reception for hours. The app must operate fully offline for an 8–10 hour shift without blocking sales, customer onboarding, canister swaps, or receipt generation.

---

## Offline-First Architecture & Local Stack

### Local SQLite Database (`madayawgas.db`)
- Created and accessed asynchronously via `expo-sqlite` with **WAL mode** and foreign keys enabled (`src/database/connection.ts`).
- **Core Schema Tables (`src/database/schema.ts`)**:
  - `local_active_trip`: Active shift metadata (`trip_id`, `trip_number`, `vehicle_plate`, `driver_name`, `sales_user_id`, `zone_id`, `status`, `dispatched_at`, `truck_id`, `truck_model`, `driver_id`, `sales_user_name`, `zone_name`).
  - `local_vehicle_inventory`: Truck loaded stock counters (`quantity_loaded`, `quantity_sold`, `quantity_remaining`).
  - `local_customers`: Zone customer directory (`id`, `name`, `store_name`, `address`, `phone`, `current_debt`, `zone_id`, `business_name`, `contact_person`, `contact_number`, `delivery_address`, `customer_type`, `canister_debt`, `is_locally_created`, `created_at`).
  - `local_sales_orders`: In-field sales records (`id`, `transaction_no`, `customer_id`, `customer_name`, `receipt_number`, `trip_id`, `total_amount`, `payment_method`, `payment_reference`, `transacted_at`, `synced_at`, `sync_status`).
  - `local_sales_items`: Line items for sales (`id`, `sales_order_id`, `product_id`, `product_name`, `quantity_sold`, `empties_returned`, `empties_defective`, `unit_price`, `subtotal`).
  - `local_canister_ledger`: Append-only tracking of cylinder swaps and loaned canisters.
  - `sync_queue`: Mutation queue for store-and-forward syncing (`id`, `endpoint`, `operation_type`, `payload`, `status`, `retry_count`, `last_error`, `created_at`).
  - `local_receipt_sequences`: Sequential counters for document numbers (`INV-...` for sales, `CD-...` for canister returns).
  - `local_driver_shift`: Active duty shift attendance (`id`, `driver_id`, `status`, `clock_in_time`, `clock_out_time`, `synced`).
  - `local_vehicle_telemetry`: Distance-based 5,000-km PM and odometer telemetry (`truck_id`, `plate_number`, `model`, `current_odometer`, `last_pm_odometer`, `status`, `last_serviced_at`).
  - `local_fuel_logs`: Fuel refills (`id`, `truck_id`, `driver_id`, `liters`, `total_cost`, `odometer`, `receipt_photo_uri`, `logged_at`, `synced`).
  - `local_apprehensions`: Roadside citations (`id`, `truck_id`, `driver_id`, `agency`, `citation_number`, `violation_notes`, `fine_amount`, `ticket_photo_uri`, `reported_at`, `synced`).
  - `local_incidents`: Breakdown/defect findings (`id`, `truck_id`, `driver_id`, `incident_type`, `description`, `severity`, `photo_uri`, `reported_at`, `synced`).
- **Database Reset & Re-initialization (`resetFullDatabase()`)**:
  - Disables foreign keys (`PRAGMA foreign_keys = OFF;`), drops all 13 local SQLite tables in reverse dependency order, re-enables foreign keys, and re-executes `SCHEMA_SQL` to return the client to a clean slate without foreign key constraint violations.
  - Exposed via Profile screens (`DriverProfileScreen.jsx` and `ProfileScreen.js`) with confirmation alert to allow developers and field operators to clear stuck sync queues or stale mock trips.

### Business Logic Invariants
- **Permissive Selling Policy**: If the sales agent sells more stock than local inventory records show as remaining on board, warn the user but **ALLOW** the sale to proceed. Cash flow in the field takes precedence; discrepancies reconcile at the evening plant dock.
- **Monotonic Odometer Integrity**: Client-side enforcement ensuring all new odometer readings must be greater than or equal to current registered odometer (`new_odometer >= current_odometer`).
- **Mandatory Citation Photo Proof**: Block submission of roadside apprehension reports until ticket photo proof is attached and validated.
- **Emergency SOS Direct Priority & Debounce**: High-affordance cabin SOS button with current GPS coordinates and an immediate 60-second cooldown timer. Life-critical SOS signals always attempt rapid direct HTTP dispatch (`/operations/alerts`) first, falling back to `sync_queue` only if offline.
- **Web-Aligned Media Compression & Caching**: 5 MB ceiling enforcement, max 1920px dimension scaling, progressive JPEG compression (0.82 -> 0.35), and persistent offline caching in `${FileSystem.documentDirectory}offline_media/`.
- **Atomic Local Writes & Transaction Safety**: Every completed transaction decrements local vehicle inventory, updates canister debt math, logs order items, and inserts a pending mutation into `sync_queue` within a single SQLite transaction using the explicit `txn` connection.
- **Append-Only Canister Debt Math**:
  ```
  quantity_loaned = max(0, quantity_sold - empties_returned)
  quantity_returned = max(0, empties_returned - quantity_sold)
  net_canister_debt = quantity_loaned - quantity_returned
  new_customer_debt = current_customer_debt + net_canister_debt
  ```

### Store-and-Forward Sync Engine (`src/sync/`)
- **Network Sentinel (`networkSentinel.ts`)**:
  - Probes `BACKEND_HEALTH_URL` (derived dynamically from `ENV.API_URL.replace(/\/api\/?$/, '') + '/health'`) rather than public third-party WAN servers (e.g. Google `generate_204`). This ensures accurate reachability detection on private LAN development setups and offline intranet deployments.
  - **Adaptive Heartbeat Polling**: Probes `/health` every 15s while online, and every 5s while offline for rapid backend recovery detection. Probes immediately when the app returns to the foreground via `AppState`.
  - **Fail-Fast Trigger (`reportNetworkFailure()`)**: Invoked by `apiClient` and `mediaService` whenever a request encounters a network error (status 0 or 408 timeout), immediately dropping state to offline and starting rapid 5s recovery polling.
- **Dual Direct-or-Queue Path**:
  - When device is online: Operations attempt direct upload with short timeouts. If successful, local records are marked `synced = 1`. If upload times out or fails, mutations automatically enqueue to `sync_queue` without halting the user.
  - When device is offline: Operations instantly persist to local SQLite and enqueue to `sync_queue` in single-digit milliseconds without triggering network timeouts.
- **Cache-First Media Architecture (`mediaService.ts`)**:
  - Images are compressed and stored in persistent offline storage (`offline_media/`) first.
  - When offline, form submissions (fuel receipts, apprehension citations, incident photos) completely bypass remote uploads, queueing with the local cached `file://` URI in < 50ms.
  - When online, `mediaService.uploadMedia` races `FileSystem.uploadAsync` against a 6-second timeout to prevent 60-second native socket hangs.
- **Tri-Trigger Coordinator (`syncScheduler.ts`)**:
  1. Network connectivity restored (offline -> online transition automatically detected by 5s probe).
  2. 30-second heartbeat interval while online.
  3. Immediate sales trigger / Manual user trigger (`syncNow()`).
  - **Guarded Manual Syncing**: `syncNow()` verifies backend reachability and blocks execution when offline (`offline: true`). Screen UI validates `SyncResult` counts (`synced`, `failed`) to prevent false-positive success notifications.
- **Sync Worker (`syncWorker.ts`)**:
  - Operational mutations (`CLOCK_IN`, `CLOCK_OUT`, `LOG_FUEL`, `REPORT_APPREHENSION`, `REPORT_ISSUE`, `EMERGENCY_SOS`) replay directly to their designated REST endpoints (`item.endpoint`) with individual error logging and retry incrementing.
  - Automatically checks for offline cached file URIs (`file:///`) in operational payloads, uploads the image to `/api/media/upload`, updates the payload with the storage key and remote URL, and marks the corresponding local SQLite row (`local_fuel_logs`, `local_apprehensions`, `local_incidents`, `local_driver_shift`) as `synced = 1`. If media upload fails, the mutation is kept queued for the next cycle without sending invalid local URIs to the endpoint.
  - Sales order mutations (`CREATE_ORDER`) batch chronologically to `POST /api/sales/sync-batch`, mapping backend `{ tripId, processedCount, transactionIds }`, updating `sync_queue` and setting `local_sales_orders.sync_status = 'SYNCED'`.
- **Session & Invalidation Invariants (`apiClient.ts`)**:
  - `apiClient` preserves authenticated sessions on `403 Forbidden` (permission denied on specific resources). Sessions are only cleared on genuine `401 Unauthorized` responses where an active token was provided.
  - Timeout defaults to 6s with clean `408 Timeout/Offline` classification and automated failover notification to `networkSentinel`.
- **Dynamic Truck & Driver Context Hydration (`driverService.ts`)**:
  - Resolves active trip assignments via `GET /api/trips/active-assignment` and vehicle telemetry via `GET /api/fleet/my-vehicle`, caching to `local_active_trip` and `local_vehicle_telemetry`.
  - Zero hardcoded vehicle/user UUIDs in business services; dynamic fallback based on loaded trip and cache.
  - Mock data strictly gated by `ENV.USE_MOCK`: zero mock leakage in live/production mode.


---

## Configuration & Mocking (`.env` / `src/config/`)

- Environment variables are statically inlined via `process.env.EXPO_PUBLIC_*` in `src/config/env.ts`.
- Config toggle: `EXPO_PUBLIC_USE_MOCK=true` runs entirely in local mock mode without requiring a live backend.
- **Default Authentication Credentials**:
  - `sales_user` / `SalesPass123!` (Canonical backend sales agent)
  - `sperson` / `salesperson123` (Legacy test account)
  - `driver_user` / `DriverPass123!` (Canonical frontline driver assigned to `ABC-1001`)
- Bridged in `src/services/mockApi.js` connecting `LoginScreen.js` to `src/api/endpoints/authApi.ts` and `src/services/authService.ts`.

---

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

---

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
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
  - `sales/`: Sales flow screens (`DashboardScreen.js`, `CustomerScreen.js`, `CustomerDetailsScreen.js`, `AddCustomerScreen.js`, `OrderScreen.js`, `NewOrderScreen.js`, `ConfirmOrderScreen.js`).
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

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

---

## Native Code & Build Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
