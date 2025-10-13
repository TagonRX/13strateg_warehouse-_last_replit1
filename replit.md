# Warehouse Management System

## Overview

This is a comprehensive warehouse management system designed for inventory tracking, barcode scanning, stock management, and worker analytics. The application provides role-based access control with separate interfaces for warehouse workers and administrators.

The system handles:
- Individual and bulk stock intake with barcode assignment
- Location-based picking and stock removal
- Daily picking list management with CSV upload and barcode scanning
- Real-time inventory tracking with progress monitoring
- Warehouse capacity monitoring with overload warnings
- Worker performance analytics
- Complete event audit logging

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 13, 2025
- **Warehouse Settings & Admin Configuration**: Complete admin interface for warehouse configuration
  - **Database Schema**: Added `warehouse_settings` and `active_locations` tables
    - `warehouse_settings`: Stores TSKU/MAXQ per location pattern (A1, B1, etc.)
    - `active_locations`: Persists admin-defined location list until deletion
  - **Admin Panels** (visible only to admins):
    - Location Management: Textarea for bulk location entry (space/comma/newline-separated)
    - TSKU/MAXQ Settings: Configure per-location-group thresholds with add/edit interface
  - **Authorization**:
    - GET /api/warehouse/settings: All authenticated users (for filters)
    - POST/DELETE endpoints: Admin-only
  - **Worker Access**: Workers can view and use TSKU/MAXQ filters without admin panels
  - **Vertical Column Layout**: Locations displayed in alphabetical letter columns (A, B, C)
  - **Smart Filters**: TSKU/MAXQ filters work with custom settings from database
  - **Color Indicators**: SKU count and quantity badges color-coded based on settings
  - **Limit Options**: 100/200/300 location display limit
- **Warehouse Loading Filter Redesign**: Complete overhaul of location filtering interface
  - **Old**: Checkbox-based letter filter (A, B, C) - was not working properly
  - **New**: Textarea input for flexible location filtering
  - Supports multiple input formats:
    - Space-separated: `A101 B101 C101`
    - Comma-separated: `A101, B101, C101`
    - Newline-separated (paste from Excel):
      ```
      A101
      B101
      C101
      ```
  - Case-insensitive (auto-converts to UPPERCASE)
  - Shows active filter count: "Фильтр активен: X локаций"
  - Empty filter shows all locations
  - Matches Excel-style workflow for easy data entry
- **Login Navigation Fix**: After successful login, app now navigates to dashboard (/) instead of staying on /login
  - Uses wouter's `setLocation("/")` in login mutation onSuccess
  - Prevents showing 404 page after authentication
- **Stock-Out Performance Optimization**: Changed default limit from loading all locations to 10
  - Significantly improves page load time for warehouses with many locations
  - Users can still increase limit (10/20/50/all) if needed
  - Default limit select shows "10" on page load
- **Warehouse Loading Pagination**: Added flexible pagination filter with default of 50 locations
  - Filter options: 10/20/30/50/All
  - Individual location display (no grouping) - each location shown separately
  - Responsive grid layout for location cards
  - Critical fix: Y1, Y10, Y101 now displayed as separate locations (removed range grouping)
- **Stock-In Location Field Enhancement**: Added editable location input field
  - Location field auto-fills from SKU value (SKU = Location by design)
  - Users can manually override location for 4-digit format (A101, B101, etc.)
  - Maintains SKU ≠ Location flexibility when needed
- **Flexible Item Entry**: Implemented optional productId and name fields
  - productId and name are now nullable in database schema
  - Stock-in form allows adding items with only SKU (productId and name optional)
  - Location auto-fills from SKU value (SKU = Location design)
  - Display shows "-" for null productId, "Без названия" for null name
- **Enhanced CSV Synchronization**: Flexible bulk upload with header-based parsing
  - Header-based column detection (supports English and Russian headers: sku/SKU, name/название, etc.)
  - SKU normalized to UPPERCASE in both form and CSV parsing for consistency
  - Two synchronization paths:
    1. **With productId**: Syncs by productId (primary key), validates SKU match, creates SKU error if mismatch
    2. **Without productId**: Syncs by SKU among items without productId, adds quantity and updates name/barcode
  - Design principle: Items with productId only sync with CSV rows containing productId; items without productId sync with CSV rows without productId
  - Prevents accidental merging of unrelated items while enabling flexible workflow (add SKU first, sync details later)
