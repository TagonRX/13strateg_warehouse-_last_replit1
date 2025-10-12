# Design Guidelines: Warehouse Management System

## Design Approach: Carbon Design System

**Rationale**: This is a utility-focused, data-intensive warehouse management application requiring efficiency, clarity, and robust data handling. Carbon Design System (IBM's enterprise design system) is selected for its:
- Excellence in data-heavy, operational interfaces
- Strong form and table components
- Clear information hierarchy for complex workflows
- Professional, functional aesthetic suitable for warehouse operations

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 220 90% 56% (IBM Blue - actions, primary buttons)
- Background: 0 0% 100% (White - main background)
- Surface: 220 14% 96% (Light Gray - cards, panels)
- Border: 220 13% 91% (Subtle borders)
- Text Primary: 220 13% 18% (Dark Gray)
- Text Secondary: 220 9% 46% (Medium Gray)
- Success: 150 60% 45% (Green - successful scans)
- Warning: 45 100% 51% (Amber - SKU errors)
- Error: 0 84% 60% (Red - conflicts, overload)

**Dark Mode:**
- Primary: 220 90% 56% (IBM Blue - consistent)
- Background: 220 13% 18% (Dark Gray)
- Surface: 220 13% 23% (Medium Dark)
- Border: 220 13% 28% (Subtle borders)
- Text Primary: 0 0% 98% (Near White)
- Text Secondary: 220 9% 66% (Light Gray)
- Status colors remain consistent with light mode

### B. Typography

**Font Family**: 
- Primary: 'IBM Plex Sans' (via Google Fonts CDN)
- Monospace: 'IBM Plex Mono' (for product IDs, barcodes, SKUs)

**Type Scale**:
- Headings: font-bold
  - H1: text-3xl (dashboard titles)
  - H2: text-2xl (section headers)
  - H3: text-xl (card titles)
- Body: font-normal
  - Large: text-lg (important data, scan results)
  - Base: text-base (standard content)
  - Small: text-sm (metadata, timestamps)
- Data: font-mono text-sm (IDs, barcodes, SKUs)

### C. Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16** for consistent rhythm
- Micro spacing: p-2, gap-2 (within components)
- Standard spacing: p-4, gap-4 (between elements)
- Section spacing: p-6 or p-8 (cards, panels)
- Page margins: p-8 or p-12 (main content areas)

**Grid Structure**:
- Sidebar Navigation: w-64 (fixed left sidebar with role-based menu)
- Main Content: flex-1 (responsive main area)
- Dashboard Grid: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Data Tables: Full-width with horizontal scroll on mobile

### D. Component Library

**Navigation & Structure**:
- **Sidebar**: Fixed left navigation, w-64, dark surface, role-based menu items
- **Top Bar**: User info, role indicator (Admin/Worker badge), logout
- **Role Badge**: Pill-shaped, primary color for admin, secondary for worker
- **Breadcrumbs**: Show navigation path on complex workflows

**Scanner Interface**:
- **USB Scanner Input**: Auto-focus input field with visual feedback on scan
- **Mobile Scanner**: Fullscreen camera overlay with scan frame indicator
- **Scanner Mode Toggle**: Switch between USB/Mobile with clear icons
- **Scan Feedback**: Toast notifications with product details, success/error colors

**Forms & Data Entry**:
- **Input Fields**: Consistent height (h-10), rounded-md, border-2
- **Labels**: text-sm font-medium mb-2, clear association
- **Barcode Input**: Monospace font, larger text, auto-submit on scan
- **File Upload**: Drag-drop zone with CSV format instructions
- **Validation**: Inline error messages, error color borders

**Data Display**:
- **Tables**: Striped rows, hover states, sticky headers for long lists
- **Product Cards**: Surface color, p-6, display ID, SKU, location, quantity
- **Location Badges**: Color-coded (green <3 SKUs, yellow 3 SKUs, red 4+ SKUs)
- **Status Indicators**: Chips/pills for IN_STOCK, PICKED, PENDING
- **SKU Error Cards**: Warning color, clear conflict explanation

**Analytics & Dashboards**:
- **Stat Cards**: Large numbers, clear labels, trend indicators
- **Charts**: Simple bar/line charts using Chart.js or Recharts
- **Time Filters**: Pill-shaped toggles for Day/Week/Month
- **Worker Stats Table**: Sortable columns, exportable data

**Admin Controls**:
- **User Management Table**: Create/edit users, role assignment
- **Login Creator Form**: Simple fields for name, login, password, role dropdown
- **Test Mode Switcher**: Quick role switching for testing (prominent in dev)

**Interactive Elements**:
- **Primary Buttons**: bg-primary, text-white, h-10, px-6, rounded-md
- **Secondary Buttons**: border-2, bg-transparent, hover:bg-surface
- **Icon Buttons**: p-2, rounded-md, hover:bg-surface
- **Modals**: Centered, max-w-2xl, backdrop blur
- **Progress Bars**: For CSV upload, primary color fill

**CSV Upload Flow**:
- **Upload Zone**: Dashed border, p-12, upload icon, format instructions
- **Progress Indicator**: Linear progress bar with percentage
- **Results Summary**: Success count, duplicate updates, errors
- **Error Table**: Expandable rows showing conflicts

### E. Animations

**Minimal, Functional Animations Only**:
- Scan success: 200ms fade-in for scan result card
- Button press: Scale down (scale-95) on active state
- Modal enter: 150ms fade + slight scale-up
- Loading states: Subtle pulse for skeleton screens
- NO decorative animations, focus on data clarity

## Key Workflows

**Stock-In (Individual)**:
1. Scanner input (USB or mobile camera) with auto-focus
2. Product details form (location, quantity)
3. Confirmation with summary card
4. Success feedback with updated inventory

**Mass CSV Upload**:
1. File drop zone with 5-column format guide
2. Upload progress bar
3. Duplicate detection and update logic display
4. Results table: new entries, updated quantities, errors

**Inventory View**:
1. Searchable, filterable data table
2. Group by SKU/Location toggle
3. Location overload indicators (color-coded)
4. Quick actions: edit, move, pick

**Admin User Management**:
1. User table with search/filter
2. "Add User" button → modal form
3. Simple fields: name, login, password, role dropdown
4. Immediate login capability after creation

## Accessibility & Responsiveness

- High contrast ratios (WCAG AAA for text)
- Focus indicators on all interactive elements (ring-2 ring-primary)
- Keyboard navigation for all workflows
- Scanner inputs accessible via keyboard entry
- Mobile-first responsive design
- Tables collapse to cards on mobile
- Touch-friendly targets (min 44x44px)

## Visual Identity

**Functional, Professional Aesthetic**:
- Clean, uncluttered interface prioritizing data visibility
- Generous whitespace between functional groups
- Clear visual hierarchy through size, weight, and color
- Monospaced fonts for data integrity (IDs, barcodes)
- Role-based UI variations (admin sees additional controls)
- Status-driven color coding (green = good, yellow = warning, red = error)

**No Images Required**: This is a purely functional application without marketing needs. All visuals are data-driven (charts, tables, status indicators).