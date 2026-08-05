<?php
/**
 * Plugin Name: Mellow Fellow - Search Reindex Hooks
 * Description: Rebuilds the Meilisearch posts and collections indexes shortly after
 *              content changes, by calling the headless frontend's reindex endpoint
 *              from a debounced WP-Cron event. Products stay on the nightly job
 *              because that rebuild does not fit the platform's request ceiling.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MF_REINDEX_HOOK', 'mf_reindex_run');
define('MF_REINDEX_STATUS_OPTION', 'mf_reindex_last_run');
define('MF_REINDEX_SECRET_OPTION', 'mf_reindex_secret');

function mf_reindex_indexes() {
    return array('posts', 'collections');
}

function mf_reindex_delay() {
    return defined('MF_REINDEX_DELAY') ? max(60, (int) MF_REINDEX_DELAY) : 300;
}

function mf_reindex_secret() {
    if (defined('MF_REINDEX_SECRET') && MF_REINDEX_SECRET) {
        return (string) MF_REINDEX_SECRET;
    }

    $env = getenv('MF_REINDEX_SECRET');
    if ($env) {
        return (string) $env;
    }

    return (string) get_option(MF_REINDEX_SECRET_OPTION, '');
}

function mf_reindex_frontend_url() {
    if (defined('MF_HEADLESS_URL') && MF_HEADLESS_URL) {
        return rtrim((string) MF_HEADLESS_URL, '/');
    }

    $env = getenv('MF_HEADLESS_URL');
    if ($env) {
        return rtrim((string) $env, '/');
    }

    $faust = get_option('faustwp_settings');
    if (is_array($faust) && !empty($faust['frontend_uri'])) {
        return rtrim((string) $faust['frontend_uri'], '/');
    }

    return '';
}

function mf_reindex_allowed_hosts($constant, $default) {
    $raw = defined($constant) ? (string) constant($constant) : $default;

    return array_filter(array_map('trim', array_map('strtolower', explode(',', $raw))));
}

function mf_reindex_host_matches($url, array $allowed) {
    $host = strtolower((string) wp_parse_url((string) $url, PHP_URL_HOST));

    return '' !== $host && in_array($host, $allowed, true);
}

function mf_reindex_environment_ok() {
    $frontend_hosts = mf_reindex_allowed_hosts(
        'MF_REINDEX_FRONTEND_HOSTS',
        'h6fnx9u5ft35zt3ytwnrsn294.js.wpenginepowered.com,localhost'
    );

    if (!mf_reindex_host_matches(mf_reindex_frontend_url(), $frontend_hosts)) {
        return false;
    }

    // A copied database keeps faustwp_settings pointing at the production frontend,
    // so the check above passes on staging. WP Engine rewrites home_url on copy.
    $wp_hosts = mf_reindex_allowed_hosts(
        'MF_REINDEX_WP_HOSTS',
        'mellowfellow1.wpenginepowered.com,mellowfellow.local'
    );

    return mf_reindex_host_matches(home_url(), $wp_hosts);
}

function mf_reindex_schedule($index) {
    if (!in_array($index, mf_reindex_indexes(), true)) {
        return;
    }

    $args = array($index);

    if (wp_next_scheduled(MF_REINDEX_HOOK, $args)) {
        return;
    }

    wp_schedule_single_event(time() + mf_reindex_delay(), MF_REINDEX_HOOK, $args);
}

function mf_reindex_record($index, $ok, $code, $message) {
    $all = get_option(MF_REINDEX_STATUS_OPTION, array());
    if (!is_array($all)) {
        $all = array();
    }

    $all[$index] = array(
        'time'    => time(),
        'ok'      => (bool) $ok,
        'code'    => (int) $code,
        'message' => (string) $message,
    );

    update_option(MF_REINDEX_STATUS_OPTION, $all, false);

    if (!$ok) {
        error_log('[MF Reindex] ' . $index . ' failed (HTTP ' . (int) $code . '): ' . $message);
    }
}

add_action(MF_REINDEX_HOOK, 'mf_reindex_execute', 10, 1);

function mf_reindex_execute($index) {
    if (!in_array($index, mf_reindex_indexes(), true)) {
        return;
    }

    if (!mf_reindex_environment_ok()) {
        mf_reindex_record($index, false, 0, 'Skipped: this install is not the configured production pair.');
        return;
    }

    $secret = mf_reindex_secret();
    $base   = mf_reindex_frontend_url();

    if (!$secret || !$base) {
        mf_reindex_record($index, false, 0, 'Not configured: reindex secret or frontend URL is missing.');
        return;
    }

    $url = add_query_arg(array('type' => $index), $base . '/api/reindex');

    $response = wp_remote_post($url, array(
        'timeout' => 35,
        'headers' => array(
            'Content-Type'     => 'application/json',
            'x-reindex-secret' => $secret,
        ),
        'body' => '{}',
    ));

    if (is_wp_error($response)) {
        mf_reindex_record($index, false, 0, $response->get_error_message());
        return;
    }

    $code = (int) wp_remote_retrieve_response_code($response);

    if ($code >= 200 && $code < 300) {
        mf_reindex_record($index, true, $code, '');
        return;
    }

    $body = wp_remote_retrieve_body($response);
    mf_reindex_record($index, false, $code, substr((string) $body, 0, 300));
}

add_action('transition_post_status', 'mf_reindex_on_post_status', 10, 3);

function mf_reindex_on_post_status($new_status, $old_status, $post) {
    if (!($post instanceof WP_Post)) {
        return;
    }

    if ('publish' !== $new_status && 'publish' !== $old_status) {
        return;
    }

    if ('post' === $post->post_type) {
        mf_reindex_schedule('posts');
        return;
    }

    if ('product' === $post->post_type && $new_status !== $old_status) {
        mf_reindex_schedule('collections');
    }
}

add_action('created_term', 'mf_reindex_on_term', 10, 3);
add_action('edited_term', 'mf_reindex_on_term', 10, 3);
add_action('delete_term', 'mf_reindex_on_term', 10, 3);

function mf_reindex_on_term($term, $tt_id, $taxonomy) {
    if ('collection' === $taxonomy) {
        mf_reindex_schedule('collections');
    }
}

add_action('set_object_terms', 'mf_reindex_on_object_terms', 10, 4);

function mf_reindex_on_object_terms($object_id, $terms, $tt_ids, $taxonomy) {
    if ('collection' !== $taxonomy || 'product' !== get_post_type($object_id)) {
        return;
    }

    mf_reindex_schedule('collections');
}

add_action('admin_menu', function () {
    add_options_page(
        'Search Reindex',
        'Search Reindex',
        'manage_options',
        'mf-search-reindex',
        'mf_reindex_render_page'
    );
});

add_action('admin_init', function () {
    register_setting('mf_reindex_group', MF_REINDEX_SECRET_OPTION, array(
        'type'              => 'string',
        'sanitize_callback' => 'mf_reindex_sanitize_secret',
        'default'           => '',
    ));
});

function mf_reindex_sanitize_secret($value) {
    $value = trim((string) $value);

    if ('' !== $value) {
        return $value;
    }

    // The field never renders the stored value, so a blank submission means "leave
    // it alone" and cannot mean "clear it". Clearing needs its own checkbox.
    if (!empty($_POST['mf_reindex_clear_secret'])) {
        return '';
    }

    return (string) get_option(MF_REINDEX_SECRET_OPTION, '');
}

add_action('admin_notices', function () {
    if (!current_user_can('manage_options')) {
        return;
    }

    $runs = get_option(MF_REINDEX_STATUS_OPTION, array());
    if (!is_array($runs)) {
        return;
    }

    $failed = array();
    foreach (mf_reindex_indexes() as $index) {
        if (isset($runs[$index]) && empty($runs[$index]['ok'])) {
            $failed[] = $index;
        }
    }

    if (!$failed) {
        return;
    }

    printf(
        '<div class="notice notice-error"><p>%s <a href="%s">%s</a></p></div>',
        esc_html('Search reindex failed for ' . implode(' and ', $failed) . '. Search results may be stale.'),
        esc_url(admin_url('options-general.php?page=mf-search-reindex')),
        esc_html('View details')
    );
});

function mf_reindex_render_status_cell($run) {
    if (!is_array($run) || empty($run['time'])) {
        return esc_html('Never run');
    }

    $when = esc_html(wp_date('Y-m-d H:i', (int) $run['time']));

    if (!empty($run['ok'])) {
        return esc_html('Succeeded ') . $when;
    }

    $detail = 'Failed ' . wp_date('Y-m-d H:i', (int) $run['time']);
    if (!empty($run['code'])) {
        $detail .= ' (HTTP ' . (int) $run['code'] . ')';
    }
    if (!empty($run['message'])) {
        $detail .= ': ' . $run['message'];
    }

    return '<strong>' . esc_html($detail) . '</strong>';
}

function mf_reindex_render_constant_cell($name, $show_value) {
    if (!defined($name)) {
        return esc_html('Not defined');
    }

    if (!$show_value) {
        return esc_html('Defined');
    }

    $value = constant($name);

    return esc_html('Defined: ' . (is_scalar($value) ? (string) $value : gettype($value)));
}

function mf_reindex_render_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $runs     = get_option(MF_REINDEX_STATUS_OPTION, array());
    $runs     = is_array($runs) ? $runs : array();
    $frontend = mf_reindex_frontend_url();
    $has_key  = '' !== mf_reindex_secret();
    $env_ok   = mf_reindex_environment_ok();
    ?>
    <div class="wrap">
        <h1>Search Reindex</h1>
        <p>
            Posts and collections are reindexed about <?php echo esc_html((string) (mf_reindex_delay() / 60)); ?>
            minutes after they change. Products are not: that rebuild is too slow for the
            endpoint and runs on the nightly scheduled job instead.
        </p>

        <h2>Status</h2>
        <table class="widefat striped" style="max-width:900px">
            <tbody>
                <tr>
                    <th scope="row" style="width:220px">Frontend URL</th>
                    <td><?php echo $frontend ? esc_html($frontend) : '<strong>' . esc_html('Not resolved') . '</strong>'; ?></td>
                </tr>
                <tr>
                    <th scope="row">Reindex secret</th>
                    <td><?php echo $has_key ? esc_html('Set') : '<strong>' . esc_html('Not set, the hook cannot run') . '</strong>'; ?></td>
                </tr>
                <tr>
                    <th scope="row">Environment</th>
                    <td>
                        <?php
                        echo $env_ok
                            ? esc_html('Allowed to publish')
                            : '<strong>' . esc_html('Blocked, this install is not the configured production pair') . '</strong>';
                        ?>
                    </td>
                </tr>
                <?php foreach (mf_reindex_indexes() as $index) : ?>
                    <tr>
                        <th scope="row"><?php echo esc_html('Last ' . $index . ' run'); ?></th>
                        <td><?php echo mf_reindex_render_status_cell(isset($runs[$index]) ? $runs[$index] : null); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <h2>Environment signals</h2>
        <p>
            Read only. The guard's allowed hosts are declared in code today. What is present
            here decides whether they could be derived from the install instead.
        </p>
        <table class="widefat striped" style="max-width:900px">
            <tbody>
                <tr>
                    <th scope="row" style="width:220px">wp_get_environment_type()</th>
                    <td><?php echo esc_html(wp_get_environment_type()); ?></td>
                </tr>
                <tr>
                    <th scope="row">PWP_NAME</th>
                    <td><?php echo mf_reindex_render_constant_cell('PWP_NAME', true); ?></td>
                </tr>
                <tr>
                    <th scope="row">WPE_APIKEY</th>
                    <td><?php echo mf_reindex_render_constant_cell('WPE_APIKEY', false); ?></td>
                </tr>
                <tr>
                    <th scope="row">home_url()</th>
                    <td><?php echo esc_html(home_url()); ?></td>
                </tr>
            </tbody>
        </table>

        <h2>Settings</h2>
        <form method="post" action="options.php">
            <?php settings_fields('mf_reindex_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mf_reindex_secret">Reindex secret</label></th>
                    <td>
                        <input
                            type="password"
                            id="mf_reindex_secret"
                            name="<?php echo esc_attr(MF_REINDEX_SECRET_OPTION); ?>"
                            value=""
                            autocomplete="new-password"
                            class="regular-text"
                            placeholder="<?php echo esc_attr($has_key ? 'Saved, leave blank to keep' : 'Not set'); ?>"
                        />
                        <p class="description">
                            Must match REINDEX_SECRET on the headless platform. The stored value is
                            never displayed. Leave blank to keep the current one.
                        </p>
                        <p>
                            <label>
                                <input type="checkbox" name="mf_reindex_clear_secret" value="1" />
                                Clear the stored secret
                            </label>
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
