import { useState } from 'react';

export interface RedemptionOption {
  id: number;
  name: string;
  points: number;
  costText: string;
  isVariable?: boolean;
  rateCents?: number;
}

interface Props {
  points: number;
  options: RedemptionOption[];
  code: string | null;
  error: string | null;
  busyId: number | null;
  onRedeem: (optionId: number, pointsToRedeem?: number) => void;
}

export default function LoyaltyRedeemView({ points, options, code, error, busyId, onRedeem }: Props) {
  return (
    <div className="loyalty-redeem">
      <h2 className="loyalty-redeem__heading">How to Use Your Points</h2>
      <div className="loyalty-redeem__rule">
        <span className="loyalty-redeem__dot" />
        10 points equals $1
        <span className="loyalty-redeem__dot" />
      </div>
      <p className="loyalty-redeem__description">
        Redeeming your points is easy. Pick a reward below to get your code, then apply it at checkout.
      </p>
      <p className="loyalty-redeem__balance">You have {points} points</p>

      {code && (
        <div className="loyalty-redeem__code-box">
          <p className="loyalty-redeem__code-label">Your reward code</p>
          <p className="loyalty-redeem__code-value">{code}</p>
          <p className="loyalty-redeem__code-hint">Apply this code at checkout.</p>
        </div>
      )}

      {error && <div className="loyalty-redeem__error">{error}</div>}

      <div className="loyalty-redeem__grid">
        {options.map((o) => {
          if (o.isVariable) {
            return (
              <VariableCard
                key={o.id}
                option={o}
                balance={points}
                busy={busyId === o.id}
                onRedeem={onRedeem}
              />
            );
          }
          const affordable = points >= o.points;
          return (
            <div key={o.id} className="loyalty-redeem__card">
              <div className="loyalty-redeem__reward">{o.name}</div>
              <div className="loyalty-redeem__cost">{o.costText || `${o.points} points`}</div>
              <button
                className="loyalty-redeem__button"
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

function VariableCard({
  option,
  balance,
  busy,
  onRedeem,
}: {
  option: RedemptionOption;
  balance: number;
  busy: boolean;
  onRedeem: (optionId: number, pointsToRedeem?: number) => void;
}) {
  const rate = option.rateCents ?? 0;
  const [pts, setPts] = useState<string>('');
  const value = Number(pts);
  const dollars = rate > 0 && value > 0 ? (value * rate) / 100 : 0;
  const valid = Number.isFinite(value) && value > 0 && value <= balance;

  return (
    <div className="loyalty-redeem__card">
      <div className="loyalty-redeem__reward">{option.name}</div>
      <input
        type="number"
        className="loyalty-redeem__points-input"
        min={1}
        max={balance}
        step={1}
        value={pts}
        placeholder="Points to use"
        onChange={(e) => setPts(e.target.value)}
        aria-label="Points to redeem"
      />
      <div className="loyalty-redeem__cost">
        {value > 0 ? `${value} points = $${dollars.toFixed(2)}` : `You have ${balance} points`}
      </div>
      <button
        className="loyalty-redeem__button"
        onClick={() => onRedeem(option.id, value)}
        disabled={!valid || busy}
        title={valid ? '' : `Enter between 1 and ${balance} points`}
      >
        {busy ? 'Redeeming...' : 'Redeem'}
      </button>
    </div>
  );
}
