import styles from './LoyaltyRedeem.module.css';

export interface RedemptionOption {
  id: number;
  name: string;
  points: number;
  costText: string;
}

interface Props {
  points: number;
  options: RedemptionOption[];
  code: string | null;
  error: string | null;
  busyId: number | null;
  onRedeem: (optionId: number) => void;
}

export default function LoyaltyRedeemView({ points, options, code, error, busyId, onRedeem }: Props) {
  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>How to Use Your Points</h2>
      <div className={styles.rule}>
        <span className={styles.dot} />
        10 points equals $1
        <span className={styles.dot} />
      </div>
      <p className={styles.description}>
        Redeeming your points is easy. Pick a reward below to get your code, then apply it at checkout.
      </p>
      <p className={styles.balance}>You have {points} points</p>

      {code && (
        <div className={styles.codeBox}>
          <p className={styles.codeLabel}>Your reward code</p>
          <p className={styles.codeValue}>{code}</p>
          <p className={styles.codeHint}>Apply this code at checkout.</p>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {options.map((o) => {
          const affordable = points >= o.points;
          return (
            <div key={o.id} className={styles.card}>
              <div className={styles.reward}>{o.name}</div>
              <div className={styles.cost}>{o.costText || `${o.points} points`}</div>
              <button
                className={styles.button}
                onClick={() => onRedeem(o.id)}
                disabled={!affordable || busyId === o.id}
                title={affordable ? '' : "You don't have enough points to redeem"}
              >
                {busyId === o.id ? 'Redeeming...' : 'Redeem'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
