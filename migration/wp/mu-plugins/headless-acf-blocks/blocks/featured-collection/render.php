<?php
/**
 * Render callback for the Featured Collection block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * featured-collection` block exposes a `featuredCollection` field: a selected
 * collection, an optional title, a product count and an optional CTA button).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\FeaturedCollection;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$collection = get_field( 'collection' );
	$title      = get_field( 'title' );
	$count      = get_field( 'product_count' );
	$button     = get_field( 'button' );

	$collection_name = $collection instanceof \WP_Term ? $collection->name : '(none selected)';
	$heading         = ! empty( $title ) ? $title : $collection_name;

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--featured-collection' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<h2 style="margin:0 0 6px;"><?php echo esc_html( $heading ); ?></h2>
		<p style="font-size:13px;margin:0;">
			<strong>Featured Collection</strong> — collection:
			<?php echo esc_html( $collection_name ); ?>,
			showing <?php echo esc_html( (string) ( $count ?: 8 ) ); ?> products
			in a grid<?php echo ! empty( $button['url'] ) ? ', with CTA button' : ''; ?>.
		</p>
		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the actual product grid renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
