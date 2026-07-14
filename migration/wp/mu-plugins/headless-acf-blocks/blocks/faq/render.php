<?php

namespace HeadlessAcfBlocks\Blocks\Faq;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$groups = get_field( 'groups' );
	$count  = is_array( $groups ) ? count( $groups ) : 0;

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--faq' )
	);
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput ?>>
		<p style="font-size:15px;font-weight:600;margin:0;">FAQ</p>

		<?php if ( $count ) : ?>
			<ul style="font-size:13px;margin-top:6px;">
				<?php foreach ( $groups as $group ) : ?>
					<li>
						<?php echo esc_html( $group['group_title'] ?? 'Untitled group' ); ?>
						(<?php echo esc_html( is_array( $group['questions'] ?? null ) ? count( $group['questions'] ) : 0 ); ?> questions)
					</li>
				<?php endforeach; ?>
			</ul>
		<?php else : ?>
			<p style="font-size:13px;margin-top:6px;">No groups yet.</p>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:4px;">
			<em>Preview only &mdash; the accordions render in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
