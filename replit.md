# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## Recent Changes (November 3, 2025)
- **Dual Inventory Quantity Tracking**: Implemented comprehensive system for tracking expected vs physical inventory:
  - **Database Schema**: Added `expectedQuantity` field to `inventoryItems` table for storing quantity from external systems/CSV imports
  - **Smart CSV Import Logic**: Modified `bulkUpsertInventoryItems` to preserve physical inventory during updates:
    - Items WITH barcodes: CSV updates only `expectedQuantity`, keeps physical `quantity` unchanged (determined by actual barcode count)
    - Items WITHOUT barcodes: CSV updates `quantity` as before (traditional inventory management)
  - **Physical Count Calculation**: Frontend automatically calculates physical count by counting records with same SKU that have barcodes
  - **Variance Detection UI**: InventoryTable displays new "Qty" column showing:
    - Non-barcoded items: displays `quantity` only
    - Barcoded items: displays `physicalCount / expectedCount` with red warning (⚠️) when mismatch occurs
    - Hover tooltip shows detailed breakdown: Physical count, Expected count, and Difference (±X)
  - **Business Logic**: Solves synchronization issue where external system shows reduced quantity after sales, but physical warehouse items (with barcodes) remain intact until actually picked
  - **Reconciliation**: After picking/packing completion, physical quantity decreases to match expected quantity from external system
- **Incremental Order Creation Workflow**: Implemented real-time order creation system for Picking → Dispatch → Packing pipeline:
  - **Immediate Order Creation**: Orders created/updated after EACH item scan (not waiting for full picking list completion) - critical for real-time Dispatch visibility
  - **Quantity Tracking**: Orders track actual `pickedQuantity` (not required) for accurate real-time state during incremental collection
  - **Status Protection**: `createOrUpdateOrderFromPickingTask` automatically skips updates for orders in DISPATCHED/PACKED status to prevent accidental rollback
  - **Completion Validation**: Both Dispatch and Packing endpoints validate all picking tasks are complete (`pickedQuantity >= requiredQuantity`) before allowing status transitions
  - **Detailed Error Reporting**: Validation failures return complete list of incomplete tasks with specific missing quantities for operator remediation
  - **Migration Endpoint**: `/api/picking/migrate-orders` safely creates orders for existing partially-collected tasks without resurrecting completed orders
  - **Smart Dispatch**: Workers scan item barcode to see all pending orders containing that item; multi-order selection dialog shows complete order details for worker choice
  - **Status Flow**: PENDING (from first item scan) → DISPATCHED (after label scan + validation) → PACKED (after packing verification + validation)
  - **Inventory Depletion**: Items are automatically removed from inventory after packing completion based on dispatched barcodes
  - **Order Lifecycle**: createOrUpdateOrderFromPickingTask consolidates picking tasks into single order per picking list; orders transition through statuses as workers process them with full lifecycle integrity protection
- **Barcode Scanner Auto-Input**: Added useGlobalBarcodeInput hook to inventory search field for automatic barcode scanner input routing
- **Bypass Code Feature**: Implemented secure bypass code system for warehouse item placement:
  - **Database**: Added `bypassCode` field to `warehouseSettings` table for storing administrator-set code
  - **Storage Layer**: Created `getBypassCode()` and `setBypassCode()` methods with admin-only access control
  - **API Endpoints**: Added GET/POST `/api/warehouse-settings/bypass-code` (admin-only) for managing bypass code
  - **UI Enhancement**: UserManagementPanel includes password-type input and save button for administrators to set bypass code
  - **PlacementView Integration**: Workers can use bypass code as alternative to scanning location barcode - code is verified server-side without exposing actual code to frontend
  - **Event Logging**: System creates BYPASS_CODE_USED event when bypass code is successfully used, tracking user, item details, and location for audit trail
  - **Security**: Bypass code never transmitted to frontend; workers submit code for server-side verification; invalid codes return explicit error
- **Detailed Import Statistics Tracking**: Implemented comprehensive import statistics pipeline:
  - **Database**: Added `import_runs` table to persist complete import history with granular metrics (rowsTotal, rowsWithId/WithoutId, created, updatedQuantityOnly/Partial/AllFields, skippedNoId, errors, totalQuantityChange)
  - **Storage Layer**: Modified `bulkUpsertInventoryItems` to collect detailed statistics during processing and accept optional context (sourceType, sourceRef, userId) for import tracking
  - **Scheduler Integration**: Scheduler now records detailed statistics for automated imports and tracks lastRunId in schedulerSettings
  - **API Endpoints**: Added GET `/api/import-runs/latest` and `/api/import-runs/:id` for import history retrieval; CSV upload responses now return detailed statistics
  - **UI Enhancement**: CSVUploader displays comprehensive breakdown in toast notifications showing created/updated counts by category, skipped items, and quantity changes
