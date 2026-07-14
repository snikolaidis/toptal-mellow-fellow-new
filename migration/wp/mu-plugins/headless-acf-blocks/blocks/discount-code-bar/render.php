<?php
/**
 * Render callback for the Discount Code Bar block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * discount-code-bar` block exposes a `discountCodeBar` field with the bar's
 * text, discount code and colors; the copy-to-clipboard button is wired up
 * in the React component).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\DiscountCodeBar;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$text            = get_field( 'text' );
	$discount_code   = get_field( 'discount_code' );
	$text_color      = get_field( 'text_color' ) ?: '#ffffff';
	$highlight_color = get_field( 'highlight_color' ) ?: $text_color;
	$background      = get_field( 'background_color' ) ?: '#000000';
	$btn_background  = get_field( 'button_background_color' ) ?: '#ffffff';
	$btn_text_color  = get_field( 'button_text_color' ) ?: '#241A00';

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--discount-code-bar' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<div style="background:<?php echo esc_attr( $background ); ?>;padding:8px 20px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;">
			<span style="color:<?php echo esc_attr( $text_color ); ?>;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">
				<?php echo esc_html( $text ?: '(no text)' ); ?>
			</span>

			<?php if ( $discount_code ) : ?>
				<span style="color:<?php echo esc_attr( $highlight_color ); ?>;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">
					CODE:&nbsp;<?php echo esc_html( $discount_code ); ?>
				</span>

				<span style="display:inline-flex;padding:4px 16px;border-radius:9999px;background:<?php echo esc_attr( $btn_background ); ?>;color:<?php echo esc_attr( $btn_text_color ); ?>;font-size:12px;font-weight:700;">
					COPY CODE
				</span>
			<?php endif; ?>
		</div>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the copy-to-clipboard behavior works in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
