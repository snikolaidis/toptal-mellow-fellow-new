<?php
/**
 * Render callback for the Hero Section block.
 *
 * IMPORTANT: This output is only ever seen inside the WP block editor preview.
 * The live frontend is rendered by the Faust.js React app from the same ACF
 * field data via WPGraphQL — this does not need to match that output pixel
 * for pixel. Keep it simple; it just needs to look reasonable to editors.
 */

namespace HeadlessAcfBlocks\Blocks\HeroSection;

defined( 'ABSPATH' ) || exit;

/**
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */
function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading    = get_field( 'heading' );
	$subheading = get_field( 'subheading' );
	$image      = get_field( 'background_image' );
	$cta        = get_field( 'cta_button' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--hero' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $image ) : ?>
			<img
				src="<?php echo esc_url( $image['sizes']['medium'] ?? $image['url'] ); ?>"
				alt=""
				style="max-width:100%;height:auto;opacity:0.6;"
			/>
		<?php endif; ?>

		<h2><?php echo esc_html( $heading ?: 'Hero Heading' ); ?></h2>

		<?php if ( $subheading ) : ?>
			<p><?php echo esc_html( $subheading ); ?></p>
		<?php endif; ?>

		<?php if ( ! empty( $cta['url'] ) ) : ?>
			<span class="button" style="display:inline-block;padding:6px 14px;background:#eee;border-radius:4px;">
				<?php echo esc_html( $cta['title'] ?: 'Button' ); ?>
			</span>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
