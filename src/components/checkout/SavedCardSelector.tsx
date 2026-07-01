import { SavedCardInfo } from '@/types/checkout';
import styles from '@/styles/pages/checkout.module.css';

interface SavedCardSelectorProps {
  cards: SavedCardInfo[];
  selectedId: string | null;
  onSelect: (paymentProfileId: string | null) => void;
  disabled?: boolean;
}

function getCardIcon(cardType: string): string {
  const type = cardType.toLowerCase();
  if (type.includes('visa')) return '💳 Visa';
  if (type.includes('master')) return '💳 Mastercard';
  if (type.includes('amex') || type.includes('american')) return '💳 Amex';
  if (type.includes('discover')) return '💳 Discover';
  return '💳 ' + cardType;
}

export default function SavedCardSelector({
  cards,
  selectedId,
  onSelect,
  disabled,
}: SavedCardSelectorProps) {
  if (cards.length === 0) return null;

  return (
    <div className={styles.savedCards}>
      <h3 className={styles.savedCardsTitle}>Saved Payment Methods</h3>
      <div className={styles.savedCardsList}>
        {cards.map((card) => (
          <label
            key={card.paymentProfileId}
            className={`${styles.savedCardOption} ${selectedId === card.paymentProfileId ? styles.savedCardSelected : ''}`}
          >
            <input
              type="radio"
              name="savedCard"
              value={card.paymentProfileId}
              checked={selectedId === card.paymentProfileId}
              onChange={() => onSelect(card.paymentProfileId)}
              disabled={disabled}
            />
            <span className={styles.savedCardInfo}>
              <span className={styles.savedCardType}>{getCardIcon(card.cardType)}</span>
              <span className={styles.savedCardNumber}>&bull;&bull;&bull;&bull; {card.last4}</span>
              {card.expDate && (
                <span className={styles.savedCardExp}>Exp {card.expDate}</span>
              )}
            </span>
          </label>
        ))}
        <label
          className={`${styles.savedCardOption} ${selectedId === null ? styles.savedCardSelected : ''}`}
        >
          <input
            type="radio"
            name="savedCard"
            value=""
            checked={selectedId === null}
            onChange={() => onSelect(null)}
            disabled={disabled}
          />
          <span className={styles.savedCardInfo}>
            <span className={styles.savedCardType}>+ Use a new card</span>
          </span>
        </label>
      </div>
    </div>
  );
}
