# Warehouse Management System

## Overview

This is a comprehensive warehouse management system designed to streamline inventory tracking, stock operations, and worker analytics. The application supports barcode scanning (USB devices and mobile cameras), CSV imports, picking list management, order fulfillment workflows, and detailed event logging. It features role-based access control with admin and worker roles, and includes specialized workflows for product testing, placement, dispatch, and packing operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript and Vite for development and building
- Radix UI primitives for accessible component foundations
- shadcn/ui component library ("New York" style variant)
- TailwindCSS for styling with custom design tokens
- TanStack React Query for server state management
- React Hook Form with Zod resolvers for form validation

**Design System:**
- Typography: IBM Plex Sans (body text) and IBM Plex Mono (data/codes)
- Color scheme: Supports light and dark modes with HSL-based theming
- Component architecture: Modular components in `client/src/components/`
- Path aliases: `@/` for client source, `@shared/` for shared types, `@assets/` for assets

**Key UI Features:**
- Responsive layout with collapsible sidebar navigation
- Real-time barcode scanner integration (USB and camera-based)
- WebSocket support for remote scanning capabilities
- CSV import wizards with drag-and-drop file upload
- Data tables with inline editing and filtering
- Photo gallery displays for product images

### Backend Architecture

**Technology Stack:**
- Node.js with Express.js framework
- TypeScript with ES Modules
- Drizzle ORM for database operations
- Session-based and Bearer token authentication
- WebSocket server for real-time scanning features
- bcrypt for password hashing

**API Design:**
- RESTful JSON API structure
- Endpoints organized by feature domain
- Role-based middleware (`requireAuth`, `requireAdmin`)
- Request size limits: 50MB for handling large CSV uploads
- Comprehensive error handling with proper HTTP status codes

**Database Layer:**
- Drizzle ORM with PostgreSQL dialect
- Dual database driver support:
  - Neon serverless driver for cloud deployments (Replit)
  - node-postgres (pg) driver for local/standard PostgreSQL installations
- Automatic driver selection based on DATABASE_URL pattern
- UUID primary keys across all tables
- Automatic timestamp management (createdAt, updatedAt)

**Session Management:**
- In-memory session storage with expiry (24 hours)
- Token-based authentication for API requests
- Automatic session cleanup for expired tokens

### Core Features and Workflows

**Inventory Management:**
- Individual and bulk CSV import (up to 2000 rows)
- Intelligent product matching with SKU conflict resolution
- Automatic location extraction from SKU patterns (e.g., A101-F → A101)
- Barcode mapping system supporting multiple barcodes per item
- Price tracking and archiving with 4-day zero-quantity grace period
- Product image storage (up to 24 images per item)
- Inline editing with real-time validation

**Location Management:**
- Active location registry with barcode assignments
- CSV mass-upload for locations
- Location pattern-based warehouse settings (TSKU/MAXQ limits)
- Dynamic filtering and capacity analysis

**Barcode Scanning:**
- Dual-mode scanner support (USB keyboard devices and mobile camera)
- WebSocket-based remote scanning for distributed workflows
- HTTPS requirement detection for camera access
- Auto-focus and zoom controls for mobile scanning
- Real-time barcode validation against inventory

**Picking Lists:**
- Daily picking list creation and management
- Multi-source CSV/Excel import with URL support
- Global credential storage for remote imports
- Automatic source merging and deduplication
- Inventory depletion warnings
- Product photo display in picking interface
- Persistent selection state

**Testing and Placement Workflow:**
- Optional two-phase system for incoming products
- Testing phase with condition assignment (New, Used, Exdisplay, Parts, Faulty)
- Automatic filtering of items under test from placement views
- Barcode editing capability for admins
- Pending placement management with bulk operations

**Dispatch Workflow:**
- Four-phase non-stop barcode scanning process
- Support for non-barcoded items via manual SKU search
- Incremental order creation with status tracking
- Shipping label integration
- Admin-only bulk order deletion with status filtering

**Packing Workflow:**
- Multi-worker order fulfillment system
- Shipping label-based order lookup (priority: label → barcode → SKU)
- Order display format: `orderNumber__shippingLabel`
- Real-time packing statistics per worker

**Bypass Code System:**
- Secure alternative to location barcode scanning
- Admin-configurable bypass code
- Confirmation dialogs for placement operations

**Analytics and Reporting:**
- Worker performance metrics and cost tracking
- Event log with full audit trail (CSV export supported)
- Import history with detailed statistics
- Visual indicators for operation types
- Searchable and filterable event history

