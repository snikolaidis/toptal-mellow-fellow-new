import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import Layout from '@/components/Layout';

const AWIN_ADVERTISER_ID = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '';

export default function OrderConfirmationPage() {
  const router = useRouter();
  const { orderId, total } = router.query;

  // Parse total for Awin (strip currency symbols)
  const awinTotal = typeof total === 'string' ? total.replace(/[^0-9.]/g, '') : '';

  return (
    <Layout title="Order Confirmed">
      {/* Awin Conversion Tracking */}
      {AWIN_ADVERTISER_ID && orderId && awinTotal && (
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
                AWIN.Tracking.Sale.orderRef = "${orderId}";
                AWIN.Tracking.Sale.parts = "DEFAULT:${awinTotal}";
                AWIN.Tracking.Sale.currency = "USD";
                AWIN.Tracking.Sale.test = "0";
              `,
            }}
          />
          <noscript>
            <img
              src={`https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=${AWIN_ADVERTISER_ID}&amount=${awinTotal}&ch=aw&parts=DEFAULT:${awinTotal}&ref=${orderId}&cr=USD&testmode=0`}
              width="0"
              height="0"
              style={{ display: 'none' }}
            />
          </noscript>
        </Head>
      )}

      <div className="order-confirmation">
        <div className="confirmation-icon">✓</div>
        <h1>Thank You for Your Order!</h1>

        <div className="order-details-card">
          <p className="order-number">
            Order Number: <strong>#{orderId}</strong>
          </p>
          {total && (
            <p className="order-total">
              Total Charged: <strong>{total}</strong>
            </p>
          )}
        </div>

        <div className="confirmation-message">
          <p>
            We have received your order and payment. Your order is being processed
            and you will receive an email confirmation shortly.
          </p>
          <p className="payment-note">
            Your payment was securely processed via Authorize.net.
          </p>
        </div>

        <div className="what-next">
          <h3>What happens next?</h3>
          <ol>
            <li>You will receive an order confirmation email</li>
            <li>We will prepare your order for shipping</li>
            <li>You will receive a shipping notification with tracking info</li>
          </ol>
        </div>

        <div className="confirmation-actions">
          <Link href="/shop" className="btn btn-primary">
            Continue Shopping
          </Link>
          <Link href="/" className="btn btn-secondary">
            Return Home
          </Link>
        </div>
      </div>

      <style jsx>{`
        .order-confirmation {
          max-width: 600px;
          margin: 2rem auto;
          padding: 2rem;
          text-align: center;
        }

        .confirmation-icon {
          width: 80px;
          height: 80px;
          background: #22c55e;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          margin: 0 auto 1.5rem;
        }

        h1 {
          color: #1a1a1a;
          margin-bottom: 1.5rem;
        }

        .order-details-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .order-number {
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }

        .order-total {
          font-size: 1.25rem;
          color: #22c55e;
        }

        .confirmation-message {
          margin-bottom: 1.5rem;
          color: #666;
        }

        .payment-note {
          font-size: 0.9rem;
          color: #888;
          margin-top: 0.5rem;
        }

        .what-next {
          text-align: left;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .what-next h3 {
          margin-bottom: 1rem;
          font-size: 1rem;
        }

        .what-next ol {
          margin: 0;
          padding-left: 1.5rem;
        }

        .what-next li {
          margin-bottom: 0.5rem;
          color: #666;
        }

        .confirmation-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }
      `}</style>
    </Layout>
  );
}
