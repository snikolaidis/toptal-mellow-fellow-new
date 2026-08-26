import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Layout from '@/components/Layout';
import { useCart, groupCartItems } from '@/context/CartContext';
import styles from '@/styles/pages/cart.module.css';

export default function CartPage() {
  const { cart, updateQuantity, removeFromCart, removeBundleGroup, addBundleToCart, isLoading, cartReady, bundleNames, bundleDiscounts, refreshCart, applyCoupon, removeCoupon, error: cartError } = useCart();
  const [couponCode, setCouponCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!cart && !isLoading) {
      refreshCart();
    }
  }, []);
  const { bundles, standalone } = groupCartItems(cart?.items ?? [], bundleNames);

  if (isLoading || !cartReady) {
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
                {/* Bundle groups */}
                {bundles.map((group) => {
                  const discount = bundleDiscounts[group.bundleId] ?? 0;
                  const originalTotal = group.instances
                    .flatMap((inst) => inst.items)
                    .reduce((sum, i) => sum + parseFloat(i.total.replace(/[^0-9.]/g, '') || '0'), 0);
                  const discountedTotal = discount > 0 ? originalTotal * (1 - discount / 100) : originalTotal;
                  const bundleTotal = discountedTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                  return (
                    <React.Fragment key={group.bundleId}>
                      <tr className={styles.bundleHeaderRow}>
                        <td className={styles.bundleHeaderCell}>{group.bundleName}</td>
                        <td></td>
                        <td>
                          <div className={styles.quantitySelector}>
                            <button
                              className={styles.quantityBtn}
                              onClick={() =>
                                removeBundleGroup(
                                  [group.instances[group.instances.length - 1].groupKey]
                                )
                              }
                              aria-label={`Remove one ${group.bundleName}`}
                            >
                              −
                            </button>
                            <input
                              className={styles.quantityInput}
                              type="text"
                              value={group.quantity}
                              readOnly
                              aria-label="Bundle quantity"
                            />
                            <button
                              className={styles.quantityBtn}
                              onClick={() =>
                                addBundleToCart(
                                  group.bundleId,
                                  group.representativeItems.flatMap((i) =>
                                    Array(i.quantity).fill(i.product.databaseId)
                                  ),
                                  group.bundleName
                                )
                              }
                              aria-label={`Add another ${group.bundleName}`}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          {discount > 0 && (
                            <span style={{ textDecoration: 'line-through', color: '#8A8683', marginRight: '0.375rem', fontSize: '0.875rem' }}>
                              {originalTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                            </span>
                          )}
                          {bundleTotal}
                        </td>
                        <td></td>
                      </tr>
                      {group.representativeItems.map((item) => (
                        <tr key={item.key} className={styles.bundleItemRow}>
                          <td>
                            <div className={styles.productCell}>
                              {item.product.image && (
                                <Image
                                  src={item.product.image.sourceUrl}
                                  alt={item.product.image.altText || item.product.name}
                                  width={60}
                                  height={60}
                                  style={{ objectFit: 'contain' }}
                                />
                              )}
                              <div className={styles.productInfo}>
                                <Link href={`/products/${item.product.slug}`}>
                                  {item.product.name}
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td>{item.product.price}</td>
                          <td style={{ color: '#8A8683', fontSize: '0.875rem' }}>×{item.quantity}</td>
                          <td>{item.total}</td>
                          <td></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Standalone items */}
                {standalone.map((item) => (
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
                          <Link href={`/products/${item.product.slug}`}>
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
                          aria-label={item.quantity <= 1 ? 'Remove item' : 'Decrease quantity'}
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
                    <td>
                      {item.subtotal && parseFloat(item.subtotal.replace(/[^0-9.]/g, '')) > parseFloat(item.total.replace(/[^0-9.]/g, '')) + 0.005 && (
                        <span style={{ textDecoration: 'line-through', color: '#8A8683', marginRight: '0.375rem', fontSize: '0.875rem' }}>
                          {item.subtotal}
                        </span>
                      )}
                      {item.total}
                    </td>
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

            <form
              className={styles.couponForm}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!couponCode.trim()) return;
                setIsApplying(true);
                const ok = await applyCoupon(couponCode.trim());
                if (ok) setCouponCode('');
                setIsApplying(false);
              }}
            >
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Discount code"
                disabled={isApplying}
                className={styles.couponInput}
              />
              <button
                type="submit"
                disabled={isApplying || !couponCode.trim()}
                className={styles.couponBtn}
              >
                {isApplying ? 'Applying...' : 'Apply'}
              </button>
            </form>
            {cartError && <p className={styles.couponError}>{cartError}</p>}

            {cart.appliedCoupons && cart.appliedCoupons.length > 0 && (
              <div className={styles.appliedCoupons}>
                {cart.appliedCoupons.map((coupon) => (
                  <span key={coupon.code} className={styles.appliedCoupon}>
                    {coupon.code}
                    <button
                      type="button"
                      onClick={() => removeCoupon(coupon.code)}
                      className={styles.couponRemoveBtn}
                      aria-label={`Remove coupon ${coupon.code}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>{cart.subtotal}</span>
            </div>
            {cart.discountTotal && parseFloat(cart.discountTotal.replace(/[^0-9.-]/g, '')) > 0 && (
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
