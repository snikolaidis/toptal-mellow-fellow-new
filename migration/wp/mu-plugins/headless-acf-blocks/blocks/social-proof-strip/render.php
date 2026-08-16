<?php

namespace HeadlessAcfBlocks\Blocks\SocialProofStrip;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading    = get_field( 'heading' );
	$subheading = get_field( 'subheading' );
	$thumbs     = get_field( 'thumbs' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--social-proof-strip' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<?php if ( $thumbs ) : ?>
			<div style="display:flex;gap:10px;align-items:center;overflow:hidden;">
				<?php foreach ( $thumbs as $thumb ) : ?>
					<span style="display:inline-flex;align-items:center;justify-content:center;width:70px;height:70px;border-radius:40px;background:<?php echo esc_attr( $thumb['glow_color'] ?: '#eee' ); ?>;">
						<?php if ( ! empty( $thumb['image']['sizes']['thumbnail'] ) ) : ?>
							<img src="<?php echo esc_url( $thumb['image']['sizes']['thumbnail'] ); ?>" alt="" style="max-width:100%;height:auto;" />
						<?php endif; ?>
					</span>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<h2 style="text-align:center;text-transform:uppercase;"><?php echo esc_html( $heading ?: '5 Million+' ); ?></h2>

		<?php if ( $subheading ) : ?>
			<p style="text-align:center;"><?php echo esc_html( $subheading ); ?></p>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
