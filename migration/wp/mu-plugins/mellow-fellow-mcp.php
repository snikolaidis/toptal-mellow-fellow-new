<?php
/**
 * Plugin Name: Mellow Fellow - MCP Server
 * Description: Model Context Protocol endpoint exposing read-only WooCommerce tools to
 *              the FlowHunt agent. Replaces the standalone Node service that ran on
 *              Railway (woocommerce-mcp/ in the frontend repo). Same four tools, same
 *              names, same output text, so the agent prompt needs no changes.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MF_MCP_SETTINGS_OPTION', 'mf_mcp_settings' );
define( 'MF_MCP_CHARACTER_LIMIT', 25000 );
define( 'MF_MCP_SERVER_NAME',     'woocommerce-mcp-server' );
define( 'MF_MCP_SERVER_VERSION',  '1.0.0' );

// The Node SDK negotiated the version with the client rather than pinning one, so the
// same is done here: echo back what the client asks for when it is a version we know,
// otherwise answer with the newest we understand.
function mf_mcp_protocol_versions() {
    return array( '2024-11-05', '2025-03-26', '2025-06-18' );
}

/* ── config ──────────────────────────────────────────────────────── */

function mf_mcp_config( $key, $default = '' ) {
    $const = 'MF_MCP_' . strtoupper( $key );
    if ( defined( $const ) ) return (string) constant( $const );

    $env = getenv( $const );
    if ( false !== $env && '' !== $env ) return (string) $env;

    $settings = get_option( MF_MCP_SETTINGS_OPTION, array() );
    if ( is_array( $settings ) && isset( $settings[ $key ] ) && '' !== $settings[ $key ] ) {
        return (string) $settings[ $key ];
    }

    return $default;
}

function mf_mcp_bearer_token() { return mf_mcp_config( 'BEARER_TOKEN' ); }

/* ── formatting, ported from woocommerce-mcp/src/format.ts ───────── */

function mf_mcp_strip_html( $html ) {
    if ( ! $html ) return '';
    $text = preg_replace( '/<[^>]*>/', ' ', (string) $html );
    $text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
    $text = str_replace( "\xC2\xA0", ' ', $text );
    return trim( preg_replace( '/\s+/', ' ', $text ) );
}

function mf_mcp_truncate( $text, $max ) {
    $text = (string) $text;
    if ( mb_strlen( $text ) <= $max ) return $text;
    return trim( mb_substr( $text, 0, $max ) ) . '...';
}

function mf_mcp_money( $amount, $currency ) {
    if ( ! is_numeric( $amount ) ) return trim( $amount . ' ' . $currency );
    return trim( number_format( (float) $amount, 2, '.', '' ) . ' ' . $currency );
}

function mf_mcp_date( $date ) {
    if ( ! $date ) return 'n/a';
    if ( $date instanceof WC_DateTime ) return $date->date( 'Y-m-d' );
    $time = strtotime( (string) $date );
    return $time ? gmdate( 'Y-m-d', $time ) : (string) $date;
}

/* ── summaries ───────────────────────────────────────────────────── */

// WordPress permalinks say /products/{slug} but the headless frontend serves the
// product page at /product/{slug}, so the raw permalink 404s for anyone who clicks it.
function mf_mcp_product_url( WC_Product $product ) {
    return str_replace( '/products/', '/product/', $product->get_permalink() );
}

function mf_mcp_summarize_product( WC_Product $product ) {
    $categories = array();
    foreach ( $product->get_category_ids() as $term_id ) {
        $term = get_term( $term_id, 'product_cat' );
        if ( $term && ! is_wp_error( $term ) ) $categories[] = $term->name;
    }

    $description = $product->get_short_description();
    if ( '' === $description ) $description = $product->get_description();

    return array(
        'id'            => $product->get_id(),
        'name'          => $product->get_name(),
        'url'           => mf_mcp_product_url( $product ),
        'price'         => (string) $product->get_price(),
        'regularPrice'  => (string) $product->get_regular_price(),
        'onSale'        => (bool) $product->is_on_sale(),
        'inStock'       => 'instock' === $product->get_stock_status(),
        'stockStatus'   => $product->get_stock_status(),
        'stockQuantity' => $product->get_stock_quantity(),
        'sku'           => $product->get_sku(),
        'categories'    => $categories,
        'description'   => mf_mcp_truncate( mf_mcp_strip_html( $description ), 400 ),
    );
}

