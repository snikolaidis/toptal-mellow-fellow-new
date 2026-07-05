<?php
/**
 * Render callback for the Responsive Image block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * responsive-image` block exposes a `responsiveImage` field with the three
 * image slots plus link/border-radius/width/eager-load settings).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\ResponsiveImage;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$desktop = get_field( 'desktop_image' );
	$tablet  = get_field( 'tablet_image' );
	$mobile  = get_field( 'mobile_image' );

	$img       = $desktop ?: ( $tablet ?: $mobile );
	$image_url = $img ? ( $img['sizes']['large'] ?? $img['url'] ) : '';

	$slots = array_filter(
		array(
			$mobile ? 'mobile' : null,
			$tablet ? 'tablet' : null,
			$desktop ? 'desktop' : null,
		)
	);

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--responsive-image' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $image_url ) : ?>
			<img src="<?php echo esc_url( $image_url ); ?>" alt="" style="max-width:100%;height:auto;" />
		<?php endif; ?>

		<p style="font-size:13px;margin-top:8px;">
			<strong>Responsive Image</strong> —
			<?php echo $slots ? esc_html( implode( ', ', $slots ) . ' set' ) : 'no images set'; ?>.
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only — the responsive &lt;picture&gt; renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
