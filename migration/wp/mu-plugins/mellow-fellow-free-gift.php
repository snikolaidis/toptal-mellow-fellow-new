<?php
/* Plugin Name: Mellow Fellow Free Gift */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The free gift is NOT a coupon. It is a normal cart line tagged with the
 * 'mf_free_gift' cart-item flag, priced to $0 server-side while the cart
 * qualifies, and removed automatically when it stops qualifying.
 *
 * Keeping the gift out of the coupon system is deliberate. As a 100%-off coupon
 * (the previous mf-free-gift-<id> design) it fought WebToffee auto-apply coupons
 * (e.g. foreverfall) inside the Store API's validate_cart_coupons: the gift made
 * its target product a $0 line, which knocked that product out of the other
 * coupon's applicable set, so the other coupon threw "not applicable" (err 109),
 * got stripped, re-fired, and churned for seconds per request — the source of the
 * add-to-cart timeouts and the gift getting evicted. A plain priced line has none
 * of that coupling with the coupon engine.
 *
 * The gift still reaches Acumatica as a discount: checkout.tsx sends the gift
 * line's regularUnitPrice (its catalog price) exactly like a bundle line, so
 * create-order records the line at subtotal=regular / total=$0, and
 * acumatica-orders maps that gap as a line-level discount. See checkout.tsx and
 * mellow-fellow-create-order.php.
 */

/* -------------------------------------------------------------------------
 * Eligibility helpers — shared with the cart-ops add_free_gift action in
 * mellow-fellow-cart-persistence.php. (mu-plugins load alphabetically, so
 * that file is loaded before this one; these are only ever CALLED at request
 * time, by which point every mu-plugin is loaded, so definition order is moot.)
 * ---------------------------------------------------------------------------*/

function mf_free_gift_offers() {
    $offers = function_exists('mf_cart_offers_get') ? mf_cart_offers_get() : array();
    return array(
        'threshold'   => (float) ($offers['free_gift_threshold'] ?? 100),
        'max_price'   => (float) ($offers['free_gift_max_price'] ?? 10),
        'collections' => (string) ($offers['free_gift_collections'] ?? ''),
    );
}

/**
 * Pre-discount subtotal of all NON-gift lines (regular price x qty). The gift's
 * own price never counts toward the threshold that keeps it unlocked, and we use
 * the regular (pre-discount) price so "$100 to unlock" means $100 of catalog
 * value — matching the frontend widget's qualifying-subtotal calculation.
 */
function mf_free_gift_qualifying_subtotal() {
    if (!function_exists('WC') || !WC()->cart) {
        return 0.0;
    }
    $sum = 0.0;
    foreach (WC()->cart->get_cart() as $values) {
        if (!empty($values['mf_free_gift'])) {
            continue;
        }
        $product = isset($values['data']) ? $values['data'] : null;
        if (!$product) {
            continue;
        }
        $regular = (float) $product->get_regular_price();
        if ($regular <= 0) {
            $regular = (float) $product->get_price();
        }
        $sum += $regular * (int) ($values['quantity'] ?? 1);
    }
    return $sum;
}

function mf_free_gift_cart_qualifies() {
    $offers = mf_free_gift_offers();
    return mf_free_gift_qualifying_subtotal() >= $offers['threshold'];
}

/** Is this product allowed to be a free gift (price cap + optional collection)? */
function mf_free_gift_product_eligible($product_id) {
    if (!function_exists('wc_get_product')) {
        return false;
    }
    $product = wc_get_product($product_id);
    if (!$product) {
        return false;
    }
    $offers = mf_free_gift_offers();
    $price  = (float) $product->get_price();
    if ($price <= 0 || $price > $offers['max_price']) {
        return false;
    }
    $slugs = array_filter(array_map('trim', explode(',', $offers['collections'])));
    if (!empty($slugs) && function_exists('mf_get_products_in_collections')) {
        $allowed = mf_get_products_in_collections($slugs);
        if (!in_array($product_id, $allowed)) {
            return false;
        }
    }
    return true;
}

/** Cart key of the current gift line, or '' if none is present. */
function mf_free_gift_current_key() {
    if (!function_exists('WC') || !WC()->cart) {
        return '';
    }
    foreach (WC()->cart->get_cart() as $key => $values) {
        if (!empty($values['mf_free_gift'])) {
            return $key;
        }
    }
    return '';
}

/* -------------------------------------------------------------------------
 * Enforcement
 * ---------------------------------------------------------------------------*/

/**
 * Price the gift line to $0 while the cart qualifies. Idempotent, and hooked
 * after bundle pricing (which runs at priority 10) so the qualifying subtotal
 * reflects the final non-gift line prices.
 */
add_action('woocommerce_before_calculate_totals', function ($cart) {
    if (!$cart || !is_a($cart, 'WC_Cart')) {
        return;
    }
    if (!mf_free_gift_cart_qualifies()) {
        return;
    }
    foreach ($cart->get_cart() as $values) {
        if (empty($values['mf_free_gift'])) {
            continue;
        }
        $product = isset($values['data']) ? $values['data'] : null;
        if ($product) {
            $product->set_price(0);
        }
    }
}, 20, 1);

/**
 * Remove the gift line as soon as the cart stops qualifying. This runs once per
 * request right after the cart is loaded from the session and BEFORE totals are
 * calculated — the sanctioned place to mutate cart contents (removing inside
 * before_calculate_totals would mutate the cart mid-calculation). Server-side
 * enforcement means the gift can never be billed at a non-$0 price: it is either
 * free (qualifying) or absent.
 */
