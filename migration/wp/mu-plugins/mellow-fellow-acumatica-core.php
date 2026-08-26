<?php
/**
 * Plugin Name: Mellow Fellow - Acumatica Core
 * Description: Shared auth, REST helpers, circuit breaker, logging, and admin UI
 *              for the Acumatica ERP integration. All other mellow-fellow-acumatica-*
 *              plugins depend on this file.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MF_ACU_LOG_OPTION',     'mf_acu_log' );
define( 'MF_ACU_STATUS_OPTION',  'mf_acu_status' );
define( 'MF_ACU_CIRCUIT_OPTION', 'mf_acu_circuit' );
define( 'MF_ACU_SESSION_KEY',    'mf_acu_session' );
define( 'MF_ACU_SETTINGS_OPTION','mf_acu_settings' );
define( 'MF_ACU_LOG_MAX',        50 );

/* ── helpers to read config ──────────────────────────────────────── */

function mf_acu_config( $key, $default = '' ) {
    $const = 'ACUMATICA_' . strtoupper( $key );
    if ( defined( $const ) ) return (string) constant( $const );
    $env = getenv( $const );
    if ( $env !== false ) return (string) $env;

    $settings = get_option( MF_ACU_SETTINGS_OPTION, array() );
    if ( is_array( $settings ) && isset( $settings[ $key ] ) && '' !== $settings[ $key ] ) {
        return (string) $settings[ $key ];
    }

    return $default;
}

function mf_acu_base_url()      { return rtrim( mf_acu_config( 'BASE_URL' ), '/' ); }
function mf_acu_username()      { return mf_acu_config( 'USERNAME' ); }
function mf_acu_password()      { return mf_acu_config( 'PASSWORD' ); }
function mf_acu_company()       { return mf_acu_config( 'COMPANY' ); }
function mf_acu_branch()        { return mf_acu_config( 'BRANCH', 'MF' ); }
function mf_acu_order_type()    { return mf_acu_config( 'ORDER_TYPE', 'MF' ); }
function mf_acu_sync_secret()   { return mf_acu_config( 'SYNC_SECRET' ); }

/* ── environment guard ───────────────────────────────────────────── */

function mf_acu_environment_ok() {
    $allowed = array_filter( array_map( 'trim', array_map( 'strtolower', explode( ',',
        defined( 'MF_ACU_ALLOWED_HOSTS' )
            ? (string) MF_ACU_ALLOWED_HOSTS
            : 'mellowfellow1.wpenginepowered.com,mellowfellow.local'
    ) ) ) );

    $host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
    return '' !== $host && in_array( $host, $allowed, true );
}

/* ── logging ─────────────────────────────────────────────────────── */

function mf_acu_log( $message, $context = '' ) {
    $entry = array(
        'time'    => time(),
        'message' => (string) $message,
        'context' => (string) $context,
    );

    $log = get_option( MF_ACU_LOG_OPTION, array() );
    if ( ! is_array( $log ) ) $log = array();
    array_unshift( $log, $entry );
    $log = array_slice( $log, 0, MF_ACU_LOG_MAX );
    update_option( MF_ACU_LOG_OPTION, $log, false );

    error_log( '[MF Acumatica] ' . ( $context ? "[$context] " : '' ) . $message );
}

function mf_acu_record( $component, $ok, $detail = '' ) {
    $status = get_option( MF_ACU_STATUS_OPTION, array() );
    if ( ! is_array( $status ) ) $status = array();

    $status[ $component ] = array(
        'time'   => time(),
        'ok'     => (bool) $ok,
        'detail' => (string) $detail,
    );

    update_option( MF_ACU_STATUS_OPTION, $status, false );
}

/* ── circuit breaker ─────────────────────────────────────────────── */

function mf_acu_circuit_state() {
    $state = get_option( MF_ACU_CIRCUIT_OPTION, array() );
    if ( ! is_array( $state ) ) return array( 'failures' => 0, 'open' => false );
    return wp_parse_args( $state, array( 'failures' => 0, 'open' => false, 'opened_at' => 0 ) );
}

