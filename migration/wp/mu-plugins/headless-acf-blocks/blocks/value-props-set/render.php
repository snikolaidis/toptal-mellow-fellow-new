<?php
/**
 * Render callback for the Value Props Set block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL.
 *
 * This block has no fields of its own — it renders the global value props
 * repeater from the "Site Settings" ACF options page
 * (mellow-fellow-site-settings.php, siteSettings.valuePropsSet in GraphQL).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\ValuePropsSet;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$items = function_exists( 'get_field' ) ? get_field( 'value_props', 'option' ) : null;
	$items = is_array( $items ) ? $items : array();

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--value-props-set' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( empty( $items ) ) : ?>
			<p style="font-size:13px;">
				<strong>Value Props Set</strong> — no value props yet.
				Add them under <em>Site Settings &rarr; Value Props</em>.
			</p>
		<?php else : ?>
			<div style="display:flex;justify-content:center;gap:30px;text-align:center;">
				<?php foreach ( $items as $item ) : ?>
					<div>
						<?php if ( ! empty( $item['image']['url'] ) ) : ?>
							<img
								src="<?php echo esc_url( $item['image']['sizes']['thumbnail'] ?? $item['image']['url'] ); ?>"
								alt=""
								style="width:40px;height:auto;"
							/>
						<?php endif; ?>
						<?php if ( ! empty( $item['title'] ) ) : ?>
							<p style="font-size:12px;font-weight:700;margin:4px 0 0;">
								<?php echo esc_html( $item['title'] ); ?>
							</p>
						<?php endif; ?>
					</div>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;text-align:center;">
			<em>Preview only — global content from Site Settings &rarr; Value Props;
			the actual section renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
