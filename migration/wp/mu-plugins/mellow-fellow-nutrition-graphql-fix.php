<?php
/**
 * Plugin Name: Mellow Fellow Nutrition GraphQL Fix
 * Description: Fixes the auto-generated WPGraphQL-for-ACF resolver for the
 *              Nutrition field group, which incorrectly returns null for a
 *              genuine value of "0" (PHP's empty("0") === true).
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WPGraphQL-for-ACF's default scalar-field resolver discards a value when
 * empty($value) is true. In PHP, empty("0") — and empty(0), empty("") — all
 * evaluate to true, so a text/number field genuinely saved as "0" resolves
 * to null over GraphQL even though wp_postmeta holds "0", not an empty
 * string. Re-registering these three fields with an explicit null/''-only
 * check fixes it without touching how the value is stored or fetched.
 *
 * $source for a field on the Nutrition type is the array of already-fetched
 * sub-field values the parent (`nutrition` on each product type) resolver
 * produced — so this reads $source[$field] directly rather than re-querying
 * ACF, keeping it consistent with whatever fetched the group in the first
 * place. Falls back to get_field() only if $source isn't array-like, in
 * case a future plugin version resolves the group differently.
 */
add_action('graphql_register_types', function () {
    foreach (['calories', 'sugar', 'carbs'] as $field_name) {
        register_graphql_field('Nutrition', $field_name, [
            'type'        => 'String',
            'description' => "Nutrition {$field_name} value (ACF text field).",
            'resolve'     => function ($source) use ($field_name) {
                if (is_array($source) && array_key_exists($field_name, $source)) {
                    $value = $source[$field_name];
                } elseif (is_object($source) && isset($source->ID)) {
                    $value = get_field($field_name, $source->ID);
                } elseif (is_numeric($source)) {
                    $value = get_field($field_name, (int) $source);
                } else {
                    $value = null;
                }

                // get_field() returns false when a field has never been
                // saved for the post; treat that the same as null/''.
                if ($value === null || $value === false || $value === '') {
                    return null;
                }

                return (string) $value;
            },
        ]);
    }
});
