import Link from 'next/link';
import Image from 'next/image';
import Layout from '@/components/Layout';
import { useCart } from '@/context/CartContext';
import styles from '@/styles/pages/cart.module.css';

export default function CartPage() {
  const { cart, updateQuantity, removeFromCart, isLoading } = useCart();

  if (isLoading) {
    return (
      <Layout title="Cart">
        <div className={styles.page}>
          <h1 className={styles.title}>Your Cart</h1>
          <p className={styles.loading}>Loading cart...</p>
        </div>
      </Layout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Layout title="Cart">
        <div className={styles.page}>
          <h1 className={styles.title}>Your Cart</h1>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Your cart is empty.</p>
            <Link href="/shop" className="btn-primary">
              Continue Shopping
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Cart">
      <div className={styles.page}>
        <h1 className={styles.title}>Your Cart</h1>

        <div className={styles.container}>
          <div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <div className={styles.productCell}>
                        {item.product.image && (
                          <Image
                            src={item.product.image.sourceUrl}
                            alt={item.product.image.altText || item.product.name}
                            width={80}
                            height={80}
                            style={{ objectFit: 'cover' }}
                          />
                        )}
                        <div className={styles.productInfo}>
                          <Link href={`/product/${item.product.slug}`}>
                            {item.product.name}
                          </Link>
                          {item.variation && (
                            <p className={styles.variationInfo}>{item.variation.name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{item.product.price}</td>
                    <td>
                      <div className={styles.quantitySelector}>
                        <button
                          className={styles.quantityBtn}
                          onClick={() => updateQuantity(item.key, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <input
                          className={styles.quantityInput}
                          type="text"
                          value={item.quantity}
                          readOnly
                          aria-label="Quantity"
                        />
                        <button
                          className={styles.quantityBtn}
                          onClick={() => updateQuantity(item.key, item.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td>{item.total}</td>
                    <td>
                      <button
                        className={styles.removeBtn}
                        onClick={() => removeFromCart(item.key)}
                        aria-label="Remove item"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.summary}>
            <h2 className={styles.summaryTitle}>Order Summary</h2>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>{cart.subtotal}</span>
            </div>
            {cart.discountTotal && parseFloat(cart.discountTotal) > 0 && (
              <div className={`${styles.summaryRow} ${styles.summaryRowDiscount}`}>
                <span>Discount</span>
                <span>-{cart.discountTotal}</span>
              </div>
            )}
            {cart.shippingTotal && (
              <div className={styles.summaryRow}>
                <span>Shipping</span>
                <span>{cart.shippingTotal}</span>
              </div>
            )}
            <div className={`${styles.summaryRow} ${styles.summaryRowTotal}`}>
              <span>Total</span>
              <span>{cart.total}</span>
            </div>

            <div className={styles.actions}>
              <Link href="/checkout" className={`btn-primary ${styles.checkoutBtn}`}>
                Proceed to Checkout
              </Link>
              <Link href="/shop" className={styles.continueShoppingBtn}>
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
