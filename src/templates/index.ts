/**
 * Faust.js template hierarchy.
 *
 * Keys are WordPress template names resolved by Faust's `getPossibleTemplates`
 * from the seed node (e.g. `front-page` for the static front page, `page-{slug}`
 * for a specific page, `page` as the generic fallback). The thin route wrappers
 * (`src/pages/index.tsx` for `/` and `src/pages/pages/[...wordpressNode].tsx`
 * for `/pages/*`) call `getWordPressProps`, which selects and renders the
 * matching template below.
 */
import FrontPage from './front-page';
import Page from './page';
import MellowDay2026 from './page-mellow-day-2026';
import Rewards from './page-rewards';
import Affiliate from './page-affiliate';
import BonusPointsProducts from './page-bonus-points-products';

const templates = {
  'front-page': FrontPage,
  'page': Page,
  'page-mellow-day-2026': MellowDay2026,
  'page-rewards': Rewards,
  'page-affiliate': Affiliate,
  'page-bonus-points-products': BonusPointsProducts,
};

export default templates;
