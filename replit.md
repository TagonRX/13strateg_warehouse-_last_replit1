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
*   **Inventory Management**: Supports bulk imports, real-time updates, location consistency checks, comprehensive price tracking, and an archiving system. Includes automatic condition transfer from testing to stock-in and inventory display, with support for items without barcodes. Products can be added to inventory without prior testing, with visual tracking via yellow highlighting and "БЕЗ ТЕСТА" badge in event logs for admin oversight.
*   **Location Management**: Administrators can mass-upload locations and barcodes via CSV files, supporting both comma and semicolon delimiters, automatic header detection, and preservation of existing barcodes. Features "Download Template" button and performance optimizations for large datasets. Individual location barcode edits update local state; users must click "Сохранить локации" to persist all changes to database via batch save. Display limited to 200 locations with warning if more exist; users must use range filters for larger datasets. Optimized with memoized LocationsManagementTable component and debounced range filters to prevent input lag.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials, persistent selections, and inventory depletion warnings. Manual collection is also supported.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations. Performance-optimized with memoized LocationTable component and useCallback-wrapped helper functions to prevent input lag during filtering - only debounced filter changes trigger table re-renders while typing remains responsive.
*   **User Management**: Includes basic user administration with robust deletion safeguards.
*   **Event Logging**: A comprehensive audit trail captures all warehouse operations with full product information and cost traceability, supporting CSV export. Includes visual indicators: red highlighting for critical warnings (faulty items blocked), yellow highlighting with "БЕЗ ТЕСТА" badge for products added without testing.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, accurately preserving working minutes across condition transitions.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning ("Сканер" for USB/keyboard devices and "Камера" for mobile camera via WebSocket). All scanning components support both traditional barcodes and QR codes. Mobile camera mode includes sidebar zoom controls with vertical slider, +/- buttons, and real-time zoom indicator, automatically detecting camera capabilities. Features accessible tooltips, dynamic help text, "zero-leak" routing, explicit confirmation modals, quantity-based bulk barcode creation, and capacity validation.
*   **Product Testing Workflow**: Optional two-phase system for incoming products. Products can be added directly to inventory without testing, or they can go through the testing workflow tracking items from pending tests to final condition (Used/Exdisplay/New/Parts/Faulty) with working hours analytics for faulty items. Untested products are flagged in event logs with yellow highlighting for administrative review.

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