# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators, ensuring secure and tailored functionalities. The system's core capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, and warehouse capacity monitoring. It also provides daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
*   **Framework**: React 18 with TypeScript, using Vite for development.
*   **UI/UX**: Radix UI primitives and shadcn/ui components in a "New York" style, inspired by Carbon Design System for data-intensive operations. Features include IBM Plex Sans/Mono typography, a color palette optimized for operational clarity, and light/dark mode support.
*   **State Management**: TanStack Query for server state, local React state for UI.
*   **Routing**: Wouter for client-side routing.
*   **Styling**: Tailwind CSS with custom design tokens.
*   **Key UI Patterns**: Role-based sidebar navigation, responsive design, card-based interface, real-time toast notifications, progress indicators, resizable table columns with persistence, and a multi-select filter for warehouse locations.

### Backend Architecture
*   **Runtime**: Node.js with Express.js.
*   **Language**: TypeScript with ES Modules.
*   **API Design**: RESTful JSON API, prefixed with `/api`.
*   **Authentication**: Session-based authentication with BCrypt for password hashing (10 salt rounds), Bearer token support, and role-based middleware (`requireAuth`, `requireAdmin`).
*   **Database ORM**: Drizzle ORM for type-safe queries.
*   **Architectural Decisions**: Monorepo structure (`client/`, `server/`, `shared/`), shared TypeScript types, Zod for schema validation, Vite middleware for HMR in development, and esbuild for production bundling.
*   **Core API Routes**: Authentication, inventory management (CRUD, bulk import, file synchronization), warehouse capacity analysis, user management, event logging, SKU error management, worker analytics, and picking list management.
*   **Real-time Communication**: WebSocket server for device-to-device communication, supporting remote scanning and picking list synchronization across user devices.

### Database Schema
*   **ORM**: Drizzle ORM with PostgreSQL dialect.
*   **Tables**:
    *   `users`: Stores worker and admin accounts with role-based access.
    *   `inventory_items`: Tracks product inventory, including SKU, location, quantity, and status.
    *   `event_logs`: Comprehensive audit trail of all operations with enhanced product tracking. Stores `productId`, `itemName`, `sku`, `location` to enable complete product history tracking from first scan to picking and deletion. Supports search by any product field (ID, name, SKU, location). All STOCK_OUT and STOCK_IN events include complete product information for full traceability.
    *   `worker_analytics`: Stores daily worker performance metrics.
    *   `picking_lists`: Manages daily picking lists, supporting multiple tasks per list.
    *   `picking_tasks`: Individual pick items within a picking list, tracking required and picked quantities.
    *   `sku_errors`: Manages SKU mismatch corrections during bulk uploads to prevent data corruption.
*   **Design Decisions**: UUID primary keys, automatic timestamps, foreign key relationships, product deduplication by `productId`, and upsert patterns for bulk inventory updates.

