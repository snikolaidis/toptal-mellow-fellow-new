<?php

namespace HeadlessAcfBlocks\Blocks\PromoSlider;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$slides = get_field( 'slides' );
	$count  = is_array( $slides ) ? count( $slides ) : 0;

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--promo-slider' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<p style="font-size:15px;font-weight:600;margin:0;">Promo Slider</p>

		<?php if ( $count ) : ?>
			<ul style="font-size:13px;margin-top:6px;">
				<?php foreach ( $slides as $slide ) : ?>
					<li><?php echo esc_html( $slide['heading'] ?? 'Untitled slide' ); ?></li>
				<?php endforeach; ?>
			</ul>
		<?php else : ?>
			<p style="font-size:13px;margin-top:6px;">No slides yet.</p>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only &mdash; the slider renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
