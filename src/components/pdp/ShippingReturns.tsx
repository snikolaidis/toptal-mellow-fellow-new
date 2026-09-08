/**
 * The two shipping/returns assurances that sit under the shipping note in the
 * purchase block.
 *
 * Distinct from `PdpTrustBadges`, which is the six-item vertical list of
 * product claims further down in the description section.
 *
 * Both icons take their colour from CSS rather than a hardcoded `stroke`, so
 * they can use the existing palette tokens — `--color-yellow-gold` and
 * `--color-club-purple` already hold the exact values from the source SVGs
 * (#FFCC4F and #7C629E).
 */
const ITEMS = [
  {
    key: 'ship',
    title: 'Fast ship',
    subtitle: '2–3 day delivery',
    icon: (
      <svg width="15" height="17" viewBox="0 0 15 17" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M1.50256 9.75195C1.36063 9.75244 1.22148 9.71264 1.10127 9.63719C0.981064 9.56173 0.884733 9.45372 0.82347 9.3257C0.762207 9.19767 0.738527 9.05489 0.755182 8.91395C0.771837 8.773 0.828143 8.63967 0.917558 8.52945L8.34256 0.879453C8.39825 0.815164 8.47415 0.771721 8.55779 0.756253C8.64144 0.740785 8.72785 0.754213 8.80286 0.794331C8.87786 0.83445 8.937 0.898876 8.97056 0.977034C9.00412 1.05519 9.01012 1.14244 8.98756 1.22445L7.54756 5.73945C7.5051 5.8531 7.49084 5.97534 7.506 6.09571C7.52117 6.21607 7.5653 6.33096 7.63463 6.43052C7.70395 6.53008 7.79639 6.61134 7.90401 6.66732C8.01164 6.72331 8.13124 6.75235 8.25256 6.75195H13.5026C13.6445 6.75147 13.7836 6.79127 13.9038 6.86672C14.0241 6.94217 14.1204 7.05019 14.1816 7.17821C14.2429 7.30623 14.2666 7.44901 14.2499 7.58996C14.2333 7.73091 14.177 7.86423 14.0876 7.97445L6.66256 15.6245C6.60686 15.6887 6.53096 15.7322 6.44732 15.7477C6.36368 15.7631 6.27726 15.7497 6.20226 15.7096C6.12726 15.6695 6.06812 15.605 6.03456 15.5269C6.00099 15.4487 5.995 15.3615 6.01756 15.2795L7.45756 10.7645C7.50002 10.6508 7.51428 10.5286 7.49911 10.4082C7.48395 10.2878 7.43981 10.1729 7.37049 10.0734C7.30117 9.97382 7.20873 9.89257 7.1011 9.83658C6.99347 9.7806 6.87387 9.75156 6.75256 9.75195H1.50256Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: 'returns',
    title: '30-day returns',
    subtitle: 'No questions asked',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M2.25 9C2.25 10.335 2.64588 11.6401 3.38758 12.7501C4.12928 13.8601 5.18349 14.7253 6.41689 15.2362C7.65029 15.7471 9.00749 15.8808 10.3169 15.6203C11.6262 15.3599 12.829 14.717 13.773 13.773C14.717 12.829 15.3599 11.6262 15.6203 10.3169C15.8808 9.00749 15.7471 7.65029 15.2362 6.41689C14.7253 5.18349 13.8601 4.12928 12.7501 3.38758C11.6401 2.64588 10.335 2.25 9 2.25C7.11296 2.2571 5.30173 2.99342 3.945 4.305L2.25 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.25 2.25V6H6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const;

export default function ShippingReturns() {
  return (
    <ul className="shipping-returns">
      {ITEMS.map((item) => (
        <li key={item.key} className="shipping-returns__item">
          <span className={`shipping-returns__icon shipping-returns__icon--${item.key}`}>
            {item.icon}
          </span>
          <span className="shipping-returns__title">{item.title}</span>
          <span className="shipping-returns__subtitle">{item.subtitle}</span>
        </li>
      ))}
    </ul>
  );
}
