import { useCart } from '@/context/CartContext';
import TieredProgressBar from './TieredProgressBar';
import FreeGiftWidget from './FreeGiftWidget';
import styles from './CartDrawerV2.module.css';

export default function CartDrawerV2() {
  const {
    cart,
    isDrawerOpen,
    closeDrawer,
  } = useCart();

  if (!isDrawerOpen) return null;

  const subtotal = parseFloat(
    (cart?.subtotal || '0').replace(/[^0-9.]/g, '')
  );

  return (
    <>
      <div className={styles.backdrop} onClick={closeDrawer} />

      <aside className={styles.drawer}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Cart</h2>

          <button
            onClick={closeDrawer}
            className={styles.closeBtn}
          >
            ✕
          </button>
        </div>

        {/* Shipping Banner */}
        <div className={styles.shippingBanner}>
          Free shipping on all orders over $80
        </div>

        {/* Progress */}
        <TieredProgressBar subtotal={subtotal} />

        {/* Scroll Area */}
        <div className={styles.content}>
          {/* Empty Cart */}
          {(!cart || cart.items.length === 0) && (
            <div className={styles.emptyCart}>
              <h3>Your cart is empty!</h3>

              <button className={styles.shopBtn}>
                SHOP NOW
              </button>
            </div>
          )}

          {/* Cart Items */}
          {cart && cart.items.length > 0 && (
            <div className={styles.cartItems}>
              {cart.items.map((item) => (
                <div key={item.key}>
                  {item.product.name}
                </div>
              ))}
            </div>
          )}

          {/* Free Products */}
          <FreeGiftWidget subtotal={subtotal} />

          {/* Recommendations */}
          <div className={styles.recommendations}>
            <h3>You May Also Like</h3>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.subtotalRow}>
            <span>SUBTOTAL</span>
            <span>{cart?.subtotal}</span>
          </div>

          <button className={styles.checkoutBtn}>
            Checkout Now
          </button>

          <button
            className={styles.continueBtn}
            onClick={closeDrawer}
          >
            CONTINUE SHOPPING
          </button>
        </div>
      </aside>
    </>
  );
}