### Recent Bug Fixes and Enhancements (October 2025)
*   **Pick Operation Cache Invalidation**: Fixed issue where inventory table didn't update after picking items. All stock-out mutations (pick, delete item, delete location, bulk delete) now invalidate both `/api/warehouse/loading` and `/api/inventory` query keys to ensure UI updates immediately after operations.
*   **Event Logging Product Tracking**: Enhanced event logs with complete product information (productId, itemName, sku, location) for all STOCK_OUT and STOCK_IN events, enabling full product movement history tracking.
*   **Pick Item Return Data**: Fixed pickItemByBarcode to return updated item quantity instead of original quantity, ensuring frontend receives correct data after pick operations.
*   **Warehouse Loading Per-Letter Limit**: Fixed limit filter in Warehouse Loading view to apply per letter when multiple letters or all letters are selected. Example: with limit 100 and letters A, B, C selected, shows 100 items from A + 100 from B + 100 from C (not 100 total). Single letter selection still applies limit to total as before.
*   **Stock-Out Item Expansion**: Changed Stock-Out view to expand items by quantity. If an item has quantity 19, it now shows 19 separate rows (each numbered #1-#19). Clicking a row auto-fills the barcode field. Added manual confirmation button and undo button. Instructions translated to Russian. Limit filter extended with 100 and 200 options.
*   **User Management Enhancements**: Added ability to edit user names via new PATCH `/api/users/:id/name` endpoint. Enhanced delete validation to prevent self-deletion and deletion of the last admin. All error messages in Russian for consistency.
*   **Warehouse Loading Filter Layout**: Redesigned filter layout to group filters on the left side with fixed widths instead of stretching across the full width. Filters now use flex layout with wrapping, ensuring compact presentation when "All letters" is selected.
*   **Warehouse Loading Filter Performance**: Optimized filter calculations by separating activeLocationsSet memoization, added NaN validation for numeric filters, and added "50" option to limit selector. Filters no longer hang when changing values.
*   **Warehouse Loading Empty Locations**: Modified warehouse loading view to show ALL active locations from location management, even if they are currently empty (showing 0 SKUs, 0 quantity). This ensures visibility of all configured locations regardless of current inventory status.
*   **Warehouse Loading Natural Sorting**: Implemented natural/numeric sorting for warehouse locations. Locations now sort logically: X1, X2...X10, X11...X100, X101...X199, X200+ (not alphabetically X1, X10, X100, X11, X2...). Sorting is first by letter prefix alphabetically, then by number numerically within same letter group.
*   **Warehouse Settings Extended**: Added warehouse settings for all letters A-Z (26 grouped settings). Each group includes X0 and contains 7 locations (e.g., "A0, A1, A2, A3, A4, A5, A6"). A-B use TSKU=4/MAXQ=10, C-Z use TSKU=3/MAXQ=7. X0 pattern applies to all locations with numbers < 100.
*   **Warehouse Loading Table Styling**: Improved table readability - increased gap between letter columns (gap-8), reduced spacing between location and TSKU (gap-1), optimized TSKU column width (w-5) for 2-digit numbers.
*   **Warehouse Settings Formatting**: All warehouse settings now use consistent formatting with spaces after commas (e.g., "E1, E2, E3, E4, E5, E6"). Settings table optimized with smaller text (text-sm), reduced padding (p-2), and tighter gaps (gap-2) to prevent horizontal stretching.
*   **Warehouse Settings Inline Editing**: Settings table now supports inline editing - clicking "Редактировать" opens input fields directly in the row with "Подтвердить" and "Отмена" buttons. Improved column spacing: wider gap between "Группа локаций" and "TSKU" (w-48, w-20), tighter gap between "TSKU" and "MAXQ" (w-16).
*   **Warehouse Loading Compact Layout**: All Card components (Filters, Settings, Location Management, Warehouse Loading table, Legend) now use w-fit to prevent full-width stretching and create a more compact interface.
*   **Inventory Barcode Scanning**: Added barcode scanning support in Inventory table editing. When editing an item, users can scan barcodes using USB scanner or mobile camera. Supports multiple barcodes per item with quantity tracking. BarcodeEditor component integrates html5-qrcode for camera scanning and provides real-time barcode management with quantity validation.
*   **Inventory Edit Buttons Fix**: Fixed missing edit/delete buttons for items inside expandable location groups. All items now show action buttons regardless of being in a collapsed or expanded group.
*   **Remote Barcode Scanning Enhancement**: Extended WebSocket server to support quantity (qty) parameter in remote_scan messages. BarcodeEditor now receives and processes barcodes with quantities sent from mobile devices.
*   **Mobile Remote Scanner Interface**: Added RemoteBarcodeScanner component accessible from Inventory page on mobile/tablet devices. Allows scanning barcodes with camera, setting quantity (default 1), and sending to desktop for editing. Connected via WebSocket for real-time transmission.
*   **Picking Task Item Names**: Added `itemName` field to picking_tasks table. When creating picking lists, item names are automatically extracted from inventory by SKU. Picking interface now displays item names instead of SKU codes for better worker experience.
*   **Inventory Location Fix**: Fixed location mismatch where SKU-based location extraction (Warehouse Loading) didn't match database location field (Inventory). Corrected A99R item location from A998 to A99 to ensure consistency across views.
*   **Inventory Group Dropdown Alignment**: Fixed dropdown menu alignment issue where action buttons (edit/delete) in expanded location groups with multiple SKUs appeared slightly shifted down. Added consistent flex wrapper to chevron icon to match button container structure.
*   **Inventory Expanded Items Visual Clarity**: When a location group is expanded, nested items no longer display location in the location column. This creates a visual hierarchy making it clear that expanded rows are sub-items (SKUs) within that location, not separate location entries.
*   **Enhanced Picking List CSV Format**: Updated picking list CSV/Excel format to support 3 columns: SKU, название товара (опционально), количество. Parser now auto-merges duplicate SKUs by summing quantities. If item name not provided in file, system automatically looks up name from inventory. Tasks with names from inventory are highlighted with blue background for visual distinction. Display shows: SKU (монокод), название, количество собрано/требуется.
*   **URL-based CSV Import with Auto-Detection**: Added comprehensive CSV import from URL functionality with automatic field detection and persistent mapping. Features include: (1) SSRF security hardening with DNS resolution, private IP blocking (IPv4/IPv6), and redirect prevention, (2) Auto-delimiter detection (comma/semicolon/tab) by analyzing header frequency, (3) CRLF normalization for cross-platform compatibility, (4) Customizable field mapping with auto-detection for common patterns (item_sku→SKU, item_title→name, transaction_quantity→quantity), (5) Persistent mapping storage in localStorage for reuse, (6) Full dataset loading (not preview-only), (7) Automatic SKU deduplication with quantity summation. Import button in Daily Picking view opens dialog for URL input, field mapping configuration, and one-click task creation.
*   **Daily Picking Auto-Date and Persistent URL**: Picking list name now auto-fills with today's date in dd.MM.yyyy format (e.g., 14.10.2025) on page load and after list creation. CSV URL field loads from localStorage with default value (https://files.3dsellers.com/uploads/0874ff67c0e8b7abc580de328633eda6/export-csv/automation-172416.csv). Added Save button (icon) next to Load button to persist custom URLs across sessions. Credentials (baritero@gmail.com/Baritero1) remain saved and don't clear after successful load.

### Build and Development
*   **Development**: `npm run dev` starts Express server with Vite HMR.
*   **Production**: `npm run build` creates optimized frontend and server bundles; `npm start` runs the production server.
*   **Database Operations**: `npm run db:push` for schema changes via Drizzle Kit.
*   **Seed Scripts**: `npx tsx server/seed-warehouse-settings.ts` to seed warehouse settings for all letters A-Z (26 grouped settings, each containing 7 locations including X0, with A-B: TSKU=4/MAXQ=10, C-Z: TSKU=3/MAXQ=7).

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`).
*   **UI Components**: Radix UI, shadcn/ui, Lucide React (icons), cmdk (command palette), vaul (drawer/modal).
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod (validation).
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Barcode Scanning**: html5-qrcode.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.