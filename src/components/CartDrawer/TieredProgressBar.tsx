import { useEffect, useState } from 'react';
import { useCartOffers } from '@/config/cartOffers';
import styles from './TieredProgressBar.module.css';

interface Props {
  subtotal: number;
}

function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6h11v9H2z" />
      <path d="M13 9h4l3 3v3h-7z" />
      <circle cx="6.5" cy="17.5" r="1.6" />
      <circle cx="16.5" cy="17.5" r="1.6" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12v8H4v-8" />
      <path d="M2 8h20v4H2z" />
      <path d="M12 8v12" />
      <path d="M12 8S11 3 8 4c-2 .7-1 4 4 4z" />
      <path d="M12 8s1-5 4-4c2 .7 1 4-4 4z" />
    </svg>
  );
}

export default function TieredProgressBar({ subtotal }: Props) {
  const { tiers: rawTiers } = useCartOffers();
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 60);
    return () => clearTimeout(t);
  }, []);
  const tiers = [...rawTiers].sort((a, b) => a.amount - b.amount);
  if (tiers.length === 0) return null;

  const maxAmount = tiers[tiers.length - 1].amount;
  const progress = Math.min(100, (subtotal / maxAmount) * 100);
  const nextTier = tiers.find((t) => subtotal < t.amount);

  return (
    <div className={styles.wrap}>
      <p className={styles.text}>
        {nextTier ? (
          <>
            You are <strong>${(nextTier.amount - subtotal).toFixed(2)} USD</strong> away from{' '}
            <strong>{nextTier.label}!</strong>
          </>
        ) : (
          <>You have unlocked <strong>every reward!</strong></>
        )}
      </p>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${filled ? progress : 0}%` }} />
        {tiers.map((tier) => {
          const reached = subtotal >= tier.amount;
          const left = Math.min(100, (tier.amount / maxAmount) * 100);
          const isGift = /gift/i.test(tier.label);
          return (
            <div key={tier.amount} className={styles.milestone} style={{ left: `${left}%` }}>
              <span
                className={`${styles.dot} ${reached ? styles.dotReached : ''}`}
                title={tier.label}
                aria-label={tier.label}
              >
                {isGift ? <GiftIcon /> : <TruckIcon />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
