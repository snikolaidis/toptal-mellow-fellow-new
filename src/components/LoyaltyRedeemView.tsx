import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

export interface RedemptionOption {
  id: number;
  name: string;
  points: number;
  costText: string;
  isVariable?: boolean;
  rateCents?: number;
  isFreeProduct?: boolean;
  productId?: number;
  imageUrl?: string;
}

export type LoyaltyVariant = 'discounts' | 'free-products';

interface Props {
  points: number;
  options: RedemptionOption[];
  code: string | null;
  error: string | null;
  busyId: number | null;
  variant: LoyaltyVariant;
  onRedeem: (optionId: number, pointsToRedeem?: number) => void;
}

function groupByPoints(options: RedemptionOption[]): Array<[number, RedemptionOption[]]> {
  const map = new Map<number, RedemptionOption[]>();
  options.forEach((o) => {
    const arr = map.get(o.points) || [];
    arr.push(o);
    map.set(o.points, arr);
  });
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

export default function LoyaltyRedeemView({
  points,
  options,
  code,
  error,
  busyId,
  variant,
  onRedeem,
}: Props) {
  const isFree = variant === 'free-products';

  const renderOption = (o: RedemptionOption) => {
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
        {o.isFreeProduct && o.imageUrl && (
          <img className="loyalty-redeem__image" src={o.imageUrl} alt={o.name} loading="lazy" />
        )}
        <div className="loyalty-redeem__reward">{o.name}</div>
        {!o.isFreeProduct && (
          <div className="loyalty-redeem__cost">{o.costText || `${o.points} points`}</div>
        )}
        <button
          className={
            o.isFreeProduct
              ? 'loyalty-redeem__button loyalty-redeem__button--outline'
              : 'loyalty-redeem__button'
          }
          onClick={() => onRedeem(o.id)}
          disabled={!affordable || busyId === o.id}
          title={affordable ? '' : "You don't have enough points to redeem"}
        >
          {busyId === o.id ? 'Redeeming...' : o.isFreeProduct ? 'Redeem now' : 'Redeem'}
        </button>
      </div>
    );
  };

  return (
    <div className="loyalty-redeem">
      <h2 className="loyalty-redeem__heading">
        {isFree ? 'Points for Products' : 'How to Use Your Points'}
      </h2>

      {!isFree && (
        <div className="loyalty-redeem__rule">
          <span className="loyalty-redeem__dot" />
          10 points equals $1
          <span className="loyalty-redeem__dot" />
        </div>
      )}

      <p className="loyalty-redeem__description">
        {isFree
          ? 'Redeem your points for a free product, added straight to your cart.'
          : 'Redeeming your points is easy. Pick a reward below to get your code, then apply it at checkout.'}
      </p>
      <p className="loyalty-redeem__balance">You have {points} points</p>

      {code && (
        <div className="loyalty-redeem__code-box">
          <p className="loyalty-redeem__code-label">Your reward code</p>
          <p className="loyalty-redeem__code-value">{code}</p>
          <p className="loyalty-redeem__code-hint">
            {isFree ? 'Added to your cart with the discount applied.' : 'Apply this code at checkout.'}
          </p>
        </div>
      )}

      {error && <div className="loyalty-redeem__error">{error}</div>}

      {isFree
        ? groupByPoints(options).map(([pts, opts]) => (
            <div key={pts} className="loyalty-redeem__group">
              <h3 className="loyalty-redeem__group-heading">Products for {pts} Points</h3>
              {opts.length > 1 ? (
                <Swiper
                  modules={[Navigation]}
                  navigation
                  slidesPerView={1.4}
                  spaceBetween={16}
                  breakpoints={{
                    640: { slidesPerView: 2 },
                    992: { slidesPerView: 3 },
                    1280: { slidesPerView: 4 },
                  }}
                >
                  {opts.map((o) => (
                    <SwiperSlide key={o.id}>{renderOption(o)}</SwiperSlide>
                  ))}
                </Swiper>
              ) : (
                <div className="loyalty-redeem__grid">{opts.map(renderOption)}</div>
              )}
            </div>
          ))
        : options.length > 0 && (
            <div className="loyalty-redeem__grid">{options.map(renderOption)}</div>
          )}
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
