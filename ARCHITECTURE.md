# Twenty One Cannabis - Application Architecture Guide

> **Purpose**: This document explains the application architecture so you can maintain, debug, and extend the codebase without external help.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Design System](#design-system)
4. [Component Architecture](#component-architecture)
5. [State Management](#state-management)
6. [API Layer](#api-layer)
7. [Styling System](#styling-system)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting Guide](#troubleshooting-guide)

---

## Project Overview

**Stack:**
- **Framework**: Next.js 14 (Pages Router)
- **Headless CMS**: WordPress with WooCommerce
- **GraphQL**: WPGraphQL + WooGraphQL
- **Authentication**: Faust.js
- **Styling**: Tailwind CSS v4
- **Payments**: Authorize.net

**Key URLs:**
- Frontend: `http://localhost:3000` (or `https://localhost:3001` for HTTPS)
- WordPress Admin: Configured in `.env.local` as `NEXT_PUBLIC_WORDPRESS_URL`

---

## Directory Structure

```
src/
├── components/           # React components
│   ├── icons/           # SVG icon components
│   │   └── index.tsx    # TwentyOneLogo, CartIcon, etc.
│   ├── ui/              # Shared UI components (NEW)
│   │   ├── Button.tsx   # Button with variants
│   │   ├── Input.tsx    # Input, Select, Textarea
│   │   ├── Card.tsx     # Card container
│   │   └── index.ts     # Central export
│   ├── checkout/        # Checkout-specific components
│   │   ├── CheckoutForm.tsx
│   │   └── OrderSummary.tsx
│   ├── Layout.tsx       # Main layout (header/footer)
│   └── ProductCard.tsx  # Product display card
│
├── constants/           # Static data (NEW)
│   └── geography.ts     # Countries, US states, CA provinces
│
├── context/             # React Context providers
│   └── CartContext.tsx  # Cart state management
│
├── graphql/             # GraphQL queries and mutations
│   ├── queries/         # GET operations
│   │   ├── products.ts  # Product queries
│   │   ├── cart.ts      # Cart operations
│   │   └── auth.ts      # Authentication
│   └── mutations/       # Write operations
│
├── lib/                 # Utilities and helpers
│   ├── apollo-client.ts # GraphQL client setup
│   ├── authorize-net.ts # Payment tokenization
│   ├── http.ts          # HTTP request utilities (NEW)
│   ├── validation.ts    # Form validation (NEW)
│   └── errors.ts        # Error handling (NEW)
│
├── pages/               # Next.js pages (routes)
│   ├── api/             # API routes (server-side)
│   │   ├── graphql.ts   # GraphQL proxy
│   │   ├── orders/      # Order creation
│   │   └── payment/     # Payment processing
│   ├── account/         # User account pages
│   ├── product/         # Product detail pages
│   ├── shop/            # Shop listing
│   ├── index.tsx        # Homepage
│   ├── cart.tsx         # Cart page
│   ├── checkout.tsx     # Checkout flow
│   └── login.tsx        # Auth pages
│
├── styles/              # CSS files
│   ├── globals.css      # Main stylesheet with design tokens
│   └── design-tokens.css # Token documentation (reference)
│
└── types/               # TypeScript definitions
    ├── checkout.ts      # Checkout types (AddressData, etc.)
    └── woocommerce.ts   # WooCommerce types (Product, Cart, Order)
```

---

## Design System

### Where to Change Colors/Fonts

**All design tokens are in one place:**

```
src/styles/globals.css (lines 18-70)
```

The `@theme` block contains all colors, fonts, and spacing:

```css
@theme {
  /* Change these to update the entire site */
  --color-brand-primary: #000000;      /* Main brand color */
  --color-brand-primary-hover: #333333; /* Hover state */
  --color-surface-primary: #ffffff;     /* White backgrounds */
  --color-surface-secondary: #f5f5f0;   /* Off-white backgrounds */
  --color-text-primary: #000000;        /* Main text */
  --color-text-secondary: #666666;      /* Secondary text */
  --color-border-default: #e0e0e0;      /* Borders */
  /* ... more tokens ... */
}
```

**To change the brand colors for your design pivot:**
1. Open `src/styles/globals.css`
2. Find the `@theme` block (around line 18)
3. Update the `--color-*` values
4. Save - changes apply site-wide

### Design Token Reference

| Token | Purpose | Default |
|-------|---------|---------|
| `--color-brand-primary` | Primary brand color (buttons, links) | `#000000` |
| `--color-brand-primary-hover` | Hover state for brand elements | `#333333` |
| `--color-surface-primary` | White backgrounds | `#ffffff` |
| `--color-surface-secondary` | Off-white/cream backgrounds | `#f5f5f0` |
| `--color-text-primary` | Main body text | `#000000` |
| `--color-text-secondary` | Secondary/muted text | `#666666` |
| `--color-text-muted` | Placeholder, disabled text | `#999999` |
| `--color-border-default` | Default borders | `#e0e0e0` |
| `--color-state-error` | Error messages | `#b91c1c` |
| `--color-state-success` | Success messages | `#15803d` |

### How Tokens Become CSS Classes

Tailwind v4 automatically generates utility classes from tokens:

```css
--color-brand-primary: #000000;
```

Creates these utilities:
- `bg-brand-primary` - Background color
- `text-brand-primary` - Text color
- `border-brand-primary` - Border color

---

## Component Architecture

### Shared UI Components

Location: `src/components/ui/`

```tsx
import { Button, Input, Select, Card } from '@/components/ui';

// Button variants
<Button>Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button loading>Loading...</Button>

// Input with validation
<Input
  label="Email"
  type="email"
  error={errors.email}
  required
/>

// Select dropdown
<Select label="State" error={errors.state}>
  <option value="">Select...</option>
  {states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
</Select>

// Card container
<Card variant="bordered" padding="lg">
  Content here
</Card>
```

### Icon Components

Location: `src/components/icons/index.tsx`

```tsx
import { TwentyOneLogo, CartIcon, UserIcon, SearchIcon } from '@/components/icons';

<TwentyOneLogo />   // Main logo
<CartIcon />        // Shopping bag
<UserIcon />        // Profile
<SearchIcon />      // Magnifying glass
<MenuIcon />        // Hamburger menu
<CloseIcon />       // X close
<InstagramIcon />   // Social
<TwitterIcon />     // Social
```

### Layout Component

Location: `src/components/Layout.tsx`

Wraps all pages with header, footer, and meta tags:

```tsx
<Layout title="Shop" description="Browse our products">
  {/* Page content */}
</Layout>
```

---

## State Management

### Cart Context

Location: `src/context/CartContext.tsx`

**Usage:**

```tsx
import { useCart } from '@/context/CartContext';

function MyComponent() {
  const {
    cart,           // Cart data (items, totals)
    isLoading,      // Loading state
    error,          // Error message
    addToCart,      // Add item
    updateQuantity, // Change quantity
    removeFromCart, // Remove item
    clearCart,      // Empty cart
    refreshCart,    // Refetch from server
  } = useCart();
}
```

**Cart data structure:**

```typescript
interface Cart {
  items: CartItem[];
  subtotal: string;      // "$25.00"
  total: string;         // "$30.00"
  shippingTotal: string; // "$5.00"
  discountTotal: string; // "$0.00"
  isEmpty: boolean;
  itemsCount: number;
}
```

---

## API Layer

### API Routes (Server-Side)

Location: `src/pages/api/`

| Route | Purpose | File |
|-------|---------|------|
| `/api/graphql` | Proxy GraphQL to WordPress | `graphql.ts` |
| `/api/orders/create` | Create WooCommerce order | `orders/create.ts` |
| `/api/payment/process` | Process Authorize.net payment | `payment/process.ts` |

### HTTP Utility

Location: `src/lib/http.ts`

Shared HTTP functions for API routes:

```typescript
import { makeHttpRequest, makeHttpGetRequest, extractWcSessionToken } from '@/lib/http';

// POST request
const response = await makeHttpRequest({
  url: 'https://wordpress.example.com/graphql',
  body: JSON.stringify({ query, variables }),
  cookies: req.headers.cookie,
  wcSessionToken: extractWcSessionToken(cookies),
});

// GET request
const response = await makeHttpGetRequest(url, cookies);
```

**Production TODOs in http.ts:**

The file contains `// TODO: PRODUCTION` comments marking local development workarounds that should be removed in production:

1. `rejectUnauthorized: false` - Self-signed cert workaround
2. `family: 4` - IPv4 forcing for `.local` domains
3. `WP_INTERNAL_URL` fallback - Local by Flywheel workaround

Search for `TODO: PRODUCTION` to find all cleanup points.

---

## Styling System

### CSS File Structure

**Main file:** `src/styles/globals.css`

Structure:
1. **Imports** (lines 1-2): Tailwind and Google Fonts
2. **@theme block** (lines 18-70): Design tokens
3. **@layer base** (lines 72-123): Base styles and focus rings
4. **@layer components** (lines 125+): Component classes

### CSS Classes vs Tailwind Utilities

**Use CSS classes for:**
- Complex, multi-property styles
- Styles that need hover/focus/active states
- Responsive patterns

**Use Tailwind utilities for:**
- One-off adjustments
- Spacing tweaks
- Simple color/size changes

### Key CSS Classes

| Class | Purpose | File Location |
|-------|---------|---------------|
| `.btn-primary` | Black button | globals.css:333 |
| `.btn-outline` | Transparent with border | globals.css:382 |
| `.form-input` | Text inputs | globals.css:636 |
| `.form-label` | Input labels | globals.css:626 |
| `.nav-link` | Navigation links | globals.css:173 |
| `.icon-btn` | Icon buttons | globals.css:230 |
| `.error-alert` | Error messages | globals.css:709 |
| `.success-alert` | Success messages | globals.css:718 |

---

## Common Tasks

### Adding a New Color

1. Open `src/styles/globals.css`
2. Add to `@theme` block:
   ```css
   --color-your-color: #hexvalue;
   ```
3. Use in components: `className="bg-your-color text-your-color"`

### Adding a New Page

1. Create file in `src/pages/your-page.tsx`
2. Use Layout wrapper:
   ```tsx
   import Layout from '@/components/Layout';

   export default function YourPage() {
     return (
       <Layout title="Your Page">
         {/* Content */}
       </Layout>
     );
   }
   ```

### Adding Form Validation

Location: `src/lib/validation.ts`

```typescript
import { validateEmail, validateAddress, isValid } from '@/lib/validation';

// Validate email
if (!validateEmail(email)) {
  errors.email = 'Invalid email';
}

// Validate address
const addressErrors = validateAddress(billing, 'billing', { requireEmail: true });
```

### Handling Errors

Location: `src/lib/errors.ts`

```typescript
import { CartError, ErrorCode, getUserMessage, logError } from '@/lib/errors';

try {
  await addToCart(item);
} catch (err) {
  logError('MyComponent.addToCart', err);
  const message = getUserMessage(err); // User-friendly message
  setError(message);
}
```

---

## Troubleshooting Guide

### Common Issues

#### "Cart not persisting"
**Location:** `src/pages/api/graphql.ts`

Check:
1. `wc_session_token` cookie is being set
2. Console logs show "WC Session Token: present"
3. WordPress has WooGraphQL session handling enabled

#### "Payment failing"
**Location:** `src/lib/authorize-net.ts`, `src/pages/api/payment/process.ts`

Check:
1. Authorize.net credentials in `.env.local`
2. Console logs in payment API route
3. Browser network tab for Accept.js loading

#### "GraphQL errors"
**Location:** `src/pages/api/graphql.ts`

Check:
1. WordPress GraphQL endpoint is accessible
2. `NEXT_PUBLIC_WORDPRESS_URL` is correct
3. Console logs in graphql.ts for request/response

#### "Styles not applying"
**Location:** `src/styles/globals.css`

Check:
1. CSS variable is defined in `@theme` block
2. Class is in `@layer components` (not outside)
3. Tailwind is processing the file (check build output)

### Debug Logging

API routes have built-in logging:
- `console.log` for info
- `console.error` for errors
- Check terminal where `npm run dev` is running

### Finding Things

**Search patterns:**

| Looking for... | Search term |
|----------------|-------------|
| Color definitions | `--color-` |
| Production cleanup | `TODO: PRODUCTION` |
| GraphQL queries | `gql\`` |
| API routes | `export default async function handler` |
| React contexts | `createContext` |

---

## File Quick Reference

| What you need | Where to look |
|---------------|---------------|
| Change colors | `src/styles/globals.css` lines 18-70 |
| Change fonts | `src/styles/globals.css` line 68-69 |
| Add UI component | `src/components/ui/` |
| Add icon | `src/components/icons/index.tsx` |
| Cart logic | `src/context/CartContext.tsx` |
| Form validation | `src/lib/validation.ts` |
| Error handling | `src/lib/errors.ts` |
| HTTP utilities | `src/lib/http.ts` |
| API proxy | `src/pages/api/graphql.ts` |
| Order creation | `src/pages/api/orders/create.ts` |
| Payment processing | `src/pages/api/payment/process.ts` |
| Type definitions | `src/types/` |
| Constants (states, countries) | `src/constants/geography.ts` |

---

## Production Deployment Notes

Before deploying to production, search for and address:

1. **`TODO: PRODUCTION`** - Remove local development workarounds in `src/lib/http.ts`
2. **Environment variables** - Ensure all `.env` vars are set in production
3. **HTTPS** - Remove self-signed certificate bypass
4. **Console logs** - Consider reducing verbose logging

---

*Last updated: January 2025*