- **Null Value Handling**: Updated inventory table to properly filter and display nullable fields
  - Search/filter handles null productId and name gracefully
  - Table displays appropriate fallback values for null fields

### October 12, 2025
- **Inventory Pagination**: Added page limit filter (10/20/50/100/All) with default of 50 items
- **Event Logs Advanced Filters**: Implemented comprehensive filtering system
  - Search by SKU/ID/name (searches in action and details fields)
  - Filter by worker/user
  - Date range filter with timezone-safe SQL implementation
  - Page limits: 100/200/500/All (10000)
  - All filters properly combine using Drizzle's `and()` and `or()` operators
  - Fixed OR precedence issues and timezone handling in date filters
- **Worker Analytics**: Complete implementation of worker performance analytics
  - Period filters: day, week, month, all time
  - Action columns: Входы, Добавлено, Выдано, CSV загрузка, Листов создано, Собрано, Удалено локаций
  - Sortable columns with tri-state sorting (asc/desc/none)
  - Visual sort indicators (arrows)
  - Backend aggregates event logs by worker and action type
  - Fixed TanStack Query authentication by adding Bearer token to all requests
- **SKU Errors System**: Implemented correction workflow for SKU mismatches during bulk upload
  - Detects when productId exists but SKU differs during CSV upload
  - Creates skuError records instead of silent data corruption
  - Correction UI allows editing SKU and returning item to inventory
  - Updates existing inventory item (no duplicates): corrects SKU/location and adds quantity
  - Design: SKU = Location throughout system (both fields update together)
  - Admin-only access at /sku-errors route
- **Warehouse Loading Redesign**: Redesigned warehouse loading page with compact, filterable letter-based view
  - Letter filter with checkboxes - select which location letters to display
  - "Все"/"Сброс" buttons to select all or clear all filters
  - Horizontal scroll layout showing each letter in separate card
  - Range grouping within letters (A1 for A100-A199, A2 for A200-A299, etc.)
  - Non-standard locations grouped as "Прочее" (Others)
  - TSKU and MAXQ displayed and applied per letter card
  - Compact badge display for SKU count and quantity with color coding
  - More efficient use of screen space with smaller cards and typography

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript using Vite as the build tool

**UI Component Library**: Radix UI primitives with shadcn/ui components following the "New York" style variant

**Design System**: Carbon Design System-inspired approach for data-intensive warehouse operations
- IBM Plex Sans for primary typography
- IBM Plex Mono for product IDs, barcodes, and SKUs
- Color palette optimized for operational clarity with success/warning/error states
- Light and dark mode support via CSS variables

**State Management**: 
- TanStack Query (React Query) for server state management
- Local React state for UI interactions
- No global state management library (Redux/Zustand) used

**Routing**: Wouter for lightweight client-side routing

**Styling**: Tailwind CSS with custom design tokens defined in CSS variables

**Key UI Patterns**:
- Sidebar navigation with role-based menu items
- Responsive layout supporting mobile and desktop
- Card-based interface for operational tasks
- Real-time feedback with toast notifications
- Progress indicators for bulk operations

### Backend Architecture

**Runtime**: Node.js with Express.js server

**Language**: TypeScript with ES Modules

**API Design**: RESTful JSON API with endpoint prefix `/api`

**Authentication**:
- Session-based authentication using in-memory session storage
- BCrypt for password hashing (10 salt rounds)
- Bearer token authentication via Authorization header
- Role-based middleware (`requireAuth`, `requireAdmin`)

**Database ORM**: Drizzle ORM for type-safe database queries

**Key Architectural Decisions**:
- Monorepo structure with `client/`, `server/`, and `shared/` directories
- Shared TypeScript types between frontend and backend via `@shared` alias
- Type validation using Zod schemas (via drizzle-zod)
- Development server uses Vite middleware for HMR
- Production build creates static frontend assets and bundled Node.js server

**API Routes**:
- `/api/auth/*` - Authentication endpoints
- `/api/inventory` - Inventory CRUD operations
- `/api/inventory/bulk` - Bulk inventory import
- `/api/warehouse/loading` - Warehouse capacity analysis
- `/api/users` - User management (admin only)
- `/api/logs` - Event logging (admin only)
- `/api/sku-errors` - SKU error management (admin only)
- `/api/worker-analytics` - Worker performance analytics (admin only)
- `/api/picking-lists` - Picking list management

