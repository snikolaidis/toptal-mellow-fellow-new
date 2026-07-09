<?php
/**
 * Render callback for the Blend Callout block.
 *
 * IMPORTANT: This output is only ever seen inside the WP block editor preview.
 * The live frontend is rendered by the Faust.js React app from the same ACF
 * field data via WPGraphQL — this does not need to match that output pixel
 * for pixel. Keep it simple; it just needs to look reasonable to editors.
 */

namespace HeadlessAcfBlocks\Blocks\BlendCallout;

defined( 'ABSPATH' ) || exit;

/**
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */
function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading     = get_field( 'heading' );
	$description = get_field( 'description' );
	$image       = get_field( 'image' );
	$learn_link  = get_field( 'learn_link' );
	$shop_link   = get_field( 'shop_link' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--blend-callout' )
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

		<h2><?php echo esc_html( $heading ?: 'Blend Callout Heading' ); ?></h2>

		<?php if ( $description ) : ?>
			<div><?php echo wp_kses_post( $description ); ?></div>
		<?php endif; ?>

		<?php if ( ! empty( $learn_link['url'] ) ) : ?>
			<span class="button" style="display:inline-block;padding:6px 14px;background:#eee;border-radius:4px;">
				<?php echo esc_html( $learn_link['title'] ?: 'Learn' ); ?>
			</span>
		<?php endif; ?>

		<?php if ( ! empty( $shop_link['url'] ) ) : ?>
			<span class="button" style="display:inline-block;padding:6px 14px;background:#eee;border-radius:4px;">
				<?php echo esc_html( $shop_link['title'] ?: 'Shop' ); ?>
			</span>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
