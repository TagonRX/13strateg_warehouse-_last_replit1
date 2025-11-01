# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite. It leverages Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette is optimized for operational clarity, supporting both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable, persistent table columns. Barcode and QR code scanning is integrated with universal scanner support (USB, Zebra TC57, keyboard-emulating devices) plus mobile camera mode via WebSocket. All scanning modes support both traditional barcodes and QR codes. Mobile camera scanning requires an HTTPS connection, with clear warnings and guidance for HTTP connections. The picking interface features a compact vertical layout with collapsible sections and optimized barcode scanner styling.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server for features like remote scanning and picking list synchronization. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports, real-time updates, location consistency checks, comprehensive price tracking, and an archiving system. Includes automatic condition transfer from testing to stock-in and inventory display, with support for items without barcodes. Products can be added to inventory without prior testing, with visual tracking via yellow highlighting and "БЕЗ ТЕСТА" badge in event logs for admin oversight. Features comprehensive CSV import wizard with intelligent product matching (90% similarity threshold), conflict resolution UI, and support for eBay URLs and product images. The inventory table displays product thumbnails (clickable for full-size modal view) and eBay links with sticky headers for improved navigation.
*   **Location Management**: Administrators can mass-upload locations and barcodes via CSV files, supporting both comma and semicolon delimiters, automatic header detection, and preservation of existing barcodes. Features "Download Template" button and performance optimizations for large datasets. Individual location barcode edits update local state; users must click "Сохранить локации" to persist all changes to database via batch save. Display limited to 200 locations with warning if more exist; users must use range filters for larger datasets. Optimized with memoized LocationsManagementTable component and debounced range filters to prevent input lag.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials, persistent selections, and inventory depletion warnings. Manual collection is also supported. Displays product photos (48px thumbnails, clickable for full-size modal) and eBay external link buttons for each task, enriched from inventory data.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations. Performance-optimized with memoized LocationTable component and useCallback-wrapped helper functions to prevent input lag during filtering - only debounced filter changes trigger table re-renders while typing remains responsive.
*   **User Management**: Includes basic user administration with robust deletion safeguards.
*   **Event Logging**: A comprehensive audit trail captures all warehouse operations with full product information and cost traceability, supporting CSV export. Includes visual indicators: red highlighting for critical warnings (faulty items blocked), yellow highlighting with "БЕЗ ТЕСТА" badge for products added without testing. ORDER_PACKED events track order packing completion with worker name, order number, item count, and barcode details (first 5 barcodes shown with count indicator for larger orders).
*   **Worker Analytics**: Displays key metrics and cost totals for all users, accurately preserving working minutes across condition transitions. Includes packing statistics showing total orders packed per worker (itemsPacked column), calculated dynamically from ORDER_PACKED event logs. Searchable event history enables easy audit trail lookup by worker name, order number, or barcode to identify who packed specific orders.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning ("Сканер" for USB/keyboard devices and "Камера" for mobile camera via WebSocket). All scanning components support both traditional barcodes and QR codes. Mobile camera mode includes sidebar zoom controls with vertical slider, +/- buttons, and real-time zoom indicator, automatically detecting camera capabilities. Features accessible tooltips, dynamic help text, "zero-leak" routing, explicit confirmation modals, quantity-based bulk barcode creation, and capacity validation.
*   **Product Testing Workflow**: Optional two-phase system for incoming products. Products can be added directly to inventory without testing, or they can go through the testing workflow tracking items from pending tests to final condition (Used/Exdisplay/New/Parts/Faulty) with working hours analytics for faulty items. Untested products are flagged in event logs with yellow highlighting for administrative review.
*   **Dispatch Workflow**: Complete order preparation system with 4-phase non-stop barcode scanning. Workers scan products to find orders (prioritizing single-item orders), verify multi-item orders with quantity tracking (Map-based counts ensuring all units scanned), scan shipping labels, and confirm dispatch. Displays product photos (clickable for gallery view with all product images) and eBay links, tracks scanned quantities with progress bars (e.g., "2/3"), validates against order items, and prevents duplicate scans. Dispatched orders move to Packing queue with verified barcode list.
*   **Packing Workflow**: Multi-worker order fulfillment with barcode verification against Dispatch data. Workers select ready-to-pack orders (status=DISPATCHED), scan shipping labels to start packing session, verify each product barcode against dispatchedBarcodes array with quantity validation, and complete packing upon full verification. Supports concurrent packing sessions with real-time updates (5-second refetchInterval), shows product photos (clickable for gallery view) and eBay links, tracks verification progress per item, and prevents errors (duplicate scans, wrong barcodes, quantity mismatches).

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, SKU errors, CSV sources, global settings, CSV import sessions, and a dedicated workflow for product testing (pending_tests, tested_items, faulty_stock). UUID primary keys and automatic timestamps are used, with foreign key relationships for data integrity. Product deduplication is achieved by `productId`, and upsert patterns handle bulk inventory updates.

