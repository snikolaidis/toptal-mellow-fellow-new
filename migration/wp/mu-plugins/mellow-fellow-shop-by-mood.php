<?php
/**
 * Plugin Name: Mellow Fellow Shop by Mood terms
 * Description: Exposes the mood taxonomy terms on the Shop by Mood block so the
 *              homepage cards derive their label, image and link from the terms
 *              themselves instead of a hand maintained repeater. Adding a mood in
 *              Products > Moods is enough for it to appear on the homepage.
 *              The shape is declared locally rather than reusing the Mood type so
 *              the field keeps its contract on environments where the taxonomy has
 *              not been recreated yet.
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'graphql_register_types',
	function () {
		if ( ! function_exists( 'register_graphql_object_type' ) ) {
			return;
		}

		register_graphql_object_type(
			'MoodCardSource',
			[
				'description' => __( 'A mood term reduced to what the Shop by Mood cards render.', 'mellow-fellow' ),
				'fields'      => [
					'databaseId'  => [ 'type' => 'Int' ],
					'name'        => [ 'type' => 'String' ],
					'slug'        => [ 'type' => 'String' ],
					'description' => [ 'type' => 'String' ],
					'imageUrl'    => [ 'type' => 'String' ],
					'imageAlt'    => [ 'type' => 'String' ],
					'imageWidth'  => [ 'type' => 'Int' ],
					'imageHeight' => [ 'type' => 'Int' ],
				],
			]
		);

		register_graphql_field(
			'AcfShopByMood',
			'moodTerms',
			[
				'type'        => [ 'list_of' => 'MoodCardSource' ],
				'description' => __( 'Every mood term, oldest first, so the card order follows the order the moods were created in. Empty when the taxonomy does not exist on this environment.', 'mellow-fellow' ),
				'resolve'     => function () {
					if ( ! taxonomy_exists( 'mood' ) ) {
						return [];
					}

					$terms = get_terms(
						[
							'taxonomy'   => 'mood',
							'hide_empty' => false,
							'orderby'    => 'term_id',
							'order'      => 'ASC',
						]
					);

					if ( is_wp_error( $terms ) || empty( $terms ) ) {
						return [];
					}

					return array_values(
						array_filter(
							array_map(
								function ( $term ) {
									$image_id = 0;

									if ( function_exists( 'get_field' ) ) {
										$image = get_field( 'mood_hero_desktop', $term );

										if ( is_array( $image ) && isset( $image['ID'] ) ) {
											$image_id = (int) $image['ID'];
										} elseif ( is_numeric( $image ) ) {
											$image_id = (int) $image;
										}
									}

									$meta = $image_id ? wp_get_attachment_metadata( $image_id ) : [];

									return [
										'databaseId'  => (int) $term->term_id,
										'name'        => $term->name,
										'slug'        => $term->slug,
										'description' => $term->description,
										'imageUrl'    => $image_id ? wp_get_attachment_url( $image_id ) : null,
										'imageAlt'    => $image_id ? get_post_meta( $image_id, '_wp_attachment_image_alt', true ) : null,
										'imageWidth'  => isset( $meta['width'] ) ? (int) $meta['width'] : null,
										'imageHeight' => isset( $meta['height'] ) ? (int) $meta['height'] : null,
									];
								},
								$terms
							)
						)
					);
				},
			]
		);
	}
);