function mf_acu_circuit_is_open() {
    return ! empty( mf_acu_circuit_state()['open'] );
}

function mf_acu_circuit_record_success() {
    update_option( MF_ACU_CIRCUIT_OPTION, array( 'failures' => 0, 'open' => false ), false );
}

function mf_acu_circuit_record_failure() {
    $state = mf_acu_circuit_state();
    $state['failures'] = (int) $state['failures'] + 1;

    if ( $state['failures'] >= 3 ) {
        $state['open']      = true;
        $state['opened_at'] = time();
        mf_acu_log( 'Circuit breaker OPEN after 3 consecutive failures', 'circuit' );
    }

    update_option( MF_ACU_CIRCUIT_OPTION, $state, false );
}

function mf_acu_circuit_reset() {
    update_option( MF_ACU_CIRCUIT_OPTION, array( 'failures' => 0, 'open' => false ), false );
    mf_acu_log( 'Circuit breaker manually reset', 'circuit' );
}

/* ── authentication ──────────────────────────────────────────────── */

function mf_acu_login( $force = false ) {
    if ( ! $force ) {
        $cached = get_transient( MF_ACU_SESSION_KEY );
        if ( $cached && is_array( $cached ) && ! empty( $cached['cookies'] ) ) {
            return $cached;
        }
    }

    $base = mf_acu_base_url();
    if ( ! $base ) return new WP_Error( 'mf_acu_no_url', 'ACUMATICA_BASE_URL is not configured.' );

    $payload = array(
        'name'     => mf_acu_username(),
        'password' => mf_acu_password(),
    );

    $company = mf_acu_company();
    if ( $company ) $payload['company'] = $company;

    $branch = mf_acu_branch();
    if ( $branch ) $payload['branch'] = $branch;

    $response = wp_remote_post( $base . '/entity/auth/login', array(
        'timeout' => 15,
        'headers' => array( 'Content-Type' => 'application/json' ),
        'body'    => wp_json_encode( $payload ),
    ) );

    if ( is_wp_error( $response ) ) {
        mf_acu_log( 'Login failed: ' . $response->get_error_message(), 'auth' );
        return $response;
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    if ( $code !== 204 && $code !== 200 ) {
        $body = wp_remote_retrieve_body( $response );
        $msg  = 'Login failed (HTTP ' . $code . ')';
        $json = json_decode( $body, true );
        if ( isset( $json['exceptionMessage'] ) ) $msg .= ': ' . $json['exceptionMessage'];
        mf_acu_log( $msg, 'auth' );
        return new WP_Error( 'mf_acu_login_failed', $msg );
    }

    $raw_cookies = wp_remote_retrieve_cookies( $response );
    $cookies     = array();
    foreach ( $raw_cookies as $c ) {
        $cookies[] = $c->name . '=' . $c->value;
    }

    $session = array(
        'cookies'    => implode( '; ', $cookies ),
        'base_url'   => $base,
        'logged_in'  => time(),
    );

    set_transient( MF_ACU_SESSION_KEY, $session, 20 * MINUTE_IN_SECONDS );
    return $session;
}

function mf_acu_logout( $session = null ) {
    if ( ! $session ) $session = get_transient( MF_ACU_SESSION_KEY );
    if ( ! $session || ! is_array( $session ) ) return;

    wp_remote_post( $session['base_url'] . '/entity/auth/logout', array(
        'timeout' => 5,
        'headers' => array( 'Cookie' => $session['cookies'] ),
    ) );

    delete_transient( MF_ACU_SESSION_KEY );
}

/* ── REST API helpers ────────────────────────────────────────────── */

function mf_acu_rest_request( $method, $endpoint, $session, $body = null ) {
    $args = array(
        'method'  => $method,
        'timeout' => 30,
        'headers' => array(
            'Cookie' => $session['cookies'],
            'Accept' => 'application/json',
        ),
    );

    if ( $body !== null ) {
        $args['headers']['Content-Type'] = 'application/json';
        $args['body'] = wp_json_encode( $body );
    }

    $url      = $session['base_url'] . $endpoint;
    $response = wp_remote_request( $url, $args );

    if ( is_wp_error( $response ) ) return $response;

    $code = (int) wp_remote_retrieve_response_code( $response );

    if ( $code === 401 ) {
        $retry_session = mf_acu_login( true );
        if ( is_wp_error( $retry_session ) ) return $retry_session;

        $args['headers']['Cookie'] = $retry_session['cookies'];
        $response = wp_remote_request( $url, $args );
        if ( is_wp_error( $response ) ) return $response;
        $code = (int) wp_remote_retrieve_response_code( $response );
    }

    $raw = wp_remote_retrieve_body( $response );

    if ( $code >= 400 ) {
        $json = json_decode( $raw, true );
        $msg  = isset( $json['exceptionMessage'] ) ? $json['exceptionMessage'] : substr( $raw, 0, 300 );

        $inner = '';
        if ( isset( $json['innerException']['exceptionMessage'] ) ) {
            $inner = $json['innerException']['exceptionMessage'];
        }
        if ( isset( $json['innerException']['innerException']['exceptionMessage'] ) ) {
            $inner .= ' → ' . $json['innerException']['innerException']['exceptionMessage'];
        }

        $full_msg = 'HTTP ' . $code . ': ' . $msg;
        if ( $inner ) $full_msg .= ' [Inner: ' . $inner . ']';

        mf_acu_log( $full_msg . ' | Endpoint: ' . $endpoint . ' | Response: ' . substr( $raw, 0, 1000 ), 'api' );

        return new WP_Error( 'mf_acu_api_error', $full_msg, array( 'status' => $code, 'body' => $raw ) );
    }

    if ( $code === 204 ) return true;

    $decoded = json_decode( $raw, true );
    return ( $decoded !== null ) ? $decoded : $raw;
}

function mf_acu_rest_get( $endpoint, $session ) {
    return mf_acu_rest_request( 'GET', $endpoint, $session );
}

function mf_acu_rest_put( $endpoint, $payload, $session ) {
    return mf_acu_rest_request( 'PUT', $endpoint, $session, $payload );
}

/* ── sync secret verification (for incoming GitHub Actions calls) ── */

function mf_acu_verify_sync_secret( WP_REST_Request $request ) {
    $secret = mf_acu_sync_secret();
    if ( ! $secret ) return false;

    $header = $request->get_header( 'x-acumatica-sync-secret' );
    if ( ! $header ) return false;

    return hash_equals( $secret, $header );
}

/* ── admin UI ────────────────────────────────────────────────────── */

add_action( 'admin_menu', function() {
    add_options_page(
        'Acumatica Sync',
        'Acumatica Sync',
        'manage_options',
        'mf-acumatica',
        'mf_acu_render_admin_page'
    );
} );

add_action( 'admin_post_mf_acu_test_login', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_acu_test_login' );

    delete_transient( MF_ACU_SESSION_KEY );
    $result = mf_acu_login( true );

    if ( is_wp_error( $result ) ) {
        mf_acu_record( 'auth', false, $result->get_error_message() );
    } else {
        mf_acu_record( 'auth', true, 'Login successful' );
        mf_acu_logout( $result );
    }

    wp_safe_redirect( admin_url( 'options-general.php?page=mf-acumatica' ) );
    exit;
} );

