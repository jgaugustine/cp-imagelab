# ImageLab Dependencies

This file lists all dependencies for the ImageLab project.

## Runtime Dependencies

### UI Components & Libraries
- `@dnd-kit/core`: ^6.3.1 - Drag and drop toolkit core
- `@dnd-kit/sortable`: ^10.0.0 - Sortable components for drag and drop
- `@dnd-kit/utilities`: ^3.2.2 - Utility functions for drag and drop
- `@hookform/resolvers`: ^3.10.0 - Validation resolvers for react-hook-form
- `@radix-ui/react-accordion`: ^1.2.11 - Accessible accordion component
- `@radix-ui/react-alert-dialog`: ^1.1.14 - Accessible alert dialog component
- `@radix-ui/react-aspect-ratio`: ^1.1.7 - Aspect ratio component
- `@radix-ui/react-avatar`: ^1.1.10 - Avatar component
- `@radix-ui/react-checkbox`: ^1.3.2 - Checkbox component
- `@radix-ui/react-collapsible`: ^1.1.11 - Collapsible component
- `@radix-ui/react-context-menu`: ^2.2.15 - Context menu component
- `@radix-ui/react-dialog`: ^1.1.14 - Dialog component
- `@radix-ui/react-dropdown-menu`: ^2.1.15 - Dropdown menu component
- `@radix-ui/react-hover-card`: ^1.1.14 - Hover card component
- `@radix-ui/react-label`: ^2.1.7 - Label component
- `@radix-ui/react-menubar`: ^1.1.15 - Menubar component
- `@radix-ui/react-navigation-menu`: ^1.2.13 - Navigation menu component
- `@radix-ui/react-popover`: ^1.1.14 - Popover component
- `@radix-ui/react-progress`: ^1.1.7 - Progress indicator component
- `@radix-ui/react-radio-group`: ^1.3.7 - Radio group component
- `@radix-ui/react-scroll-area`: ^1.2.9 - Scrollable area component
- `@radix-ui/react-select`: ^2.2.5 - Select dropdown component
- `@radix-ui/react-separator`: ^1.1.7 - Separator component
- `@radix-ui/react-slider`: ^1.3.5 - Slider component
- `@radix-ui/react-slot`: ^1.2.3 - Slot component
- `@radix-ui/react-switch`: ^1.2.5 - Switch toggle component
- `@radix-ui/react-tabs`: ^1.1.12 - Tabs component
- `@radix-ui/react-toast`: ^1.2.14 - Toast notification component
- `@radix-ui/react-toggle`: ^1.1.9 - Toggle button component
- `@radix-ui/react-toggle-group`: ^1.1.10 - Toggle group component
- `@radix-ui/react-tooltip`: ^1.2.7 - Tooltip component

### Core Framework & Utilities
- `react`: ^18.3.1 - React library
- `react-dom`: ^18.3.1 - React DOM renderer
- `react-router-dom`: ^6.30.1 - React routing library
- `react-hook-form`: ^7.61.1 - Form state management
- `zod`: ^3.25.76 - Schema validation library

### Data & State Management
- `@tanstack/react-query`: ^5.83.0 - Data fetching and state management
- `ml-matrix`: ^6.12.1 - Matrix operations library

### UI Utilities
- `class-variance-authority`: ^0.7.1 - Class variance utility
- `clsx`: ^2.1.1 - Conditional className utility
- `tailwind-merge`: ^2.6.0 - Merge Tailwind CSS classes
- `tailwindcss-animate`: ^1.0.7 - Tailwind CSS animations

### UI Components
- `cmdk`: ^1.1.1 - Command palette component
- `date-fns`: ^3.6.0 - Date utility library
- `embla-carousel-react`: ^8.6.0 - Carousel component
- `input-otp`: ^1.4.2 - OTP input component
- `lucide-react`: ^0.462.0 - Icon library
- `next-themes`: ^0.3.0 - Theme management
- `react-day-picker`: ^8.10.1 - Date picker component
- `react-resizable-panels`: ^2.1.9 - Resizable panel components
- `recharts`: ^2.15.4 - Chart library
- `sonner`: ^1.7.4 - Toast notification library
- `vaul`: ^0.9.9 - Drawer component

## Development Dependencies

### Build Tools
- `vite`: ^7.1.12 - Build tool and dev server
- `@vitejs/plugin-react-swc`: ^3.11.0 - Vite plugin for React with SWC
- `typescript`: ^5.8.3 - TypeScript compiler

### Styling
- `tailwindcss`: ^3.4.17 - Utility-first CSS framework
- `@tailwindcss/typography`: ^0.5.16 - Typography plugin for Tailwind
- `postcss`: ^8.5.6 - CSS post-processor
- `autoprefixer`: ^10.4.21 - CSS autoprefixer

### Linting & Code Quality
- `eslint`: ^9.32.0 - JavaScript/TypeScript linter
- `@eslint/js`: ^9.32.0 - ESLint JavaScript configuration
- `eslint-plugin-react-hooks`: ^5.2.0 - React hooks linting rules
- `eslint-plugin-react-refresh`: ^0.4.20 - React refresh linting
- `typescript-eslint`: ^8.38.0 - TypeScript ESLint integration
- `globals`: ^15.15.0 - Global variables for ESLint
- `lovable-tagger`: ^1.1.11 - Code tagging utility

### Type Definitions
- `@types/node`: ^22.16.5 - TypeScript definitions for Node.js
- `@types/react`: ^18.3.23 - TypeScript definitions for React
- `@types/react-dom`: ^18.3.7 - TypeScript definitions for React DOM

## Installation

To install all dependencies, run:

```bash
npm install
```

Or if using bun:

```bash
bun install
```

## Notes

- All version numbers use the caret (^) prefix, allowing minor and patch updates
- This project uses Vite as the build tool and React with TypeScript
- UI components are primarily from Radix UI and custom components
- Styling is handled by Tailwind CSS

