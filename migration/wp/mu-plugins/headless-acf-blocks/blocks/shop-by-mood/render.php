<?php

namespace HeadlessAcfBlocks\Blocks\ShopByMood;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading    = get_field( 'heading' );
	$subheading = get_field( 'subheading' );
	$cards      = get_field( 'cards' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--shop-by-mood' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<h2 style="text-align:center;"><?php echo esc_html( $heading ?: 'Shop by Mood' ); ?></h2>

		<?php if ( $subheading ) : ?>
			<p style="text-align:center;"><?php echo esc_html( $subheading ); ?></p>
		<?php endif; ?>

		<?php if ( $cards ) : ?>
			<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
				<?php foreach ( $cards as $card ) : ?>
					<div style="position:relative;border-radius:8px;overflow:hidden;background:#eee;min-height:80px;">
						<?php if ( ! empty( $card['image']['sizes']['medium'] ) ) : ?>
							<img src="<?php echo esc_url( $card['image']['sizes']['medium'] ); ?>" alt="" style="width:100%;height:80px;object-fit:cover;display:block;" />
						<?php endif; ?>
						<span style="position:absolute;left:0;right:0;bottom:6px;text-align:center;color:#fff;font-weight:bold;text-transform:uppercase;">
							<?php echo esc_html( $card['label'] ?? '' ); ?>
						</span>
					</div>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
