<?php
/**
 * Plugin Name: Mellow Fellow Shop by Mood terms
 * Description: Exposes the mood taxonomy terms on the Shop by Mood block so the
 *              homepage cards derive their label, image and link from the terms
 *              themselves instead of a hand maintained repeater. Adding a mood in
 *              Products > Moods is enough for it to appear on the homepage.
 *              It also registers the Homepage Card Image field those cards read.
 *              The shape is declared locally rather than reusing the Mood type so
 *              the field keeps its contract on environments where the taxonomy has
 *              not been recreated yet.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'acf/init', 'mf_register_mood_card_image_field' );

/**
 * The homepage card and this mood page's hero are different aspect ratios,
 * about 3:2 against 6.4:1 on desktop, so one image cannot crop well for both.
 */
function mf_register_mood_card_image_field() {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}

	acf_add_local_field_group(
		[
			'key'      => 'group_mf_mood_homepage_card',
			'title'    => 'Homepage Shop by Mood Card',
			'fields'   => [
				[
					'key'           => 'field_mf_mood_homepage_card_image',
					'label'         => 'Homepage Card Image',
					'name'          => 'mood_homepage_card_image',
					'type'          => 'image',
					'instructions'  => 'Shown on the Shop by Mood cards on the homepage, nowhere else. The banner across the top of this mood page is Mood Hero Desktop / Mood Hero Mobile, not this field. Roughly 3:2 landscape, 658 x 440 or larger. Leave it empty and the card falls back to Mood Hero Desktop, which is a wide banner and crops badly at card shape.',
					'return_format' => 'array',
					'preview_size'  => 'medium',
				],
			],
			'location' => [
				[
					[
						'param'    => 'taxonomy',
						'operator' => '==',
						'value'    => 'mood',
					],
				],
			],
		]
	);
}

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
					'count'       => [ 'type' => 'Int' ],
					'description' => [ 'type' => 'String' ],
					'imageUrl'    => [ 'type' => 'String' ],
					'imageAlt'    => [ 'type' => 'String' ],
					'imageWidth'  => [ 'type' => 'Int' ],
					'imageHeight' => [ 'type' => 'Int' ],
				],
			]
		);

		$resolve_mood_terms = function () {
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
										// Card art first, hero as the fallback so no card goes blank while the
										// new field is still being filled in mood by mood.
										$image = get_field( 'mood_homepage_card_image', $term );

										if ( ! $image ) {
											$image = get_field( 'mood_hero_desktop', $term );
										}

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
										'count'       => (int) $term->count,
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
		};

		// Both the Shop by Mood cards and the mood tabs render the same six terms,
		// so they read the same source rather than each keeping its own list.
		foreach ( [ 'AcfShopByMood', 'AcfCategoryTabs' ] as $graphql_type ) {
			register_graphql_field(
				$graphql_type,
				'moodTerms',
				[
					'type'        => [ 'list_of' => 'MoodCardSource' ],
					'description' => __( 'Every mood term, oldest first, so the order follows the order the moods were created in. Empty when the taxonomy does not exist on this environment.', 'mellow-fellow' ),
					'resolve'     => $resolve_mood_terms,
				]
			);
		}
	}
);
