import type { CSSProperties } from 'react';
import { fragments } from './LoyaltyTiers.fragments';
import Image from 'next/image';
import Link from 'next/link';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
}

interface Benefit {
  icon?: { node?: MediaItem | null } | null;
  label?: string | null;
}

interface Tier {
  icon?: { node?: MediaItem | null } | null;
  iconBg?: string | null;
  name?: string | null;
  points?: string | null;
  benefits?: Benefit[] | null;
}

interface LoyaltyTiersProps {
  loyaltyTiers?: {
    badgeIcon?: { node?: MediaItem | null } | null;
    badgeText?: string | null;
    heading?: string | null;
    body?: string | null;
    cta?: { url?: string | null; title?: string | null; target?: string | null } | null;
    tiersTitle?: string | null;
    tiers?: Tier[] | null;
  } | null;
}

function BadgeIcon({ node }: { node?: MediaItem | null }) {
  if (!node?.sourceUrl) return null;
  return (
    <Image
      className="loyalty-tiers__badge-icon"
      src={node.sourceUrl}
      alt=""
      width={24}
      height={24}
    />
  );
}

export default function LoyaltyTiers(props: LoyaltyTiersProps) {
  const data = props.loyaltyTiers;
  const tiers = data?.tiers ?? [];

  // The tiers grid is the section. With the group present but the repeater empty this
  // used to render the heading and CTA over a blank grid, which reads as broken; the
  // section is better off not showing at all.
  if (!data || tiers.length === 0) {
    return null;
  }

  const { badgeIcon, badgeText, heading, body, cta, tiersTitle } = data;
  const badgeNode = badgeIcon?.node;

  return (
    <section className="loyalty-tiers">
      <div className="loyalty-tiers__panel">
        {badgeText && (
          <p className="loyalty-tiers__badge">
            <BadgeIcon node={badgeNode} />
            <span className="loyalty-tiers__badge-text">{badgeText}</span>
            <BadgeIcon node={badgeNode} />
          </p>
        )}

        {heading && <h2 className="loyalty-tiers__heading">{heading}</h2>}
        {body && <p className="loyalty-tiers__body">{body}</p>}

        {cta?.url && (
          <Link
            href={cta.url}
            target={cta.target || undefined}
            rel={cta.target === '_blank' ? 'noopener noreferrer' : undefined}
            className="loyalty-tiers__cta"
          >
            {cta.title || 'Start Earning'}
          </Link>
        )}

        {tiers.length > 0 && (
          <div className="loyalty-tiers__table">
            {tiersTitle && <p className="loyalty-tiers__table-title">{tiersTitle}</p>}

            {tiers.map((tier, i) => (
              <div key={i} className="loyalty-tiers__row">
                <div className="loyalty-tiers__tier">
                  <span
                    className="loyalty-tiers__tier-icon"
                    style={
                      tier.iconBg
                        ? ({ '--tier-icon-bg': tier.iconBg } as CSSProperties)
                        : undefined
                    }
                  >
                    {tier.icon?.node?.sourceUrl && (
                      <Image src={tier.icon.node.sourceUrl} alt="" width={32} height={32} />
                    )}
                  </span>
                  <span className="loyalty-tiers__tier-text">
                    {tier.name && <span className="loyalty-tiers__tier-name">{tier.name}</span>}
                    {tier.points && (
                      <span className="loyalty-tiers__tier-points">{tier.points}</span>
                    )}
                  </span>
                </div>

                {(tier.benefits ?? []).length > 0 && (
                  <ul className="loyalty-tiers__benefits">
                    {(tier.benefits ?? []).map((benefit, j) => (
                      <li key={j} className="loyalty-tiers__benefit">
                        {benefit.icon?.node?.sourceUrl && (
                          <Image
                            className="loyalty-tiers__benefit-icon"
                            src={benefit.icon.node.sourceUrl}
                            alt=""
                            width={20}
                            height={20}
                          />
                        )}
                        <span>{benefit.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

LoyaltyTiers.displayName = 'AcfLoyaltyTiers';

LoyaltyTiers.fragments = fragments;
