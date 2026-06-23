<?php
/**
 * Render callback for the Sale Countdown Hero block.
 *
 * IMPORTANT: This output only powers the WP admin editor preview. The live
 * frontend is rendered by the Faust.js React app via WPGraphQL — see the
 * note on timezone handling below, which matters for both the PHP preview
 * and the GraphQL-exposed value the frontend actually uses.
 */

namespace HeadlessAcfBlocks\Blocks\SaleCountdownHero;

defined( 'ABSPATH' ) || exit;

/**
 * ACF's date_time_picker stores a naive 'Y-m-d H:i:s' string with NO
 * timezone information attached. The editor enters it expecting it to mean
 * "this moment, in whatever timezone this site is configured for"
 * (Settings -> General -> Timezone). To make that moment unambiguous for
 * any consumer (this preview, or the GraphQL API the frontend queries), we
 * explicitly attach WordPress's configured timezone using wp_timezone() —
 * never date_default_timezone_set(), which WordPress core does not
 * reliably honor since WP 5.3.
 *
 * @param string $raw_datetime The raw 'Y-m-d H:i:s' string from ACF.
 * @return \DateTimeImmutable A timezone-aware DateTimeImmutable instance.
 */
function get_site_aware_datetime( string $raw_datetime ): \DateTimeImmutable {
	return new \DateTimeImmutable( $raw_datetime, wp_timezone() );
}

/**
 * @param array  $block      Block settings and attributes.
 * @param string $content    Block inner HTML (empty for this block).
 * @param bool   $is_preview True during AJAX preview in the editor.
 * @param int    $post_id    The post ID this block is saved to.
 */
function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$sale_end_raw = get_field( 'sale_end' );
	$heading      = get_field( 'heading' );
	$tiers        = get_field( 'tiers' );
	$button_1     = get_field( 'button_1' );
	$button_2     = get_field( 'button_2' );
	$desktop_img  = get_field( 'desktop_image' );

	$sale_end_label = '';
	if ( $sale_end_raw ) {
		$sale_end_dt    = get_site_aware_datetime( $sale_end_raw );
		$sale_end_label = $sale_end_dt->format( 'F j, Y g:i a' ) . ' (' . wp_timezone_string() . ')';
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--sale-countdown' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $desktop_img ) : ?>
			<img
				src="<?php echo esc_url( $desktop_img['sizes']['medium'] ?? $desktop_img['url'] ); ?>"
				alt=""
				style="max-width:100%;height:auto;opacity:0.5;"
			/>
		<?php endif; ?>

		<h2><?php echo esc_html( $heading ?: 'Sale Heading' ); ?></h2>

		<p style="font-size:13px;">
			<strong>Counts down to:</strong>
			<?php echo esc_html( $sale_end_label ?: 'No end date set' ); ?>
		</p>

		<?php if ( ! empty( $tiers ) ) : ?>
			<ul style="font-size:13px;">
				<?php foreach ( $tiers as $tier ) : ?>
					<li>
						<?php echo esc_html( $tier['percentage'] ); ?>% —
						<?php echo esc_html( $tier['label'] ?: ( 'Spend $' . $tier['spend'] ) ); ?>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<?php if ( ! empty( $button_1['url'] ) || ! empty( $button_2['url'] ) ) : ?>
			<p>
				<?php if ( ! empty( $button_1['url'] ) ) : ?>
					<span class="button" style="display:inline-block;padding:6px 14px;background:#eee;border-radius:4px;margin-right:8px;">
						<?php echo esc_html( $button_1['title'] ?: 'Button 1' ); ?>
					</span>
				<?php endif; ?>
				<?php if ( ! empty( $button_2['url'] ) ) : ?>
					<span class="button" style="display:inline-block;padding:6px 14px;background:#eee;border-radius:4px;">
						<?php echo esc_html( $button_2['title'] ?: 'Button 2' ); ?>
					</span>
				<?php endif; ?>
			</p>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering and countdown logic happen in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
