# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
*   **Framework**: React 18 with TypeScript, Vite.
*   **UI/UX**: Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System), IBM Plex Sans/Mono typography, color palette optimized for operational clarity, light/dark mode support.
*   **State Management**: TanStack Query for server state, local React state for UI.
*   **Routing**: Wouter.
*   **Styling**: Tailwind CSS with custom design tokens.
*   **Key UI Patterns**: Role-based sidebar navigation, responsive design, card-based interface, real-time toast notifications, progress indicators, resizable table columns with persistence, multi-select filter for warehouse locations. Barcode scanning support in inventory editing via USB scanner (with fast input handling for immediate Enter processing) or mobile camera. Remote barcode scanning with quantity support via WebSocket.

### Backend
*   **Runtime**: Node.js with Express.js, TypeScript with ES Modules.
*   **API Design**: RESTful JSON API (`/api` prefix).
*   **Authentication**: Session-based with BCrypt (10 salt rounds), Bearer token support, role-based middleware (`requireAuth`, `requireAdmin`).
*   **Database ORM**: Drizzle ORM.
*   **Architectural Decisions**: Monorepo structure (`client/`, `server/`, `shared/`), shared TypeScript types, Zod for schema validation, Vite middleware for HMR, esbuild for production bundling.
*   **Core API Routes**: Authentication, inventory management (CRUD, bulk import, file synchronization), warehouse capacity analysis, user management, event logging, SKU error management, worker analytics, picking list management.
*   **Real-time Communication**: WebSocket server for device-to-device communication (remote scanning, picking list synchronization).

### Database Schema
*   **ORM**: Drizzle ORM with PostgreSQL dialect.
*   **Tables**: `users`, `inventory_items` (with `price` field for cost tracking), `event_logs` (comprehensive audit with full product tracking, `quantity` and `price` fields for cost analytics), `worker_analytics`, `picking_lists`, `picking_tasks` (including `itemName`), `sku_errors`, `csv_sources` (globally shared CSV sources), `global_settings` (shared configuration like CSV credentials).
*   **Design Decisions**: UUID primary keys, automatic timestamps, foreign key relationships, product deduplication by `productId`, upsert patterns for bulk inventory updates. Event logs store complete product information including quantity and price for cost traceability. CSV sources are globally shared across all users for consistent picking list management.

