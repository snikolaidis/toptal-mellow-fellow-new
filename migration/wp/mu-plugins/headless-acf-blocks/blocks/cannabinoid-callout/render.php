<?php

namespace HeadlessAcfBlocks\Blocks\CannabinoidCallout;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$name        = get_field( 'name' );
	$icon        = get_field( 'icon' );
	$description = get_field( 'description' );
	$learn_link  = get_field( 'learn_link' );
	$shop_link   = get_field( 'shop_link' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--cannabinoid-callout' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<?php if ( $icon ) : ?>
			<img
				src="<?php echo esc_url( $icon['sizes']['medium'] ?? $icon['url'] ); ?>"
				alt=""
				style="max-width:100%;height:auto;opacity:0.6;"
			/>
		<?php endif; ?>

		<h2><?php echo esc_html( $name ?: 'Cannabinoid Callout Name' ); ?></h2>

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
