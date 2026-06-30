<?php
/**
 * Render callback for the Collection Slider block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * collection-slider` block exposes a `collectionSlider` field: a selected
 * collection, an optional title and a product count).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\CollectionSlider;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$collection = get_field( 'collection' );
	$title      = get_field( 'title' );
	$count      = get_field( 'product_count' );

	$collection_name = $collection instanceof \WP_Term ? $collection->name : '(none selected)';
	$heading         = ! empty( $title ) ? $title : $collection_name;

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--collection-slider' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<h2 style="margin:0 0 6px;"><?php echo esc_html( $heading ); ?></h2>
		<p style="font-size:13px;margin:0;">
			<strong>Collection Slider</strong> — collection:
			<?php echo esc_html( $collection_name ); ?>,
			showing <?php echo esc_html( (string) ( $count ?: 8 ) ); ?> products.
		</p>
		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the actual carousel renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