### Key Features & Implementations
*   **Inventory Management**: Bulk import, real-time updates post-picking, location consistency checks. Price tracking for all inventory items with inline editing support. Default sorting by location A-Z with alphanumeric intelligence (A1, A2, A10). File synchronization from CSV (data/inventory_sync.csv) supports price, dimensions (length/width/height), volume (auto-calculated), and weight fields. Archive system creates timestamped CSV files (data/arhiv/YYYY-MM-DD_HH-MM-SS.csv) recording all changes: UPDATE (field-by-field diff with old/new values), CREATE (new items), and DELETED (items not in CSV but in DB). Deletion is disabled for safety but tracked in archives.
*   **Price & Cost Analytics**: Comprehensive cost tracking system with quantity and price fields in event logs. Worker analytics display total cost for stock-in operations (`stockInCost` = Σ(quantity × price) for `STOCK_IN` + `STOCK_IN_UPDATE`) and stock-out operations (`stockOutCost` = Σ(quantity × price) for `STOCK_OUT`). PATCH operations automatically detect quantity changes and log appropriate events with cost data. Price synchronized automatically from existing inventory items and CSV file import (no manual price entry in Stock-In form).
*   **Picking Lists**: Daily list management, item names displayed for better UX, enhanced CSV/Excel import with auto-detection (delimiter, fields), URL-based import with SSRF hardening, persistent mapping, and auto-deduplication. Support for multiple CSV sources with global credentials (shared username/password) and collapsible UI interface. Each source has compact 3-character name display. Automatic "Load All" functionality merges data from enabled sources. Selected list persists in localStorage across page refreshes.
*   **Manual Collection**: "Собрать" (Collect) button for each picking task enables manual item collection without barcode scanning. System decrements inventory if item exists, or marks as collected without inventory tracking. All manual collections logged with dedicated action types (`PICK_ITEM_MANUAL`, `PICK_ITEM_MANUAL_NO_INVENTORY`) for full audit trail with quantity and price tracking.
*   **Warehouse Loading View**: Dynamic filtering (per-letter limits), displays all active locations (even empty), natural/numeric sorting for locations. Configurable warehouse settings (A-Z groups, TSKU, MAXQ) with inline editing.
*   **User Management**: Edit user names, robust delete validation (prevent self-deletion, last admin deletion).
*   **Event Logging**: Enhanced with complete product information for all `STOCK_OUT`, `STOCK_IN`, and picking events. Includes quantity and price fields for comprehensive cost tracking and analytics. Distinguishes between scanned (`PICK_ITEM`) and manual (`PICK_ITEM_MANUAL`) collections with full worker attribution. PATCH operations on inventory automatically log `STOCK_OUT` (quantity decrease), `STOCK_IN_UPDATE` (quantity increase), or `INVENTORY_UPDATE` (other changes) with appropriate cost data.
*   **Worker Analytics**: Displays metrics for all users (admins + workers) including login count, stock-in/out counts, and cost totals. Analytics page shows sortable columns for "Стоимость добавл." (stock-in cost) and "Стоимость выдано" (stock-out cost), providing financial insights into warehouse operations.
*   **UI Enhancements**: Improved table readability, compact layouts for cards and settings, consistent styling for buttons and dropdowns. CSV sources in collapsible section with responsive grid (2-5 columns based on screen size). Price field available in inventory table inline editing for cost tracking.
*   **Performance Optimizations**: Inventory table search field now uses memoized filtering (useMemo) to prevent lag during typing, even with large datasets. All data transformations (sorting, filtering, grouping) are optimized with stable dependencies.
*   **Barcode Scanner Workflow**: Dual-mode scanner support with USB and Phone options selectable via compact buttons at top of Stock-In form. USB mode features ZERO-LEAK strict routing implementation with pre-buffering algorithm that guarantees scanner data ONLY reaches barcode field regardless of focus position (location, productId, or any other field). Pre-buffering detects scanner vs manual typing: first character is buffered for 80ms, if second character arrives quickly it's a scanner (focus switches to barcode, buffer is flushed), otherwise it's manual typing (character replayed to original field). Auto-reset inactivity timer (200ms) prevents sticky scanner state. Hardened for edge cases: selection-safe replay, readOnly/disabled bypass, type="number" safety, element unmount detection, focus-change awareness. Phone mode uses WebSocket connection for remote barcode scanning with live connection indicator showing connection status (green = connected, amber = connecting). Simplified Stock-In form without separate BarcodeScanner component section - cleaner UI with direct field input and global barcode routing in USB mode. Manual confirmation required: after scanning, user must click "Добавить товар" button (no auto-submit). Barcode field properly persists to database and is fully searchable in inventory table filter. All barcode data stored in barcodeMappings JSON format with support for multiple codes per item.
*   **Auto-Location Extraction**: Stock-In form automatically extracts warehouse location from SKU field format. When user enters SKU (e.g., "A101-R"), location field auto-populates with first 4 characters before dash (e.g., "A101"). Handles all cases: SKU with dash (extracts up to 4 chars before "-"), SKU without dash (extracts first 4 chars), short SKUs (<4 chars work correctly), and edge cases (dash at position 0). System respects manual edits - if user manually changes location, auto-extraction pauses until next form submission. Form reset clears all tracking state for fresh entry.

## Deployment

*   **Ubuntu Server Package**: Complete installation scripts in `deployment/` folder (1-5 for setup, 6-7 for GitHub sync with auto-backup)
*   **GitHub Integration**: Optional version control sync with automatic backup before updates and rollback support (see `deployment/GITHUB.md`)
*   **Backup System**: Automated backup creation before GitHub sync, keeps last 10 versions in `/opt/warehouse-backups/`

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL (development), PostgreSQL 16 (production)
*   **UI Components**: Radix UI, shadcn/ui, Lucide React, cmdk, vaul.
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod.
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Barcode Scanning**: html5-qrcode.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.