### Database Schema

**ORM**: Drizzle ORM with PostgreSQL dialect

**Tables**:

1. **users** - Worker and admin accounts
   - Fields: id (UUID), name, login (unique), password (hashed), role, createdAt
   - Roles: 'admin' or 'worker'

2. **inventory_items** - Product inventory tracking
   - Fields: id (UUID), productId, name, sku, location, quantity, barcode, status, createdBy, createdAt, updatedAt
   - Status values: 'IN_STOCK', 'PICKED'
   - SKU and location are typically the same value

3. **event_logs** - Audit trail of all warehouse operations
   - Fields: id (UUID), userId, action, details, createdAt
   - Actions: LOGIN, STOCK_IN, STOCK_OUT, CSV_UPLOAD, PICKING_LIST_CREATED, ITEM_PICKED, etc.

4. **worker_analytics** - Daily performance metrics
   - Fields: id (UUID), userId, date, itemsReceived, itemsPicked, csvErrors

5. **picking_lists** - Daily picking list management
   - Fields: id (UUID), name, userId, status (PENDING/IN_PROGRESS/COMPLETED), createdAt, completedAt
   - One list can have multiple picking tasks

6. **picking_tasks** - Individual pick items within a picking list
   - Fields: id (UUID), listId, sku, requiredQuantity, pickedQuantity, pickedItemIds (array), status (PENDING/COMPLETED), createdAt, completedAt
   - SKU-based picking (matches any item with same SKU)
   - Tracks which specific items were picked via pickedItemIds

7. **sku_errors** - SKU mismatch correction during bulk upload
   - Fields: id (UUID), productId, name, csvSku, existingSku, quantity, barcode, status (PENDING/RESOLVED), createdAt, resolvedAt
   - Created when bulk CSV upload finds matching productId but different SKU
   - Prevents silent data corruption during import
   - Admin can correct SKU and return item to inventory with proper reconciliation

**Key Design Decisions**:
- UUID primary keys using PostgreSQL's `gen_random_uuid()`
- Timestamps with automatic `defaultNow()` values
- Foreign key relationships to users table
- Product deduplication logic based on `productId` field
- Bulk operations support upsert patterns for inventory updates

### Build and Development

**Development**:
- `npm run dev` - Starts Express server with Vite middleware for HMR
- Hot module replacement for React components
- TypeScript type checking via `tsc --noEmit`

**Production**:
- `npm run build` - Creates optimized frontend bundle and server bundle
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server to `dist/index.js`
- `npm start` - Runs production server

**Database Operations**:
- `npm run db:push` - Push schema changes to database via Drizzle Kit
- Migration files stored in `./migrations`

## External Dependencies

### Database
- **Neon Serverless PostgreSQL** via `@neondatabase/serverless`
- Connection via `DATABASE_URL` environment variable
- WebSocket support for serverless environments

### UI Component Libraries
- **Radix UI** - Headless accessible component primitives (20+ components)
- **shadcn/ui** - Pre-styled Radix components following design system
- **Lucide React** - Icon library
- **cmdk** - Command palette component
- **vaul** - Drawer/modal component

### Form Handling
- **React Hook Form** - Form state management
- **@hookform/resolvers** - Form validation resolvers
- **Zod** - Schema validation

### Data Fetching
- **TanStack Query** - Server state management and caching

### Authentication
- **BCrypt** - Password hashing library

### Styling
- **Tailwind CSS** - Utility-first CSS framework
- **class-variance-authority** - Component variant utilities
- **tailwind-merge** - Tailwind class merging utility

### Session Management
- **connect-pg-simple** - PostgreSQL session store (dependency present but in-memory sessions currently used)

### Date Handling
- **date-fns** - Date utility library

### Build Tools
- **Vite** - Frontend build tool and dev server
- **esbuild** - Backend bundler
- **TypeScript** - Type system
- **Drizzle Kit** - Database migration tool

### Development Tools (Replit-specific)
- `@replit/vite-plugin-runtime-error-modal` - Error overlay
- `@replit/vite-plugin-cartographer` - Code mapping
- `@replit/vite-plugin-dev-banner` - Development banner