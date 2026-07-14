import { CoreBlocks } from '@faustwp/blocks';
import HeroSection from './HeroSection';
import HeroSlider from './HeroSlider';
import CollectionLinks from './CollectionLinks';
import CollectionSlider from './CollectionSlider';
import SaleCountdownHero from './SaleCountdownHero';
import DoublePointsDaily from './DoublePointsDaily';
import CollectionGroup from './CollectionGroup';
import ImageSlider from './ImageSlider';
import HighlightsGroup from './HighlightsGroup';
import ResponsiveImage from './ResponsiveImage';
import ImageCarousel from './ImageCarousel';
import FeaturedCollection from './FeaturedCollection';
import BlendCallout from './BlendCallout';
import CannabinoidCallout from './CannabinoidCallout';
import ValuePropsSet from './ValuePropsSet';
import CollectionCardsSet from './CollectionCardsSet';
import ShoppableHero from './ShoppableHero';
import UgcCarousel from './UgcCarousel';
import BlogPosts from './BlogPosts';
import Faq from './Faq';
import ReviewsCarousel from './ReviewsCarousel';
import PromoSlider from './PromoSlider';

export default {
  ...CoreBlocks,
  // Key must exactly match the block's __typename in the GraphQL schema.
  AcfHeroSection: HeroSection,
  // Ready, but inert until the `acf/hero-slider` block is deployed to WP (the
  // `AcfHeroSlider` type must exist before the front-page template can query it).
  AcfHeroSlider: HeroSlider,
  // Ready, but inert until the `acf/collection-links` block is deployed to WP.
  AcfCollectionLinks: CollectionLinks,
  // Ready, but inert until the `acf/collection-slider` block is deployed to WP.
  AcfCollectionSlider: CollectionSlider,
  AcfSaleCountdownHero: SaleCountdownHero,
  // Hardcoded for now — inert until a matching WP/ACF block __typename exists.
  // Currently rendered via a direct import on the mellow-day-2026 page.
  AcfDoublePointsDaily: DoublePointsDaily,
  // Migrated from Shopify; takes collections as props. Inert until a matching
  // WP/ACF block __typename exists.
  AcfCollectionGroup: CollectionGroup,
  // Ready, but inert until the `acf/image-slider` block is deployed to WP (the
  // `AcfImageSlider` type must exist before templates can query it).
  AcfImageSlider: ImageSlider,
  // Ready, but inert until the `acf/highlights-group` block is deployed to WP.
  AcfHighlightsGroup: HighlightsGroup,
  // Ready, but inert until the `acf/responsive-image` block is deployed to WP.
  AcfResponsiveImage: ResponsiveImage,
  // Ready, but inert until the `acf/image-carousel` block is deployed to WP.
  AcfImageCarousel: ImageCarousel,
  // Ready, but inert until the `acf/featured-collection` block is deployed to WP.
  AcfFeaturedCollection: FeaturedCollection,
  // Ready, but inert until the `acf/blend-callout` block is deployed to WP.
  AcfBlendCallout: BlendCallout,
  AcfCannabinoidCallout: CannabinoidCallout,
  // Ready, but inert until the `acf/value-props-set` block is deployed to WP.
  // Content is global (Site Settings → Value Props), fetched by the component
  // itself — the block is just a placement marker.
  AcfValuePropsSet: ValuePropsSet,
  // Ready, but inert until the `acf/collection-cards-set` block is deployed to
  // WP. Content is per-block (each placement has its own cards).
  AcfCollectionCardsSet: CollectionCardsSet,
  // Ready, but inert until the `acf/shoppable-hero` block is deployed to WP.
  AcfShoppableHero: ShoppableHero,
  // Ready, but inert until the `acf/ugc-carousel` block is deployed to WP. The
  // videos are global (managed on the Affiliate page), fetched by the component
  // itself — the block is just a placement marker with a title.
  AcfUgcCarousel: UgcCarousel,
  // Ready, but inert until the `acf/blog-posts` block is deployed to WP. Posts
  // are fetched by the component itself.
  AcfBlogPosts: BlogPosts,
  // Ready, but inert until the `acf/faq` block is deployed to WP.
  AcfFaq: Faq,
  // Ready, but inert until the `acf/reviews-carousel` block is deployed to WP.
  // The reviews themselves are rendered by klaviyo.js into the carousel div.
  AcfReviewsCarousel: ReviewsCarousel,
  // Ready, but inert until the `acf/promo-slider` block is deployed to WP.
  AcfPromoSlider: PromoSlider
};