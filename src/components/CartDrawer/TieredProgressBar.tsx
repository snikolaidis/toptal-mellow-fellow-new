import { useCartOffers } from '@/config/cartOffers';
import styles from './TieredProgressBar.module.css';

interface Props {
  subtotal: number;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TieredProgressBar({ subtotal }: Props) {
  const { tiers: rawTiers } = useCartOffers();
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
        <div className={styles.fill} style={{ width: `${progress}%` }} />
        {tiers.map((tier) => {
          const reached = subtotal >= tier.amount;
          const left = Math.min(100, (tier.amount / maxAmount) * 100);
          return (
            <div key={tier.amount} className={styles.milestone} style={{ left: `${left}%` }}>
              <span className={`${styles.dot} ${reached ? styles.dotReached : ''}`}>
                {reached && <CheckIcon />}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.labels}>
        {tiers.map((tier) => {
          const reached = subtotal >= tier.amount;
          const left = Math.min(100, (tier.amount / maxAmount) * 100);
          return (
            <span
              key={tier.amount}
              className={`${styles.label} ${reached ? styles.labelReached : ''}`}
              style={{ left: `${left}%` }}
            >
              {tier.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
