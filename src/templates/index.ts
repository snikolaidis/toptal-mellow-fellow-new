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
import PageLearnAboutOurBlends from './page-learn-about-our-blends';
import PageLearnAboutCannabinoids from './page-learn-about-cannabinoids-1';
import LandingPage from './template-landing-page';
import SnapPage from './page-snap';

const templates = {
  'front-page': FrontPage,
  'page': Page,
  'page-snap': SnapPage,
  'page-mellow-day-2026': MellowDay2026,
  'page-rewards': Rewards,
  'page-affiliate': Affiliate,
  'page-bonus-points-products': BonusPointsProducts,
  'page-learn-about-our-blends': PageLearnAboutOurBlends,
  'page-learn-about-cannabinoids-1': PageLearnAboutCannabinoids,
  // Assigned via the WP admin's Page Attributes → Template dropdown (mu-plugin:
  // mellow-fellow-page-templates.php). Faust keys custom-template matches as
  // `template-${templateName}`, checked before slug-based fallbacks.
  'template-Landing Page': LandingPage,
};

export default templates;
