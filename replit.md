# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## Recent Updates (October 27, 2025)
- ✅ **Cyrillic Location Support**: Fixed regex patterns in WarehouseLoadingView to support both Latin (A-Z) and Cyrillic (А-Я) warehouse location prefixes. Updated 5 critical patterns: availableLetters generation, letter filtering, per-letter limiting, column grouping, and getSettingForLocation. Now locations like "К11-RS" (Cyrillic К) are properly recognized, filtered, grouped, and receive correct TSKU/MAXQ settings.
- ✅ **Camera Zoom Controls**: Added sidebar zoom controls for mobile camera scanning. Features vertical slider with +/- buttons, real-time zoom level indicator (e.g., "2.0x"), automatic capability detection, and dynamic range adjustment (1x-8x). Initial zoom defaults to 2x for better barcode/QR code recognition. Chrome/Android only (Safari not supported).
- ✅ **QR Code Support**: Added full QR code scanning support across all barcode scanning components (BarcodeScanner, RemoteBarcodeScanner, ScannerMode, PlacementView). Html5-qrcode library now auto-detects both barcodes and QR codes.
- ✅ **Case-Insensitive Login**: Login system now accepts credentials regardless of case (e.g., "oleg", "Oleg", "OLEG" all work). Fixed PostgreSQL query to use `LOWER()` function for case-insensitive comparison.
- ✅ **User Management**: Implemented login editing with uniqueness validation, database cleanup (removed test users), LSP error fixes in BarcodeScanner component.
- ✅ **Safe User Deletion**: Fixed foreign key constraint violations when deleting users. System now automatically removes all related data (event logs, analytics, test records) before user deletion.

## Quick Start

### Локальная разработка
```bash
./start.sh
```
Скрипт автоматически установит зависимости, настроит окружение и запустит приложение. Подробности в `START_RU.txt`.

### Установка на Kubuntu 25.10 сервер (ОДНА КОМАНДА!)
Полностью автоматическая установка одним файлом:
```bash
cd ~/Desktop/Main-project-13strategyexperts
chmod +x install-kubuntu.sh
./install-kubuntu.sh
```

Скрипт автоматически выполнит:
- Установку Node.js 20 LTS
- Установку PostgreSQL
- Создание базы данных warehouse_db (пользователь: warehouse_user, пароль: 1234q)
- Установку зависимостей и сборку приложения
- Создание admin пользователя с bcrypt хешем (логин: admin, пароль: admin123)
- Установку PM2 и запуск сервера

**Логин в систему:** admin / admin123 ✅ ПРОТЕСТИРОВАНО!

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite. It leverages Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette is optimized for operational clarity, supporting both light and dark modes. Key UI patterns include role-based sidebar navigation (defaultOpen on desktop), responsive design, card-based interfaces, real-time toast notifications, and resizable, persistent table columns. Barcode and QR code scanning is integrated with universal scanner support (USB scanners, Zebra TC57, and other keyboard-emulating devices) plus mobile camera mode via WebSocket. **Full Format Support**: All scanning modes support both traditional barcodes (CODE_128, EAN, UPC) and QR codes automatically through html5-qrcode library. **Camera Security**: Mobile camera scanning requires HTTPS connection; system displays clear warnings and guidance for HTTP connections with recommendations to use USB scanners as alternative.

**Daily Picking View Compact Layout**: The picking interface features a space-efficient vertical layout with collapsible sections. "Create Picking List" and "Saved Lists" are collapsed by default to maximize screen real estate. When a list is selected, the barcode scanner and progress indicators appear between the collapsed sections and the main picking tasks table. The barcode scanner component uses compact styling (reduced padding, smaller text/icons, h-8 buttons/inputs) to minimize vertical space while maintaining usability. All collapsible sections use conditional rendering for optimal performance.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server for features like remote scanning and picking list synchronization. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports, real-time updates, location consistency checks, and comprehensive price tracking. An archiving system records all inventory changes. Includes automatic condition transfer from testing to stock-in and inventory display, with support for items without barcodes.
*   **Location Management**: Administrators can mass-upload locations and barcodes via CSV files in the Warehouse Loading view. Supports both comma and semicolon delimiters, automatic header detection, and preserves existing barcodes when CSV values are empty. Shows upload statistics (added, updated, errors). Features "Download Template" button with pre-filled example data. Performance optimized with conditional rendering and increased default limit to 200 locations.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials for multiple sources, persistent selections, and inventory depletion warnings. Manual collection is also supported.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations.
*   **User Management**: Includes basic user administration with robust deletion safeguards.
*   **Event Logging**: A comprehensive audit trail captures all warehouse operations, including product testing, stock movements, and user actions, with full product information and cost traceability. Supports CSV export.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, accurately preserving working minutes across condition transitions.
*   **Barcode and QR Code Scanner Workflow**: Supports dual-mode scanning with clear UI distinction: "Сканер" mode for USB scanners, Zebra TC57, and other keyboard-emulating devices; "Камера" mode for mobile camera scanning via WebSocket through a dedicated "/scanner-mode" page. **Full Format Support**: All scanning components (BarcodeScanner, RemoteBarcodeScanner, ScannerMode, PlacementView) support both traditional barcodes (CODE_128, CODE_39, EAN_13, EAN_8, UPC_A, UPC_E) and QR codes automatically. **Camera Zoom Controls**: Mobile camera mode includes sidebar zoom controls with vertical slider, +/- buttons, and real-time zoom indicator. Auto-detects camera capabilities and adjusts range dynamically (typically 1x-8x). Initial zoom defaults to 2x for optimal scanning. Chrome/Android only. Features accessible tooltips explaining each mode, dynamic help text, a "zero-leak" routing algorithm for scanner mode, explicit confirmation modals, quantity-based bulk barcode creation, and capacity validation.
*   **Product Testing Workflow**: A two-phase system for incoming products, tracking items from pending tests to final condition (Used/Exdisplay/New/Parts/Faulty) with working hours analytics for faulty items.

