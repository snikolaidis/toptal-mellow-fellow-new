<?php

namespace HeadlessAcfBlocks\Blocks\WhatSetsUsApart;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading = get_field( 'heading' );
	$items   = get_field( 'items' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--what-sets-us-apart' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<h2 style="text-align:center;"><?php echo esc_html( $heading ?: 'What Sets Us Apart' ); ?></h2>

		<?php if ( $items ) : ?>
			<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center;">
				<?php foreach ( $items as $item ) : ?>
					<div>
						<?php if ( ! empty( $item['icon']['url'] ) ) : ?>
							<img src="<?php echo esc_url( $item['icon']['url'] ); ?>" alt="" style="width:80px;height:80px;object-fit:contain;" />
						<?php endif; ?>
						<p style="text-transform:uppercase;font-weight:bold;color:<?php echo esc_attr( $item['label_color'] ?: '#000' ); ?>;">
							<?php echo esc_html( $item['label'] ?? '' ); ?>
						</p>
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