function mf_mcp_summarize_order( WC_Order $order ) {
    $currency = $order->get_currency();

    $ship_parts = array_filter( array(
        trim( $order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name() ),
        $order->get_shipping_address_1(),
        $order->get_shipping_address_2(),
        trim( $order->get_shipping_city() . ' ' . $order->get_shipping_state() . ' ' . $order->get_shipping_postcode() ),
        $order->get_shipping_country(),
    ), function ( $part ) { return '' !== trim( (string) $part ); } );

    $items = array();
    foreach ( $order->get_items() as $item ) {
        $item_product = $item->get_product();
        $items[] = array(
            'name'     => $item->get_name(),
            'quantity' => (int) $item->get_quantity(),
            'total'    => mf_mcp_money( $item->get_total(), $currency ),
            'sku'      => $item_product ? (string) $item_product->get_sku() : '',
        );
    }

    $shipping_method = $order->get_shipping_method();

    return array(
        'id'              => $order->get_id(),
        'number'          => (string) $order->get_order_number(),
        'status'          => $order->get_status(),
        'datePlaced'      => mf_mcp_date( $order->get_date_created() ),
        'datePaid'        => mf_mcp_date( $order->get_date_paid() ),
        'total'           => mf_mcp_money( $order->get_total(), $currency ),
        'currency'        => $currency,
        'paymentMethod'   => $order->get_payment_method_title() ? $order->get_payment_method_title() : 'n/a',
        'shippingMethod'  => $shipping_method ? $shipping_method : 'n/a',
        'customerName'    => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
        'customerEmail'   => (string) $order->get_billing_email(),
        'shipTo'          => implode( ', ', $ship_parts ),
        'items'           => $items,
        'customerNote'    => (string) $order->get_customer_note(),
    );
}

/* ── renderers ───────────────────────────────────────────────────── */

function mf_mcp_render_product( array $p ) {
    $price = $p['onSale'] ? $p['price'] . ' (was ' . $p['regularPrice'] . ')' : $p['price'];
    $stock = $p['inStock'] ? 'in stock' : str_replace( '_', ' ', $p['stockStatus'] );

    $lines = array(
        '## ' . $p['name'] . ' (id ' . $p['id'] . ')',
        '- Price: ' . $price,
        '- Availability: ' . $stock,
    );
    if ( $p['sku'] )                    $lines[] = '- SKU: ' . $p['sku'];
    if ( count( $p['categories'] ) > 0 ) $lines[] = '- Categories: ' . implode( ', ', $p['categories'] );
    if ( $p['description'] )            $lines[] = '- ' . $p['description'];
    $lines[] = '- Link: ' . $p['url'];

    return implode( "\n", $lines );
}

function mf_mcp_render_order( array $o ) {
    $lines = array(
        'Order ' . $o['number'] . ' (id ' . $o['id'] . ')',
        '- Status: ' . $o['status'],
        '- Placed: ' . $o['datePlaced'],
        '- Paid: ' . $o['datePaid'],
        '- Total: ' . $o['total'],
        '- Payment: ' . $o['paymentMethod'],
        '- Shipping method: ' . $o['shippingMethod'],
        '- Customer: ' . $o['customerName'] . ' (' . $o['customerEmail'] . ')',
    );
    if ( $o['shipTo'] ) $lines[] = '- Ship to: ' . $o['shipTo'];
    if ( count( $o['items'] ) > 0 ) {
        $lines[] = '- Items:';
        foreach ( $o['items'] as $item ) {
            $lines[] = '  - ' . $item['quantity'] . ' x ' . $item['name'] . ' = ' . $item['total'];
        }
    }
    if ( $o['customerNote'] ) $lines[] = '- Customer note: ' . $o['customerNote'];

    return implode( "\n", $lines );
}

