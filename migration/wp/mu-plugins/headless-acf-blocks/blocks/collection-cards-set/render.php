<?php
/**
 * Render callback for the Collection Cards Set block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL (the `acf/
 * collection-cards-set` block exposes a `collectionCardsSet` field with a
 * `cards` repeater, grid settings, and an optional schedule window).
 *
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */

namespace HeadlessAcfBlocks\Blocks\CollectionCardsSet;

defined( 'ABSPATH' ) || exit;

/**
 * ACF's date_time_picker stores a naive 'Y-m-d H:i:s' string with no
 * timezone info. Attach the site's configured timezone explicitly — see the
 * matching helper/comment in blocks/sale-countdown-hero/render.php.
 */
function get_site_aware_datetime( string $raw_datetime ): \DateTimeImmutable {
	return new \DateTimeImmutable( $raw_datetime, wp_timezone() );
}

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$cards          = get_field( 'cards' );
	$count          = is_array( $cards ) ? count( $cards ) : 0;
	$max_per_row    = get_field( 'max_per_row' );
	$stack_mobile   = get_field( 'stack_on_mobile' );
	$is_scheduled   = get_field( 'is_scheduled' );
	$start_raw      = get_field( 'start_date_time' );
	$end_raw        = get_field( 'end_date_time' );

	$schedule_label = '';
	if ( $is_scheduled ) {
		$start_label = $start_raw ? get_site_aware_datetime( $start_raw )->format( 'F j, Y g:i a' ) : '(no start)';
		$end_label   = $end_raw ? get_site_aware_datetime( $end_raw )->format( 'F j, Y g:i a' ) : '(no end)';
		$schedule_label = $start_label . ' to ' . $end_label . ' (' . wp_timezone_string() . ')';
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--collection-cards-set' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<p style="font-size:13px;margin:0 0 8px;">
			<strong>Collection Cards Set</strong> — <?php echo esc_html( (string) $count ); ?>
			card<?php echo 1 === $count ? '' : 's'; ?>,
			max <?php echo esc_html( (string) ( $max_per_row ?: 4 ) ); ?> per row,
			<?php echo $stack_mobile ? 'stacked' : '2-up'; ?> on mobile.
		</p>

		<?php if ( $is_scheduled ) : ?>
			<p style="font-size:13px;">
				<strong>Scheduled:</strong> <?php echo esc_html( $schedule_label ); ?>
			</p>
		<?php endif; ?>

		<?php if ( $count > 0 ) : ?>
			<ul style="font-size:13px;margin:0;padding-left:18px;">
				<?php foreach ( $cards as $card ) : ?>
					<li><?php echo esc_html( trim( ( $card['preface'] ?? '' ) . ' ' . ( $card['title'] ?? '' ) ) ?: '(untitled card)' ); ?></li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — the actual grid and schedule logic render in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
