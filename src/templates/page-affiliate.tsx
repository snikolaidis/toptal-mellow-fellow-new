import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import Link from 'next/link';
import Image from 'next/image';
import Layout from '@/components/Layout';
import { Product } from '@/types/woocommerce';
import styles from '@/styles/pages/affiliate.module.css';
import UGCGallery, { UGCItem } from '@/components/affiliate/UGCGallery';
import { PRODUCT_FIELDS } from '@/graphql/queries/products';

const AWIN_SIGNUP_URL = 'https://ui.awin.com/express-signup/en/awin/59403/726a754c-4998-4ec8-a77d-40ccd659d54e?t=CkcZSywINKh2WumvTw9RRzoTi29X6_Tgg1VjVeaDBjY';

interface AffiliateImage {
  sourceUrl: string;
  altText: string;
}

interface AffiliateData {
  products?: { nodes: Product[] };
  pageBy?: {
    affiliatePageContent?: {
      ugcGallery?: Array<{
        videoUrl?: { node?: { mediaItemUrl?: string } | null } | null;
        videoPoster?: { node?: { sourceUrl?: string } | null } | null;
        taggedProduct?: { nodes?: any[] } | null;
      }> | null;
      affiliateHero1?: { node?: AffiliateImage | null } | null;
      affiliateHero2?: { node?: AffiliateImage | null } | null;
      affiliateHero3?: { node?: AffiliateImage | null } | null;
      affiliateCtaLifestyle?: { node?: AffiliateImage | null } | null;
    } | null;
  } | null;
}

