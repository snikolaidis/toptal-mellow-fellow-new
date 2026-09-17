<?php
/**
 * Plugin Name: Mellow Fellow - Category Product Order
 * Description: Adds an ACF "Pinned products" relationship field to every taxonomy the
 *              storefront can list products by (the shared MF_TAXONOMY_PARAM_ALLOWLIST,
 *              today collection, mood, product_cat) so an admin can drag chosen products
 *              to the top of any such term (e.g. softgels first in Clearance). Adding a
 *              taxonomy to that allowlist extends pinning to it automatically. On the
 *              headless storefront the listing is served
 *              by the mf/v1/collection-products SQL endpoint, which reads the pinned
 *              list via mf_cpo_pinned_ids_for_term() and forces those products first
 *              on the default sort. The posts_clauses filter below keeps the same
 *              ordering for any WP-rendered archive/shortcode/block. Editable entirely
 *              from wp-admin.
 * Version: 1.1.0
 * Requires Plugins: advanced-custom-fields-pro, woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// Taxonomies that carry a pinned list. Derived at call time from the storefront's
// own allowlist (MF_TAXONOMY_PARAM_ALLOWLIST, mellow-fellow-taxonomy-param.php) so
// the field and the ordering automatically cover every taxonomy the storefront can
// list products by, present or future. Resolved lazily, not as a top-level define,
// because this mu-plugin loads before mellow-fellow-taxonomy-param.php (alphabetical
// order) so the allowlist constant does not exist yet at file-load time. Falls back
// to the current set if that plugin is ever absent.
function mf_cpo_taxonomies() {
    if ( defined( 'MF_TAXONOMY_PARAM_ALLOWLIST' ) && is_array( MF_TAXONOMY_PARAM_ALLOWLIST ) ) {
        return MF_TAXONOMY_PARAM_ALLOWLIST;
    }

    return [ 'collection', 'mood', 'product_cat' ];
}

add_action( 'acf/init', 'mf_register_category_product_order_fields' );

function mf_register_category_product_order_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    // One OR'd location rule per taxonomy so the field shows on each term screen.
    $location = [];
    foreach ( mf_cpo_taxonomies() as $taxonomy ) {
        $location[] = [
            [
                'param'    => 'taxonomy',
                'operator' => '==',
                'value'    => $taxonomy,
            ],
        ];
    }

    acf_add_local_field_group( [
        'key'      => 'group_mf_category_product_order',
        'title'    => 'Category Product Order',
        'fields'   => [
            [
                'key'           => 'field_mf_cpo_pinned_products',
                'label'         => 'Pinned products (shown first)',
                'name'          => 'mf_pinned_products',
                'type'          => 'relationship',
                'instructions'  => 'Search for products and drag them into the order you want. These appear first on this collection, before all other products, on the default sort. Leave empty to use the normal sorting.',
                'post_type'     => [ 'product' ],
                'filters'       => [ 'search' ],
                'elements'      => [ 'featured_image' ],
                'return_format' => 'id',
            ],
        ],
        'location' => $location,
    ] );
}

// Restrict the relationship picker to products that actually belong to the term
// being edited. Pinning only reorders products already in the collection; it
// cannot pull in a product that is not a member, so offering non-members just
// lets an admin pin something that then silently never appears.
add_filter( 'acf/fields/relationship/query/name=mf_pinned_products', 'mf_cpo_restrict_picker_to_term', 10, 3 );

function mf_cpo_restrict_picker_to_term( $args, $field, $post_id ) {
    if ( ! function_exists( 'acf_decode_post_id' ) ) {
        return $args;
    }

    $decoded = acf_decode_post_id( $post_id );
    if ( ( $decoded['type'] ?? '' ) !== 'term' || empty( $decoded['id'] ) ) {
        return $args;
    }

    $term = get_term( (int) $decoded['id'] );
    if ( ! $term || is_wp_error( $term ) || ! in_array( $term->taxonomy, mf_cpo_taxonomies(), true ) ) {
        return $args;
    }

    // include_children => false so the picker offers only products directly
    // assigned to this term, matching the storefront endpoint's membership test
    // (its SQL joins the exact term, no children). Without it a parent term would
    // offer sub-term products that then never appear on the parent's page.
    // Appended, not assigned, so any existing tax_query is kept.
    $args['tax_query']   = isset( $args['tax_query'] ) && is_array( $args['tax_query'] ) ? $args['tax_query'] : [];
    $args['tax_query'][] = [
        'taxonomy'         => $term->taxonomy,
        'field'            => 'term_id',
        'terms'            => (int) $decoded['id'],
        'include_children' => false,
    ];

    return $args;
}

/**
 * Pinned product IDs for a single term, in the order set in the backend.
 * Used by the mf/v1/collection-products endpoint and the posts_clauses filter.
 *
 * @return int[] Ordered, de-duplicated product IDs, or [] when none are pinned.
 */
