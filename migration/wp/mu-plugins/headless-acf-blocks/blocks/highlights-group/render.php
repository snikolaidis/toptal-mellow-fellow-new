<?php
/**
 * Render callback for the Highlights Group block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * highlights-group` block exposes a `highlightsGroup` field with a
 * `highlights` repeater).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\HighlightsGroup;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading    = get_field( 'heading' );
	$highlights = get_field( 'highlights' );
	$count      = is_array( $highlights ) ? count( $highlights ) : 0;

	$first_image = '';
	if ( $count > 0 && ! empty( $highlights[0]['image'] ) ) {
		$img         = $highlights[0]['image'];
		$first_image = $img['sizes']['large'] ?? $img['url'];
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--highlights-group' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $heading ) : ?>
			<h3 style="text-align:center;"><?php echo esc_html( $heading ); ?></h3>
		<?php endif; ?>

		<?php if ( $first_image ) : ?>
			<img src="<?php echo esc_url( $first_image ); ?>" alt="" style="max-width:100%;height:auto;" />
		<?php endif; ?>

		<p style="font-size:13px;margin-top:8px;">
			<strong>Highlights Group</strong> — <?php echo esc_html( (string) $count ); ?>
			highlight<?php echo 1 === $count ? '' : 's'; ?>.
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only — the actual section renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