const AffiliatePage: FaustTemplate<AffiliateData> = (props) => {
  const bestsellers = props.data?.products?.nodes ?? [];
  const acf = props.data?.pageBy?.affiliatePageContent ?? {};

  const ugcItems: UGCItem[] = (acf.ugcGallery || [])
    .filter((row) => row?.videoUrl?.node?.mediaItemUrl)
    .map((row, i) => ({
      id: `ugc-${i}`,
      videoUrl: row.videoUrl!.node!.mediaItemUrl as string,
      posterUrl: row.videoPoster?.node?.sourceUrl || null,
      product: row.taggedProduct?.nodes?.[0] || null,
    }));

  const images = {
    affiliateHero1: acf.affiliateHero1?.node || null,
    affiliateHero2: acf.affiliateHero2?.node || null,
    affiliateHero3: acf.affiliateHero3?.node || null,
    affiliateCtaLifestyle: acf.affiliateCtaLifestyle?.node || null,
  };

  return (
    <Layout
      title="Affiliate Program"
      description="Join the Mellow Fellow affiliate program. Earn 15% commission on every qualifying purchase."
      seo={{
        title: 'Affiliate Program | Mellow Fellow',
        metaDesc: 'Join the Mellow Fellow affiliate program. Earn 15% commission on every qualifying purchase generated through your affiliate links.',
        schema: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Mellow Fellow Affiliate Program',
          description: 'Earn 15% commission sharing premium cannabis products.',
          url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/pages/affiliate`,
        }),
      }}
    >
      {/* ===== HERO ===== */}
      <section className={`section ${styles.hero}`}>
        <div className="container">
          <div className={styles.heroGrid}>
            <div className={styles.heroContent}>
              <span className={styles.badgePill}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 0a2 2 0 110 4 2 2 0 010-4zm3 9.75c0 .781-.397 1.469-1 1.872V14.5c0 .828-.672 1.5-1.5 1.5h-1c-.828 0-1.5-.672-1.5-1.5v-2.878A2.247 2.247 0 015 9.75V8.5C5 6.844 6.344 5.5 8 5.5s3 1.344 3 3v1.25zM3 1a1.75 1.75 0 100 3.5A1.75 1.75 0 003 1zm.5 7.5v1c0 1.016.378 1.941 1 2.647V14.5c0 .038 0 .078.003.116A1.494 1.494 0 013.5 15h-1c-.828 0-1.5-.672-1.5-1.5v-1.769A1.994 1.994 0 010 10V9c0-1.656 1.344-3 3-3 .397 0 .775.078 1.122.216A4.48 4.48 0 003.5 8.5zm8 6v-2.353c.622-.703 1-1.628 1-2.647v-1c0-.834-.228-1.613-.622-2.284A2.99 2.99 0 0113 6c1.656 0 3 1.344 3 3v1c0 .741-.403 1.388-1 1.731V13.5c0 .828-.672 1.5-1.5 1.5h-1c-.384 0-.738-.144-1.003-.384.003-.038.003-.075.003-.116zm1.5-12.5a1.75 1.75 0 100 3.5 1.75 1.75 0 000-3.5z" fill="#1D2B33" /></svg>
                Affiliate Program
              </span>

              <h1 className={styles.heroTitle}>
                Create,{'\n'}Share, &amp;{'\n'}<em>Earn</em> with{'\n'}Mellow Fellow
              </h1>

              <p className={styles.heroText}>
                Share products your audience loves from a rapidly expanding
                cannabinoid brand and start earning commission on every sale.
              </p>

              <a href={AWIN_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className={styles.btnGold}>
                Apply Today
              </a>

              <div className={styles.heroAvatars}>
                <div className={styles.avatarStack}>
                  <span /><span /><span />
                </div>
                <p className={styles.heroCreators}>
                  Join <strong>500+</strong> active creators
                </p>
              </div>
            </div>

            <div className={styles.heroImages}>
              <div className={styles.imageCollage}>
                <div className={styles.collageMain}>
                  <img
                    src={images.affiliateHero1?.sourceUrl || '/images/affiliate-hero-1.webp'}
                    alt={images.affiliateHero1?.altText || 'Creator sharing Mellow Fellow'}
                  />
                </div>
                <div className={styles.collageSecondary}>
                  <img
                    src={images.affiliateHero2?.sourceUrl || '/images/affiliate-hero-2.webp'}
                    alt={images.affiliateHero2?.altText || 'Mellow Fellow lifestyle'}
                  />
                </div>
                <div className={styles.collageTertiary}>
                  <img
                    src={images.affiliateHero3?.sourceUrl || '/images/affiliate-hero-3.webp'}
                    alt={images.affiliateHero3?.altText || 'Creator content'}
                  />
                </div>
                <div className={styles.floatingBadge}>
                  <div className={styles.floatingBadgeIcon}>
                    <svg width="25" height="28" viewBox="0 0 25 28" fill="none"><path d="M3.649 19.833l-1.361-1.361 7.194-7.243 3.889 3.889 5.056-5.007H15.9V8.167h5.833V14h-1.944v-2.528L13.371 17.89l-3.889-3.889-5.833 5.833z" fill="#5A493A" /></svg>
                  </div>
                  <div>
                    <div className={styles.floatingBadgeLabel}>Monthly Payouts</div>
                    <div className={styles.floatingBadgeValue}>15% Commission</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHY MELLOW FELLOW ===== */}
      <section className={`section ${styles.whySection}`}>
        <div className="container">
          <h2 className={styles.sectionHeading}>Why Mellow Fellow?</h2>
          <div className={styles.headingBar} />
          <div className={styles.whyGrid}>
            <div className={styles.whyCard}>
              <div className={styles.whyIcon}>
                <svg width="36" height="44" viewBox="0 0 36 44" fill="none"><path d="M7.5 35.5c-1.275 0-2.181-.569-2.719-1.706-.537-1.138-.406-2.194.394-3.169L13.5 20.5v-9H12c-.425 0-.781-.144-1.069-.431A1.451 1.451 0 0110.5 10c0-.425.144-.781.431-1.069A1.451 1.451 0 0112 8.5h12c.425 0 .781.144 1.069.431.287.288.431.644.431 1.069 0 .425-.144.781-.431 1.069A1.451 1.451 0 0124 11.5h-1.5v9l8.325 10.125c.8.975.931 2.031.394 3.169-.538 1.137-1.444 1.706-2.719 1.706H7.5zm0-3h21L19.5 21.55V11.5h-3v10.05L7.5 32.5z" fill="#3A493A" /></svg>
              </div>
              <h3>Pharmacist-Formulated</h3>
              <p>Developed by a board-certified pharmacist.</p>
            </div>

            <div className={styles.whyCardAlt}>
              <div className={styles.whyIconAlt}>
                <svg width="36" height="44" viewBox="0 0 36 44" fill="none"><path d="M28.5 37c-.825 0-1.531-.294-2.119-.881A2.884 2.884 0 0125.5 34v-1.65c-1.725-.35-3.156-1.206-4.294-2.569-1.137-1.362-1.706-2.956-1.706-4.781v-7.5c0-.825.288-1.531.863-2.119A2.884 2.884 0 0122.5 14.5h9c.825 0 1.531.294 2.119.881.587.588.881 1.294.881 2.119v7.5c0 1.825-.569 3.419-1.706 4.781-1.138 1.363-2.569 2.219-4.294 2.569V34H33v3h-4.5z" fill="#5A493A" /><path d="M12 37.75L9 35.5v-6H7.5c-.825 0-1.531-.294-2.119-.881A2.884 2.884 0 014.5 26.5V15.25c-.425 0-.781-.144-1.069-.431A1.451 1.451 0 013 13.75c0-.425.144-.781.431-1.069A1.451 1.451 0 014.5 12.25H9V10h-.75c-.425 0-.781-.144-1.069-.431A1.451 1.451 0 016.75 8.5c0-.425.144-.781.431-1.069A1.451 1.451 0 018.25 7h4.5c.425 0 .781.144 1.069.431.287.288.431.644.431 1.069 0 .425-.144.781-.431 1.069A1.451 1.451 0 0112.75 10H12v2.25h4.5c.425 0 .781.144 1.069.431.287.288.431.644.431 1.069 0 .425-.144.781-.431 1.069A1.451 1.451 0 0116.5 15.25V26.5c0 .825-.294 1.531-.881 2.119A2.884 2.884 0 0113.5 29.5H12v8.25zM7.5 26.5h6v-2.25h-2.625a.853.853 0 01-.625-.263.853.853 0 01-.263-.625c0-.245.088-.451.263-.625a.853.853 0 01.625-.262H13.5v-2.25h-2.625a.853.853 0 01-.625-.263.853.853 0 01-.263-.625c0-.245.088-.451.263-.625a.853.853 0 01.625-.262H13.5V15.25H7.5V26.5z" fill="#5A493A" /></svg>
              </div>
              <h3>Precision Cannabinoid Blends</h3>
              <p>Thoughtfully crafted formulas designed for distinct experiences.</p>
            </div>

            <div className={styles.whyCard}>
              <div className={styles.whyIcon}>
                <svg width="36" height="44" viewBox="0 0 36 44" fill="none"><path d="M16.425 27.325L24.9 18.85l-2.138-2.137L16.425 23.05l-3.15-3.15-2.138 2.138 5.288 5.287zM18 37c-3.475-.875-6.344-2.869-8.606-5.981C7.131 27.906 6 24.45 6 20.65V11.5L18 7l12 4.5v9.15c0 3.8-1.131 7.256-3.394 10.369C24.344 34.131 21.475 36.125 18 37zm0-3.15c2.6-.825 4.75-2.475 6.45-4.95 1.7-2.475 2.55-5.225 2.55-8.25v-7.088L18 10.188 9 13.562v7.088c0 3.025.85 5.775 2.55 8.25 1.7 2.475 3.85 4.125 6.45 4.95z" fill="#3A493A" /></svg>
              </div>
              <h3>Transparency &amp; Quality</h3>
              <p>Third-party tested products with trusted ingredients.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EARN WITH MELLOW FELLOW ===== */}
      <section className={`section ${styles.earnSection}`}>
        <div className="container">
          <div className={styles.earnGrid}>
            <div className={styles.earnLeft}>
              <h2>Earn with</h2>
              <p className={styles.earnBrand}>Mellow Fellow</p>
              <div className={styles.earnBar} />
            </div>

            <div className={styles.earnRight}>
              <div className={styles.benefitRow}>
                <div className={styles.benefitPercentage}>15%</div>
                <div className={styles.benefitContent}>
                  <h3>Competitive Commission</h3>
                  <p>
                    Earn at least <strong>15%</strong> (subject to change) commission on
                    every qualifying purchase generated through your affiliate links.
                  </p>
                </div>
              </div>

              <div className={styles.benefitRow}>
                <div className={styles.benefitIcon}>
                  <svg width="73" height="86" viewBox="0 0 73 86" fill="none"><path d="M15.107 72.861c-1.642 0-3.048-.585-4.218-1.754-1.17-1.17-1.754-2.576-1.754-4.218V25.083c0-1.642.585-3.048 1.754-4.218 1.17-1.17 2.576-1.754 4.218-1.754h2.986v-5.972h5.972v5.972h23.889v-5.972h5.972v5.972h2.987c1.642 0 3.048.585 4.218 1.754 1.17 1.17 1.754 2.576 1.754 4.218v41.806c0 1.642-.585 3.048-1.754 4.218-1.17 1.17-2.576 1.754-4.218 1.754H15.107zm0-5.972h41.806V37.028H15.107v29.861zm0-35.833h41.806v-5.973H15.107v5.973z" fill="#D9C79E" /></svg>
                </div>
                <div className={styles.benefitContent}>
                  <h3>30-Day Cookie Window</h3>
                  <p>
                    Receive credit when customers purchase within 30 days of clicking your link.
                  </p>
                </div>
              </div>

              <div className={styles.benefitRow}>
                <div className={styles.benefitIcon}>
                  <svg width="73" height="86" viewBox="0 0 73 86" fill="none"><path d="M15.107 72.861c-1.642 0-3.048-.585-4.218-1.754-1.17-1.17-1.754-2.576-1.754-4.218V33.22a5.85 5.85 0 01-1.179-2.127 5.605 5.605 0 01-.407-3.024V19.111c0-1.642.585-3.048 1.754-4.218 1.17-1.17 2.576-1.754 4.218-1.754h47.778c1.642 0 3.048.585 4.218 1.754 1.17 1.17 1.754 2.576 1.754 4.218v8.958a5.605 5.605 0 01-.407 3.024 5.85 5.85 0 01-1.179 2.127v33.669c0 1.642-.585 3.048-1.754 4.218-1.17 1.17-2.576 1.754-4.218 1.754H15.107zm0-38.82v32.848h41.806V34.042H15.107zM12.121 28.07h47.778v-8.958H12.121v8.958zm14.931 20.903h17.916V43H27.052v5.972z" fill="#D9C79E" /></svg>
                </div>
                <div className={styles.benefitContent}>
                  <h3>High-Demand Products</h3>
                  <p>
                    A diverse product lineup that gives creators multiple content angles.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== START EARNING CTA ===== */}
      <section className="section">
        <div className={styles.ctaBanner}>
          <div className={styles.ctaBannerGrid}>
            <div className={styles.ctaBannerContent}>
              <span className={styles.badgePill}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 0a2 2 0 110 4 2 2 0 010-4zm3 9.75c0 .781-.397 1.469-1 1.872V14.5c0 .828-.672 1.5-1.5 1.5h-1c-.828 0-1.5-.672-1.5-1.5v-2.878A2.247 2.247 0 015 9.75V8.5C5 6.844 6.344 5.5 8 5.5s3 1.344 3 3v1.25z" fill="#1D2B33" /></svg>
                Creator Network
              </span>
              <h2>Start Earning with Mellow Fellow</h2>
              <p>
                Get paid for every qualified purchase! Just share the awesome
                products your audience is already into. Come join our creator
                network today!
              </p>
              <a href={AWIN_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className={styles.btnDark}>
                Earn Today
              </a>
            </div>
            <div className={styles.ctaBannerImage}>
              <img
                src={images.affiliateCtaLifestyle?.sourceUrl || '/images/affiliate-cta-lifestyle.webp'}
                alt={images.affiliateCtaLifestyle?.altText || 'Mellow Fellow lifestyle'}
              />
              <div className={styles.ctaBannerImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* ===== SEE HOW CREATORS SHARE ===== */}
      <section className={`section ${styles.creatorsSection}`}>
        <div className="container">
          <div className={styles.creatorsGrid}>
            <div className={styles.creatorsImages}>
              <UGCGallery items={ugcItems} />
            </div>
            <div className={styles.creatorsText}>
              <h2>See How Creators Share Mellow Fellow</h2>
              <p>
                Creators across TikTok, Instagram, and YouTube share Mellow
                Fellow in ways that feel natural to their audience — from
                lifestyle moments and unboxings to drink creations and
                everyday routines.
              </p>
              <a href={AWIN_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className={styles.btnDark}>
                Become an Affiliate!
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className={`section ${styles.howSection}`}>
        <div className="container">
          <span className={styles.badgePill}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 1C1.672 1 1 1.672 1 2.5S1.672 4 2.5 4h4.75v1.25L5.75 6.75H3.5A2.25 2.25 0 001.25 9v2H1a1 1 0 00-1 1v2a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 00-1-1h-.25V9c0-.416.334-.75.75-.75h2.25l1.5 1.5V11H7a1 1 0 00-1 1v2a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 00-1-1h-.25v-1.25l1.5-1.5h2.25c.416 0 .75.334.75.75v2H13a1 1 0 00-1 1v2a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 00-1-1h-.25V9a2.25 2.25 0 00-2.25-2.25h-2.25L8.75 5.25V4h4.75C14.328 4 15 3.328 15 2.5S14.328 1 13.5 1h-11z" fill="#1D2B33" /></svg>
            Process
          </span>
          <h2 className={styles.howSectionTitle}>How It Works</h2>
          <div className={styles.howBar} />
          <div className={styles.howGrid}>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3A493A" strokeWidth="1.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </div>
              <h3>Apply</h3>
              <p>Submit your affiliate application.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3A493A" strokeWidth="1.5"><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              </div>
              <h3>Share</h3>
              <p>Create content featuring Mellow Fellow products.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3A493A" strokeWidth="1.5"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3>Earn</h3>
              <p>Receive commissions on qualifying purchases generated through your affiliate links.</p>
            </div>
          </div>
          <div className={styles.commissionTag}>
            <span>15% Commission</span>
          </div>
        </div>
      </section>

      {/* ===== THE BESTSELLERS ===== */}
      <section className="section">
        <div className="container">
          <h2 className={styles.bestsellersTitle}>The Bestsellers</h2>
          <div className={styles.bestsellersBar} />
          <div className={styles.bestsellersGrid}>
            {bestsellers.map((product) => (
              <div key={product.id} className={styles.bestsellerCard}>
                <div className={styles.bestsellerImage}>
                  {product.image?.sourceUrl ? (
                    <Image
                      src={product.image.sourceUrl}
                      alt={product.image.altText || product.name}
                      width={100}
                      height={140}
                      style={{ objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ width: 100, height: 140, background: '#eee', borderRadius: 8 }} />
                  )}
                </div>
                <div className={styles.bestsellerInfo}>
                  {product.name && (
                    <>
                      <h4>{product.name.split(' - ')[0]}</h4>
                      {product.name.includes(' - ') && (
                        <div className={styles.subtitle}>{product.name.split(' - ').slice(1).join(' - ')}</div>
                      )}
                    </>
                  )}
                  <div className={styles.bestsellerBar} />
                  {product.shortDescription && (
                    <p dangerouslySetInnerHTML={{
                      __html: product.shortDescription.replace(/<[^>]+>/g, '').slice(0, 100),
                    }} />
                  )}
                  <Link href={`/products/${product.slug}`} className={styles.viewProductBtn}>
                    View Product
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WARNING BANNER ===== */}
      <div className={styles.warningBanner}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M12 0c.689 0 1.322.38 1.65.984L23.775 19.734c.314.581.3 1.284-.037 1.851-.338.567-.952.915-1.613.915H1.875c-.661 0-1.275-.348-1.613-.915a1.877 1.877 0 01.225-1.851L10.35.984C10.678.38 11.31 0 12 0zm0 16.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 7.5c-.853 0-1.533.727-1.472 1.58l.347 4.875c.042.586.534 1.045 1.12 1.045.591 0 1.078-.455 1.12-1.045l.347-4.875A1.502 1.502 0 0012 7.5z" fill="white" /></svg>
        Must be 21 to purchase cannabinoid products where applicable. Products are hemp-derived and compliant with federal regulations where sold.
      </div>
    </Layout>
  );
};

AffiliatePage.query = gql`
  ${PRODUCT_FIELDS}
  query GetAffiliatePage {
    products(first: 3, where: { orderby: [{ field: TOTAL_SALES, order: DESC }] }) {
      nodes {
        __typename
        ...ProductFields
      }
    }
    pageBy(uri: "affiliate-data") {
      affiliatePageContent {
        ugcGallery {
          videoUrl { node { mediaItemUrl } }
          videoPoster { node { sourceUrl } }
          taggedProduct {
            nodes {
              ... on SimpleProduct {
                id
                databaseId
                name
                slug
                price
                regularPrice
                salePrice
                stockStatus
                shortDescription
                image { id sourceUrl altText }
              }
            }
          }
        }
        affiliateHero1 { node { sourceUrl altText } }
        affiliateHero2 { node { sourceUrl altText } }
        affiliateHero3 { node { sourceUrl altText } }
        affiliateCtaLifestyle { node { sourceUrl altText } }
      }
    }
  }
`;

export default AffiliatePage;