add_action('woocommerce_cart_loaded_from_session', function ($cart) {
    if (!$cart || !is_a($cart, 'WC_Cart')) {
        return;
    }
    if (mf_free_gift_cart_qualifies()) {
        return;
    }
    $key = mf_free_gift_current_key();
    if ($key) {
        $cart->remove_cart_item($key);
    }
});

/**
 * The "Free gift" locked cart chip.
 *
 * Computed directly from the current cart (not from a value stashed during
 * calculate_totals). This matters because the Store API does NOT run
 * calculate_totals on a plain GET /cart, so anything that relied on a
 * before_calculate_totals hook was empty on cart reads. Reading the cart here,
 * inside the Store API data_callback, works on every response — GET included.
 *
 * Returns the chip array, or null when there's no qualifying gift.
 */
function mf_free_gift_chip() {
    if (!function_exists('mf_free_gift_cart_qualifies') || !mf_free_gift_cart_qualifies()) {
        return null;
    }
    $key = mf_free_gift_current_key();
    if (!$key || !function_exists('WC') || !WC()->cart) {
        return null;
    }
    $item    = WC()->cart->get_cart()[$key] ?? null;
    $product = $item && isset($item['data']) ? $item['data'] : null;
    if (!$product) {
        return null;
    }
    $regular = (float) $product->get_regular_price();
    if ($regular <= 0) {
        $regular = (float) $product->get_price();
    }
    return array(
        'code'      => 'mf-free-gift',
        'label'     => 'Free gift',
        'amount'    => $regular,
        'removable' => false,
    );
}

/**
 * Register the mellow-fellow-promotions cart extension HERE (was in the resolver,
 * which is shelved — coupling the gift chip to it is what silently broke the chip).
 * The free-gift plugin now owns it. Any resolver-engine promotions are merged in
 * when that engine is on (via $GLOBALS['mf_active_promotions']), so nothing is lost.
 *
 * The 'items' schema is REQUIRED: a bare {type:array} lets WooCommerce's Store API
 * schema sanitizer null the whole value (an array of objects with no item schema),
 * which is exactly how the chip regressed after a WC update — the namespace was
 * present but its value came back null.
 */
add_action('woocommerce_blocks_loaded', function () {
    if (!function_exists('woocommerce_store_api_register_endpoint_data')) {
        return;
    }
    woocommerce_store_api_register_endpoint_data(array(
        'endpoint'        => 'cart',
        'namespace'       => 'mellow-fellow-promotions',
        'data_callback'   => function () {
            // Wrapped so a throw here can never null the whole namespace (the Store
            // API leaves $data unassigned on a thrown callback → the extension
            // serializes as null, which is exactly the chip regression). On error we
            // log the exact cause and return an empty (valid) array instead.
            try {
                // Resolver-engine promotions (when that engine is enabled), minus any
                // stale gift entry, then the freshly computed gift chip.
                $promotions = ( isset($GLOBALS['mf_active_promotions']) && is_array($GLOBALS['mf_active_promotions']) )
                    ? array_values(array_filter(
                        $GLOBALS['mf_active_promotions'],
                        function ($p) { return !(isset($p['code']) && $p['code'] === 'mf-free-gift'); }
                    ))
                    : array();
                $chip = mf_free_gift_chip();
                if ($chip) {
                    $promotions[] = $chip;
                }
                return array('promotions' => $promotions);
            } catch (\Throwable $e) {
                if (function_exists('wc_get_logger')) {
                    wc_get_logger()->error(
                        'chip data_callback threw: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine(),
                        array('source' => 'mf-free-gift-chip')
                    );
                }
                return array('promotions' => array());
            }
        },
        'schema_callback' => function () {
            // 'context' => ['view'] is REQUIRED at every level. WooCommerce runs the
            // Store API response through rest_filter_response_by_context, which strips
            // any field that doesn't declare the current ('view') context — a field
            // with no context comes back null. (This is what silently broke the chip
            // after a WC update; a working reference is woocommerce-services' notices.)
            return array(
                'promotions' => array(
                    'description' => 'Active cart promotions (locked chips).',
                    'type'        => 'array',
                    'context'     => array('view'),
                    'readonly'    => true,
                    'items'       => array(
                        'type'       => 'object',
                        'context'    => array('view'),
                        'properties' => array(
                            'code'      => array('type' => 'string', 'context' => array('view')),
                            'label'     => array('type' => 'string', 'context' => array('view')),
                            'amount'    => array('type' => 'number', 'context' => array('view')),
                            'removable' => array('type' => 'boolean', 'context' => array('view')),
                        ),
                    ),
                ),
            );
        },
        'schema_type'     => ARRAY_A,
    ));
});

/* -------------------------------------------------------------------------
 * REST: gift product IDs for a set of collections (used by the frontend widget
 * to restrict which products can be offered as a gift). The old POST /free-gift
 * coupon-minting route is gone — the gift is added via the add_free_gift cart-op.
 * ---------------------------------------------------------------------------*/

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/gift-product-ids', array(
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function ($request) {
            $slugs_param = $request->get_param('collections');
            // is_string: this route declares no args, so collections[]=x would fatal.
            if (empty($slugs_param) || !is_string($slugs_param)) {
                return new WP_REST_Response(array('ids' => array()), 200);
            }
            $slugs = array_filter(array_map('trim', explode(',', $slugs_param)));
            if (empty($slugs) || !function_exists('mf_get_products_in_collections')) {
                return new WP_REST_Response(array('ids' => array()), 200);
            }
            $ids = mf_get_products_in_collections($slugs);
            return new WP_REST_Response(array('ids' => array_values($ids)), 200);
        },
    ));
});