/* ── tool results ────────────────────────────────────────────────── */

function mf_mcp_text_result( $text, $structured = null ) {
    $result = array( 'content' => array( array( 'type' => 'text', 'text' => mf_mcp_truncate( $text, MF_MCP_CHARACTER_LIMIT ) ) ) );
    if ( null !== $structured ) $result['structuredContent'] = $structured;
    return $result;
}

function mf_mcp_error_result( $message ) {
    return array(
        'content'  => array( array( 'type' => 'text', 'text' => $message ) ),
        'isError'  => true,
    );
}

/* ── tool definitions, kept identical to the Node server ─────────── */

function mf_mcp_tools() {
    return array(
        array(
            'name'        => 'woo_search_products',
            'title'       => 'Search WooCommerce products',
            'description' => 'Search the published product catalog by keyword. Returns name, price, sale price, stock availability, SKU, categories, a short description, and the product link. Use this to answer questions about whether a product exists, its price, or whether it is in stock.',
            'inputSchema' => array(
                'type'       => 'object',
                'properties' => array(
                    'query'         => array( 'type' => 'string',  'minLength' => 1, 'maxLength' => 200, 'description' => "Keyword to search product names and descriptions, e.g. 'gummies' or 'sleep'" ),
                    'limit'         => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'default' => 10, 'description' => 'Maximum number of products to return (default 10)' ),
                    'in_stock_only' => array( 'type' => 'boolean', 'default' => false, 'description' => 'When true, only return products currently in stock' ),
                ),
                'required'   => array( 'query' ),
            ),
            'annotations' => array( 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => true ),
        ),
        array(
            'name'        => 'woo_get_product',
            'title'       => 'Get one WooCommerce product',
            'description' => 'Get full details for a single product by its numeric WooCommerce id. Returns price, sale price, stock availability and quantity, SKU, categories, description, and the product link.',
            'inputSchema' => array(
                'type'       => 'object',
                'properties' => array(
                    'product_id' => array( 'type' => 'integer', 'minimum' => 1, 'description' => 'The numeric WooCommerce product id' ),
                ),
                'required'   => array( 'product_id' ),
            ),
            'annotations' => array( 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => true ),
        ),
        array(
            'name'        => 'woo_find_order',
            'title'       => 'Find an order by number and email',
            'description' => 'Look up a single order using both its order number and the customer email. The order is only returned when the email on the order matches the email provided, so it is safe to use for customer support identity checks. Returns order status, dates, total, payment and shipping method, items, and shipping address. If no order matches both values, it returns a not-found message.',
            'inputSchema' => array(
                'type'       => 'object',
                'properties' => array(
                    'order_number' => array( 'type' => 'string', 'minLength' => 1, 'maxLength' => 60, 'description' => "The order number the customer gives, e.g. '1042'" ),
                    'email'        => array( 'type' => 'string', 'format' => 'email', 'description' => "The customer email that must match the order's billing email" ),
                ),
                'required'   => array( 'order_number', 'email' ),
            ),
            'annotations' => array( 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => true ),
        ),
        array(
            'name'        => 'woo_get_customer_orders',
            'title'       => "List a customer's recent orders",
            'description' => 'List recent orders associated with a customer email, most useful for order-history questions. Returns a short summary of each order: number, status, date, and total. Use woo_find_order to confirm the details of a specific order.',
            'inputSchema' => array(
                'type'       => 'object',
                'properties' => array(
                    'email' => array( 'type' => 'string',  'format' => 'email', 'description' => 'The customer email to search orders for' ),
                    'limit' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 20, 'default' => 5, 'description' => 'Maximum number of orders to return (default 5)' ),
                ),
                'required'   => array( 'email' ),
            ),
            'annotations' => array( 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => true ),
        ),
    );
}