add_action( 'admin_post_mf_acu_run_diagnostics', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_acu_run_diagnostics' );

    $results = array();

    $session = mf_acu_login( true );
    if ( is_wp_error( $session ) ) {
        $results[] = array( 'test' => 'Authentication', 'ok' => false, 'detail' => $session->get_error_message() );
        update_option( 'mf_acu_diagnostics', $results, false );
        wp_safe_redirect( add_query_arg( 'mf_acu_diag', '1', admin_url( 'options-general.php?page=mf-acumatica' ) ) );
        exit;
    }
    $results[] = array( 'test' => 'Authentication', 'ok' => true, 'detail' => 'Login successful' );

    $order_type = mf_acu_order_type();
    $ot_check = mf_acu_rest_get(
        "/entity/Default/24.200.001/SalesOrder?\$filter=OrderType eq '$order_type'&\$top=1&\$select=OrderType,OrderNbr",
        $session
    );
    if ( is_wp_error( $ot_check ) ) {
        $results[] = array( 'test' => "Order Type '$order_type'", 'ok' => false, 'detail' => $ot_check->get_error_message() );
    } else {
        $results[] = array( 'test' => "Order Type '$order_type'", 'ok' => true, 'detail' => 'Accessible (query returned without error)' );
    }

    $branch = mf_acu_branch();
    $br_check = mf_acu_rest_get(
        "/entity/Default/24.200.001/SalesOrder?\$filter=Branch eq '$branch'&\$top=1&\$select=Branch",
        $session
    );
    if ( is_wp_error( $br_check ) ) {
        $results[] = array( 'test' => "Branch '$branch'", 'ok' => false, 'detail' => 'Could not verify — ' . $br_check->get_error_message() );
    } elseif ( is_array( $br_check ) && empty( $br_check ) ) {
        $results[] = array( 'test' => "Branch '$branch'", 'ok' => false, 'detail' => 'No existing orders use this branch — verify it exists in Acumatica' );
    } else {
        $results[] = array( 'test' => "Branch '$branch'", 'ok' => true, 'detail' => 'Found on existing sales orders' );
    }

    $cc = mf_acu_config( 'CUSTOMER_CLASS', 'MFF' );
    $cc_check = mf_acu_rest_get(
        "/entity/Default/24.200.001/Customer?\$filter=CustomerClass eq '$cc'&\$top=1&\$select=CustomerClass",
        $session
    );
    if ( is_wp_error( $cc_check ) ) {
        $results[] = array( 'test' => "Customer Class '$cc'", 'ok' => false, 'detail' => 'Could not verify — ' . $cc_check->get_error_message() );
    } elseif ( is_array( $cc_check ) && empty( $cc_check ) ) {
        $results[] = array( 'test' => "Customer Class '$cc'", 'ok' => false, 'detail' => 'No customers use this class — it may not exist in Acumatica' );
    } else {
        $results[] = array( 'test' => "Customer Class '$cc'", 'ok' => true, 'detail' => 'Found on existing customers' );
    }

    $test_order = wc_get_orders( array(
        'status' => 'processing',
        'limit'  => 1,
        'return' => 'objects',
    ) );
    if ( ! empty( $test_order ) ) {
        $o = $test_order[0];
        $skus = array();
        foreach ( $o->get_items() as $item ) {
            $p = $item->get_product();
            if ( $p && $p->get_sku() ) $skus[] = $p->get_sku();
        }
        if ( ! empty( $skus ) ) {
            $missing = array();
            foreach ( $skus as $sku ) {
                $escaped = str_replace( "'", "''", $sku );
                $inv = mf_acu_rest_get(
                    "/entity/Default/24.200.001/StockItem?\$filter=InventoryID eq '$escaped'&\$top=1&\$select=InventoryID",
                    $session
                );
                if ( is_wp_error( $inv ) || ( is_array( $inv ) && empty( $inv ) ) ) {
                    $missing[] = $sku;
                }
            }
            if ( empty( $missing ) ) {
                $results[] = array( 'test' => 'Inventory Items (order #' . $o->get_order_number() . ')', 'ok' => true, 'detail' => 'All SKUs found: ' . implode( ', ', $skus ) );
            } else {
                $results[] = array( 'test' => 'Inventory Items (order #' . $o->get_order_number() . ')', 'ok' => false, 'detail' => 'Missing SKUs: ' . implode( ', ', $missing ) );
            }
        }
    }

    $results[] = array( 'test' => 'Hold Mode', 'ok' => true, 'detail' => 'Orders sent with Hold=false (auto-release). If orders fail on creation, try setting Hold=true first.' );

    mf_acu_logout( $session );
    update_option( 'mf_acu_diagnostics', $results, false );

    wp_safe_redirect( add_query_arg( 'mf_acu_diag', '1', admin_url( 'options-general.php?page=mf-acumatica' ) ) );
    exit;
} );

