<?php
/**
 * Render callback for the Image Carousel block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * image-carousel` block exposes an `imageCarousel` field with a title and a
 * gallery of images).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\ImageCarousel;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$title  = get_field( 'title' );
	$images = get_field( 'images' );
	$count  = is_array( $images ) ? count( $images ) : 0;

	$first_image = '';
	if ( $count > 0 ) {
		$img         = $images[0];
		$first_image = $img['sizes']['medium'] ?? $img['url'];
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--image-carousel' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $title ) : ?>
			<h3 style="text-align:center;"><?php echo esc_html( $title ); ?></h3>
		<?php endif; ?>

		<?php if ( $first_image ) : ?>
			<img src="<?php echo esc_url( $first_image ); ?>" alt="" style="max-height:80px;width:auto;" />
		<?php endif; ?>

		<p style="font-size:13px;margin-top:8px;">
			<strong>Image Carousel</strong> — <?php echo esc_html( (string) $count ); ?>
			image<?php echo 1 === $count ? '' : 's'; ?>.
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only — the autoplaying carousel renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
