import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

import Layout from '@/components/Layout';
import { ChevronDownIcon } from '@/components/icons';
import { useCart } from '@/context/CartContext';
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

interface OrderedItem {
  id: number | string;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  image: string;
  total: number;
}

export default function OrderConfirmation() {
  const router = useRouter();

  const firstName =
    typeof router.query.firstName === 'string'
      ? router.query.firstName
      : '';

  const [order, setOrder] = useState<OrderData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>([]);

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
   * Fetch what was actually ordered, authorized by the order's own
   * key (the same guest-access model WooCommerce itself uses for
   * its "order received" page) rather than any session/login state -
   * so this works on first load, on reload, and for a shared/emailed
   * link, for guest and logged-in checkouts alike.
   */
  useEffect(() => {
    if (!router.isReady) return;

    const orderDatabaseId = router.query.orderDatabaseId;
    const orderKey = router.query.orderKey;

    if (
      typeof orderDatabaseId !== 'string' ||
      typeof orderKey !== 'string' ||
      !orderDatabaseId ||
      !orderKey
    ) {
      return;
    }

    let cancelled = false;

    fetch(
      `/api/checkout/order-items?orderId=${encodeURIComponent(orderDatabaseId)}&key=${encodeURIComponent(orderKey)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.items)) {
          setOrderedItems(data.items);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.orderDatabaseId, router.query.orderKey]);

  /*
   * Recommend complements to what was just ordered - reuses the same
   * cross-sell engine the cart drawer and PDP "You May Also Like" use
   * (see api/shop/recommendations.ts), fed with this order's product
   * IDs so it can both derive product types and exclude items the
   * customer already just bought.
   */
  useEffect(() => {
    if (orderedItems.length === 0) {
      setLoading(false);
      return;
    }

    const productIds = orderedItems
      .map((item) => item.productId)
      .filter(Boolean);

    if (productIds.length === 0) {
      setLoading(false);
      return;
    }

    const totalQuery =
      typeof router.query.total === 'string'
        ? router.query.total
        : '';
    const cartTotal = totalQuery.replace(/[^0-9.]/g, '') || '0';

    let cancelled = false;

    fetch(
      `/api/shop/recommendations?${new URLSearchParams({
        context: 'cart',
        cartProductIds: productIds.join(','),
        excludeProductIds: productIds.join(','),
        cartTotal,
        limit: '8',
      })}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.products)) {
          setProducts(
            data.products.map((p: any) => ({
              id: p.databaseId,
              name: p.name,
              price: p.price || '',
              image: p.image?.sourceUrl || '',
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderedItems, router.query.total]);

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
    router.push('/account');
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
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_1_3163)">
                  <path d="M13.9949 26.8241C21.0802 26.8241 26.8239 21.0804 26.8239 13.9952C26.8239 6.90997 21.0802 1.16626 13.9949 1.16626C6.90972 1.16626 1.16602 6.90997 1.16602 13.9952C1.16602 21.0804 6.90972 26.8241 13.9949 26.8241Z" stroke="#4E7A47" strokeWidth="1.16627"/>
                  <path d="M8.16406 13.9952L12.246 18.0771L19.8267 10.4964" stroke="#4E7A47" strokeWidth="1.45783" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
                <defs>
                  <clipPath id="clip0_1_3163">
                    <rect width="27.9904" height="27.9904" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
            </div>

            <h2>
              Your order is confirmed!
            </h2>

            <p>
              Thanks{firstName ? ` ${firstName}` : ''}! We've received your order
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
              <span className={styles.countdown}>
                <svg className={styles.timerIcon} width="42" height="41" viewBox="0 0 42 41" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M30.6208 7.31594C30.2664 7.42485 29.8793 7.43126 29.5577 7.25829C29.1771 7.05329 28.7833 6.8611 28.3896 6.68813C27.7071 6.38704 27.4905 5.51579 28.1205 5.11219C29.1049 4.47798 30.2861 4.10641 31.5527 4.10641C35.0046 4.10641 37.8002 6.83548 37.8002 10.2052C37.8002 11.0508 37.623 11.858 37.3014 12.5947C37.0061 13.2674 36.0939 13.2225 35.6674 12.6203C35.418 12.268 35.1555 11.9284 34.8799 11.5953C34.6502 11.3134 34.5846 10.9419 34.6305 10.5831C34.6436 10.4614 34.6568 10.3333 34.6568 10.2052C34.6568 8.53313 33.2655 7.18141 31.5593 7.18141C31.2377 7.18141 30.9227 7.23266 30.6274 7.32235L30.6208 7.31594ZM6.33301 12.6139C5.90645 13.2161 4.9877 13.2609 4.69895 12.5883C4.37738 11.8516 4.2002 11.0444 4.2002 10.1988C4.2002 6.82907 6.99582 4.10001 10.4477 4.10001C11.7143 4.10001 12.8955 4.47157 13.8799 5.10579C14.5099 5.50938 14.2933 6.38063 13.6108 6.68173C13.2105 6.8611 12.8233 7.04688 12.4427 7.25188C12.1211 7.42485 11.7274 7.41844 11.3796 7.30954C11.0843 7.21985 10.7758 7.1686 10.4477 7.1686C8.73488 7.1686 7.3502 8.52673 7.3502 10.1924C7.3502 10.3205 7.35676 10.4486 7.37645 10.5703C7.42238 10.9291 7.35676 11.3006 7.12707 11.5825C6.85145 11.9156 6.58895 12.2552 6.33957 12.6075L6.33301 12.6139ZM32.5502 22.55C32.5502 16.3231 27.3789 11.275 21.0002 11.275C14.6214 11.275 9.4502 16.3231 9.4502 22.55C9.4502 28.7769 14.6214 33.825 21.0002 33.825C27.3789 33.825 32.5502 28.7769 32.5502 22.55ZM30.2205 33.7289C27.7005 35.7085 24.4914 36.9 21.0002 36.9C17.5089 36.9 14.2999 35.7085 11.7799 33.7289L8.99082 36.4516C8.37395 37.0538 7.37645 37.0538 6.76613 36.4516C6.15582 35.8494 6.14926 34.8756 6.76613 34.2799L9.5552 31.5572C7.52082 29.0908 6.3002 25.9581 6.3002 22.55C6.3002 14.6255 12.8824 8.20001 21.0002 8.20001C29.118 8.20001 35.7002 14.6255 35.7002 22.55C35.7002 25.9581 34.4796 29.0908 32.4518 31.5508L35.2408 34.2735C35.8577 34.8756 35.8577 35.8494 35.2408 36.4452C34.6239 37.041 33.6264 37.0474 33.0161 36.4452L30.2271 33.7225L30.2205 33.7289ZM22.5752 15.8875V21.9158L25.2658 24.5424C25.8827 25.1445 25.8827 26.1183 25.2658 26.7141C24.6489 27.3099 23.6514 27.3163 23.0411 26.7141L19.8911 23.6391C19.5958 23.3508 19.4318 22.96 19.4318 22.55V15.8875C19.4318 15.0355 20.1339 14.35 21.0068 14.35C21.8796 14.35 22.5818 15.0355 22.5818 15.8875H22.5752Z" fill="#A92331"/>
                </svg>
                {' '}9:52
              </span>
              {' '}
              <span>
                left to add to your order
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
                <ChevronDownIcon />
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

            <details open={orderedItems.length > 0}>
              <summary>
                <span>What You Ordered</span>
                <ChevronDownIcon />
              </summary>

              <div
                className={
                  styles.accordionContent
                }
              >
                {orderedItems.length > 0 ? (
                  <div className={styles.orderedItems}>
                    {orderedItems.map((item) => (
                      <div
                        className={styles.orderedItem}
                        key={item.id}
                      >
                        <div className={styles.orderedItemImage}>
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                            />
                          )}
                        </div>

                        <div className={styles.orderedItemInfo}>
                          <div className={styles.orderedItemName}>
                            {item.name}
                          </div>
                          <div className={styles.orderedItemQty}>
                            Qty {item.quantity} × ${item.price.toFixed(2)}
                          </div>
                        </div>

                        <div className={styles.orderedItemTotal}>
                          ${item.total.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  'Your order details are available in your account.'
                )}
              </div>
            </details>

          </section>

          {/* POINTS + SHARE */}
          <section className={styles.infoGrid}>

            <div className={styles.pointsCard}>

              <strong>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_1_3196)">
                    <path d="M4.55781 1.32018C4.73357 1.08193 5.0148 0.937408 5.31164 0.937408H14.6858C14.9826 0.937408 15.2638 1.07802 15.4396 1.32018L19.8142 7.25712C20.0798 7.61646 20.0524 8.11251 19.7556 8.44451L10.6939 18.4436C10.5182 18.6389 10.2643 18.7521 9.9987 18.7521C9.7331 18.7521 9.48312 18.6389 9.30345 18.4436L0.241813 8.44451C-0.0589399 8.11251 -0.0823751 7.61646 0.183225 7.25712L4.55781 1.32018ZM6.06157 2.87472C5.93268 2.97237 5.89753 3.14814 5.97955 3.28484L8.22152 7.02277L2.47207 7.49929C2.31193 7.511 2.18694 7.64771 2.18694 7.81176C2.18694 7.9758 2.31193 8.1086 2.47207 8.12423L9.97136 8.74917C9.98698 8.74917 10.0065 8.74917 10.0221 8.74917L17.5214 8.12423C17.6816 8.11251 17.8065 7.9758 17.8065 7.81176C17.8065 7.64771 17.6816 7.51491 17.5214 7.49929L11.772 7.01886L14.0139 3.28484C14.096 3.14814 14.0608 2.96847 13.9319 2.87472C13.803 2.78098 13.6234 2.79661 13.514 2.91378L9.9987 6.72592L6.4795 2.91378C6.37014 2.79661 6.19047 2.78098 6.06157 2.87472Z" fill="white"/>
                  </g>
                  <defs>
                    <clipPath id="clip0_1_3196">
                      <rect width="19.9981" height="19.9981" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
                <span>You earned 99 points!</span>
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
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_1_3211)">
                    <path d="M12.0223 0.718682C11.5536 0.913976 11.2489 1.36706 11.2489 1.87482V4.99953H6.87435C3.07783 4.99953 0 8.07736 0 11.8739C0 16.2992 3.18329 18.2756 3.91369 18.674C4.01134 18.7287 4.1207 18.7482 4.23007 18.7482C4.65581 18.7482 4.99953 18.4006 4.99953 17.9788C4.99953 17.6858 4.83157 17.4163 4.61675 17.2171C4.2496 16.8734 3.74964 16.186 3.74964 15.0025C3.74964 12.9324 5.42917 11.2528 7.49929 11.2528H11.2489V14.3775C11.2489 14.8814 11.5536 15.3384 12.0223 15.5337C12.491 15.729 13.0261 15.6196 13.3854 15.2642L19.6349 9.01477C20.1231 8.52653 20.1231 7.73364 19.6349 7.24541L13.3854 0.996C13.0261 0.636659 12.491 0.5312 12.0223 0.726494V0.718682Z" fill="white"/>
                  </g>
                  <defs>
                    <clipPath id="clip0_1_3211">
                      <rect width="19.9981" height="19.9981" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
                <span>Share & Save</span>
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
  const { addToCart } = useCart();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedId, setAddedId] = useState<number | null>(null);

  if (!products.length) {
    return (
      <div className={styles.noProducts}>
        No recommended products available.
      </div>
    );
  }

  const handleAddToCart = async (product: Product) => {
    setAddingId(product.id);

    try {
      await addToCart({
        productId: product.id,
        quantity: 1,
      });

      setAddedId(product.id);

      setTimeout(() => {
        setAddedId((current) =>
          current === product.id ? null : current
        );
      }, 2000);
    } catch (error) {
      console.error('Failed to add product to cart:', error);
    } finally {
      setAddingId(null);
    }
  };

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

          <h3 title={product.name}>
            {product.name}
          </h3>

          <div className={styles.price}>
            {product.price}
          </div>

          <button
            onClick={() => handleAddToCart(product)}
            disabled={addingId === product.id}
          >
            {addingId === product.id
              ? 'Adding...'
              : addedId === product.id
              ? 'Added ✓'
              : 'Add to Cart'}
          </button>

        </div>
      ))}

    </div>
  );
}

