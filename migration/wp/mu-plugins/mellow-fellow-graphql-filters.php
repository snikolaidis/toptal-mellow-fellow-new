<?php
/**
 * Plugin Name: Mellow Fellow GraphQL Taxonomy Filters
 * Description: Registers custom ACF taxonomy filters on WooGraphQL product queries.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Map of GraphQL arg base name → WordPress taxonomy slug.
 * For each entry we register: {base} (String) and {base}In ([String]).
 */
define('MF_GRAPHQL_TAX_FILTERS', [
    'mfProductType'           => 'product-type',
    'strainTypeFilter'        => 'strain-type',
    'blendTypeFilter'         => 'blend-types',
    'cannabinoidFilter'       => 'cannabinoid',
    'singleCannabinoidFilter' => 'single-cannabinoid',
    'sizeFilter'              => 'size',
    'mgFilter'                => 'mg',
    'piecesFilter'            => 'pieces',
    'collectionFilter'        => 'collection',
    'strainNameFilter'        => 'strain-name',
]);

/**
 * 1. Register the where args on both product connection types.
 *    v1.0.3 of wp-graphql-woocommerce uses "products" (non-union) and
 *    "productsWithVariations" (union) — custom filters must be on both.
 */
add_action('graphql_register_types', function () {
    $where_types = [
        'RootQueryToProductConnectionWhereArgs',
        'RootQueryToProductUnionConnectionWhereArgs',
    ];

    foreach ($where_types as $where_type) {
        foreach (MF_GRAPHQL_TAX_FILTERS as $base => $taxonomy) {
            $label = ucfirst(preg_replace('/([A-Z])/', ' $1', $base));

            register_graphql_field($where_type, $base, [
                'type'        => 'String',
                'description' => "Filter products by {$label} taxonomy slug.",
            ]);

            register_graphql_field($where_type, $base . 'In', [
                'type'        => ['list_of' => 'String'],
                'description' => "Filter products by multiple {$label} taxonomy slugs.",
            ]);
        }
    }
});

/**
 * 2. Map the where args to WP_Query tax_query.
 *    Hooks into the product connection resolver's query args.
 */
add_filter('graphql_product_connection_query_args', function ($query_args, $source, $args) {
    $where = $args['where'] ?? [];

    if (empty($where)) {
        return $query_args;
    }

    if (empty($query_args['tax_query'])) {
        $query_args['tax_query'] = [];
    }

    foreach (MF_GRAPHQL_TAX_FILTERS as $base => $taxonomy) {
        // Check single value
        $single_key = $base;
        $multi_key  = $base . 'In';

        $slugs = [];

        if (!empty($where[$single_key])) {
            $slugs = [(string) $where[$single_key]];
        }

        if (!empty($where[$multi_key]) && is_array($where[$multi_key])) {
            $slugs = array_merge($slugs, array_map('strval', $where[$multi_key]));
        }

        $slugs = array_unique(array_filter($slugs));

        if (empty($slugs)) {
            continue;
        }

        // Resolve slugs to term_taxonomy_ids (same pattern WooGraphQL uses)
        $term_taxonomy_ids = [];
        foreach ($slugs as $slug) {
            $term = get_term_by('slug', $slug, $taxonomy);
            if ($term && !is_wp_error($term)) {
                $term_taxonomy_ids[] = $term->term_taxonomy_id;
            }
        }

        if (!empty($term_taxonomy_ids)) {
            $query_args['tax_query'][] = [
                'taxonomy' => $taxonomy,
                'field'    => 'term_taxonomy_id',
                'terms'    => $term_taxonomy_ids,
                'operator' => 'IN',
            ];
        }
    }

    // Ensure AND relation when multiple tax queries
    if (count($query_args['tax_query']) > 1 && !isset($query_args['tax_query']['relation'])) {
        $query_args['tax_query']['relation'] = 'AND';
    }

    return $query_args;
}, 10, 3);
