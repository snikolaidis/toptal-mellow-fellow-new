import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

import Layout from '@/components/Layout';
import styles from '@/styles/OrderConfirmation.module.css';

const AWIN_ADVERTISER_ID =
  process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '';

interface Product {
  id: number;
  name: string;
  price: string;
  image: string;
}

interface OrderData {
  id?: number;
  orderNumber?: string;
  total?: string;
}

export default function OrderConfirmation() {
  const router = useRouter();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
console.log("[OrderConfirmation] | order", order)
console.log("[OrderConfirmation] | products", products)
  /*
   * Scroll to top whenever the confirmation page/order URL changes.
   */
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  }, [router.asPath]);

  /*
   * Load order + recommended products.
   */
  useEffect(() => {
    if (!router.isReady) return;

    const orderId = router.query.orderId;

    if (!orderId) {
      setLoading(false);
      return;
    }

    async function loadConfirmationData() {
      try {
        /*
         * Load WooCommerce order information.
         */
        const orderResponse = await fetch(
          `/api/checkout/order/${orderId}`,
          {
            credentials: 'include',
          }
        );

        if (orderResponse.ok) {
          const orderData = await orderResponse.json();

          setOrder(
            orderData?.order || orderData
          );
        }

        /*
         * Load recommended products.
         */
        const productsResponse = await fetch(
          '/api/checkout/recommendations',
          {
            credentials: 'include',
          }
        );

        if (productsResponse.ok) {
          const productData =
            await productsResponse.json();

          setProducts(
            productData?.products || []
          );
        }
      } catch (error) {
        console.error(
          'Failed to load confirmation page:',
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadConfirmationData();
  }, [
    router.isReady,
    router.query.orderId,
  ]);

  /*
   * -----------------------------------------
   * AWIN CONVERSION TRACKING
   * -----------------------------------------
   */

  const awinOrderRef =
    order?.orderNumber ||
    (typeof router.query.orderId === 'string'
      ? router.query.orderId
      : '');

  /*
   * Remove currency symbols and other
   * non-numeric characters from the total.
   *
   * Example:
   * "$99.99" -> "99.99"
   */
  const awinTotal =
    typeof order?.total === 'string'
      ? order.total.replace(/[^0-9.]/g, '')
      : '';

  /*
   * Prevent the same order from being
   * tracked multiple times in the same browser
   * session.
   */
  const awinTrackingKey = awinOrderRef
    ? `awin-order-${awinOrderRef}`
    : '';

  const [shouldTrackAwin, setShouldTrackAwin] =
    useState(false);

  useEffect(() => {
    if (
      !AWIN_ADVERTISER_ID ||
      !awinOrderRef ||
      !awinTotal ||
      !awinTrackingKey
    ) {
      return;
    }

    /*
     * Check whether this order was already
     * tracked in this browser session.
     */
    const alreadyTracked =
      sessionStorage.getItem(awinTrackingKey);

    if (alreadyTracked) {
      return;
    }

    /*
     * Mark this order as tracked before
     * rendering the Awin script.
     */
    sessionStorage.setItem(
      awinTrackingKey,
      '1'
    );

    setShouldTrackAwin(true);
  }, [
    awinOrderRef,
    awinTotal,
    awinTrackingKey,
  ]);

  const handleContinueShopping = () => {
    router.push('/shop');
  };

  const handleMyAccount = () => {
    router.push('/my-account');
  };

  return (
    <>
      {/* -----------------------------------------
          AWIN CONVERSION TRACKING
      ------------------------------------------ */}

      {shouldTrackAwin && (
        <Head>
          <script
            type="text/javascript"
            dangerouslySetInnerHTML={{
              __html: `
                var AWIN = AWIN || {};
                AWIN.Tracking = AWIN.Tracking || {};
                AWIN.Tracking.Sale = {};

                AWIN.Tracking.Sale.amount = "${awinTotal}";
                AWIN.Tracking.Sale.channel = "aw";
                AWIN.Tracking.Sale.orderRef = "${awinOrderRef}";
                AWIN.Tracking.Sale.parts = "DEFAULT:${awinTotal}";
                AWIN.Tracking.Sale.currency = "USD";
                AWIN.Tracking.Sale.test = "0";
              `,
            }}
          />

          <noscript>
            <img
              src={`https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=${AWIN_ADVERTISER_ID}&amount=${awinTotal}&ch=aw&parts=DEFAULT:${awinTotal}&ref=${awinOrderRef}&cr=USD&testmode=0`}
              width="0"
              height="0"
              style={{ display: 'none' }}
              alt=""
            />
          </noscript>
        </Head>
      )}

      <Layout title="Order Confirmation">
        <main className={styles.page}>

          {/* ORDER CONFIRMED */}
          <section className={styles.confirmationCard}>

            <div className={styles.successIcon}>
              ✓
            </div>

            <h1>
              Your order is confirmed!
            </h1>

            <p>
              Thanks, We've received your order
              and we're preparing it now.
            </p>

            {order?.orderNumber && (
              <strong>
                Order #{order.orderNumber}
              </strong>
            )}

            {order?.total && (
              <p>
                Total: <strong>{order.total}</strong>
              </p>
            )}

          </section>

          {/* FORGOT SOMETHING */}
          <section className={styles.forgotCard}>

            <div className={styles.timer}>
              ⏰{' '}
              <span>
                9:52 left to add to your order
              </span>
            </div>

            <h2>
              Forgot Something?
            </h2>

            <p>
              Add more items with no additional shipping
              fees until 2:20PM
            </p>

            <ProductSlider products={products} />

          </section>

          {/* ACCORDIONS */}
          <section className={styles.accordions}>

            <details>
              <summary>
                <span>Shipping & Tracking</span>
                <span>⌄</span>
              </summary>

              <div
                className={
                  styles.accordionContent
                }
              >
                Your shipping and tracking information
                will appear here once your order ships.
              </div>
            </details>

            <details>
              <summary>
                <span>What You Ordered</span>
                <span>⌄</span>
              </summary>

              <div
                className={
                  styles.accordionContent
                }
              >
                Your order details are available in your
                account.
              </div>
            </details>

          </section>

          {/* POINTS + SHARE */}
          <section className={styles.infoGrid}>

            <div className={styles.pointsCard}>

              <strong>
                ♢ You earned 99 points!
              </strong>

              <p>
                Points accumulate toward your next reward.
                Check your account to redeem.
              </p>

              <button
                onClick={handleMyAccount}
              >
                View My Account
              </button>

            </div>

            <div className={styles.shareCard}>

              <strong>
                ↗ Share & Save
              </strong>

              <p>
                Give friends $10 off their first order,
                get $10 credit when they buy.
              </p>

              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Mellow Fellow',
                      text: 'Check out Mellow Fellow',
                      url: window.location.origin,
                    });
                  } else {
                    navigator.clipboard.writeText(
                      window.location.origin
                    );
                  }
                }}
              >
                Share Referral Link
              </button>

            </div>

          </section>

          {/* YOU MAY ALSO LIKE */}
          <section className={styles.alsoLike}>

            <h2>
              You may also like
            </h2>

            <ProductSlider
              products={products}
            />

          </section>

          {/* BUTTONS */}
          <section className={styles.bottomActions}>

            <button
              className={styles.continueButton}
              onClick={handleContinueShopping}
            >
              Continue Shopping
            </button>

            <button
              className={styles.accountButton}
              onClick={handleMyAccount}
            >
              View My Account
            </button>

          </section>

        </main>
      </Layout>
    </>
  );
}


/*
 * -----------------------------------------
 * PRODUCT SLIDER
 * -----------------------------------------
 */

function ProductSlider({
  products,
}: {
  products: Product[];
}) {
  if (!products.length) {
    return (
      <div className={styles.noProducts}>
        No recommended products available.
      </div>
    );
  }

  return (
    <div className={styles.productSlider}>

      {products.map((product) => (
        <div
          className={styles.productCard}
          key={product.id}
        >

          <div className={styles.productImage}>

            {product.image && (
              <img
                src={product.image}
                alt={product.name}
              />
            )}

          </div>

          <small>
            Beverage
          </small>

          <h3>
            {product.name}
          </h3>

          <div className={styles.price}>
            {product.price}
          </div>

          <button
            onClick={() => {
              window.location.href =
                `/shop?add-to-cart=${product.id}`;
            }}
          >
            Add to Cart
          </button>

        </div>
      ))}

    </div>
  );
}

