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
  - `local_active_trip`: Active shift metadata (`trip_id`, `vehicle_plate`, `driver_name`, `sales_user_id`, `zone_id`, `status`).
  - `local_vehicle_inventory`: Truck loaded stock counters (`quantity_loaded`, `quantity_sold`, `quantity_remaining`).
  - `local_customers`: Zone customer directory (`id`, `name`, `store_name`, `address`, `phone`, `current_debt`, `zone_id`).
  - `local_sales_orders`: In-field sales records (`id`, `order_number`, `customer_id`, `trip_id`, `total_amount`, `payment_method`, `empties_returned_count`).
  - `local_sales_items`: Line items for sales (`id`, `order_id`, `product_id`, `sku`, `quantity`, `unit_price`, `total_price`).
  - `local_canister_ledger`: Append-only tracking of cylinder swaps and loaned canisters.
  - `sync_queue`: Mutation queue for store-and-forward syncing (`id`, `endpoint`, `method`, `payload`, `status`, `retry_count`, `idempotency_key`).
  - `local_receipt_sequences`: Sequential counters for document numbers (`INV-...` for sales, `CD-...` for canister returns).

### Business Logic Invariants
- **Permissive Selling Policy**: If the sales agent sells more stock than local inventory records show as remaining on board, warn the user but **ALLOW** the sale to proceed. Cash flow in the field takes precedence; discrepancies reconcile at the evening plant dock.
- **Atomic Local Writes**: Every completed transaction decrements local vehicle inventory, updates canister debt math, logs order items, and inserts a pending mutation into `sync_queue` within a single SQLite transaction.
- **Append-Only Canister Debt Math**:
  ```
  quantity_loaned = max(0, quantity_sold - empties_returned)
  quantity_returned = max(0, empties_returned - quantity_sold)
  net_canister_debt = quantity_loaned - quantity_returned
  new_customer_debt = current_customer_debt + net_canister_debt
  ```

### Store-and-Forward Sync Engine (`src/sync/`)
- **Network Sentinel**: NetInfo listener monitoring online/offline transitions.
- **Tri-Trigger Coordinator (`syncScheduler.ts`)**:
  1. Network connectivity restored (offline -> online transition).
  2. 30-second heartbeat interval while online.
  3. Manual user trigger (`syncNow()`).
- **Sync Worker (`syncWorker.ts`)**: Batches pending mutations chronologically to `POST /api/sales/sync-batch` with exponential backoff on retryable network errors.

---

## Configuration & Mocking (`.env` / `src/config/`)

- Environment variables are statically inlined via `process.env.EXPO_PUBLIC_*` in `src/config/env.ts`.
- Config toggle: `EXPO_PUBLIC_USE_MOCK=true` runs entirely in local mock mode without requiring a live backend.
- **Default Authentication Credentials**:
  - `sales_user` / `SalesPass123!` (Canonical backend sales agent)
  - `sperson` / `salesperson123` (Legacy test account)
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

- **Screen Organization (`src/screens/`)**:
  - `auth/`: Pre-login screens (`LoginScreen.js`, `SplashScreen.js`).
  - `shared/`: Screens shared across roles (`ProfileScreen.js`).
  - `sales/`: Sales flow screens (`DashboardScreen.js`, `CustomerScreen.js`, `CustomerDetailsScreen.js`, `AddCustomerScreen.js`, `OrderScreen.js`, `NewOrderScreen.js`, `ConfirmOrderScreen.js`).
  - `driver/`: Reserved directory for driver role screens.
- **Component Organization (`src/components/`)**:
  - `ui/`: Universal UI primitives (`FadeInView.js`, `InputField.js`, `PasswordField.js`, `PrimaryButton.js`, `ContactField.js`).
  - `navigation/`: Dynamic navigation components (`BottomNav.js`).
  - `sales/`: Sales domain widgets (`CustomerCard.js`, `OrderSummaryDrawer.js`, `ProductOrderCard.js`, `QuantityControl.js`).
  - `driver/`: Reserved directory for driver domain widgets.
- **App Entry (`App.js`)**:
  - Root coordinator managing top-level session and tab state.

---

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

---

## Native Code & Build Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
