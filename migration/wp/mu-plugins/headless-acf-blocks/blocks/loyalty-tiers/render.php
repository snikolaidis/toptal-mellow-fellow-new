<?php

namespace HeadlessAcfBlocks\Blocks\LoyaltyTiers;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$badge_text  = get_field( 'badge_text' );
	$heading     = get_field( 'heading' );
	$body        = get_field( 'body' );
	$cta         = get_field( 'cta' );
	$tiers_title = get_field( 'tiers_title' );
	$tiers       = get_field( 'tiers' );

	$wrapper_attributes = get_block_wrapper_attributes(
		array( 'class' => 'headless-block-preview headless-block-preview--loyalty-tiers' )
	);
	?>
	<div <?php echo $wrapper_attributes; ?>>
		<div style="background:linear-gradient(180deg,#7c629e,#d4c9e3);border-radius:13px;padding:20px;color:#fff;">
			<?php if ( $badge_text ) : ?>
				<span style="display:inline-block;background:rgba(244,63,94,0.37);border-radius:999px;padding:4px 12px;text-transform:uppercase;font-size:11px;">
					<?php echo esc_html( $badge_text ); ?>
				</span>
			<?php endif; ?>

			<h2 style="color:#fff;"><?php echo esc_html( $heading ?: 'Join Mellow Fam Club' ); ?></h2>

			<?php if ( $body ) : ?>
				<p><?php echo esc_html( $body ); ?></p>
			<?php endif; ?>

			<?php if ( ! empty( $cta['url'] ) ) : ?>
				<span style="display:inline-block;border:1px solid #fff;border-radius:999px;padding:12px 40px;">
					<?php echo esc_html( $cta['title'] ?: 'Start Earning' ); ?>
				</span>
			<?php endif; ?>

			<?php if ( $tiers ) : ?>
				<div style="background:#fff;border-radius:16px;margin-top:16px;color:#1d2b33;">
					<div style="padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.05);text-transform:uppercase;color:#9a9080;font-weight:bold;">
						<?php echo esc_html( $tiers_title ?: 'Tier Benefits' ); ?>
					</div>
					<?php foreach ( $tiers as $tier ) : ?>
						<div style="display:flex;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.05);">
							<span>
								<strong><?php echo esc_html( $tier['name'] ?? '' ); ?></strong><br />
								<small style="color:#9a9080;"><?php echo esc_html( $tier['points'] ?? '' ); ?></small>
							</span>
							<span style="text-align:right;font-size:12px;color:#3e484f;">
								<?php if ( ! empty( $tier['benefits'] ) ) : ?>
									<?php foreach ( $tier['benefits'] as $b ) : ?>
										<?php echo esc_html( $b['label'] ?? '' ); ?><br />
									<?php endforeach; ?>
								<?php endif; ?>
							</span>
						</div>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</div>

		<p style="font-size:11px;color:#888;margin-top:8px;">
			<em>Preview only — actual frontend rendering happens in the Faust.js app.</em>
		</p>
	</div>
	<?php
}
