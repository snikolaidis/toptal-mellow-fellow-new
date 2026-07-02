import styles from '@/styles/pages/deals-hero.module.css';

export interface DealsHeroProps {
  eyebrow: string | null;
  heading: string | null;
  subtitle: string | null;
}

export default function DealsHero({ eyebrow, heading, subtitle }: DealsHeroProps) {
  if (!eyebrow && !heading && !subtitle) {
    return null;
  }

  return (
    <div className={styles.heroWrap}>
      <div className={styles.hero}>
        <div className={styles.inner}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          {heading && <h1 className={styles.heading}>{heading}</h1>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
