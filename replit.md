# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## Recent Changes

### October 22, 2025 (Session 2)
**Major Feature Enhancements:**
- **Location Management Refactor**: Redesigned from text-based to table-based UI with array-based state for optimal performance:
  - Range filtering with "С...ПО..." inputs for efficient location selection
  - Single-input add location field with immediate table updates
  - Array-based state (`locationList: string[]`) eliminates parsing overhead
  - Collapsible admin sections for Location Management and TSKU/MAXQ Settings
  - Keyboard-accessible chevron rotation using `group data-[state=open]:rotate-180` pattern
- **Warehouse Loading Validation**: Added location consistency checks:
  - Only displays locations from the managed locations list
  - Memoized `managedLocationsSet` for O(1) location lookups
  - Warning alerts for items in unmanaged locations
- **Daily Picking List Enhancements**: Inventory depletion warnings with color-coded rows:
  - Three-tier warning system: critical (red), warning (yellow), safe (green)
  - Accounts for already-picked quantities using `remainingQuantity = requiredQuantity - pickedQuantity`
  - Real-time display of current inventory, remaining to pick, and final quantity after picking
  - Fixed calculation bug to prevent false warnings for partially/fully picked items
- **Inventory Condition Editing**: Full condition management in InventoryTable:
  - Added editable Select dropdown in edit mode with options: New, Used, Exdisplay, Parts, Faulty
  - Color-coded badges: Blue (New), Green (Exdisplay), Yellow (Used), Gray (Parts), Red (Faulty)
  - AlertDialog confirmation for Faulty selection with Russian localization
  - Backend API endpoint (PATCH /api/inventory/:id/condition) with database updates to tested_items/faulty_stock tables
  - Intelligent data routing: tested_items for New/Used/Exdisplay, faulty_stock for Faulty, both for Parts
- **Event Logs CSV Export**: Professional data export functionality:
  - "Экспорт в CSV" button with Download icon
  - Exports currently filtered logs with all active filters
  - Semicolon delimiter for Russian Excel compatibility
  - UTF-8 BOM for proper Cyrillic encoding
  - Date format: DD.MM.YYYY HH:MM:SS
  - Proper escaping for special characters (quotes, semicolons, newlines)
  - Timestamped filenames: logs_YYYYMMDD_HHMMSS.csv
  - Toast notifications showing export count
- **Stock-In Form Layout Optimization**: Improved SKU/Location workflow:
  - Reordered fields: ID товара → Название → SKU + Локация (side-by-side 50%/50%)
  - Location field now disabled (gray, read-only) with auto-fill from SKU
  - Removed required asterisk from Location label
  - Simplified state management by removing manual edit tracking
  - Visual clarity: Location clearly appears as auto-filled, non-editable field

### October 22, 2025 (Session 1)
**Performance & UX Improvements:**
- **Warehouse Loading Filters**: Added 300ms debounce to TSKU/MAXQ filters in WarehouseLoadingView to eliminate input lag. Uses separate immediate UI state (tskuInput/maxqInput) and debounced filtering state (tskuFilter/maxqFilter) for optimal responsiveness.
- **BarcodeEditor Complete Overhaul**: Replaced auto-save with explicit workflow:
  - Auto-scan functionality: USB scans trigger on Enter, Camera/Phone scans auto-add to working list
  - Each scan creates separate entry (even duplicates) with qty=1 for accurate tracking
  - "Before/After" confirmation modal showing original vs. modified barcode mappings
  - Explicit "Confirm"/"Cancel" buttons for all changes
  - Capacity validation on all 5 ingestion paths (USB, Camera, WebSocket, Manual add, Quantity edit) using functional setState updates to prevent stale closures and negative unmappedQuantity values
  - Real-time counters: Total / Mapped / Unmapped quantities with visual alerts when items remain unmapped