/* ── tool handlers ───────────────────────────────────────────────── */

function mf_mcp_call_tool( $name, array $args ) {
    try {
        switch ( $name ) {
            case 'woo_search_products':      return mf_mcp_tool_search_products( $args );
            case 'woo_get_product':          return mf_mcp_tool_get_product( $args );
            case 'woo_find_order':           return mf_mcp_tool_find_order( $args );
            case 'woo_get_customer_orders':  return mf_mcp_tool_customer_orders( $args );
        }
        return mf_mcp_error_result( 'Error: Unknown tool ' . $name . '.' );
    } catch ( Throwable $e ) {
        return mf_mcp_error_result( 'Error: ' . $e->getMessage() );
    }
}

function mf_mcp_tool_search_products( array $args ) {
    $query = isset( $args['query'] ) ? trim( (string) $args['query'] ) : '';
    if ( '' === $query ) return mf_mcp_error_result( 'Error: query is required.' );

    $limit = isset( $args['limit'] ) ? (int) $args['limit'] : 10;
    $limit = max( 1, min( 50, $limit ) );

    $query_args = array( 's' => $query, 'status' => 'publish', 'limit' => $limit );
    if ( ! empty( $args['in_stock_only'] ) ) $query_args['stock_status'] = 'instock';

    $products = wc_get_products( $query_args );
    if ( empty( $products ) ) {
        return mf_mcp_text_result( "No products found matching '" . $query . "'." );
    }

    $summaries = array_map( 'mf_mcp_summarize_product', $products );
    $text = implode( "\n", array_merge(
        array( 'Found ' . count( $summaries ) . " product(s) matching '" . $query . "':", '' ),
        array_map( 'mf_mcp_render_product', $summaries )
    ) );

    return mf_mcp_text_result( $text, array( 'count' => count( $summaries ), 'products' => $summaries ) );
}

function mf_mcp_tool_get_product( array $args ) {
    $id = isset( $args['product_id'] ) ? (int) $args['product_id'] : 0;
    if ( $id <= 0 ) return mf_mcp_error_result( 'Error: product_id must be a positive number.' );

    $product = wc_get_product( $id );
    if ( ! $product ) return mf_mcp_text_result( 'No product found with id ' . $id . '.' );

    $summary = mf_mcp_summarize_product( $product );
    return mf_mcp_text_result( mf_mcp_render_product( $summary ), array( 'product' => $summary ) );
}

// The email is the query rather than a filter applied afterwards, so an order can only
// come back to a caller who already knows the address it was placed with.
function mf_mcp_tool_find_order( array $args ) {
    $number = isset( $args['order_number'] ) ? trim( (string) $args['order_number'] ) : '';
    $email  = isset( $args['email'] ) ? trim( (string) $args['email'] ) : '';
    if ( '' === $number || '' === $email ) {
        return mf_mcp_error_result( 'Error: order_number and email are both required.' );
    }

    $orders = wc_get_orders( array( 'billing_email' => $email, 'limit' => 20, 'orderby' => 'date', 'order' => 'DESC' ) );
    foreach ( $orders as $order ) {
        if ( (string) $order->get_order_number() === $number || (string) $order->get_id() === $number ) {
            $summary = mf_mcp_summarize_order( $order );
            return mf_mcp_text_result( mf_mcp_render_order( $summary ), array( 'order' => $summary ) );
        }
    }

    return mf_mcp_text_result(
        "No order found that matches order number '" . $number . "' and email '" . $email . "'. Ask the customer to confirm both values."
    );
}

