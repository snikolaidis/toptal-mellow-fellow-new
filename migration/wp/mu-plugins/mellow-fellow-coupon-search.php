<?php
/**
 * Plugin Name: Mellow Fellow - Coupon Search
 * Description: Adds a searchable Select2 dropdown to the admin order edit screen
 *              for applying coupons. Shows both native WooCommerce and Smart Coupon
 *              coupons with type/amount context.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

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

add_action('woocommerce_order_item_add_action_buttons', function ($order) {
    $nonce = wp_create_nonce('mf-coupon-search');
    ?>
    <span class="mf-coupon-search-wrap">
        <select id="mf-coupon-search" data-nonce="<?php echo esc_attr($nonce); ?>"></select>
        <button type="button" class="button" id="mf-apply-coupon">Apply coupon</button>
    </span>
    <?php
});

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
    #woocommerce-order-items .add-coupon { display: none !important; }
    #woocommerce-order-items .mf-coupon-search-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        vertical-align: middle;
    }
    </style>
    <script>
    jQuery(function($) {

        function initCouponSearch() {
            var $el = $('#mf-coupon-search');
            if (!$el.length || $el.hasClass('select2-hidden-accessible')) return;

            var $wrap = $el.closest('.mf-coupon-search-wrap');
            var $refund = $wrap.siblings('.refund-items');
            if ($refund.length) {
                $refund.after($wrap);
            }

            $el.select2({
                placeholder: 'Select a coupon or type to search…',
                allowClear: true,
                width: '350px',
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
        }

        initCouponSearch();

        $('#woocommerce-order-items').on('click', '#mf-apply-coupon', function(e) {
            e.preventDefault();

            var $select  = $('#mf-coupon-search');
            var selected = $select.select2('data');

            if (!selected || !selected.length || !selected[0].id) {
                alert('Please search and select a coupon first.');
                return;
            }

            var coupon = selected[0].id;
            var $btn = $(this);
            $btn.prop('disabled', true).text('Applying…');

            $.post(ajaxurl, {
                action:   'woocommerce_add_coupon_discount',
                order_id: woocommerce_admin_meta_boxes.post_id,
                coupon:   coupon,
                security: woocommerce_admin_meta_boxes.order_item_nonce
            }, function() {
                window.location.reload();
            }).fail(function() {
                alert('Failed to apply coupon. Please try again.');
                $btn.prop('disabled', false).text('Apply coupon');
            });
        });
    });
    </script>
    <?php
});