add_action( 'admin_post_mf_acu_reset_circuit', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_acu_reset_circuit' );

    mf_acu_circuit_reset();

    wp_safe_redirect( admin_url( 'options-general.php?page=mf-acumatica' ) );
    exit;
} );

add_action( 'admin_post_mf_acu_save_settings', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
    check_admin_referer( 'mf_acu_save_settings' );

    $existing = get_option( MF_ACU_SETTINGS_OPTION, array() );
    if ( ! is_array( $existing ) ) $existing = array();

    $fields = array( 'BASE_URL', 'USERNAME', 'COMPANY', 'BRANCH', 'ORDER_TYPE', 'CUSTOMER_CLASS', 'SYNC_SECRET' );
    $updated = $existing;

    foreach ( $fields as $field ) {
        $posted = isset( $_POST[ 'mf_acu_' . $field ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'mf_acu_' . $field ] ) ) : '';
        $updated[ $field ] = $posted;
    }

    $password = isset( $_POST['mf_acu_PASSWORD'] ) ? wp_unslash( $_POST['mf_acu_PASSWORD'] ) : '';
    if ( '' !== $password ) {
        $updated['PASSWORD'] = sanitize_text_field( $password );
    }

    update_option( MF_ACU_SETTINGS_OPTION, $updated, false );
    delete_transient( MF_ACU_SESSION_KEY );

    mf_acu_log( 'Settings saved via admin UI', 'settings' );

    wp_safe_redirect( add_query_arg( 'mf_acu_saved', '1', admin_url( 'options-general.php?page=mf-acumatica' ) ) );
    exit;
} );