function mf_mcp_tool_customer_orders( array $args ) {
    $email = isset( $args['email'] ) ? trim( (string) $args['email'] ) : '';
    if ( '' === $email ) return mf_mcp_error_result( 'Error: email is required.' );

    $limit = isset( $args['limit'] ) ? (int) $args['limit'] : 5;
    $limit = max( 1, min( 20, $limit ) );

    $orders = wc_get_orders( array( 'billing_email' => $email, 'limit' => $limit, 'orderby' => 'date', 'order' => 'DESC' ) );
    if ( empty( $orders ) ) return mf_mcp_text_result( "No orders found for '" . $email . "'." );

    $summaries = array_map( 'mf_mcp_summarize_order', $orders );
    $rows = array();
    foreach ( $summaries as $o ) {
        $rows[] = '- Order ' . $o['number'] . ' (id ' . $o['id'] . ') - ' . $o['status'] . ' - ' . $o['datePlaced'] . ' - ' . $o['total'];
    }

    $text = implode( "\n", array_merge(
        array( 'Found ' . count( $summaries ) . " order(s) for '" . $email . "':", '' ),
        $rows
    ) );

    return mf_mcp_text_result( $text, array( 'count' => count( $summaries ), 'orders' => $summaries ) );
}

/* ── JSON-RPC ────────────────────────────────────────────────────── */

function mf_mcp_rpc_error( $id, $code, $message ) {
    return array( 'jsonrpc' => '2.0', 'error' => array( 'code' => $code, 'message' => $message ), 'id' => $id );
}

function mf_mcp_rpc_result( $id, $result ) {
    return array( 'jsonrpc' => '2.0', 'result' => $result, 'id' => $id );
}

function mf_mcp_handle_message( array $message ) {
    $id     = array_key_exists( 'id', $message ) ? $message['id'] : null;
    $method = isset( $message['method'] ) ? (string) $message['method'] : '';
    $params = isset( $message['params'] ) && is_array( $message['params'] ) ? $message['params'] : array();

    // Notifications carry no id and get no response at all.
    if ( ! array_key_exists( 'id', $message ) ) return null;

    switch ( $method ) {
        case 'initialize':
            $requested = isset( $params['protocolVersion'] ) ? (string) $params['protocolVersion'] : '';
            $versions  = mf_mcp_protocol_versions();
            $version   = in_array( $requested, $versions, true ) ? $requested : end( $versions );

            return mf_mcp_rpc_result( $id, array(
                'protocolVersion' => $version,
                'capabilities'    => array( 'tools' => new stdClass() ),
                'serverInfo'      => array( 'name' => MF_MCP_SERVER_NAME, 'version' => MF_MCP_SERVER_VERSION ),
            ) );

        case 'ping':
            return mf_mcp_rpc_result( $id, new stdClass() );

        case 'tools/list':
            return mf_mcp_rpc_result( $id, array( 'tools' => mf_mcp_tools() ) );

        case 'tools/call':
            $name = isset( $params['name'] ) ? (string) $params['name'] : '';
            $args = isset( $params['arguments'] ) && is_array( $params['arguments'] ) ? $params['arguments'] : array();
            if ( '' === $name ) return mf_mcp_rpc_error( $id, -32602, 'Missing tool name' );
            return mf_mcp_rpc_result( $id, mf_mcp_call_tool( $name, $args ) );
    }

    return mf_mcp_rpc_error( $id, -32601, 'Method not found: ' . $method );
}

/* ── REST route ──────────────────────────────────────────────────── */

function mf_mcp_unauthorized() {
    return new WP_REST_Response( mf_mcp_rpc_error( null, -32001, 'Unauthorized' ), 401 );
}

function mf_mcp_authorized( WP_REST_Request $request ) {
    $expected = mf_mcp_bearer_token();
    if ( '' === $expected ) return false;

    $header = (string) $request->get_header( 'authorization' );
    $token  = 0 === stripos( $header, 'Bearer ' ) ? trim( substr( $header, 7 ) ) : '';

    return '' !== $token && hash_equals( $expected, $token );
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/mcp', array(
        'methods'             => 'POST',
        'callback'            => 'mf_mcp_handle_request',
        'permission_callback' => '__return_true',
    ) );

    register_rest_route( 'mf/v1', '/mcp', array(
        'methods'             => array( 'GET', 'DELETE' ),
        'callback'            => function () {
            return new WP_REST_Response( mf_mcp_rpc_error( null, -32000, 'Method not allowed. Use POST.' ), 405 );
        },
        'permission_callback' => '__return_true',
    ) );
} );