function mf_cpo_pinned_ids_for_term( $taxonomy, $term_id ) {
    if ( ! function_exists( 'get_field' ) || ! $term_id ) {
        return [];
    }

    $pinned = get_field( 'mf_pinned_products', $taxonomy . '_' . (int) $term_id );
    if ( empty( $pinned ) ) {
        return [];
    }

    return array_values( array_unique( array_filter( array_map( 'intval', (array) $pinned ) ) ) );
}

/**
 * Build the "pinned first" ORDER BY fragment for a given ID column.
 * Empty string when nothing is pinned. IDs come from a trusted ACF
 * relationship field (each intval'd), so inlining them is safe.
 */
function mf_cpo_order_by_fragment( array $ids, $id_column ) {
    if ( ! $ids ) {
        return '';
    }

    $idlist = implode( ',', array_map( 'intval', $ids ) );
    $field  = "FIELD( {$id_column}, {$idlist} )";

    return "( {$field} = 0 ), {$field}";
}

// --- WP-rendered archives / [products] shortcode / blocks --------------------
// The headless storefront never runs this (it queries the SQL endpoint), but it
// keeps the same ordering for any classic WP loop constrained to one of our terms.
add_filter( 'posts_clauses', 'mf_category_product_order_clauses', 20, 2 );

function mf_category_product_order_clauses( $clauses, $query ) {
    if ( is_admin() || ! ( $query instanceof WP_Query ) ) {
        return $clauses;
    }

    // On the archive itself, respect a shopper-chosen sort. Only pin on the
    // default catalog ordering there.
    if (
        $query->is_main_query()
        && function_exists( 'is_tax' )
        && is_tax( mf_cpo_taxonomies() )
        && isset( $_GET['orderby'] )
    ) {
        return $clauses;
    }

    $ids = mf_cpo_pinned_ids_for_query( $query );
    if ( ! $ids ) {
        return $clauses;
    }

    global $wpdb;
    $pinned_order = mf_cpo_order_by_fragment( $ids, "{$wpdb->posts}.ID" );
    if ( '' === $pinned_order ) {
        return $clauses;
    }

    $clauses['orderby'] = ! empty( $clauses['orderby'] )
        ? $pinned_order . ', ' . $clauses['orderby']
        : $pinned_order;

    return $clauses;
}

function mf_cpo_pinned_ids_for_query( $query ) {
    $term = mf_cpo_single_term( $query );
    if ( ! $term ) {
        return [];
    }

    return mf_cpo_pinned_ids_for_term( $term['taxonomy'], $term['term_id'] );
}

// Return [ taxonomy, term_id ] only when the query is constrained to exactly one
// term of one of our taxonomies (archive, shortcode, block, or custom query).
function mf_cpo_single_term( $query ) {
    $taxonomies = mf_cpo_taxonomies();

    foreach ( $taxonomies as $taxonomy ) {
        $slug = $query->get( $taxonomy );
        if ( is_string( $slug ) && $slug !== '' && strpbrk( $slug, ',+ ' ) === false ) {
            $term = get_term_by( 'slug', $slug, $taxonomy );
            if ( $term && ! is_wp_error( $term ) ) {
                return [ 'taxonomy' => $taxonomy, 'term_id' => (int) $term->term_id ];
            }
        }
    }

    if ( empty( $query->tax_query ) || empty( $query->tax_query->queries ) ) {
        return null;
    }

    $found = [];
    foreach ( $query->tax_query->queries as $tq ) {
        if ( ! is_array( $tq ) ) {
            continue;
        }
        $taxonomy = $tq['taxonomy'] ?? '';
        if ( ! in_array( $taxonomy, $taxonomies, true ) ) {
            continue;
        }
        $field = $tq['field'] ?? 'term_id';
        foreach ( (array) ( $tq['terms'] ?? [] ) as $value ) {
            if ( 'slug' === $field ) {
                $term = get_term_by( 'slug', $value, $taxonomy );
                $tid  = ( $term && ! is_wp_error( $term ) ) ? (int) $term->term_id : 0;
            } elseif ( 'name' === $field ) {
                $term = get_term_by( 'name', $value, $taxonomy );
                $tid  = ( $term && ! is_wp_error( $term ) ) ? (int) $term->term_id : 0;
            } else {
                $tid = (int) $value;
            }
            if ( $tid ) {
                $found[ $taxonomy . ':' . $tid ] = [ 'taxonomy' => $taxonomy, 'term_id' => $tid ];
            }
        }
    }

    $found = array_values( $found );

    return count( $found ) === 1 ? $found[0] : null;
}