- **USB Scanner Quantity Feature**: Added bulk barcode creation workflow:
  - Quantity field allows workers to specify N units before scanning
  - Single scan creates N separate barcode entries (each with qty=1) for accurate tracking
  - Focus management: autoFocus on scanner input + onBlur refocus from quantity field
  - UI guidance: "Укажите количество, затем сканируйте. Будет добавлено столько баркодов, сколько указано."
  - **Critical Bug Fix**: Resolved stale closure issues in all barcode handlers (handleUsbScan, handleManualAdd, handleUpdateQuantity, handleRemoveBarcode):
    - All functions now use functional setState updates: `setWorkingBarcodes(prev => ...)`
    - Barcode values captured before callback: `const barcode = scannedCode;` to prevent stale references
    - Capacity checks use fresh `currentMapped` computed inside update function
    - Scanner input now clears correctly after each scan via `setScannedCode("")`
    - Verified via end-to-end testing: multiple bulk additions work correctly
- **Enhanced Confirmation Dialog**: Improved barcode change verification:
  - Shows "Было X товаров / Стало Y товаров" comparison with large, prominent numbers
  - Quantity mismatch alerts: "Превышение" (red) for overages, "Недостача" (yellow) for shortages
  - Side-by-side barcode mapping comparison (original vs. modified)
  - Three action buttons: "Подтвердить изменения" (saves), "Исправить" (returns to editing), "Отменить всё" (discards)
- **Inventory Condition Display**: Fixed condition field visibility in inventory tables:
  - Modified getAllInventoryItems() SQL query with dual LEFT JOIN to tested_items and faulty_stock
  - Uses COALESCE(testedItems.condition, faultyStock.condition) for unified condition retrieval
  - Condition now displays for all tested products regardless of final destination table
- **Warehouse Loading View Improvements**: Enhanced location display and management:
  - **Default Display Logic**: Changed from showing only active locations to showing ALL locations by default
  - **Optional Active Filter**: Added checkbox "Только активные (N)" for admins to optionally filter by active locations only
  - **Location Search**: Added search field in admin location management to filter locations by name
  - **Mass Delete**: Added "Удалить найденные (N)" button to delete all locations matching search filter
  - **Duplicate Handling**: Fixed index tracking to correctly edit/delete duplicate locations using `{ loc, originalIdx }` pairing before filtering
  - **Add Location Button Fix**: Fixed "Добавить локацию" button to create visible editable fields with "НОВАЯ" placeholder text

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite. It leverages Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette is optimized for operational clarity, supporting both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable, persistent table columns. Barcode scanning is integrated, supporting both USB scanners and mobile camera inputs.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server for features like remote scanning and picking list synchronization. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports, real-time updates, location consistency checks, and comprehensive price tracking. An archiving system records all inventory changes.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials for multiple sources, and persistent selections. Manual collection is also supported.
*   **Warehouse Loading View**: Provides dynamic filtering and configuration of warehouse settings for capacity analysis.
*   **User Management**: Includes basic user administration with robust deletion safeguards.
*   **Event Logging**: A comprehensive audit trail captures all warehouse operations, including product testing, stock movements, and user actions, with full product information and cost traceability.
*   **Worker Analytics**: Displays key metrics and cost totals for all users.
*   **Barcode Scanner Workflow**: Supports dual-mode scanning (USB and Phone) with a "zero-leak" routing algorithm for USB scanners and WebSocket integration for mobile camera scanning via a dedicated "/scanner-mode" page.
*   **Product Testing Workflow**: A two-phase system for incoming products, tracking items from pending tests to final condition (Used/Exdisplay/New/Parts/Faulty) with working hours analytics for faulty items.

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, SKU errors, CSV sources, global settings, and a dedicated workflow for product testing (pending_tests, tested_items, faulty_stock). UUID primary keys and automatic timestamps are used, with foreign key relationships for data integrity. Product deduplication is achieved by `productId`, and upsert patterns handle bulk inventory updates.

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL (development), PostgreSQL 16 (production).
*   **UI Components**: Radix UI, shadcn/ui, Lucide React, cmdk, vaul.
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod.
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Barcode Scanning**: html5-qrcode.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.