import { CoreBlocks } from '@faustwp/blocks';
import HeroSection from './HeroSection';
import HeroSlider from './HeroSlider';
import CollectionLinks from './CollectionLinks';
import CollectionSlider from './CollectionSlider';
import SaleCountdownHero from './SaleCountdownHero';
import DoublePointsDaily from './DoublePointsDaily';
import CollectionGroup from './CollectionGroup';

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
  AcfCollectionGroup: CollectionGroup
};