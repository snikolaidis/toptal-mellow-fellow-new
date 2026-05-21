import Link from 'next/link';
import {
  TwentyOneLogoWhite,
  InstagramIcon,
  TwitterIcon,
} from '@/components/icons';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        {/* Brand */}
        <div className={styles.brandSection}>
          <Link href="/" className={styles.logo}>
            <TwentyOneLogoWhite className="h-6 w-auto" />
          </Link>
          <p className={styles.brandDescription}>
            Curated cannabis for elevated living. Quality products, responsibly sourced.
          </p>
          <div className={styles.socialLinks}>
            <a href="#" className={styles.socialLink} aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a href="#" className={styles.socialLink} aria-label="Twitter">
              <TwitterIcon />
            </a>
          </div>
        </div>

        {/* Shop Links */}
        <div className={styles.linkSection}>
          <h3 className={styles.sectionTitle}>Shop</h3>
          <ul className={styles.linkList}>
            <li><Link href="/shop" className={styles.link}>All Products</Link></li>
            <li><Link href="/shop?category=flower" className={styles.link}>Flower</Link></li>
            <li><Link href="/shop?category=edibles" className={styles.link}>Edibles</Link></li>
            <li><Link href="/shop?category=concentrates" className={styles.link}>Concentrates</Link></li>
            <li><Link href="/shop?category=accessories" className={styles.link}>Accessories</Link></li>
          </ul>
        </div>

        {/* Info Links */}
        <div className={styles.linkSection}>
          <h3 className={styles.sectionTitle}>Information</h3>
          <ul className={styles.linkList}>
            <li><Link href="/account" className={styles.link}>My Account</Link></li>
            <li><Link href="#" className={styles.link}>Shipping & Returns</Link></li>
            <li><Link href="#" className={styles.link}>FAQ</Link></li>
            <li><Link href="#" className={styles.link}>Contact</Link></li>
          </ul>
        </div>

        {/* Newsletter */}
        <div className={styles.newsletterSection}>
          <h3 className={styles.sectionTitle}>Newsletter</h3>
          <p className={styles.newsletterDescription}>
            Subscribe for updates on new products and exclusive offers.
          </p>
          <form className={styles.newsletterForm}>
            <input
              type="email"
              placeholder="your@email.com"
              className={styles.newsletterInput}
            />
            <button type="submit" className={styles.newsletterBtn}>
              Subscribe
            </button>
          </form>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className={styles.footerBottom}>
        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} Twenty One Cannabis. All rights reserved. 21+ only.
        </p>
        <div className={styles.legalLinks}>
          <a href="#" className={styles.legalLink}>Privacy</a>
          <a href="#" className={styles.legalLink}>Terms</a>
        </div>
      </div>
    </footer>
  );
}
