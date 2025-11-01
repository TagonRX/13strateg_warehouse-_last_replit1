# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite. It leverages Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette is optimized for operational clarity, supporting both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable, persistent table columns. Barcode and QR code scanning is integrated with universal scanner support (USB, Zebra TC57, keyboard-emulating devices) plus mobile camera mode via WebSocket. The picking interface features a compact vertical layout with collapsible sections.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server for features like remote scanning and picking list synchronization. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports via a comprehensive CSV import wizard with intelligent product matching, real-time updates, location consistency checks, price tracking, archiving, and automatic condition transfer. Includes visual tracking for items added without testing. Displays product thumbnails, eBay links, Item ID, and eBay Seller columns with sticky headers.
*   **Location Management**: Administrators can mass-upload locations and barcodes via CSV, with individual location barcode edits requiring a batch save. Display is optimized with memoized components and debounced filters for large datasets.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials, persistent selections, and inventory depletion warnings. Displays product photos, eBay external links, and eBay Seller information.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations, optimized with memoized components and debounced filters.
*   **User Management**: Basic user administration with robust deletion safeguards.
*   **Event Logging**: Comprehensive audit trail of all warehouse operations with full product information and cost traceability, supporting CSV export and visual indicators for critical warnings and untested products.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, including packing statistics, and searchable event history.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning ("Сканер" for USB/keyboard devices and "Камера" for mobile camera via WebSocket) with zoom controls, accessible tooltips, and capacity validation.
*   **Product Testing Workflow**: Optional two-phase system for incoming products, allowing direct inventory addition or a testing workflow tracking items from pending tests to final condition with working hours analytics.
*   **Dispatch Workflow**: Complete order preparation system with 4-phase non-stop barcode scanning for finding orders, verifying multi-item orders, scanning shipping labels, and confirming dispatch. Displays product photos, eBay links, and tracks scanned quantities.
*   **Packing Workflow**: Multi-worker order fulfillment with barcode verification against Dispatch data, supporting concurrent packing sessions with real-time updates, product photos, and error prevention.

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, and specific workflows. It uses UUID primary keys, automatic timestamps, and foreign key relationships. Product deduplication is by `productId`, and upsert patterns handle bulk inventory updates. The CSV import system is a 4-step wizard with source selection, intelligent column mapping (including bilingual suggestions and auto-detection), intelligent matching and conflict resolution (using Levenshtein distance and handling dimension conflicts), and a final confirmation and commit step. Backend CSV processing is optimized for large files using batch processing and parallel chunk execution. CSV URL imports use POST endpoint with 60-second timeout (AbortController), comprehensive logging (fetch duration, parsing metrics), and URL masking for security.

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