<?php
/**
 * Plugin Name: Mellow Fellow Nutrition GraphQL Fix
 * Description: Overrides wpgraphql-acf's default resolver for the Nutrition
 *              field group's calories/sugar/carbs fields, which silently
 *              turns a genuinely-saved "0" into null.
 * Version: 5.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Root cause (confirmed by reading WPGraphQL core directly): PHP's
 * empty("0") === true, and wpgraphql-acf's auto-generated field resolver
 * discards a value when empty($value) is true — so a field genuinely saved
 * as the string "0" resolves to null over GraphQL.
 *
 * `register_graphql_field()` cannot fix this. WPGraphQL's TypeRegistry::
 * register_field() explicitly refuses to override a field that already
 * exists on a type — it logs a DUPLICATE_FIELD graphql_debug() message
 * (invisible unless GRAPHQL_DEBUG is enabled) and leaves the original
 * resolver in place. Since wpgraphql-acf already registers calories/sugar/
 * carbs on Nutrition (once the field group's GraphQL Types setting names
 * SimpleProduct/VariableProduct), every attempt to re-register those same
 * fields here was silently discarded — for all three fields, not just
 * sugar (calories/carbs simply never hit the one input, "0", where
 * wpgraphql-acf's own resolver disagrees with a correct one).
 *
 * The only way to override an already-registered field is to hook the same
 * filter wpgraphql-acf itself contributes to when building the type's field
 * list — `graphql_{TypeName}_fields` — and replace the existing entries
 * directly, at a priority late enough to run after wpgraphql-acf's own
 * contribution.
 *
 * $source for these fields is `['node' => <post model>, 'acf_field_group'
 * => <field group config>]` (confirmed by direct introspection against
 * this exact field group) — `node->databaseId` gives the post ID.
 *
 * Verified against a local pull of the production DB/plugins (Local by
 * Flywheel): calories/sugar/carbs all resolve correctly on post 24513
 * (calories "40", sugar "0", carbs null — the last because it's genuinely
 * unset), stable across repeated queries, and unrelated products with no
 * nutrition data correctly resolve all three as null.
 */
add_filter('graphql_Nutrition_fields', function ($fields) {
    foreach (['calories', 'sugar', 'carbs'] as $field_name) {
        if (!isset($fields[$field_name])) {
            continue;
        }

        $fields[$field_name]['resolve'] = function ($source) use ($field_name) {
            $node = $source['node'] ?? null;
            $post_id = is_object($node) && isset($node->databaseId)
                ? (int) $node->databaseId
                : null;

            if (!$post_id) {
                return null;
            }

            $value = get_field($field_name, $post_id);

            // Deliberately not empty() — empty("0") is true in PHP, and
            // that's the bug this file exists to fix. get_field() returns
            // false for a field never saved on this post; treat that the
            // same as null/''.
            if ($value === null || $value === false || $value === '') {
                return null;
            }

            return (string) $value;
        };
    }

    return $fields;
}, PHP_INT_MAX);
