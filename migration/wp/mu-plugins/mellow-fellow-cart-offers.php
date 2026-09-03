<?php
/* Plugin Name: Mellow Fellow Cart Offers */

if (!defined('ABSPATH')) {
    exit;
}

function mf_cart_offers_defaults() {
    return array(
        'free_shipping_threshold' => 80,
        'free_gift_enabled' => 0,
        'free_gift_threshold' => 100,
        'free_gift_max_price' => 10,
        'free_gift_mode' => 'select',
        'free_gift_collections' => '',
    );
}

function mf_cart_offers_get() {
    $saved = get_option('mf_cart_offers', array());
    return array_merge(mf_cart_offers_defaults(), is_array($saved) ? $saved : array());
}

add_action('admin_menu', function () {
    add_options_page(
        'Cart Offers',
        'Cart Offers',
        'manage_options',
        'mf-cart-offers',
        'mf_cart_offers_render_page'
    );
});

add_action('admin_init', function () {
    register_setting('mf_cart_offers_group', 'mf_cart_offers', array(
        'sanitize_callback' => 'mf_cart_offers_sanitize',
    ));
});

function mf_cart_offers_sanitize($input) {
    return array(
        'free_shipping_threshold' => max(0, (float) ($input['free_shipping_threshold'] ?? 80)),
        'free_gift_enabled' => empty($input['free_gift_enabled']) ? 0 : 1,
        'free_gift_threshold' => max(0, (float) ($input['free_gift_threshold'] ?? 100)),
        'free_gift_max_price' => max(0, (float) ($input['free_gift_max_price'] ?? 10)),
        'free_gift_mode' => in_array(($input['free_gift_mode'] ?? 'select'), array('select', 'automatic'), true)
            ? $input['free_gift_mode'] : 'select',
        'free_gift_collections' => sanitize_text_field($input['free_gift_collections'] ?? ''),
    );
}

function mf_cart_offers_render_page() {
    $o = mf_cart_offers_get();
    ?>
    <div class="wrap">
        <h1>Cart Offers</h1>
        <p>Controls the cart drawer tiered progress bar and the Free Gift with Purchase widget on the headless storefront.</p>
        <form method="post" action="options.php">
            <?php settings_fields('mf_cart_offers_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mf_fst">Free shipping threshold ($)</label></th>
                    <td><input name="mf_cart_offers[free_shipping_threshold]" id="mf_fst" type="number" step="0.01" min="0" value="<?php echo esc_attr($o['free_shipping_threshold']); ?>" /></td>
                </tr>
                <tr>
                    <th scope="row">Free Gift with Purchase</th>
                    <td><label><input name="mf_cart_offers[free_gift_enabled]" type="checkbox" value="1" <?php checked($o['free_gift_enabled'], 1); ?> /> Enabled</label></td>
                </tr>
                <tr>
                    <th scope="row"><label for="mf_fgt">Free gift threshold ($)</label></th>
                    <td><input name="mf_cart_offers[free_gift_threshold]" id="mf_fgt" type="number" step="0.01" min="0" value="<?php echo esc_attr($o['free_gift_threshold']); ?>" />
                    <p class="description">Cart subtotal at which the free gift unlocks.</p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="mf_fgmp">Free gift max price ($)</label></th>
                    <td><input name="mf_cart_offers[free_gift_max_price]" id="mf_fgmp" type="number" step="0.01" min="0" value="<?php echo esc_attr($o['free_gift_max_price']); ?>" />
                    <p class="description">Only products under this price are offered as free gifts.</p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="mf_fgmode">Free gift mode</label></th>
                    <td><select name="mf_cart_offers[free_gift_mode]" id="mf_fgmode">
                        <option value="select" <?php selected($o['free_gift_mode'], 'select'); ?>>Customer picks one</option>
                        <option value="automatic" <?php selected($o['free_gift_mode'], 'automatic'); ?>>Automatic</option>
                    </select></td>
                </tr>
                <tr>
                    <th scope="row"><label for="mf_fgcoll">Free gift collections</label></th>
                    <td>
                        <input name="mf_cart_offers[free_gift_collections]" id="mf_fgcoll" type="text" class="regular-text" value="<?php echo esc_attr($o['free_gift_collections']); ?>" />
                        <p class="description">Comma-separated collection slugs. Only products from these collections will be offered as free gifts. Leave empty for all eligible products.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/cart-offers', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function () {
            $o = mf_cart_offers_get();
            $tiers = array(
                array('amount' => (float) $o['free_shipping_threshold'], 'label' => 'Free Shipping'),
            );
            if ($o['free_gift_enabled']) {
                $tiers[] = array('amount' => (float) $o['free_gift_threshold'], 'label' => 'Free Gift');
            }
            usort($tiers, function ($a, $b) { return $a['amount'] <=> $b['amount']; });
            return new WP_REST_Response(array(
                'freeShippingThreshold' => (float) $o['free_shipping_threshold'],
                'freeGift' => array(
                    'enabled' => (bool) $o['free_gift_enabled'],
                    'threshold' => (float) $o['free_gift_threshold'],
                    'maxGiftPrice' => (float) $o['free_gift_max_price'],
                    'mode' => $o['free_gift_mode'],
                    'collections' => array_filter(array_map('trim', explode(',', $o['free_gift_collections'] ?? ''))),
                ),
                'tiers' => $tiers,
            ), 200);
        },
    ));
});