add_action( 'admin_notices', function() {
    if ( ! current_user_can( 'manage_options' ) ) return;

    if ( mf_acu_circuit_is_open() ) {
        $state = mf_acu_circuit_state();
        $when  = isset( $state['opened_at'] ) ? wp_date( 'Y-m-d H:i', (int) $state['opened_at'] ) : 'unknown';
        printf(
            '<div class="notice notice-error"><p><strong>Acumatica sync disabled</strong> — circuit breaker tripped at %s after 3 consecutive failures. <a href="%s">View details</a></p></div>',
            esc_html( $when ),
            esc_url( admin_url( 'options-general.php?page=mf-acumatica' ) )
        );
    }
} );

function mf_acu_render_admin_page() {
    if ( ! current_user_can( 'manage_options' ) ) return;

    $status  = get_option( MF_ACU_STATUS_OPTION, array() );
    $log     = get_option( MF_ACU_LOG_OPTION, array() );
    $circuit = mf_acu_circuit_state();
    $env_ok  = mf_acu_environment_ok();

    if ( ! is_array( $status ) ) $status = array();
    if ( ! is_array( $log ) )    $log    = array();
    $saved  = get_option( MF_ACU_SETTINGS_OPTION, array() );
    if ( ! is_array( $saved ) ) $saved = array();

    $has_const_or_env = function( $key ) {
        $const = 'ACUMATICA_' . strtoupper( $key );
        if ( defined( $const ) ) return 'constant';
        if ( getenv( $const ) !== false ) return 'env';
        return false;
    };
    ?>
    <div class="wrap">
        <h1>Acumatica Sync</h1>

        <?php if ( isset( $_GET['mf_acu_saved'] ) ) : ?>
            <div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>
        <?php endif; ?>

        <h2>Credentials &amp; Settings</h2>
        <p>Values set via PHP constants or server environment variables take priority. Fields locked by a constant/env var are shown as read-only.</p>
        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="max-width:900px">
            <input type="hidden" name="action" value="mf_acu_save_settings" />
            <?php wp_nonce_field( 'mf_acu_save_settings' ); ?>
            <table class="form-table">
                <?php
                $fields = array(
                    'BASE_URL'       => array( 'label' => 'Base URL',       'placeholder' => 'https://example.acumatica.com' ),
                    'USERNAME'       => array( 'label' => 'Username',       'placeholder' => '' ),
                    'PASSWORD'       => array( 'label' => 'Password',       'placeholder' => '', 'type' => 'password' ),
                    'COMPANY'        => array( 'label' => 'Company',        'placeholder' => 'ARVIDA' ),
                    'BRANCH'         => array( 'label' => 'Branch',         'placeholder' => 'MF' ),
                    'ORDER_TYPE'     => array( 'label' => 'Order Type',     'placeholder' => 'MF' ),
                    'CUSTOMER_CLASS' => array( 'label' => 'Customer Class', 'placeholder' => 'MFF' ),
                    'SYNC_SECRET'    => array( 'label' => 'Sync Secret',    'placeholder' => 'Random 32+ char string', 'type' => 'password' ),
                );

                foreach ( $fields as $key => $meta ) :
                    $override = $has_const_or_env( $key );
                    $type     = isset( $meta['type'] ) ? $meta['type'] : 'text';
                    $db_val   = isset( $saved[ $key ] ) ? $saved[ $key ] : '';
                    $is_pw    = ( $type === 'password' );
                ?>
                    <tr>
                        <th scope="row"><label for="mf_acu_<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $meta['label'] ); ?></label></th>
                        <td>
                            <?php if ( $override ) : ?>
                                <input type="text" class="regular-text" value="<?php echo $is_pw ? '••••••••' : esc_attr( mf_acu_config( $key ) ); ?>" disabled />
                                <p class="description">Locked — set via <?php echo esc_html( $override ); ?></p>
                            <?php else : ?>
                                <input
                                    type="<?php echo esc_attr( $type ); ?>"
                                    id="mf_acu_<?php echo esc_attr( $key ); ?>"
                                    name="mf_acu_<?php echo esc_attr( $key ); ?>"
                                    class="regular-text"
                                    value="<?php echo $is_pw ? '' : esc_attr( $db_val ); ?>"
                                    placeholder="<?php echo esc_attr( $meta['placeholder'] ); ?>"
                                    autocomplete="off"
                                />
                                <?php if ( $is_pw && $db_val ) : ?>
                                    <p class="description">A value is saved. Leave blank to keep it.</p>
                                <?php endif; ?>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>
            <?php submit_button( 'Save Settings' ); ?>
        </form>

        <h2>Resolved Configuration</h2>
        <p>Effective values after merging constants, env vars, and saved settings.</p>
        <table class="widefat striped" style="max-width:900px">
            <tbody>
                <tr>
                    <th style="width:220px">Base URL</th>
                    <td><?php echo mf_acu_base_url() ? esc_html( mf_acu_base_url() ) : '<strong>Not set</strong>'; ?></td>
                </tr>
                <tr>
                    <th>Company</th>
                    <td><?php echo esc_html( mf_acu_company() ?: '(not set)' ); ?></td>
                </tr>
                <tr>
                    <th>Branch</th>
                    <td><?php echo esc_html( mf_acu_branch() ); ?></td>
                </tr>
                <tr>
                    <th>Order Type</th>
                    <td><?php echo esc_html( mf_acu_order_type() ); ?></td>
                </tr>
                <tr>
                    <th>Username</th>
                    <td><?php echo mf_acu_username() ? esc_html( mf_acu_username() ) : '<strong>Not set</strong>'; ?></td>
                </tr>
                <tr>
                    <th>Password</th>
                    <td><?php echo mf_acu_password() ? 'Set' : '<strong>Not set</strong>'; ?></td>
                </tr>
                <tr>
                    <th>Customer Class</th>
                    <td><?php echo esc_html( mf_acu_config( 'CUSTOMER_CLASS', 'MFF' ) ); ?></td>
                </tr>
                <tr>
                    <th>Sync Secret</th>
                    <td><?php echo mf_acu_sync_secret() ? 'Set' : 'Not set (GitHub Actions auth disabled)'; ?></td>
                </tr>
                <tr>
                    <th>Environment</th>
                    <td>
                        <?php echo $env_ok
                            ? 'Production — sync allowed'
                            : '<strong>Non-production — sync blocked</strong>'; ?>
                        <br><small>home_url: <?php echo esc_html( home_url() ); ?></small>
                    </td>
                </tr>
            </tbody>
        </table>

        <h2>Circuit Breaker</h2>
        <table class="widefat striped" style="max-width:900px">
            <tbody>
                <tr>
                    <th style="width:220px">State</th>
                    <td>
                        <?php if ( $circuit['open'] ) : ?>
                            <strong style="color:#d63638">OPEN — sync disabled</strong>
                            (tripped <?php echo esc_html( wp_date( 'Y-m-d H:i', (int) $circuit['opened_at'] ) ); ?>)
                            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin-left:12px">
                                <input type="hidden" name="action" value="mf_acu_reset_circuit" />
                                <?php wp_nonce_field( 'mf_acu_reset_circuit' ); ?>
                                <button type="submit" class="button">Reset Circuit Breaker</button>
                            </form>
                        <?php else : ?>
                            Closed — operating normally (<?php echo (int) $circuit['failures']; ?>/3 failures)
                        <?php endif; ?>
                    </td>
                </tr>
            </tbody>
        </table>

        <h2>Status</h2>
        <table class="widefat striped" style="max-width:900px">
            <tbody>
                <?php foreach ( $status as $component => $info ) :
                    $when = isset( $info['time'] ) ? wp_date( 'Y-m-d H:i:s', (int) $info['time'] ) : '-';
                ?>
                    <tr>
                        <th style="width:220px"><?php echo esc_html( $component ); ?></th>
                        <td>
                            <?php echo $info['ok']
                                ? esc_html( $info['detail'] . ' — ' . $when )
                                : '<strong>' . esc_html( $info['detail'] . ' — ' . $when ) . '</strong>'; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if ( empty( $status ) ) : ?>
                    <tr><td colspan="2">No sync has run yet.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>

        <h2>Actions</h2>
        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline">
            <input type="hidden" name="action" value="mf_acu_test_login" />
            <?php wp_nonce_field( 'mf_acu_test_login' ); ?>
            <button type="submit" class="button button-primary">Test Acumatica Login</button>
        </form>
        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin-left:12px">
            <input type="hidden" name="action" value="mf_acu_run_diagnostics" />
            <?php wp_nonce_field( 'mf_acu_run_diagnostics' ); ?>
            <button type="submit" class="button">Run Full Diagnostics</button>
        </form>

        <?php
        $diag = get_option( 'mf_acu_diagnostics', array() );
        if ( ! empty( $diag ) && isset( $_GET['mf_acu_diag'] ) ) :
        ?>
        <h2>Diagnostic Results</h2>
        <table class="widefat striped" style="max-width:900px">
            <thead>
                <tr><th style="width:60px">Status</th><th style="width:260px">Test</th><th>Detail</th></tr>
            </thead>
            <tbody>
                <?php foreach ( $diag as $d ) : ?>
                    <tr>
                        <td><?php echo $d['ok'] ? '<span style="color:#00a32a">&#10003;</span>' : '<span style="color:#d63638">&#10007;</span>'; ?></td>
                        <td><?php echo esc_html( $d['test'] ); ?></td>
                        <td><?php echo esc_html( $d['detail'] ); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>

        <h2>Log (last <?php echo MF_ACU_LOG_MAX; ?> events)</h2>
        <?php if ( empty( $log ) ) : ?>
            <p>No events recorded yet.</p>
        <?php else : ?>
            <table class="widefat striped" style="max-width:900px">
                <thead>
                    <tr>
                        <th style="width:160px">Time</th>
                        <th style="width:100px">Context</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $log as $entry ) : ?>
                        <tr>
                            <td><?php echo esc_html( wp_date( 'Y-m-d H:i:s', (int) $entry['time'] ) ); ?></td>
                            <td><?php echo esc_html( $entry['context'] ); ?></td>
                            <td><?php echo esc_html( $entry['message'] ); ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
    <?php
}
