<?php
/**
 * Render callback for the Collection Links block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * collection-links` block exposes a `collectionLinks` field with a `links`
 * repeater of selected collections).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\CollectionLinks;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$links   = get_field( 'links' );
	$count   = is_array( $links ) ? count( $links ) : 0;
	$heading = get_field( 'section_heading' );
	$layout  = get_field( 'layout' ) ?: 'track';

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--collection-links' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $heading ) : ?>
			<p style="font-size:15px;margin:0 0 4px;"><strong><?php echo esc_html( $heading ); ?></strong></p>
		<?php endif; ?>
		<p style="font-size:13px;margin:0 0 8px;">
			<strong>Collection Links</strong> — <?php echo esc_html( (string) $count ); ?>
			collection<?php echo 1 === $count ? '' : 's'; ?>
			(<?php echo esc_html( $layout ); ?> layout).
		</p>

		<?php if ( $count > 0 ) : ?>
			<ul style="font-size:13px;margin:0;padding-left:18px;">
				<?php foreach ( $links as $row ) : ?>
					<?php
					$term  = $row['collection'] ?? null;
					$label = ! empty( $row['title_override'] )
						? $row['title_override']
						: ( $term instanceof \WP_Term ? $term->name : '(no collection)' );
					?>
					<li><?php echo esc_html( $label ); ?></li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the actual links row renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
