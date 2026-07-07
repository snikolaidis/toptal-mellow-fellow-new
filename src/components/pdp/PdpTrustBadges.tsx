import { ReactNode } from 'react';
import styles from './PdpTrustBadges.module.css';

interface Badge {
  label: string;
  icon: ReactNode;
}

const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const BADGES: Badge[] = [
  {
    label: 'Hemp-Derived Cannabinoids',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M11 20A7 7 0 0 1 4 13C4 8 7 4 12 3c1 5-1 9-5 11" />
        <path d="M11 20c0-4 2-8 7-9" />
      </svg>
    ),
  },
  {
    label: 'Federally Legal',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M12 3l7 3v5c0 4-3 8-7 10-4-2-7-6-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: 'Lab Tested',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M9 3h6" />
        <path d="M10 3v6l-4.5 8A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 9V3" />
        <path d="M7 15h10" />
      </svg>
    ),
  },
  {
    label: 'PhD Pharmacist Formulated',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
  {
    label: 'Secure Payments',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <rect x="5" y="10.5" width="14" height="9" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </svg>
    ),
  },
  {
    label: 'Discreet Shipping',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M3 8l9-4.5L21 8v8l-9 4.5L3 16z" />
        <path d="M3 8l9 4.5L21 8" />
        <path d="M12 12.5V21" />
      </svg>
    ),
  },
];

export default function PdpTrustBadges() {
  return (
    <ul className={styles.badges}>
      {BADGES.map((badge) => (
        <li key={badge.label} className={styles.badge}>
          <span className={styles.icon}>{badge.icon}</span>
          <span className={styles.label}>{badge.label}</span>
        </li>
      ))}
    </ul>
  );
}
