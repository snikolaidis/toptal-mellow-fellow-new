<?php
/**
 * Plugin Name: Mellow Fellow - Acumatica Inventory Sync
 * Description: Mirrors Acumatica Available inventory into WooCommerce stock (inventory
 *              ONLY — never price). Acumatica is the source of truth; WooCommerce is a
 *              read-only mirror used solely for the in-stock gate + display. A delta
 *              engine (high-watermark on LastModifiedOn) runs every 15 minutes, and a
 *              targeted re-sync fires within a minute of each order push. All Acumatica
 *              reads use the OData GI feed (basic auth) — NEVER the pooled contract-REST
 *              session/seat. WooCommerce is blocked from ever changing stock itself.
 * Version: 1.0.0
 * Depends: mellow-fellow-acumatica-core.php
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MF_ACU_INVENTORY_HOOK',       'mf_acu_inventory_sync' );
define( 'MF_ACU_RESYNC_HOOK',          'mf_acu_resync_skus' );
define( 'MF_ACU_INVENTORY_WATERMARK',  'mf_acu_inventory_watermark' );
define( 'MF_ACU_INVENTORY_GI',         'MF InventoryPricing API' );
// Max SKUs per batched OData query (keeps the $filter OR-chain / URL length sane).
define( 'MF_ACU_ODATA_BATCH',          25 );
// The OData GI returns one row per warehouse. Only these count toward the single
// WooCommerce stock number; AB (and any other) warehouse is stock we do NOT sell online.
// Also the set of warehouses dynamic SO routing (order push) is allowed to choose from.
define( 'MF_ACU_SELLABLE_WAREHOUSES',  'MFNC,MFFL,MFTN' );

/**
 * Warehouse codes whose Available inventory is sellable online. Filterable so the set
 * can change without a code edit.
 *
 * @return string[]
 */
function mf_acu_sellable_warehouses() {
    $codes = array_filter( array_map( 'trim', explode( ',', MF_ACU_SELLABLE_WAREHOUSES ) ) );
    /** @var string[] $codes */
    $codes = apply_filters( 'mf_acu_sellable_warehouses', $codes );
    return is_array( $codes ) ? $codes : array();
}

/* ── OData helper (basic auth) ───────────────────────────────────────
 * The core plugin's mf_acu_rest_request() speaks cookie/contract-REST against
 * /entity/... and consumes the single pooled Acumatica seat. Inventory must NOT use it.
 * The OData GI feed uses stateless HTTP basic auth against a different root
 * (/OData/<company>/), so it adds no seat/login-lock load. It still reuses the shared
 * config (creds), circuit breaker, and logging. */

function mf_acu_odata_url() {
    // Default derives the OData root from the same base host as the contract REST API,
    // so a single BASE_URL config drives both. Company segment defaults to ARVIDA.
    $default = mf_acu_base_url() . '/OData/' . mf_acu_config( 'ODATA_COMPANY', 'ARVIDA' );
    return rtrim( mf_acu_config( 'ODATA_URL', $default ), '/' );
}

/**
 * GET an Acumatica OData Generic Inquiry and return its `value` array of rows.
 *
 * @param string $gi_name      Human GI name, e.g. "MF InventoryPricing API".
 * @param array  $query_params OData params, e.g. ['$filter' => "...", '$select' => "..."].
 * @return array|WP_Error      Array of row objects (assoc arrays), or WP_Error.
 */
