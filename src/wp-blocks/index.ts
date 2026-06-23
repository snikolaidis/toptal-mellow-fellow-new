import { CoreBlocks } from '@faustwp/blocks';
import HeroSection from './HeroSection';
import SaleCountdownHero from './SaleCountdownHero';

export default {
  ...CoreBlocks,
  // Key must exactly match the block's __typename in the GraphQL schema.
  AcfHeroSection: HeroSection,
  AcfSaleCountdownHero: SaleCountdownHero
};