### System Design Choices
The database schema, managed by Drizzle ORM, includes tables for users, inventory, event logs, worker analytics, picking lists, SKU errors, CSV sources, global settings, and a dedicated workflow for product testing (pending_tests, tested_items, faulty_stock). UUID primary keys and automatic timestamps are used, with foreign key relationships for data integrity. Product deduplication is achieved by `productId`, and upsert patterns handle bulk inventory updates.

## Deployment and Startup

### Local/Development Startup
Use the automated startup script:
```bash
./start.sh                # Auto-detect mode
./start.sh development    # Development mode (npm run dev)
./start.sh production     # Production mode (PM2)
```

### Production Deployment - Kubuntu 25.10 (ONE-FILE INSTALLATION)
Complete automated installation with single script:

```bash
cd ~/Desktop/Main-project-13strategyexperts
chmod +x install-kubuntu.sh
./install-kubuntu.sh
```

**What it does:**
1. Installs Node.js 20 LTS
2. Installs PostgreSQL
3. Creates database warehouse_db (user: warehouse_user, password: 1234q)
4. Creates .env file with database connection string
5. Installs npm dependencies
6. Builds application (vite build + esbuild)
7. Syncs database schema (drizzle-kit push)
8. Creates admin user with bcrypt-hashed password
9. Installs PM2 process manager
10. Starts server via PM2 on port 5000

**Total installation time:** ~15-20 minutes  
**Database password:** 1234q (fixed)  
**Admin credentials:** admin / admin123 ✅ TESTED AND WORKING

**Server management:**
```bash
./launch.sh          # Start/restart server
pm2 stop warehouse   # Stop server
pm2 logs warehouse   # View logs
pm2 status           # Check status
```

### Alternative: Advanced Deployment
Complete deployment package available in `deployment/` directory:
- **setup.sh** - One-script automated installation for Kubuntu/Ubuntu
- **DEPLOYMENT_GUIDE.md** - Complete deployment instructions (Russian)
- **QUICK_START_RU.md** - Quick start guide (Russian)
- **ecosystem.config.js** - PM2 configuration (cluster mode)
- **nginx.conf** - Nginx reverse proxy with WebSocket support
- **backup.sh/restore.sh** - Database backup and restore scripts

### Documentation
- **БЫСТРАЯ_УСТАНОВКА_HTTPS.txt** - Quick HTTPS setup guide (3 minutes!) - NEW!
- **НАСТРОЙКА_HTTPS.txt** - Complete HTTPS configuration guide - NEW!
- **ФИНАЛЬНАЯ_ВЕРСИЯ.txt** - Complete deployment guide and file inventory (FINAL VERSION!)
- **0-НАЧНИТЕ_ЗДЕСЬ.txt** - Main entry point (START HERE!)
- **БЫСТРАЯ_УСТАНОВКА_8_ШАГОВ.txt** - Complete installation guide
- **TROUBLESHOOTING_KUBUNTU.txt** - Comprehensive troubleshooting guide
- **REPLIT_VS_SERVER.txt** - Explains differences between Replit dev and Kubuntu server
- **ЧТО_СДЕЛАНО.txt** - Summary of all automation improvements
- **УСТАНОВКА_KUBUNTU.txt** - Kubuntu installation guide
- **РАЗВЕРТЫВАНИЕ.txt** - Deployment overview
- **КАК_ЗАГРУЗИТЬ_НА_СЕРВЕР.md** - Step-by-step server upload guide
- **КАК_ИСПОЛЬЗОВАТЬ_GITHUB.txt** - GitHub workflow guide

### Installation Files
- **install-kubuntu.sh** - Complete one-file automated installation for Kubuntu 25.10
- **setup-https.sh** - Automatic HTTPS setup script (enables phone camera scanning) - NEW!
- **launch.sh** - Server startup script (PM2)
- **create-admin-user.sh** - Manual admin user creation if needed
- **server/create-admin.ts** - Admin creation script with bcrypt hashing

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