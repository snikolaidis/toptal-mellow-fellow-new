<?php

namespace HeadlessAcfBlocks\Blocks\ReviewsCarousel;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$title = get_field( 'title' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--reviews-carousel' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<p style="font-size:15px;font-weight:600;margin:0;">
			<?php echo $title ? esc_html( $title ) : 'Reviews Carousel'; ?>
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only &mdash; the Klaviyo reviews carousel renders in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