function mf_acu_odata_get( $gi_name, $query_params = array() ) {
    $user = mf_acu_username();
    $pass = mf_acu_password();
    if ( '' === $user || '' === $pass ) {
        return new WP_Error( 'mf_acu_odata_config', 'Acumatica credentials are not configured' );
    }

    $url = mf_acu_odata_url() . '/' . rawurlencode( $gi_name );

    // Build the query string by hand so the OData `$filter`/`$select`/`$orderby`/`$top`
    // KEYS stay literal (http_build_query would percent-encode the leading `$`), while
    // the VALUES are properly encoded.
    if ( ! empty( $query_params ) ) {
        $pairs = array();
        foreach ( $query_params as $k => $v ) {
            $pairs[] = $k . '=' . rawurlencode( (string) $v );
        }
        $url .= '?' . implode( '&', $pairs );
    }

    $response = wp_remote_get( $url, array(
        'timeout' => 30,
        'headers' => array(
            'Authorization' => 'Basic ' . base64_encode( $user . ':' . $pass ),
            'Accept'        => 'application/json',
        ),
    ) );

    if ( is_wp_error( $response ) ) {
        return $response;
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    $raw  = wp_remote_retrieve_body( $response );

    if ( $code < 200 || $code >= 300 ) {
        // Keep logs terse — do not echo the URL or full body.
        return new WP_Error(
            'mf_acu_odata_http',
            sprintf( 'OData GI "%s" returned HTTP %d: %s', $gi_name, $code, substr( (string) $raw, 0, 300 ) ),
            array( 'status' => $code )
        );
    }

    $data = json_decode( $raw, true );
    if ( ! is_array( $data ) || ! isset( $data['value'] ) || ! is_array( $data['value'] ) ) {
        return new WP_Error( 'mf_acu_odata_shape', sprintf( 'OData GI "%s" returned an unexpected payload', $gi_name ) );
    }

    return $data['value'];
}

/* ── per-SKU availability (shared by the sync AND order-push routing) ── */

/**
 * Batched per-warehouse Available for a set of SKUs, in ONE OData call per chunk of
 * MF_ACU_ODATA_BATCH SKUs. Returns map[ sku ][ warehouse ] = qty (float). Negatives are
 * preserved here — routing needs the raw picture; the Woo stock number clamps separately.
 *
 * Reading QtyAvailable directly by InventoryID (rather than via the LastModifiedOn delta)
 * is what makes the post-order re-sync reliable: an SO allocation drops QtyAvailable
 * without necessarily bumping the item's LastModifiedOn, so only a direct read is certain
 * to catch it.
 *
 * @param string[] $skus
 * @return array<string,array<string,float>>|WP_Error
 */
function mf_acu_skus_warehouse_availability( $skus ) {
    $skus = array_values( array_unique( array_filter( array_map( 'trim', (array) $skus ) ) ) );
    if ( empty( $skus ) ) {
        return array();
    }

    $out = array();
    foreach ( array_chunk( $skus, MF_ACU_ODATA_BATCH ) as $chunk ) {
        $clauses = array();
        foreach ( $chunk as $sku ) {
            $lit       = str_replace( "'", "''", $sku ); // escape single quotes for OData literal
            $clauses[] = "InventoryID eq '{$lit}'";
        }
        $rows = mf_acu_odata_get( MF_ACU_INVENTORY_GI, array(
            '$filter' => implode( ' or ', $clauses ),
            '$select' => 'InventoryID,Warehouse,QtyAvailable',
        ) );
        if ( is_wp_error( $rows ) ) {
            return $rows;
        }
        foreach ( $rows as $row ) {
            $sku = isset( $row['InventoryID'] ) ? trim( (string) $row['InventoryID'] ) : '';
            $wh  = isset( $row['Warehouse'] ) ? trim( (string) $row['Warehouse'] ) : '';
            if ( '' === $sku || '' === $wh ) {
                continue;
            }
            $qty = isset( $row['QtyAvailable'] ) ? (float) $row['QtyAvailable'] : 0.0;
            if ( ! isset( $out[ $sku ] ) ) {
                $out[ $sku ] = array();
            }
            // Sum in case the GI returns multiple rows per (SKU, warehouse) (subitems).
            $out[ $sku ][ $wh ] = ( isset( $out[ $sku ][ $wh ] ) ? $out[ $sku ][ $wh ] : 0.0 ) + $qty;
        }
    }
    return $out;
}

/**
 * Raw per-warehouse Available for a single SKU (map warehouse => qty). Thin wrapper over
 * the batch reader — kept for the order-push routing fallback path.
 *
 * @param string $sku
 * @return array<string,float>|WP_Error
 */
function mf_acu_sku_warehouse_availability( $sku ) {
    $map = mf_acu_skus_warehouse_availability( array( $sku ) );
    if ( is_wp_error( $map ) ) {
        return $map;
    }
    $sku = trim( (string) $sku );
    return isset( $map[ $sku ] ) ? $map[ $sku ] : array();
}

/**
 * The single WooCommerce stock number from a per-warehouse availability map: sum of
 * Available across the sellable warehouses only, clamped to >= 0.
 *
 * @param array<string,float> $wh_map warehouse => qty
 * @return int
 */
function mf_acu_sellable_qty_from_map( $wh_map ) {
    $sum = 0.0;
    foreach ( mf_acu_sellable_warehouses() as $wh ) {
        if ( isset( $wh_map[ $wh ] ) ) {
            $sum += (float) $wh_map[ $wh ];
        }
    }
    return (int) max( 0, (int) floor( $sum ) );
}

/* ── write stock into WooCommerce ────────────────────────────────────
 * Absolute set (idempotent), update-only (never creates a product). Draft/unpublished
 * products are updated too — SKU lookup ignores post status. */

/**
 * Apply one SKU's sellable qty (from a pre-fetched warehouse map) to its Woo product.
 *
 * @param string              $sku
 * @param array<string,float> $wh_map warehouse => qty
 * @return bool True if a product was found and updated.
 */
function mf_acu_apply_stock_from_map( $sku, $wh_map ) {
    $sku = trim( (string) $sku );
    if ( '' === $sku || ! function_exists( 'wc_get_product_id_by_sku' ) ) {
        return false;
    }
    $product_id = wc_get_product_id_by_sku( $sku );
    if ( ! $product_id ) {
        return false; // update-only: no product with this SKU
    }
    $product = wc_get_product( $product_id );
    if ( ! $product ) {
        return false;
    }

    $qty = mf_acu_sellable_qty_from_map( is_array( $wh_map ) ? $wh_map : array() );

    $product->set_manage_stock( true );
    $product->set_stock_quantity( $qty );
    $product->set_stock_status( $qty > 0 ? 'instock' : 'outofstock' );
    $product->save();

    return true;
}

/**
 * Batched: read a set of SKUs in one OData call (per chunk) and write each to Woo.
 *
 * @param string[] $skus
 * @return int Number of products updated (or -1 on read error).
 */
function mf_acu_apply_stock_batch( $skus ) {
    $skus = array_values( array_unique( array_filter( array_map( 'trim', (array) $skus ) ) ) );
    if ( empty( $skus ) ) {
        return 0;
    }
    $map = mf_acu_skus_warehouse_availability( $skus );
    if ( is_wp_error( $map ) ) {
        mf_acu_log( 'Batched stock read failed: ' . $map->get_error_message(), 'inventory' );
        return -1;
    }
    $updated = 0;
    foreach ( $skus as $sku ) {
        // A SKU absent from the map has no rows in the sellable warehouses → 0 stock.
        $wh_map = isset( $map[ $sku ] ) ? $map[ $sku ] : array();
        if ( mf_acu_apply_stock_from_map( $sku, $wh_map ) ) {
            $updated++;
        }
    }
    return $updated;
}

/* ── delta engine (recurring, every 15 min) ──────────────────────────
 * Mirrors the order-push sweep scheduling: same group, idempotent guard. */

add_action( 'init', function () {
    if ( function_exists( 'as_has_scheduled_action' ) && ! as_has_scheduled_action( MF_ACU_INVENTORY_HOOK ) ) {
        as_schedule_recurring_action( time() + 300, 15 * MINUTE_IN_SECONDS, MF_ACU_INVENTORY_HOOK, array(), 'mellow-fellow-acumatica' );
    }
} );

add_action( MF_ACU_INVENTORY_HOOK, 'mf_acu_inventory_sync' );

function mf_acu_inventory_sync() {
    if ( ! function_exists( 'mf_acu_environment_ok' ) || ! mf_acu_environment_ok() ) {
        return;
    }
    if ( mf_acu_circuit_is_open() ) {
        mf_acu_log( 'Inventory sync skipped — circuit breaker open', 'inventory' );
        return;
    }

    $watermark = (string) get_option( MF_ACU_INVENTORY_WATERMARK, '' );

    // Delta pull: which SKUs changed since the watermark (LastModifiedOn). On the very
    // first run (no watermark) pull everything. If the delta filter is ever rejected
    // (datetime literal syntax mismatch), fall back to a full pull rather than getting
    // stuck — correctness over efficiency.
    $params = array(
        '$select'  => 'InventoryID,LastModifiedOn',
        '$orderby' => 'LastModifiedOn',
    );
    if ( '' !== $watermark ) {
        // This GI's OData feed accepts the `datetime'...'` literal (v3 style); the newer
        // `datetimeoffset'...'` and bare-value forms both 500 on it (verified live).
        $params['$filter'] = "LastModifiedOn gt datetime'{$watermark}'";
    }

    $rows = mf_acu_odata_get( MF_ACU_INVENTORY_GI, $params );

    if ( is_wp_error( $rows ) && '' !== $watermark ) {
        mf_acu_log( 'Delta filter failed (' . $rows->get_error_message() . ') — retrying as full pull', 'inventory' );
        unset( $params['$filter'] );
        $rows = mf_acu_odata_get( MF_ACU_INVENTORY_GI, $params );
    }

    if ( is_wp_error( $rows ) ) {
        mf_acu_circuit_record_failure();
        mf_acu_record( 'inventory-sync', false, $rows->get_error_message() );
        mf_acu_log( 'Inventory sync failed: ' . $rows->get_error_message(), 'inventory' );
        return;
    }

    // Distinct changed SKUs + the max watermark seen. We then re-read those SKUs' FULL
    // per-warehouse availability in batched calls (a delta row for one warehouse doesn't
    // carry the other warehouses' current values, which the summed Woo number needs).
    $skus     = array();
    $max_seen = $watermark;
    foreach ( $rows as $row ) {
        $sku = isset( $row['InventoryID'] ) ? trim( (string) $row['InventoryID'] ) : '';
        if ( '' !== $sku ) {
            $skus[ $sku ] = true;
        }
        $lm = isset( $row['LastModifiedOn'] ) ? (string) $row['LastModifiedOn'] : '';
        if ( '' !== $lm && ( '' === $max_seen || strcmp( $lm, $max_seen ) > 0 ) ) {
            $max_seen = $lm;
        }
    }

    $updated = mf_acu_apply_stock_batch( array_keys( $skus ) );
    if ( $updated < 0 ) {
        // Read error during the re-read — do NOT advance the watermark, so the next run
        // retries these SKUs.
        mf_acu_circuit_record_failure();
        mf_acu_record( 'inventory-sync', false, 'batch re-read failed' );
        return;
    }

    mf_acu_circuit_record_success();

    if ( '' !== $max_seen && $max_seen !== $watermark ) {
        update_option( MF_ACU_INVENTORY_WATERMARK, $max_seen, false );
    }

    $detail = sprintf( '%d changed / %d updated', count( $skus ), $updated );
    mf_acu_record( 'inventory-sync', true, $detail );
    mf_acu_log( 'Inventory sync: ' . $detail, 'inventory' );
}

/* ── immediate re-sync of ordered SKUs (fired ~60s after an order push) ──
 * One batched OData call for the whole order — reads current QtyAvailable directly, so
 * it always reflects the SO allocation regardless of LastModifiedOn. */

add_action( MF_ACU_RESYNC_HOOK, 'mf_acu_resync_skus_handler', 10, 1 );

function mf_acu_resync_skus_handler( $skus ) {
    if ( ! function_exists( 'mf_acu_environment_ok' ) || ! mf_acu_environment_ok() ) {
        return;
    }
    if ( mf_acu_circuit_is_open() ) {
        return;
    }
    $updated = mf_acu_apply_stock_batch( $skus );
    if ( $updated > 0 ) {
        mf_acu_log( sprintf( 'Immediate re-sync updated %d SKU(s) post-order', $updated ), 'inventory' );
    }
}

/* ── admin: manual sync controls (on the existing Acumatica Sync page) ──
 * Rendered via the core admin page's extension hook. The run's outcome (and any
 * error) appears immediately afterward in that page's Status panel ("inventory-sync"
 * row) and the Log table (context "inventory") — the recurring 15-min sync writes to
 * the same places, so this page is the single spot to see when it ran / if it broke. */

add_action( 'mf_acu_admin_extra_actions', function () {
    $wm = get_option( MF_ACU_INVENTORY_WATERMARK, '' );
    ?>
    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin-left:12px">
        <input type="hidden" name="action" value="mf_acu_sync_inventory" />
        <?php wp_nonce_field( 'mf_acu_sync_inventory' ); ?>
        <button type="submit" class="button">Sync Inventory Now</button>
    </form>
    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin-left:8px" onsubmit="return confirm('Force a FULL re-sync of ALL inventory? This clears the delta watermark and re-reads every SKU (slower).');">
        <input type="hidden" name="action" value="mf_acu_sync_inventory" />
        <input type="hidden" name="full" value="1" />
        <?php wp_nonce_field( 'mf_acu_sync_inventory' ); ?>
        <button type="submit" class="button">Full Re-sync (reset watermark)</button>
    </form>
    <p style="margin:8px 0 0"><small>Inventory delta watermark:
        <code><?php echo $wm ? esc_html( $wm ) : '(none — next run is a full pull)'; ?></code></small></p>
    <?php
} );

add_action( 'admin_post_mf_acu_sync_inventory', function () {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_acu_sync_inventory' );

    // A full re-sync can touch every product; give it room beyond the default limit.
    if ( function_exists( 'set_time_limit' ) ) { @set_time_limit( 300 ); }

    if ( ! empty( $_POST['full'] ) ) {
        delete_option( MF_ACU_INVENTORY_WATERMARK ); // next run pulls everything
        mf_acu_log( 'Manual FULL re-sync requested (watermark cleared)', 'inventory' );
    } else {
        mf_acu_log( 'Manual inventory sync requested', 'inventory' );
    }

    if ( function_exists( 'mf_acu_inventory_sync' ) ) {
        mf_acu_inventory_sync();
    }

    wp_safe_redirect( admin_url( 'options-general.php?page=mf-acumatica' ) );
    exit;
} );

/* ── WooCommerce must NEVER change inventory itself ───────────────────
 * Acumatica is the source of truth. Placing/paying an order allocates in Acumatica
 * (Available drops there); the sync then mirrors that back. Woo neither decrements on
 * order nor restores on cancel/refund — the only writer of stock is this sync. */

add_filter( 'woocommerce_can_reduce_order_stock',  '__return_false' );
add_filter( 'woocommerce_can_restore_order_stock', '__return_false' );
