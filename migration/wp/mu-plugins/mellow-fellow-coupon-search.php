<?php
/**
 * Plugin Name: Mellow Fellow - Coupon Search
 * Description: Adds a searchable SelectWoo dropdown to the admin order edit screen
 *              for applying coupons. Shows native WooCommerce and Smart Coupon
 *              coupons (excludes BOGO). Works with WC's built-in Apply coupon
 *              button via window.prompt intercept — zero custom apply logic.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// ─── AJAX search endpoint ─────────────────────────────────────────────────────

add_action('wp_ajax_mf_json_search_coupons', function () {
    check_ajax_referer('mf-coupon-search', 'security');

    if (!current_user_can('edit_shop_orders')) {
        wp_send_json_error('Unauthorized');
    }

    $term = isset($_GET['term']) ? sanitize_text_field(wp_unslash($_GET['term'])) : '';

    global $wpdb;

    if (!empty($term)) {
        $like       = '%' . $wpdb->esc_like($term) . '%';
        $coupon_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_type = 'shop_coupon'
               AND post_status = 'publish'
               AND post_title LIKE %s
             ORDER BY post_title ASC
             LIMIT 100",
            $like
        ));
    } else {
        $coupon_ids = $wpdb->get_col(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_type = 'shop_coupon'
               AND post_status = 'publish'
             ORDER BY post_title ASC
             LIMIT 100"
        );
    }

    $type_labels = [
        'fixed_cart'    => 'Fixed Cart',
        'percent'       => 'Percentage',
        'fixed_product' => 'Fixed Product',
        'free_shipping' => 'Free Shipping',
    ];

    $results = [];

    foreach ($coupon_ids as $id) {
        $coupon = new WC_Coupon((int) $id);

        if ($coupon->get_discount_type() === 'wbte_sc_bogo') {
            continue;
        }

        $expiry = $coupon->get_date_expires();
        if ($expiry && $expiry->getTimestamp() < time()) {
            continue;
        }

        $usage_limit = $coupon->get_usage_limit();
        if ($usage_limit > 0 && $coupon->get_usage_count() >= $usage_limit) {
            continue;
        }

        $code   = $coupon->get_code();
        $type   = $coupon->get_discount_type();
        $amount = $coupon->get_amount();
        $label  = $type_labels[$type] ?? ucfirst(str_replace('_', ' ', $type));

        if ($type === 'percent') {
            $text = sprintf('%s — %s: %s%%', strtoupper($code), $label, $amount);
        } elseif ($type === 'free_shipping') {
            $text = sprintf('%s — %s', strtoupper($code), $label);
        } else {
            $text = sprintf('%s — %s: $%s', strtoupper($code), $label, number_format((float) $amount, 2));
        }

        $results[] = ['id' => $code, 'text' => $text];
    }

    wp_send_json($results);
});

// ─── HTML: inject hidden select into order items area ──────────────────────────

add_action('woocommerce_order_item_add_action_buttons', function ($order) {
    if (!$order->is_editable()) {
        return;
    }

    $nonce = wp_create_nonce('mf-coupon-search');
    ?>
    <select id="mf-coupon-search"
            data-nonce="<?php echo esc_attr($nonce); ?>"
            style="width:1px;height:1px;opacity:0;position:absolute;pointer-events:none;"></select>
    <?php
});

// ─── JS + CSS: SelectWoo init + window.prompt bridge ───────────────────────────

add_action('admin_footer', function () {
    $screen = get_current_screen();
    if (!$screen) {
        return;
    }
    if (!in_array($screen->id, ['shop_order', 'woocommerce_page_wc-orders'], true)) {
        return;
    }
    ?>
    <style>
    .mf-coupon-select-wrap {
        display: inline-block;
        vertical-align: middle;
        margin-right: 4px;
    }
    </style>
    <script>
    jQuery(function($) {

        var selectedCoupon = null;

        function initCouponSearch() {
            var $el = $('#mf-coupon-search');
            if (!$el.length || $el.hasClass('select2-hidden-accessible')) return;

            var $addCouponBtn = $('#woocommerce-order-items button.add-coupon');
            if (!$addCouponBtn.length) return;

            var $wrapper = $addCouponBtn.prev('.mf-coupon-select-wrap');
            if (!$wrapper.length) {
                $wrapper = $('<span class="mf-coupon-select-wrap"></span>');
                $addCouponBtn.before($wrapper);
            }

            $el.detach().appendTo($wrapper).css({
                width: '',
                height: '',
                opacity: '',
                position: '',
                'pointer-events': ''
            });

            $el.selectWoo({
                placeholder: 'Select a coupon…',
                allowClear: true,
                width: '300px',
                ajax: {
                    url: ajaxurl,
                    dataType: 'json',
                    delay: 250,
                    data: function(params) {
                        return {
                            action: 'mf_json_search_coupons',
                            term: params.term || '',
                            security: $el.data('nonce')
                        };
                    },
                    processResults: function(data) {
                        return { results: data };
                    },
                    cache: true
                }
            });

            $el.on('select2:select', function(e) {
                selectedCoupon = e.params.data.id;
            });
            $el.on('select2:clear', function() {
                selectedCoupon = null;
            });

            bindPromptIntercept();
        }

        function bindPromptIntercept() {
            var $btn = $('#woocommerce-order-items button.add-coupon');
            if (!$btn.length || $btn.data('mf-bound')) return;

            $btn.data('mf-bound', true);

            $btn[0].addEventListener('click', function() {
                if (!selectedCoupon) return;

                var code = selectedCoupon;
                var origPrompt = window.prompt;

                window.prompt = function() { return code; };
                setTimeout(function() { window.prompt = origPrompt; }, 0);

                selectedCoupon = null;
                var $sel = $('#mf-coupon-search');
                if ($sel.length) {
                    $sel.val(null).trigger('change');
                }
            }, true);
        }

        initCouponSearch();

        $(document.body).on('wc_order_items_reloaded', function() {
            setTimeout(initCouponSearch, 100);
        });

        $(document).ajaxComplete(function(event, xhr, settings) {
            if (!settings.data || typeof settings.data !== 'string') return;
            if (
                settings.data.indexOf('woocommerce_add_coupon_discount') !== -1 ||
                settings.data.indexOf('woocommerce_remove_order_coupon') !== -1 ||
                settings.data.indexOf('woocommerce_calc_line_taxes') !== -1 ||
                settings.data.indexOf('woocommerce_save_order_items') !== -1
            ) {
                setTimeout(initCouponSearch, 200);
            }
        });
    });
    </script>
    <?php
});
