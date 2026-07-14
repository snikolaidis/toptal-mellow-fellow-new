<?php

namespace HeadlessAcfBlocks\Blocks\BlogPosts;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$title       = get_field( 'title' );
	$post_count  = get_field( 'post_count' );
	$button_text = get_field( 'button_text' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--blog-posts' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<p style="font-size:15px;font-weight:600;margin:0;">
			<?php echo $title ? esc_html( $title ) : 'Blog Posts'; ?>
		</p>

		<p style="font-size:13px;margin-top:4px;">
			<?php echo esc_html( (int) $post_count ); ?> latest posts<?php echo $button_text ? esc_html( ', button: "' . $button_text . '"' ) : ''; ?>.
		</p>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only &mdash; the posts render in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
