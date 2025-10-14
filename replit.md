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
*   **Key UI Patterns**: Role-based sidebar navigation, responsive design, card-based interface, real-time toast notifications, progress indicators, resizable table columns with persistence, multi-select filter for warehouse locations. Barcode scanning support in inventory editing via USB scanner or mobile camera. Remote barcode scanning with quantity support via WebSocket.

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
*   **Tables**: `users`, `inventory_items`, `event_logs` (comprehensive audit with full product tracking), `worker_analytics`, `picking_lists`, `picking_tasks` (including `itemName`), `sku_errors`.
*   **Design Decisions**: UUID primary keys, automatic timestamps, foreign key relationships, product deduplication by `productId`, upsert patterns for bulk inventory updates. Event logs store complete product information for traceability.

### Key Features & Implementations
*   **Inventory Management**: Bulk import, real-time updates post-picking, location consistency checks.
*   **Picking Lists**: Daily list management, item names displayed for better UX, enhanced CSV/Excel import with auto-detection (delimiter, fields), URL-based import with SSRF hardening, persistent mapping, and auto-deduplication. Support for multiple CSV sources with independent management and "Load All" functionality.
*   **Warehouse Loading View**: Dynamic filtering (per-letter limits), displays all active locations (even empty), natural/numeric sorting for locations. Configurable warehouse settings (A-Z groups, TSKU, MAXQ) with inline editing.
*   **User Management**: Edit user names, robust delete validation (prevent self-deletion, last admin deletion).
*   **Event Logging**: Enhanced with complete product information for all `STOCK_OUT` and `STOCK_IN` events.
*   **UI Enhancements**: Improved table readability, compact layouts for cards and settings, consistent styling for buttons and dropdowns.

## External Dependencies

*   **Database**: Neon Serverless PostgreSQL.
*   **UI Components**: Radix UI, shadcn/ui, Lucide React, cmdk, vaul.
*   **Form Handling**: React Hook Form, @hookform/resolvers, Zod.
*   **Data Fetching**: TanStack Query.
*   **Authentication**: BCrypt.
*   **Styling**: Tailwind CSS, class-variance-authority, tailwind-merge.
*   **Date Handling**: date-fns.
*   **Barcode Scanning**: html5-qrcode.
*   **Build Tools**: Vite, esbuild, TypeScript, Drizzle Kit.