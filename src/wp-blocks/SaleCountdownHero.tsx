import { gql } from '@apollo/client';
import { Fragment, useEffect, useRef, useState } from 'react';

/**
 * Renders the `acf/sale-countdown-hero` ACF block on the frontend.
 *
 * DOM structure intentionally mirrors the original Shopify Liquid sections
 * (countdown-to-sale / _sale-lead-up-hero / _mellow-day-content /
 * responsive-banner) class-for-class, so the Sass being migrated over from
 * the Shopify theme can be dropped in with minimal changes. No styles are
 * defined here on purpose — styling is handled entirely by the migrated
 * Sass elsewhere in the project.
 *
 * Countdown target handling:
 * `saleCountdownHero.saleEnd` is expected to be an RFC3339 string WITH an
 * explicit UTC offset (e.g. "2026-07-04T23:59:00-04:00"), which is what
 * WPGraphQL for ACF's date_time_picker resolver is documented to return.
 * Parsed this way, `new Date(rfc3339String)` is unambiguous — the offset in
 * the string, not the visitor's browser timezone, determines the instant.
 *
 * !! Before relying on this in production, confirm in GraphiQL that the
 * offset in the returned string actually matches this site's configured
 * timezone (Settings -> General), not a bare "+00:00". If it's wrong there,
 * it will be wrong here too — this component trusts the string it's given.
 */

function getTimeRemaining(targetDate) {
  const diffMs = targetDate.getTime() - Date.now();

  if (diffMs <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function SaleCountdownHero(props) {
  const { saleCountdownHero } = props;

  const targetDate = saleCountdownHero?.saleEnd
    ? new Date(saleCountdownHero.saleEnd)
    : null;

  // null = not yet determined (avoids a flash of content before first
  // client-side check); false = expired; object = time remaining.
  const [timeRemaining, setTimeRemaining] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!targetDate) return;

    function tick() {
      const remaining = getTimeRemaining(targetDate);
      setTimeRemaining(remaining ?? false);

      if (remaining) {
        // Re-align to the next whole second, same approach as the original
        // Liquid/JS countdown.
        const msIntoSecond = Date.now() % 1000;
        timeoutRef.current = setTimeout(tick, 1000 - msIntoSecond);
      }
    }

    tick();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // targetDate is derived fresh each render from props; key off its time
    // value so this effect doesn't re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate?.getTime()]);

  if (!saleCountdownHero) {
    return null;
  }

  // Expired (or no end date configured): hide the whole block, matching the
  // original Liquid behavior of hiding the block once the target time passes.
  if (timeRemaining === false || !targetDate) {
    return null;
  }

  const { heading, tiers, button1, button2, mobileImage, tabletImage, desktopImage } =
    saleCountdownHero;

  const fallbackImage = mobileImage || tabletImage || desktopImage;

  return (
    <div className="responsive-banner__wrapper">
      <picture>
        {desktopImage?.node?.sourceUrl && (
          <source media="(width >= 1024px)" srcSet={desktopImage.node.sourceUrl} />
        )}
        {tabletImage?.node?.sourceUrl && (
          <source media="(width >= 768px)" srcSet={tabletImage.node.sourceUrl} />
        )}
        {mobileImage?.node?.sourceUrl && (
          <source media="(width < 768px)" srcSet={mobileImage.node.sourceUrl} />
        )}
        {fallbackImage?.node?.sourceUrl && (
          <img
            className="responsive-banner__image"
            src={fallbackImage.node.sourceUrl}
            alt={fallbackImage.node.altText || ''}
            width={fallbackImage.node.mediaDetails?.width}
            height={fallbackImage.node.mediaDetails?.height}
            loading="eager"
          />
        )}
      </picture>

      <div className="extra-content">
        {timeRemaining && (
          <div className="countdown-timer">
            <div className="countdown-timer__unit-wrapper days">
              <div className="countdown-timer__unit">{pad(timeRemaining.days)}</div>
              <div className="countdown-timer__unit-label">Day(s)</div>
            </div>
            <div className="countdown-timer__unit-wrapper hours">
              <div className="countdown-timer__unit">{pad(timeRemaining.hours)}</div>
              <div className="countdown-timer__unit-label">Hour(s)</div>
            </div>
            <div className="countdown-timer__unit-wrapper mins">
              <div className="countdown-timer__unit">{pad(timeRemaining.minutes)}</div>
              <div className="countdown-timer__unit-label">Min(s)</div>
            </div>
            <div className="countdown-timer__unit-wrapper secs">
              <div className="countdown-timer__unit">{pad(timeRemaining.seconds)}</div>
              <div className="countdown-timer__unit-label">Sec(s)</div>
            </div>
          </div>
        )}

        <h1 className="heading">{heading}</h1>

        {tiers?.length > 0 && (
          <div className="tiers">
            {tiers.map((tier, i) => (
              <Fragment key={i}>
                <div className="tier">
                  <div className="percentage">{tier.percentage}%</div>
                  <div className="spend">{tier.label || `Spend $${tier.spend}`}</div>
                </div>
                {i < tiers.length - 1 && <div className="divider" />}
              </Fragment>
            ))}
          </div>
        )}

        {(button1?.url || button2?.url) && (
          <div className="buttons">
            {button1?.url && (
              <a href={button1.url} className="btn btn-1">
                {button1.title}
              </a>
            )}
            {button2?.url && (
              <a href={button2.url} className="btn btn-2">
                {button2.title}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

SaleCountdownHero.displayName = 'AcfSaleCountdownHero';

SaleCountdownHero.fragments = {
  key: `AcfSaleCountdownHeroFragment`,
  entry: gql`
    fragment AcfSaleCountdownHeroFragment on AcfSaleCountdownHero {
      saleCountdownHero {
        saleEnd
        heading
        tiers {
          percentage
          spend
          label
        }
        button1 {
          url
          title
          target
        }
        button2 {
          url
          title
          target
        }
        mobileImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        tabletImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        desktopImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
      }
    }
  `,
};
