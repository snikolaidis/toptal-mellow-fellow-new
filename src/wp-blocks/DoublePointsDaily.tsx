/**
 * Hardcoded copy of the "Double Points Daily" section from the live Shopify
 * page (mellowfellow.fun/pages/mellow-day-2026), section id
 * `shopify-section-template--17389647921358__double_points_daily_eMibC3`.
 *
 * Rendered verbatim via dangerouslySetInnerHTML so the original markup —
 * class names, ids, structure — is preserved exactly, letting the Shopify
 * Sass being migrated over drop in class-for-class. No data wiring yet; this
 * is a static placeholder until it's turned into a real ACF block.
 *
 * Note: this is static HTML only — any inline <script> would not execute, and
 * the markup here has none. Styling is handled by migrated Sass elsewhere.
 */

const MARKUP = `<section id="shopify-section-template--17389647921358__double_points_daily_eMibC3" class="shopify-section double-points-daily"><div class="container">
  <div class="contents-box">
    <div class="section-header">

      <p class="section-header__preface">
        DOUBLE POINTS DAILY
      </p>

      <h2 class="section-header__title h2">
        A New Category Earns <span class="highlight-text"><span>2x Points</span> Each Day.</span>
      </h2>

      <p class="section-header__blurb">
        Shop a new featured category every day and earn double Mellow Fan points on every qualifying purchase. Come back daily to discover something new, save more, and make the most of Mellow Day.
      </p>

    </div>

    <ul class="days">
      <li id="shopify-block-ANHpLVVpRN1VyVU9JM__double_points_day_DFcXxd" class="shopify-block double-points-day">





  <div class="double-points-day__link past">

  <p class="day-title">
    Day 1
  </p>
  <p class="collection-title">
    Disposables
  </p>

  </div>


</li>
<li id="shopify-block-AS0toZU9BSUQ1NUdSM__double_points_day_D3G6iU" class="shopify-block double-points-day">





  <div class="double-points-day__link past">

  <p class="day-title">
    Day 2
  </p>
  <p class="collection-title">
    Edibles
  </p>

  </div>


</li>
<li id="shopify-block-ASkZhTjNXZ0NuVndLb__double_points_day_4wLmQQ" class="shopify-block double-points-day">





  <a href="/collections/flower-wellness" class="double-points-day__link active">

  <p class="day-title">
    Day 3
  </p>
  <p class="collection-title">
    Flower &amp; Wellness
  </p>


      <span class="live-label">
        Live Today
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="11" viewBox="0 0 8 11" fill="none">
  <path d="M3.52935 10.7986C3.78967 11.0671 4.21242 11.0671 4.47273 10.7986L7.80476 7.36091C8.06508 7.09234 8.06508 6.65618 7.80476 6.38762C7.54445 6.11905 7.1217 6.11905 6.86138 6.38762L4.66641 8.65218L4.66641 0.687533C4.66641 0.307241 4.36861 -1.58733e-07 4 -1.74846e-07C3.63139 -1.90958e-07 3.33359 0.307241 3.33359 0.687533L3.33359 8.65218L1.13862 6.38762C0.878304 6.11905 0.455551 6.11905 0.195236 6.38762C-0.065079 6.65618 -0.065079 7.09234 0.195236 7.36091L3.52727 10.7986L3.52935 10.7986Z" fill="white"></path>
</svg>
      </span>

  </a>


</li>
<li id="shopify-block-AUzVWZzhRYTdNRU8xb__double_points_day_U9fCjy" class="shopify-block double-points-day">





  <a href="/collections/carts-concentrates" class="double-points-day__link">

  <p class="day-title">
    Day 4
  </p>
  <p class="collection-title">
    Carts &amp; Concentrates
  </p>


  </a>


</li>

    </ul>
  </div>
</div>

</section>`;

export default function DoublePointsDaily() {
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}

DoublePointsDaily.displayName = 'DoublePointsDaily';
