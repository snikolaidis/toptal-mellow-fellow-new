<?php
/**
 * Render callback for the Hero Slider block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * hero-slider` block exposes a `heroSlider` field with a `slides` repeater).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\HeroSlider;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$slides = get_field( 'slides' );
	$count  = is_array( $slides ) ? count( $slides ) : 0;

	$first_image = '';
	if ( $count > 0 ) {
		$slide = $slides[0];
		$img   = $slide['desktop_image'] ?: ( $slide['tablet_image'] ?: $slide['mobile_image'] );
		if ( $img ) {
			$first_image = $img['sizes']['large'] ?? $img['url'];
		}
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--hero-slider' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $first_image ) : ?>
			<img src="<?php echo esc_url( $first_image ); ?>" alt="" style="max-width:100%;height:auto;" />
		<?php endif; ?>

		<p style="font-size:13px;margin-top:8px;">
			<strong>Hero Slider</strong> — <?php echo esc_html( (string) $count ); ?>
			slide<?php echo 1 === $count ? '' : 's'; ?>.
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only — the actual carousel renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