**File Synchronization:**
- Scheduled CSV imports with cron expressions
- Automatic archiving of changes
- Import history tracking
- Configurable import field settings

### Database Schema

**Core Tables:**
- `users` - User accounts with role-based access (admin/worker), password management
- `inventory_items` - Main inventory with SKU, location, barcodes, dimensions, pricing, images
- `archived_inventory_items` - Historical inventory data
- `active_locations` - Warehouse location registry
- `pending_placements` - Items awaiting physical placement
- `pending_tests` - Items in testing phase
- `tested_items` - Completed test records
- `faulty_stock` - Defective items tracking

**Workflow Tables:**
- `picking_lists` - Daily picking tasks
- `picking_tasks` - Individual items within picking lists (legacy support)
- `orders` - Order records with status (PENDING, DISPATCHED, PACKED)
- `csv_import_sessions` - Import tracking and validation

**Configuration Tables:**
- `warehouse_settings` - Location-based capacity rules (TSKU, MAXQ)
- `global_settings` - System-wide configuration (bypass codes, etc.)
- `csv_sources` - Registered CSV import sources with credentials
- `bulk_upload_sources` - File-based import configurations
- `scheduler_settings` - Automated import scheduling
- `column_mappings` - CSV field mapping configurations

**Analytics Tables:**
- `event_logs` - Comprehensive audit trail with quantity and cost tracking
- `worker_analytics` - Performance metrics per user
- `import_history` - Complete import operation history
- `import_runs` - Individual import execution records

**Foreign Key Relationships:**
- All operations link to `users` for attribution
- Event logs reference inventory items, orders, and users
- Picking tasks reference picking lists
- Import sessions track source configurations

### Authentication and Authorization

**Authentication:**
- bcrypt password hashing (10 salt rounds)
- Session tokens (32-byte random hex strings)
- 24-hour session expiry
- Password change enforcement flag

**Authorization:**
- Two roles: `admin` and `worker`
- Role-based middleware for route protection
- Admin-only features: user management, SKU conflict resolution, warehouse configuration, bulk deletions, barcode editing, analytics access

### Data Migration and Bootstrap System

**Bootstrap Endpoint:**
- `POST /api/admin/bootstrap` - Creates/resets admin user (login: "admin", password: "admin123")
- No authentication required
- Works in any environment

**Export Endpoint:**
- `GET /api/admin/export-all` - Exports all 22 database tables as JSON
- Admin authentication required
- Passwords remain bcrypt-hashed during export

**Import Endpoint:**
- `POST /api/admin/import-all` - Imports complete database snapshot
- Uses database transactions for atomicity (rollback on any error)
- Validates table presence before import
- Respects foreign key dependencies during deletion and insertion

**Debug Endpoint:**
- `GET /api/debug/status` - Displays migration status and database contents

## External Dependencies

### Database
- **PostgreSQL** - Primary data store (version 14+)
- **Neon Serverless** (@neondatabase/serverless) - Cloud PostgreSQL driver for Replit deployments
- **node-postgres** (pg) - Standard PostgreSQL driver for local installations
- **Drizzle ORM** (drizzle-orm, drizzle-kit) - Type-safe database operations and migrations

### Backend Services
- **Express.js** - Web framework (version 5.x)
- **WebSocket** (ws) - Real-time bidirectional communication for remote scanner
- **bcrypt** - Password hashing and verification
- **node-cron** - Scheduled task execution for automated imports
- **fast-csv** - CSV parsing for imports
- **string-similarity** - Fuzzy matching for product identification

### Frontend Libraries
- **React** (@vitejs/plugin-react) - UI framework
- **Radix UI** - Headless UI component primitives (30+ components including accordion, dialog, dropdown, select, toast, etc.)
- **TanStack React Query** - Server state management and caching
- **React Hook Form** - Form state management
- **Zod** - Schema validation (@hookform/resolvers for integration)
- **class-variance-authority & clsx** - Conditional class name utilities
- **cmdk** - Command palette component

### Development Tools
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety and developer experience
- **TailwindCSS** - Utility-first CSS framework
- **PostCSS & Autoprefixer** - CSS processing
- **ESBuild** - Fast JavaScript bundler for production builds
- **tsx** - TypeScript execution for development

### Replit-Specific Integrations
- **@replit/vite-plugin-runtime-error-modal** - Development error overlay
- **@replit/vite-plugin-cartographer** - Development environment integration
- **@replit/vite-plugin-dev-banner** - Development environment banner

### Additional Utilities
- **nanoid** - Unique ID generation
- **dotenv** - Environment variable management