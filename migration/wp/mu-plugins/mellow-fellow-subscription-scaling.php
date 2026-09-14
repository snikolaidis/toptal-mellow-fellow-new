<?php
/* Plugin Name: Mellow Fellow Subscription Scaling */

if (!defined('ABSPATH')) {
    exit;
}

// Pin Action Scheduler to a single concurrent batch. WooCommerce Subscriptions'
// Dedicated processing raises this and starves the storefront of PHP workers
// (both share one pool), so keep it at 1 until we have real subscription volume
// and a sized worker pool. Runs at a very late priority so it wins over WCS.
add_filter('action_scheduler_queue_runner_concurrent_batches', function () {
    return 1;
}, 999999);
