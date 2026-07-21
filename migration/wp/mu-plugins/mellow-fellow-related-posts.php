<?php
/**
 * Plugin Name: Mellow Fellow - Collection Related Posts
 * Description: Adds Collection.relatedPosts — matches a collection to blog
 *              posts server-side (by tag overlap, falling back to title
 *              overlap) so the frontend doesn't need to fetch every tag and
 *              the latest N posts just to score them client-side.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MF_RELATED_POSTS_STOP_WORDS', ['the', 'and', 'for', 'with', 'your', 'our', 'a', 'an', 'of', 'to', 'in', 'on']);

// Words so common across this site's collections/tags/posts (nearly every
// product is cannabis-derived) that they add no discriminative value to a
// match — without excluding them, "thc" alone would tie a THC-seltzer
// collection to any THC post regardless of product type.
define('MF_RELATED_POSTS_DOMAIN_STOP_WORDS', ['thc', 'cbd', 'delta', 'delta8', 'delta9', 'hemp', 'cannabis', 'cannabinoid', 'cannabinoids']);

define('MF_RELATED_POSTS_MAX_TAGS', 3);
define('MF_RELATED_POSTS_DEFAULT_TARGET', 12);
define('MF_RELATED_POSTS_POOL_SIZE', 60);

/**
 * Tokenizes text into a lowercase word set, stripping stop words and naively
 * singularizing (trailing "s") so a pluralized collection name still matches
 * a singular tag/title, and vice versa.
 */
function mf_related_posts_word_set(string $text): array {
    $words = preg_split('/[^a-z0-9]+/', strtolower($text)) ?: [];
    $set = [];
    foreach ($words as $word) {
        if (strlen($word) <= 2) continue;
        if (in_array($word, MF_RELATED_POSTS_STOP_WORDS, true)) continue;
        if (in_array($word, MF_RELATED_POSTS_DOMAIN_STOP_WORDS, true)) continue;
        $word = preg_replace('/s$/', '', $word);
        $set[$word] = true;
    }
    return $set;
}

function mf_related_posts_overlap_score(array $a, array $b): int {
    $score = 0;
    foreach ($a as $word => $_) {
        if (isset($b[$word])) {
            $score++;
        }
    }
    return $score;
}

/**
 * Up to MF_RELATED_POSTS_MAX_TAGS post_tag terms best matching the collection
 * name — an exact name/slug match is ranked first, then the next-best
 * word-overlap matches, so a multi-themed collection can pull from several
 * relevant tags instead of just one.
 */
function mf_related_posts_matching_tags(string $collection_name): array {
    $normalized = strtolower(trim($collection_name));
    $slug_form = preg_replace('/\s+/', '-', $normalized);
    $name_words = mf_related_posts_word_set($collection_name);

    $tags = get_terms([
        'taxonomy'   => 'post_tag',
        'hide_empty' => true,
    ]);

    if (is_wp_error($tags) || empty($tags)) {
        return [];
    }

    $scored = [];
    foreach ($tags as $tag) {
        $is_exact = strtolower(trim($tag->name)) === $normalized || $tag->slug === $slug_form;
        $score = $is_exact ? PHP_INT_MAX : mf_related_posts_overlap_score($name_words, mf_related_posts_word_set($tag->name));
        if ($score > 0) {
            $scored[] = ['tag' => $tag, 'score' => $score];
        }
    }

    usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

    return array_slice(array_map(fn($entry) => $entry['tag'], $scored), 0, MF_RELATED_POSTS_MAX_TAGS);
}

/** Ranks posts by title word-overlap with the collection name, best first. */
function mf_related_posts_rank_by_title(string $collection_name, array $posts): array {
    $name_words = mf_related_posts_word_set($collection_name);
    if (empty($name_words)) {
        return [];
    }

    $scored = [];
    foreach ($posts as $post) {
        $score = mf_related_posts_overlap_score($name_words, mf_related_posts_word_set($post->post_title));
        if ($score > 0) {
            $scored[] = ['post' => $post, 'score' => $score];
        }
    }

    usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

    return array_map(fn($entry) => $entry['post'], $scored);
}

/**
 * Prefers matching blog tags (precise); falls back to title word-overlap
 * against the recent-posts pool. No further fallback — if neither finds
 * anything relevant, the caller just gets fewer than $target posts back
 * rather than padding the result with unrelated latest posts.
 */
function mf_related_posts_resolve(string $collection_name, int $target): array {
    $related = [];
    $used_ids = [];

    $matching_tags = mf_related_posts_matching_tags($collection_name);

    if (!empty($matching_tags)) {
        $tagged = get_posts([
            'post_type'      => 'post',
            'post_status'    => 'publish',
            'posts_per_page' => $target,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'tax_query'      => [[
                'taxonomy' => 'post_tag',
                'field'    => 'term_id',
                'terms'    => array_map(fn($tag) => $tag->term_id, $matching_tags),
                'operator' => 'IN',
            ]],
        ]);

        foreach ($tagged as $post) {
            $related[] = $post;
            $used_ids[$post->ID] = true;
        }
    }

    if (count($related) < $target) {
        $pool = get_posts([
            'post_type'      => 'post',
            'post_status'    => 'publish',
            'posts_per_page' => MF_RELATED_POSTS_POOL_SIZE,
            'orderby'        => 'date',
            'order'          => 'DESC',
        ]);

        foreach (mf_related_posts_rank_by_title($collection_name, $pool) as $post) {
            if (count($related) >= $target) break;
            if (isset($used_ids[$post->ID])) continue;
            $related[] = $post;
            $used_ids[$post->ID] = true;
        }
    }

    return $related;
}

add_action('graphql_register_types', function () {
    register_graphql_field('Collection', 'relatedPosts', [
        'type'        => ['list_of' => 'Post'],
        'description' => 'Blog posts related to this collection, matched server-side by blog tag overlap (falling back to title overlap).',
        'args'        => [
            'first' => [
                'type'        => 'Int',
                'description' => 'Number of related posts to return (default 12).',
            ],
        ],
        'resolve' => function ($source, $args, $context) {
            $target = isset($args['first']) ? max(0, (int) $args['first']) : MF_RELATED_POSTS_DEFAULT_TARGET;
            $collection_name = $source->name ?? '';

            if ($target === 0 || $collection_name === '') {
                return [];
            }

            $posts = mf_related_posts_resolve($collection_name, $target);

            return array_map(
                fn($post) => $context->get_loader('post')->load_deferred($post->ID),
                $posts
            );
        },
    ]);
});
