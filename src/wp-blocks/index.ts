import { CoreBlocks } from '@faustwp/blocks';
import HeroSection from './HeroSection';
import SaleCountdownHero from './SaleCountdownHero';
import DoublePointsDaily from './DoublePointsDaily';

export default {
  ...CoreBlocks,
  // Key must exactly match the block's __typename in the GraphQL schema.
  AcfHeroSection: HeroSection,
  AcfSaleCountdownHero: SaleCountdownHero,
  // Hardcoded for now — inert until a matching WP/ACF block __typename exists.
  // Currently rendered via a direct import on the mellow-day-2026 page.
  AcfDoublePointsDaily: DoublePointsDaily
};