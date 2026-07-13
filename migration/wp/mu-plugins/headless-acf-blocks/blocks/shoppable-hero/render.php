<?php
/**
 * Render callback for the Shoppable Hero block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * shoppable-hero` block exposes a `shoppableHero` field with a picked
 * product, overlay content and mobile/tablet/desktop images). The Add to
 * Cart behavior only exists on the frontend.
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\ShoppableHero;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$product_id  = get_field( 'product' );
	$title       = get_field( 'custom_title' );
	$description = get_field( 'custom_description' );
	$alignment   = get_field( 'content_alignment' ) ?: 'left';
	$desktop_img = get_field( 'desktop_image' );

	$product       = $product_id ? get_post( $product_id ) : null;
	$product_label = $product ? $product->post_title : '(no product selected)';
	$title_label   = $title ?: ( $product ? $product->post_title . ' (from product)' : '(none)' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--shoppable-hero' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $desktop_img ) : ?>
			<img
				src="<?php echo esc_url( $desktop_img['sizes']['medium'] ?? $desktop_img['url'] ); ?>"
				alt=""
				style="max-width:100%;height:auto;opacity:0.5;"
			/>
		<?php endif; ?>

		<p style="font-size:13px;margin:0 0 8px;">
			<strong>Shoppable Hero</strong> —
			product: <?php echo esc_html( $product_label ); ?>,
			content aligned <?php echo esc_html( $alignment ); ?>.
		</p>

		<p style="font-size:13px;margin:0 0 4px;">
			<strong>Title:</strong> <?php echo esc_html( $title_label ); ?>
		</p>

		<?php if ( $description ) : ?>
			<p style="font-size:13px;margin:0 0 4px;">
				<strong>Custom description:</strong> <?php echo esc_html( wp_trim_words( $description, 25 ) ); ?>
			</p>
		<?php elseif ( $product ) : ?>
			<p style="font-size:13px;margin:0 0 4px;">
				<strong>Description:</strong> falls back to the product's description.
			</p>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the actual hero and Add to Cart render in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