function mf_mcp_handle_request( WP_REST_Request $request ) {
    if ( ! mf_mcp_authorized( $request ) ) return mf_mcp_unauthorized();

    if ( ! function_exists( 'wc_get_products' ) ) {
        return new WP_REST_Response( mf_mcp_rpc_error( null, -32603, 'WooCommerce is not available' ), 500 );
    }

    $payload = json_decode( $request->get_body(), true );
    if ( null === $payload && JSON_ERROR_NONE !== json_last_error() ) {
        return new WP_REST_Response( mf_mcp_rpc_error( null, -32700, 'Parse error' ), 400 );
    }

    // A JSON-RPC batch arrives as a top-level array.
    $is_batch = is_array( $payload ) && array_key_exists( 0, $payload );
    $messages = $is_batch ? $payload : array( $payload );

    $responses = array();
    foreach ( $messages as $message ) {
        if ( ! is_array( $message ) ) {
            $responses[] = mf_mcp_rpc_error( null, -32600, 'Invalid Request' );
            continue;
        }
        $response = mf_mcp_handle_message( $message );
        if ( null !== $response ) $responses[] = $response;
    }

    // Every message was a notification, so there is nothing to answer with. The spec
    // wants 202 and no body here, not an empty JSON-RPC envelope.
    if ( empty( $responses ) ) return new WP_REST_Response( null, 202 );

    return new WP_REST_Response( $is_batch ? $responses : $responses[0], 200 );
}

/* ── admin UI ────────────────────────────────────────────────────── */

add_action( 'admin_menu', function () {
    add_options_page( 'MCP Server', 'MCP Server', 'manage_options', 'mf-mcp', 'mf_mcp_render_admin_page' );
} );

add_action( 'admin_post_mf_mcp_save_settings', function () {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_mcp_save_settings' );

    $settings = get_option( MF_MCP_SETTINGS_OPTION, array() );
    if ( ! is_array( $settings ) ) $settings = array();

    $token = isset( $_POST['mf_mcp_BEARER_TOKEN'] ) ? sanitize_text_field( wp_unslash( $_POST['mf_mcp_BEARER_TOKEN'] ) ) : '';
    if ( '' !== $token ) $settings['BEARER_TOKEN'] = $token;

    update_option( MF_MCP_SETTINGS_OPTION, $settings, false );

    wp_safe_redirect( add_query_arg( 'mf_mcp_saved', '1', admin_url( 'options-general.php?page=mf-mcp' ) ) );
    exit;
} );

function mf_mcp_render_admin_page() {
    if ( ! current_user_can( 'manage_options' ) ) return;

    $endpoint  = rest_url( 'mf/v1/mcp' );
    $has_token = '' !== mf_mcp_bearer_token();
    ?>
    <div class="wrap">
        <h1>MCP Server</h1>

        <?php if ( isset( $_GET['mf_mcp_saved'] ) ) : ?>
            <div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>
        <?php endif; ?>

        <p>Endpoint for the FlowHunt MCP connector, transport Streamable HTTP:</p>
        <p><code><?php echo esc_html( $endpoint ); ?></code></p>
        <p>Status: <strong><?php echo $has_token ? 'token set' : 'no token, endpoint refuses every request'; ?></strong></p>

        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="mf_mcp_save_settings" />
            <?php wp_nonce_field( 'mf_mcp_save_settings' ); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mf_mcp_BEARER_TOKEN">Bearer token</label></th>
                    <td>
                        <input name="mf_mcp_BEARER_TOKEN" id="mf_mcp_BEARER_TOKEN" type="password" class="regular-text" autocomplete="off" placeholder="<?php echo $has_token ? 'unchanged' : 'paste the token'; ?>" />
                        <p class="description">Leave blank to keep the current token. Must match the token set on the FlowHunt connector.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Save' ); ?>
        </form>
    </div>
    <?php
}
