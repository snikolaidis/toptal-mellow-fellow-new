<?php

namespace HeadlessAcfBlocks\Blocks\CategoryTabs;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$heading    = get_field( 'heading' );
	$subheading = get_field( 'subheading' );
	$tabs       = get_field( 'tabs' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--category-tabs' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<h2 style="text-align:center;"><?php echo esc_html( $heading ?: 'Shop by Category' ); ?></h2>

		<?php if ( $subheading ) : ?>
			<p style="text-align:center;"><?php echo esc_html( $subheading ); ?></p>
		<?php endif; ?>

		<?php if ( $tabs ) : ?>
			<div style="display:flex;gap:0;overflow:hidden;border-bottom:2px solid #fdc777;">
				<?php foreach ( $tabs as $tab ) : ?>
					<span style="display:inline-flex;align-items:center;gap:10px;padding:10px 20px;<?php echo ! empty( $tab['is_active'] ) ? 'background:#ffeaa8;border-radius:12px 12px 0 0;' : ''; ?>">
						<?php if ( ! empty( $tab['icon']['sizes']['thumbnail'] ) ) : ?>
							<img src="<?php echo esc_url( $tab['icon']['sizes']['thumbnail'] ); ?>" alt="" style="width:24px;height:24px;object-fit:contain;" />
						<?php endif; ?>
						<?php echo esc_html( $tab['label'] ?? '' ); ?>
					</span>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
