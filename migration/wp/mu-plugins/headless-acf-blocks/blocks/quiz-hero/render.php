<?php

namespace HeadlessAcfBlocks\Blocks\QuizHero;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$eyebrow    = get_field( 'eyebrow' );
	$heading    = get_field( 'heading' );
	$subheading = get_field( 'subheading' );
	$cta        = get_field( 'cta_button' );
	$highlight  = get_field( 'cta_highlight' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--quiz-hero' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<?php if ( $eyebrow ) : ?>
			<p style="text-transform:uppercase;font-size:12px;font-weight:bold;letter-spacing:0.5px;"><?php echo esc_html( $eyebrow ); ?></p>
		<?php endif; ?>

		<h2><?php echo esc_html( $heading ?: 'Quiz Hero Heading' ); ?></h2>

		<?php if ( $subheading ) : ?>
			<p><?php echo esc_html( $subheading ); ?></p>
		<?php endif; ?>

		<?php if ( ! empty( $cta['url'] ) ) : ?>
			<span class="button" style="display:inline-block;padding:6px 14px;background:#3e484f;color:#fff;border-radius:999px;">
				<?php echo esc_html( trim( ( $cta['title'] ?? 'Button' ) . ' ' . ( $highlight ?? '' ) ) ); ?>
			</span>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
