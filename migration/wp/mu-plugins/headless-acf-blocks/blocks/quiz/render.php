<?php
/**
 * Editor-preview render for the Quiz block. The live frontend renders the quiz
 * in React; this only shows the editor which quiz is selected.
 */

namespace HeadlessAcfBlocks\Blocks\Quiz;

defined( 'ABSPATH' ) || exit;

function render( $block, $content = '', $is_preview = false, $post_id = 0 ) {
	$quiz  = get_field( 'quiz' );
	$title = '';

	if ( is_object( $quiz ) ) {
		$title = get_the_title( $quiz->ID );
	} elseif ( is_numeric( $quiz ) ) {
		$title = get_the_title( (int) $quiz );
	} elseif ( is_array( $quiz ) && isset( $quiz['ID'] ) ) {
		$title = get_the_title( (int) $quiz['ID'] );
	}

	echo '<div style="padding:28px;border:2px dashed #cbd5e1;border-radius:14px;text-align:center;font-family:sans-serif;background:#f8fafc;">';
	echo '<strong style="display:block;font-size:16px;color:#1e293b;">Quiz block</strong>';

	if ( $title ) {
		echo '<span style="color:#475569;">Showing quiz: ' . esc_html( $title ) . '</span>';
	} else {
		echo '<span style="color:#b91c1c;">Pick a quiz in the block settings on the right.</span>';
	}

	echo '</div>';
}
