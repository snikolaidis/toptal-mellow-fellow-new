import dynamic from 'next/dynamic';
import { CoreBlocks } from '@faustwp/blocks';

function block(name: string, loader: () => Promise<any>) {
  const Component = dynamic(loader);
  Component.displayName = name;
  return Component;
}

const blocks: Record<string, any> = {
  ...CoreBlocks,
  AcfHeroSection: block('AcfHeroSection', () => import('./HeroSection')),
  AcfHeroSlider: block('AcfHeroSlider', () => import('./HeroSlider')),
  AcfCollectionLinks: block('AcfCollectionLinks', () => import('./CollectionLinks')),
  AcfCollectionSlider: block('AcfCollectionSlider', () => import('./CollectionSlider')),
  AcfSaleCountdownHero: block('AcfSaleCountdownHero', () => import('./SaleCountdownHero')),
  AcfDoublePointsDaily: block('AcfDoublePointsDaily', () => import('./DoublePointsDaily')),
  AcfCollectionGroup: block('AcfCollectionGroup', () => import('./CollectionGroup')),
  AcfImageSlider: block('AcfImageSlider', () => import('./ImageSlider')),
  AcfHighlightsGroup: block('AcfHighlightsGroup', () => import('./HighlightsGroup')),
  AcfResponsiveImage: block('AcfResponsiveImage', () => import('./ResponsiveImage')),
  AcfImageCarousel: block('AcfImageCarousel', () => import('./ImageCarousel')),
  AcfFeaturedCollection: block('AcfFeaturedCollection', () => import('./FeaturedCollection')),
  AcfBlendCallout: block('AcfBlendCallout', () => import('./BlendCallout')),
  AcfCannabinoidCallout: block('AcfCannabinoidCallout', () => import('./CannabinoidCallout')),
  AcfValuePropsSet: block('AcfValuePropsSet', () => import('./ValuePropsSet')),
  AcfCollectionCardsSet: block('AcfCollectionCardsSet', () => import('./CollectionCardsSet')),
  AcfShoppableHero: block('AcfShoppableHero', () => import('./ShoppableHero')),
  AcfUgcCarousel: block('AcfUgcCarousel', () => import('./UgcCarousel')),
  AcfBlogPosts: block('AcfBlogPosts', () => import('./BlogPosts')),
  AcfFaq: block('AcfFaq', () => import('./Faq')),
  AcfReviewsCarousel: block('AcfReviewsCarousel', () => import('./ReviewsCarousel')),
  AcfPromoSlider: block('AcfPromoSlider', () => import('./PromoSlider')),
  AcfDiscountCodeBar: block('AcfDiscountCodeBar', () => import('./DiscountCodeBar')),
  AcfQuizHero: block('AcfQuizHero', () => import('./QuizHero')),
  AcfShopByMood: block('AcfShopByMood', () => import('./ShopByMood')),
  AcfSocialProofStrip: block('AcfSocialProofStrip', () => import('./SocialProofStrip')),
  AcfCategoryTabs: block('AcfCategoryTabs', () => import('./CategoryTabs')),
  AcfWhatSetsUsApart: block('AcfWhatSetsUsApart', () => import('./WhatSetsUsApart')),
  AcfLoyaltyTiers: block('AcfLoyaltyTiers', () => import('./LoyaltyTiers')),
};

export default blocks;
