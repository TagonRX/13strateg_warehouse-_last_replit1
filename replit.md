# Warehouse Management System

## Overview

This is a comprehensive warehouse management system designed for inventory tracking, barcode scanning, stock management, and worker analytics. The application provides role-based access control with separate interfaces for warehouse workers and administrators.

The system handles:
- Individual and bulk stock intake with barcode assignment
- Location-based picking and stock removal
- Daily picking list management
- Real-time inventory tracking
- Warehouse capacity monitoring with overload warnings
- Worker performance analytics
- Complete event audit logging

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript using Vite as the build tool

**UI Component Library**: Radix UI primitives with shadcn/ui components following the "New York" style variant

**Design System**: Carbon Design System-inspired approach for data-intensive warehouse operations
- IBM Plex Sans for primary typography
- IBM Plex Mono for product IDs, barcodes, and SKUs
- Color palette optimized for operational clarity with success/warning/error states
- Light and dark mode support via CSS variables

**State Management**: 
- TanStack Query (React Query) for server state management
- Local React state for UI interactions
- No global state management library (Redux/Zustand) used

**Routing**: Wouter for lightweight client-side routing

**Styling**: Tailwind CSS with custom design tokens defined in CSS variables

**Key UI Patterns**:
- Sidebar navigation with role-based menu items
- Responsive layout supporting mobile and desktop
- Card-based interface for operational tasks
- Real-time feedback with toast notifications
- Progress indicators for bulk operations

### Backend Architecture

**Runtime**: Node.js with Express.js server

**Language**: TypeScript with ES Modules

**API Design**: RESTful JSON API with endpoint prefix `/api`

**Authentication**:
- Session-based authentication using in-memory session storage
- BCrypt for password hashing (10 salt rounds)
- Bearer token authentication via Authorization header
- Role-based middleware (`requireAuth`, `requireAdmin`)

**Database ORM**: Drizzle ORM for type-safe database queries

**Key Architectural Decisions**:
- Monorepo structure with `client/`, `server/`, and `shared/` directories
- Shared TypeScript types between frontend and backend via `@shared` alias
- Type validation using Zod schemas (via drizzle-zod)
- Development server uses Vite middleware for HMR
- Production build creates static frontend assets and bundled Node.js server

**API Routes**:
- `/api/auth/*` - Authentication endpoints
- `/api/inventory` - Inventory CRUD operations
- `/api/inventory/bulk` - Bulk inventory import
- `/api/warehouse/loading` - Warehouse capacity analysis
- `/api/users` - User management (admin only)
- `/api/logs` - Event logging (admin only)

### Database Schema

**ORM**: Drizzle ORM with PostgreSQL dialect

**Tables**:

1. **users** - Worker and admin accounts
   - Fields: id (UUID), name, login (unique), password (hashed), role, createdAt
   - Roles: 'admin' or 'worker'

2. **inventory_items** - Product inventory tracking
   - Fields: id (UUID), productId, name, sku, location, quantity, barcode, status, createdBy, createdAt, updatedAt
   - Status values: 'IN_STOCK', 'PICKED'
   - SKU and location are typically the same value

3. **event_logs** - Audit trail of all warehouse operations
   - Fields: id (UUID), userId, action, details, createdAt
   - Actions: LOGIN, STOCK_IN, STOCK_OUT, CSV_UPLOAD, etc.

4. **worker_analytics** - Daily performance metrics
   - Fields: id (UUID), userId, date, itemsReceived, itemsPicked, csvErrors

5. **picking_lists** - (Schema defined but implementation may be incomplete)

**Key Design Decisions**:
- UUID primary keys using PostgreSQL's `gen_random_uuid()`
- Timestamps with automatic `defaultNow()` values
- Foreign key relationships to users table
- Product deduplication logic based on `productId` field
- Bulk operations support upsert patterns for inventory updates

### Build and Development

**Development**:
- `npm run dev` - Starts Express server with Vite middleware for HMR
- Hot module replacement for React components
- TypeScript type checking via `tsc --noEmit`

**Production**:
- `npm run build` - Creates optimized frontend bundle and server bundle
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server to `dist/index.js`
- `npm start` - Runs production server

**Database Operations**:
- `npm run db:push` - Push schema changes to database via Drizzle Kit
- Migration files stored in `./migrations`

## External Dependencies

### Database
- **Neon Serverless PostgreSQL** via `@neondatabase/serverless`
- Connection via `DATABASE_URL` environment variable
- WebSocket support for serverless environments

### UI Component Libraries
- **Radix UI** - Headless accessible component primitives (20+ components)
- **shadcn/ui** - Pre-styled Radix components following design system
- **Lucide React** - Icon library
- **cmdk** - Command palette component
- **vaul** - Drawer/modal component

### Form Handling
- **React Hook Form** - Form state management
- **@hookform/resolvers** - Form validation resolvers
- **Zod** - Schema validation

### Data Fetching
- **TanStack Query** - Server state management and caching

### Authentication
- **BCrypt** - Password hashing library

### Styling
- **Tailwind CSS** - Utility-first CSS framework
- **class-variance-authority** - Component variant utilities
- **tailwind-merge** - Tailwind class merging utility

### Session Management
- **connect-pg-simple** - PostgreSQL session store (dependency present but in-memory sessions currently used)

### Date Handling
- **date-fns** - Date utility library

### Build Tools
- **Vite** - Frontend build tool and dev server
- **esbuild** - Backend bundler
- **TypeScript** - Type system
- **Drizzle Kit** - Database migration tool

### Development Tools (Replit-specific)
- `@replit/vite-plugin-runtime-error-modal` - Error overlay
- `@replit/vite-plugin-cartographer` - Code mapping
- `@replit/vite-plugin-dev-banner` - Development banner