- **Item ID Filtering Implementation**: Enforced strict Item ID requirements for inventory imports:
  - **Automated Scheduler**: Now requires both SKU and Item ID for all imports (line 275 in scheduler.ts: `if (item.sku && item.itemId)`), preventing items without Item IDs from being added to inventory
  - **Manual CSV Upload**: Changed default behavior - "Skip items without Item ID" checkbox now CHECKED by default (changed from `false` to `true` in CSVUploader.tsx line 241), ensuring users must explicitly opt-in to import items without Item IDs
  - Existing filtering logic (lines 640-666) properly respects the checkbox state and displays toast notifications showing count of skipped items

## Recent Changes (November 2, 2025)
- **Separated CSV Source Systems**: Implemented two independent CSV source management systems:
  - `bulkUploadSources` table for inventory imports used by automated scheduler
  - `csvSources` table for picking list imports
  - Migrated CSVUploader from localStorage to database-backed bulk upload sources with automatic one-time migration
  - Added CRUD API endpoints at `/api/bulk-upload-sources`
  - Scheduler now uses `bulkUploadSources` and skips disabled/empty URL sources to prevent crashes
  - New sources default to disabled state until user fills in URL and enables manually
- **CSV Import Performance Optimization**: Batch updates now process 10 items in parallel (matching insert strategy), eliminating the 90% progress freeze that occurred when updating thousands of items sequentially. Expected 10x speedup for large updates.
- **Visible Progress Feedback**: Added toast notifications showing "Processing started" at the beginning and "✅ Upload complete: Created: X | Updated: Y | Errors: Z" at the end, giving users clear feedback on bulk operations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite, leveraging Radix UI primitives and shadcn/ui components ("New York" style) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette supports both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable table columns. Barcode and QR code scanning is integrated with universal scanner support (USB, Zebra TC57, keyboard-emulating devices) and mobile camera mode via WebSocket. The picking interface features a compact vertical layout.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports via a comprehensive CSV import wizard with intelligent product matching, real-time updates, location consistency checks, price tracking, archiving, and automatic condition transfer. Features smart CSV import logic that updates only quantity and price for existing items, or enriches missing metadata without overwriting existing data. Includes an automated CSV scheduler for recurring imports, deferred archiving with a 4-day grace period, and restoration of archived items. Advanced duplicate management includes conflict resolution during imports, a duplicate SKU filter, and tools for finding and removing existing duplicates.
*   **Location Management**: Mass-upload locations and barcodes via CSV, with individual location barcode edits requiring a batch save.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials, persistent selections, and inventory depletion warnings. Displays product photos, eBay external links, and eBay Seller information.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations.
*   **User Management**: Basic user administration with robust deletion safeguards.
*   **Event Logging**: Comprehensive audit trail of all warehouse operations with full product information and cost traceability, supporting CSV export and visual indicators.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, including packing statistics, and searchable event history.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning (USB/keyboard devices and mobile camera via WebSocket) with zoom controls, tooltips, and capacity validation.
*   **Product Testing Workflow**: Optional two-phase system for incoming products, allowing direct inventory addition or a testing workflow tracking items from pending tests to final condition with working hours analytics.
*   **Pending Placement Management**: Administrators can delete pending placements directly from Stock In and Placement sections with confirmation and event logging.
*   **Dispatch Workflow**: Complete order preparation system with 4-phase non-stop barcode scanning for finding orders, verifying multi-item orders, scanning shipping labels, and confirming dispatch.
*   **Packing Workflow**: Multi-worker order fulfillment with barcode verification against Dispatch data, supporting concurrent packing sessions with real-time updates.

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, and specific workflows. It uses UUID primary keys, automatic timestamps, and foreign key relationships. Product identification is by `itemId` or `sku`, and upsert patterns handle bulk inventory updates. The CSV import system is a 4-step wizard with source selection, intelligent column mapping (including bilingual suggestions, auto-detection, and Image URLs), intelligent matching and conflict resolution, and a final confirmation. Column mappings are persisted. Backend CSV processing is optimized for large files using batch processing and parallel chunk execution.

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL (development), PostgreSQL 16 (production).
*   **UI Components**: Radix UI, shadcn/ui, Lucide React, cmdk, vaul.
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod.
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Barcode Scanning**: html5-qrcode.
*   **CSV Parsing**: fast-csv.
*   **String Matching**: string-similarity.
*   **Image Carousel**: embla-carousel-react.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.