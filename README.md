# Faust.js WooCommerce Store with Authorize.net

A headless WooCommerce storefront built with Faust.js, Next.js, and secure Authorize.net payment processing.

## Features

- **Headless WordPress/WooCommerce** - Decoupled architecture for better performance
- **Faust.js Integration** - Official WordPress headless framework by WP Engine
- **Product Catalog** - Browse products with filtering and sorting
- **Shopping Cart** - Add, update, and remove items with real-time updates
- **Secure Checkout** - PCI-compliant payment processing with Authorize.net Accept.js
- **Responsive Design** - Mobile-first CSS with modern styling

## Prerequisites

### WordPress Backend

You'll need a WordPress installation with the following plugins:

1. **WooCommerce** - E-commerce functionality
2. **WPGraphQL** - GraphQL API for WordPress
3. **WooGraphQL** - WooCommerce extension for WPGraphQL
4. **FaustWP** - Headless WordPress plugin by WP Engine

### Authorize.net Account

1. Create an [Authorize.net sandbox account](https://developer.authorize.net/hello_world/sandbox.html) for testing
2. Get your API Login ID, Transaction Key, and Client Key from the Merchant Interface

## Installation

1. **Clone and install dependencies:**

```bash
cd "headless wordpress"
npm install
```

2. **Configure environment variables:**

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```env
# WordPress Configuration
NEXT_PUBLIC_WORDPRESS_URL=http://localhost:8080
FAUST_SECRET_KEY=your-faust-secret-key

# Authorize.net Configuration (Sandbox)
NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID=your-api-login-id
NEXT_PUBLIC_AUTHORIZE_CLIENT_KEY=your-client-key
AUTHORIZE_TRANSACTION_KEY=your-transaction-key
NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT=sandbox
```

3. **Run the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## WordPress Setup

### Required Plugin Configuration

#### WPGraphQL
- Install and activate WPGraphQL
- GraphQL endpoint will be available at `/graphql`

#### WooGraphQL
- Install and activate WooGraphQL
- Enable cart/checkout mutations in settings

#### FaustWP
- Install and activate FaustWP
- Configure the frontend URL in Settings > Faust
- Generate and copy the Secret Key to your `.env.local`

### CORS Configuration

Add this to your WordPress `functions.php` or use a CORS plugin:

```php
add_action('init', function() {
    header('Access-Control-Allow-Origin: http://localhost:3000');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
});
```

## Authorize.net Integration

### Security Model

This implementation follows PCI DSS best practices:

1. **Accept.js Tokenization** - Card data is tokenized client-side using Authorize.net's Accept.js library. Raw card numbers never touch your server.

2. **Server-Side Processing** - The tokenized payment data is sent to your Next.js API route, which communicates with Authorize.net's server-to-server API.

3. **Environment Separation** - Sensitive credentials (Transaction Key) are kept server-side only.

### Testing

Use these test card numbers in sandbox mode:

| Card Type | Number | CVV | Expiry |
|-----------|--------|-----|--------|
| Visa | 4111111111111111 | 123 | Any future date |
| Mastercard | 5424000000000015 | 123 | Any future date |
| Amex | 370000000000002 | 1234 | Any future date |
| Discover | 6011000000000012 | 123 | Any future date |

### Going to Production

1. Create a production Authorize.net account
2. Update environment variables:
   ```env
   NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT=production
   NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID=your-production-api-login-id
   NEXT_PUBLIC_AUTHORIZE_CLIENT_KEY=your-production-client-key
   AUTHORIZE_TRANSACTION_KEY=your-production-transaction-key
   ```
3. Enable SSL/HTTPS on your domain
4. Review Authorize.net's [production checklist](https://developer.authorize.net/hello_world/testing_guide.html)

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── Layout.tsx          # Main layout with header/footer
│   │   ├── ProductCard.tsx     # Product card component
│   │   └── checkout/
│   │       ├── CheckoutForm.tsx    # Billing/shipping form
│   │       └── OrderSummary.tsx    # Order summary sidebar
│   ├── context/
│   │   └── CartContext.tsx     # Shopping cart state management
│   ├── graphql/
│   │   ├── queries/
│   │   │   ├── products.ts     # Product queries
│   │   │   └── cart.ts         # Cart queries and mutations
│   │   └── mutations/
│   │       └── orders.ts       # Order mutations
│   ├── lib/
│   │   ├── apollo-client.ts    # GraphQL client setup
│   │   └── authorize-net.ts    # Accept.js integration
│   ├── pages/
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   ├── index.tsx           # Home page
│   │   ├── shop/index.tsx      # Shop page
│   │   ├── product/[slug].tsx  # Product detail page
│   │   ├── cart.tsx            # Cart page
│   │   ├── checkout.tsx        # Checkout page
│   │   ├── order-confirmation.tsx
│   │   └── api/
│   │       ├── payment/
│   │       │   └── process.ts  # Payment processing endpoint
│   │       └── orders/
│   │           └── create.ts   # Order creation endpoint
│   ├── styles/
│   │   └── globals.css         # Global styles
│   ├── templates/
│   │   └── index.ts            # Faust.js templates
│   └── types/
│       ├── woocommerce.ts      # WooCommerce types
│       └── checkout.ts         # Checkout types
├── .env.local.example
├── faust.config.js
├── next.config.js
├── package.json
└── tsconfig.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Customization

### Styling

Edit `src/styles/globals.css` to customize the look and feel. CSS custom properties are defined in `:root` for easy theming.

### Adding Countries/States

Edit `src/components/checkout/CheckoutForm.tsx` to add more countries and states to the checkout form.

### Extending GraphQL Queries

Add or modify queries in `src/graphql/queries/` to fetch additional WooCommerce data.

## Troubleshooting

### CORS Errors

Ensure your WordPress site allows requests from your Next.js development server. Check that CORS headers are properly configured.

### Cart Not Persisting

WooGraphQL requires session handling. Make sure cookies are being sent with requests (`credentials: 'include'` is set in the Apollo client).

### Payment Failures

1. Verify your Authorize.net credentials are correct
2. Check browser console for Accept.js errors
3. Ensure you're using test card numbers in sandbox mode

## Security Considerations

- Never commit `.env.local` to version control
- Keep `AUTHORIZE_TRANSACTION_KEY` server-side only
- Use HTTPS in production
- Implement rate limiting on API routes for production
- Consider adding CSRF protection for checkout forms

## License

MIT
