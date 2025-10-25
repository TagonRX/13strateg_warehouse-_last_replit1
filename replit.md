# Warehouse Management System

## Overview
This project is a comprehensive warehouse management system designed to streamline inventory tracking, stock management, and operational analytics. It offers role-based access for warehouse workers and administrators. Key capabilities include individual and bulk stock intake with barcode assignment, location-based picking, real-time inventory tracking, warehouse capacity monitoring, daily picking list management, robust worker performance analytics, and a complete event audit log. The business vision is to optimize warehouse operations, reduce manual errors, and provide actionable insights for improved efficiency and cost savings.

## Quick Start

### Локальная разработка
```bash
./start.sh
```
Скрипт автоматически установит зависимости, настроит окружение и запустит приложение. Подробности в `START_RU.txt`.

### Установка на Kubuntu 25.10 сервер (в 5 кликов)
Запустите скрипты по очереди прямо из корня проекта:
```bash
./1-install-node.sh        # Установка Node.js 20
./2-install-postgres.sh    # Установка PostgreSQL
./3-setup-database.sh      # Создание базы данных
./4-install-app.sh         # Установка приложения
./5-run-server.sh          # Запуск сервера (постоянно)
```
Каждый скрипт автоматически выполнит свою часть установки. См. `УСТАНОВКА_KUBUNTU.txt` и `БЫСТРАЯ_УСТАНОВКА.txt`.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript and Vite. It leverages Radix UI primitives and shadcn/ui components ("New York" style, inspired by Carbon Design System) for a consistent and modern look. Typography is based on IBM Plex Sans/Mono, and the color palette is optimized for operational clarity, supporting both light and dark modes. Key UI patterns include role-based sidebar navigation, responsive design, card-based interfaces, real-time toast notifications, and resizable, persistent table columns. Barcode scanning is integrated with universal scanner support (USB scanners, Zebra TC57, and other keyboard-emulating devices) plus mobile camera mode via WebSocket.

**Daily Picking View Compact Layout**: The picking interface features a space-efficient vertical layout with collapsible sections. "Create Picking List" and "Saved Lists" are collapsed by default to maximize screen real estate. When a list is selected, the barcode scanner and progress indicators appear between the collapsed sections and the main picking tasks table. The barcode scanner component uses compact styling (reduced padding, smaller text/icons, h-8 buttons/inputs) to minimize vertical space while maintaining usability. All collapsible sections use conditional rendering for optimal performance.

### Technical Implementations
The backend is built with Node.js and Express.js, using TypeScript and ES Modules. It exposes a RESTful JSON API with session-based and Bearer token authentication, featuring role-based middleware. Drizzle ORM manages PostgreSQL database interactions. The project follows a monorepo structure, sharing TypeScript types and utilizing Zod for schema validation. Real-time communication is handled via a WebSocket server for features like remote scanning and picking list synchronization. A unique auto-location extraction feature derives warehouse locations from SKUs.

### Feature Specifications
*   **Inventory Management**: Supports bulk imports, real-time updates, location consistency checks, and comprehensive price tracking. An archiving system records all inventory changes. Includes automatic condition transfer from testing to stock-in and inventory display, with support for items without barcodes.
*   **Cost Analytics**: Tracks costs through event logs for stock-in/out operations and worker performance.
*   **Picking Lists**: Manages daily picking lists with enhanced CSV/Excel/URL import capabilities, global credentials for multiple sources, persistent selections, and inventory depletion warnings. Manual collection is also supported.
*   **Warehouse Loading View**: Provides dynamic filtering, configuration of warehouse settings for capacity analysis, and validation against managed locations.
*   **User Management**: Includes basic user administration with robust deletion safeguards.
*   **Event Logging**: A comprehensive audit trail captures all warehouse operations, including product testing, stock movements, and user actions, with full product information and cost traceability. Supports CSV export.
*   **Worker Analytics**: Displays key metrics and cost totals for all users, accurately preserving working minutes across condition transitions.
*   **Barcode Scanner Workflow**: Supports dual-mode scanning with clear UI distinction: "Сканер" mode for USB scanners, Zebra TC57, and other keyboard-emulating devices; "Камера" mode for mobile camera scanning via WebSocket through a dedicated "/scanner-mode" page. Features accessible tooltips explaining each mode, dynamic help text, a "zero-leak" routing algorithm for scanner mode, explicit confirmation modals, quantity-based bulk barcode creation, and capacity validation.
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

### Production Deployment - Kubuntu 25.10 (5-click installation)
Simple installation scripts in project root (just click them in order):
1. **1-install-node.sh** - Installs Node.js 20 LTS
2. **2-install-postgres.sh** - Installs PostgreSQL
3. **3-setup-database.sh** - Creates database, user, and .env file
4. **4-install-app.sh** - npm install, build, PM2 setup
5. **5-run-server.sh** - Starts server (runs permanently with auto-restart)

Each script shows next steps. Total time: ~15-20 minutes.

### Alternative: Advanced Deployment
Complete deployment package available in `deployment/` directory:
- **setup.sh** - One-script automated installation for Kubuntu/Ubuntu
- **DEPLOYMENT_GUIDE.md** - Complete deployment instructions (Russian)
- **QUICK_START_RU.md** - Quick start guide (Russian)
- **ecosystem.config.js** - PM2 configuration (cluster mode)
- **nginx.conf** - Nginx reverse proxy with WebSocket support
- **backup.sh/restore.sh** - Database backup and restore scripts

### Documentation
- **0-НАЧНИТЕ_ЗДЕСЬ.txt** - Main entry point (START HERE!)
- **УСТАНОВКА_KUBUNTU.txt** - Kubuntu installation guide
- **БЫСТРАЯ_УСТАНОВКА.txt** - Detailed installation with troubleshooting
- **РАЗВЕРТЫВАНИЕ.txt** - Deployment overview
- **КАК_ЗАГРУЗИТЬ_НА_СЕРВЕР.md** - Step-by-step server upload guide

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