### CSV Import Feature
The CSV import system provides a comprehensive 4-step wizard for bulk inventory updates:

**Step 1: Source Selection**
- Supports two input methods: direct file upload or URL-based CSV import
- Accepts any CSV format with flexible column names
- Admin-only feature with session-based tracking

**Step 2: Column Mapping (NEW - Nov 2024)**
- Interactive table displays all CSV columns with enable/disable checkboxes
- Smart auto-mapping with bilingual suggestions (English/Russian)
  - Auto-detects: Product Name/Название → productName, Price/Цена → price, Quantity/Количество → quantity
  - Full support: productName, sku, location, barcode, quantity, price, itemId, ebayUrl, imageUrls, condition
- "(Пропустить)" option to skip unwanted columns (auto-disables checkbox)
- Sample data preview from first CSV row
- Frontend validation: requires at least one enabled column before proceeding
- Backend security: whitelist filtering prevents injection of invalid fields

**Step 3: Intelligent Matching & Conflict Resolution**
- Uses Levenshtein distance algorithm (string-similarity library) to match CSV product names against existing inventory
- Automatic matching: Products with ≥90% similarity score and no conflicts are auto-matched (shown in green)
- Conflict detection: Multiple products with ≥90% similarity require manual selection via dropdown (shown in yellow/amber)
- Unmatched items: Products with <90% similarity or missing names are skipped (shown in red)
- **Dimension Conflicts (NEW - Nov 2024)**: Detects when CSV contains weight/width/height/length values that differ from existing inventory
  - Displays warning banner when dimension conflicts are detected
  - Shows comparison table for each product with conflicting dimensions (Current vs CSV values)
  - Radio button selection: "Оставить текущие" (default, safe choice) or "Использовать CSV"
  - Choices are passed to commit endpoint via `dimensionChoices` parameter
  - If no dimension fields in CSV or values match, no conflicts shown
- Real-time summary displays: total rows, matched items, conflicts requiring resolution, dimension conflicts, and unmatched/skipped items

**Step 4: Confirmation & Commit**
- Final summary before applying changes
- Bulk update operation updates inventory with mapped fields based on Step 2 configuration
- Creates event log entry upon successful completion
- Session status tracking: READY_FOR_REVIEW → RESOLVING → COMMITTED/FAILED

**Enhanced Inventory Display**
- "Фото" column: Displays product thumbnail (first image from imageUrls array), click to open interactive image gallery modal
- Interactive image gallery (ImageGalleryModal component): Full carousel with prev/next navigation, image counter (e.g., "2 / 5"), and keyboard support
- Multiple product images support: CSV import parses space/comma/semicolon-separated URLs into array stored as JSON in imageUrls field
- Visual indicator: Thumbnails display "+N" badge when product has multiple images
- "eBay" column: External link button if ebayUrl exists
- Sticky table headers for improved navigation with large datasets
- Resizable columns with persistent widths saved to localStorage

**Backend Implementation**
- CSV parsing helpers: parseCsvFile (buffer-based), parseCsvFromUrl (fetch-based), parseImageUrls (multi-delimiter URL parsing), matchProductsByName (similarity scoring)
- Image URL parsing: Supports space, comma, and semicolon separators with automatic trimming and empty value filtering
- Session management endpoints: GET /api/inventory/import-sessions (list all), GET /:id (fetch specific session), POST /:id/resolve (save conflict resolutions), POST /:id/commit (apply changes with optional dimensionChoices)
- Dimension conflict detection: Compares CSV weight/width/height/length values against existing inventory during matching phase, stores conflicts in session parsedData
- Dimension parsing: Uses parseFloat for weight/width/height/length fields to preserve decimal precision (e.g., 2.75 kg); parseInt only used for quantity and price fields
- Bulk update method: bulkUpdateInventoryFromCsv handles batch inventory updates with selective dimension field updates based on dimensionChoices parameter
- Error handling: Failed imports mark session status as FAILED with error logging

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