# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite, leveraging Radix UI primitives and shadcn/ui components ("New York" style). Typography is based on IBM Plex Sans/Mono, and the color palette supports both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable table columns. Barcode and QR code scanning is integrated with universal scanner support (USB, Zebra TC57, keyboard-emulating devices) and mobile camera mode via WebSocket. The picking interface features a compact vertical layout.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports via a CSV import wizard with intelligent product matching, real-time updates, location consistency checks, price tracking, archiving, and automatic condition transfer. Includes an automated CSV scheduler and advanced duplicate management. Dual inventory quantity tracking (`expectedQuantity` vs. `physicalCount`) is implemented for barcoded and non-barcoded items, with UI for variance detection. Item ID filtering is enforced for imports.
*   **Location Management**: Mass-upload locations and barcodes via CSV.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials, persistent selections, and inventory depletion warnings. Displays product photos, eBay external links, and eBay Seller information. Smart order grouping: uses eBay data `(buyerUsername OR buyerName) + addressPostalCode + sellerEbayId` when available, automatically falls back to grouping by picking list name for non-eBay orders. Orders are created incrementally after each item scan with complete eBay metadata.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations.
*   **User Management**: Basic user administration with robust deletion safeguards.
*   **Event Logging**: Comprehensive audit trail of all warehouse operations with full product information and cost traceability, supporting CSV export and visual indicators. Detailed import statistics are tracked and persisted.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, including packing statistics, and searchable event history.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning (USB/keyboard devices and mobile camera via WebSocket) with zoom controls, tooltips, and capacity validation. Auto-input for barcode scanners is supported.
*   **Product Testing Workflow**: Optional two-phase system for incoming products.
*   **Pending Placement Management**: Administrators can delete pending placements.
*   **Dispatch Workflow**: Complete order preparation system with 4-phase non-stop barcode scanning, including support for non-barcoded items via manual SKU search. Incremental order creation and status protection ensure real-time visibility and data integrity. Includes "Back to orders list" button for exiting at any workflow stage.
*   **Packing Workflow**: Multi-worker order fulfillment with barcode verification against Dispatch data, supporting concurrent packing sessions with real-time updates. Displays pending orders reference table at bottom for read-only access.
*   **Bypass Code Feature**: Secure system for warehouse item placement allowing an administrator-set bypass code as an alternative to scanning location barcodes.
*   **Bulk Order Deletion**: Admin-only bulk delete functionality via DELETE /api/orders/bulk endpoint with status filtering (PENDING, DISPATCHED, PACKED). Includes confirmation dialogs showing exact deletion counts. Dispatch page deletes pending orders; Packing page deletes dispatched and packed orders.

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, and specific workflows. It uses UUID primary keys, automatic timestamps, and foreign key relationships. Product identification is by `itemId` or `sku`, and upsert patterns handle bulk inventory updates. The CSV import system is a 4-step wizard with source selection, intelligent column mapping (including bilingual suggestions, auto-detection, and Image URLs), intelligent matching and conflict resolution, and a final confirmation. Column mappings are persisted. Backend CSV processing is optimized for large files using batch processing and parallel chunk execution. Separated CSV source systems (`bulkUploadSources` for inventory and `csvSources` for picking lists) are implemented.

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