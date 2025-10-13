# Warehouse Management System

## Overview

This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators, ensuring secure and tailored functionalities. The system's core capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, and warehouse capacity monitoring. It also provides daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 13, 2025 - Remote Scanner (Phone as Wireless Scanner)
- **WebSocket Real-Time Communication**:
  - Created WebSocket server for device-to-device communication
  - Supports multiple concurrent connections per user (Set-based storage)
  - Auto-reconnect on disconnect
  - Session-based authentication
  - Broadcasts messages to all other devices of same user
- **Remote Scanner Mode**:
  - Third tab "Телефон" in BarcodeScanner component
  - Phone camera stays active (doesn't auto-close after scan)
  - Manual "Send to Computer" button (like camera shutter)
  - Visual feedback with green preview for scanned codes
  - Connection status indicators (🟢 Connected / 🟡 Connecting)
- **Dual-Device Workflow**:
  - Use phone as wireless scanner for computer
  - Phone scans → shows preview → click "Send to Computer"
  - Computer receives scan instantly via WebSocket (on any tab)
  - Status indicator shows "🟢 Принимает сканы с телефона" on desktop USB tab
- **Implementation Details**:
  - WebSocket path: `/ws`
  - Server: Map<userId, Set<WebSocket>> for multiple connections
  - Messages: `auth`, `remote_scan`, `barcode_scanned`
  - Unique camera mount IDs: `qr-reader-mobile` and `qr-reader-remote`
  - Receives WebSocket scans regardless of active tab

### October 13, 2025 - Mobile Camera & Physical Scanner Support
- **Real Camera Scanning**:
  - Implemented html5-qrcode for mobile barcode scanning
  - Uses back camera (environment mode) for better scanning
  - Error handling for camera permissions
  - Proper camera cleanup on unmount/tab switch
- **Auto-Focus for Physical Scanners**:
  - Added auto-focus on barcode input fields (Stock In, Stock Out, Picking)
  - Focus returns to input after each scan
  - Works seamlessly with USB/wired barcode scanners
- **Multi-Device Workflow**:
  - Use phone camera to scan barcodes
  - Use computer to enter data (location, etc.) simultaneously
  - Physical scanner works without clicking on input field

### October 13, 2025 - Picking List Excel Support
- **Auto-Detect Delimiter for Picking Lists**:
  - Added support for Excel data (tab-separated)
  - Auto-detects delimiter: tab (`\t`), comma (`,`), semicolon (`;`), or whitespace
  - Can now paste directly from Excel without formatting
  - Example formats: `R356-X    1` (tab), `R356-X,1` (comma), `R356-X 1` (space)
  - Tested with 5 SKUs from Excel - all parsed correctly

### October 13, 2025 - CSV Bulk Upload Fix & Location Extraction Correction
- **CSV Upload Fixed**:
  - Fixed "PayloadTooLargeError" - increased request limit to 50MB
  - Fixed CSV parsing for files with encoding issues (fallback to column positions)
  - Added auto-detection for delimiter (`;` or `,`)
- **Location Extraction Logic Corrected**:
  - **CRITICAL FIX**: Changed location extraction to match pattern: single letter + 1-3 digits at start of SKU
  - Correct pattern: `A107Y-E` → location: `A107` (not A107Y-E or A107Y)
  - Examples: `A101-G` → `A101`, `B52` → `B52`, `kjkhk` → `kjkhk` (no match, use full SKU)
  - Regex pattern: `/^([A-Z]\d{1,3})/i`
  - Fixed 11,475 existing records with incorrect locations
- **Performance Optimization**:
  - Optimized from 2655+ database queries to 1 query + batch processing
  - Batch insert in chunks of 100 items with fallback to item-by-item on error
  - Reduced processing time from timeout to ~102 seconds for 2655 items
  - Added duplicate productId detection within single upload
  - Success/error counting happens AFTER actual database operations
- **Tested Successfully**:
  - 2655 items processed: 1310 new, 1345 updated
  - Verified in inventory with locations T92, N45, G316, etc.

### October 13, 2025 - Warehouse Loading Filter Improvements
- **Multi-Select Letter Filter**: 
  - Replaced single-select dropdown with Popover + checkboxes for multi-select
  - Selected letters displayed as badges in trigger button
  - Shows locations matching ANY selected letter (OR logic)
  - "Очистить" button to clear all selections
- **Exact Value Filters**:
  - TSKU filter: Changed from minimum value (`>=`) to exact match (`===`)
  - MAXQ filter: Changed from minimum value (`>=`) to exact match (`===`)
  - UI labels updated to "точное значение" instead of "мин. значение"
- **Color Indicators - Gradient System**:
  - Changed from step-based to ratio-based gradient colors
  - Transition: green (0%) → lime (25%) → yellow (50%) → orange (75%) → red (100%)
  - Uses warehouse settings (TSKU/MAXQ) as maximum thresholds
  - Example: Location with TSKU=9 setting shows green at 0-2 SKUs, yellow at 4-5, red at 9+

## System Architecture

### Frontend Architecture

*   **Framework**: React 18 with TypeScript, using Vite for development.
*   **UI/UX**: Radix UI primitives and shadcn/ui components in a "New York" style, inspired by Carbon Design System for data-intensive operations. Features include IBM Plex Sans/Mono typography, a color palette optimized for operational clarity, and light/dark mode support.
*   **State Management**: TanStack Query for server state, local React state for UI.
*   **Routing**: Wouter for client-side routing.
*   **Styling**: Tailwind CSS with custom design tokens.
*   **Key UI Patterns**: Role-based sidebar navigation, responsive design, card-based interface, real-time toast notifications, and progress indicators.

### Backend Architecture

*   **Runtime**: Node.js with Express.js.
*   **Language**: TypeScript with ES Modules.
*   **API Design**: RESTful JSON API, prefixed with `/api`.
*   **Authentication**: Session-based authentication with BCrypt for password hashing (10 salt rounds), Bearer token support, and role-based middleware (`requireAuth`, `requireAdmin`).
*   **Database ORM**: Drizzle ORM for type-safe queries.
*   **Architectural Decisions**: Monorepo structure (`client/`, `server/`, `shared/`), shared TypeScript types, Zod for schema validation, Vite middleware for HMR in development, and esbuild for production bundling.
*   **Core API Routes**: Authentication, inventory management (CRUD, bulk import), warehouse capacity analysis, user management, event logging, SKU error management, worker analytics, and picking list management.

### Database Schema

*   **ORM**: Drizzle ORM with PostgreSQL dialect.
*   **Tables**:
    *   `users`: Stores worker and admin accounts with role-based access.
    *   `inventory_items`: Tracks product inventory, including SKU, location, quantity, and status.
    *   `event_logs`: Comprehensive audit trail of all operations.
    *   `worker_analytics`: Stores daily worker performance metrics.
    *   `picking_lists`: Manages daily picking lists, supporting multiple tasks per list.
    *   `picking_tasks`: Individual pick items within a picking list, tracking required and picked quantities.
    *   `sku_errors`: Manages SKU mismatch corrections during bulk uploads to prevent data corruption.
*   **Design Decisions**: UUID primary keys, automatic timestamps, foreign key relationships, product deduplication by `productId`, and upsert patterns for bulk inventory updates.

### Build and Development

*   **Development**: `npm run dev` starts Express server with Vite HMR.
*   **Production**: `npm run build` creates optimized frontend and server bundles; `npm start` runs the production server.
*   **Database Operations**: `npm run db:push` for schema changes via Drizzle Kit.

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`).
*   **UI Components**: Radix UI, shadcn/ui, Lucide React (icons), cmdk (command palette), vaul (drawer/modal).
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod (validation).
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.