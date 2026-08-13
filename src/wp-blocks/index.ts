import dynamic from 'next/dynamic';
import { CoreBlocks } from '@faustwp/blocks';

const blocks: Record<string, any> = {
  ...CoreBlocks,
  AcfHeroSection: dynamic(() => import('./HeroSection')),
  AcfHeroSlider: dynamic(() => import('./HeroSlider')),
  AcfCollectionLinks: dynamic(() => import('./CollectionLinks')),
  AcfCollectionSlider: dynamic(() => import('./CollectionSlider')),
  AcfSaleCountdownHero: dynamic(() => import('./SaleCountdownHero')),
  AcfDoublePointsDaily: dynamic(() => import('./DoublePointsDaily')),
  AcfCollectionGroup: dynamic(() => import('./CollectionGroup')),
  AcfImageSlider: dynamic(() => import('./ImageSlider')),
  AcfHighlightsGroup: dynamic(() => import('./HighlightsGroup')),
  AcfResponsiveImage: dynamic(() => import('./ResponsiveImage')),
  AcfImageCarousel: dynamic(() => import('./ImageCarousel')),
  AcfFeaturedCollection: dynamic(() => import('./FeaturedCollection')),
  AcfBlendCallout: dynamic(() => import('./BlendCallout')),
  AcfCannabinoidCallout: dynamic(() => import('./CannabinoidCallout')),
  AcfValuePropsSet: dynamic(() => import('./ValuePropsSet')),
  AcfCollectionCardsSet: dynamic(() => import('./CollectionCardsSet')),
  AcfShoppableHero: dynamic(() => import('./ShoppableHero')),
  AcfUgcCarousel: dynamic(() => import('./UgcCarousel')),
  AcfBlogPosts: dynamic(() => import('./BlogPosts')),
  AcfFaq: dynamic(() => import('./Faq')),
  AcfReviewsCarousel: dynamic(() => import('./ReviewsCarousel')),
  AcfPromoSlider: dynamic(() => import('./PromoSlider')),
  AcfDiscountCodeBar: dynamic(() => import('./DiscountCodeBar')),
  AcfQuizHero: dynamic(() => import('./QuizHero')),
  AcfShopByMood: dynamic(() => import('./ShopByMood')),
  AcfSocialProofStrip: dynamic(() => import('./SocialProofStrip')),
  AcfCategoryTabs: dynamic(() => import('./CategoryTabs')),
  AcfWhatSetsUsApart: dynamic(() => import('./WhatSetsUsApart')),
  AcfLoyaltyTiers: dynamic(() => import('./LoyaltyTiers')),
};

export default blocks;
