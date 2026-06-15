import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth, getApolloAuthClient, useLogout } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import Layout from '@/components/Layout';
import { GET_CUSTOMER } from '@/graphql/queries/auth';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import LoyaltyRedeem from '@/components/LoyaltyRedeem';

// Icons
const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const MapPinIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ShoppingBagIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

function AccountDashboard() {
  const client = getApolloAuthClient();
  const { logout } = useLogout();
  const { data, loading, error } = useQuery(GET_CUSTOMER, { client });
  const { ready, token } = useYotpoLoyalty();
  const loyaltyMyRewardsInstance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_MY_REWARDS_INSTANCE;

  useEffect(() => {
    if (ready && loyaltyMyRewardsInstance && !loading) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, loyaltyMyRewardsInstance, loading]);

  const handleLogout = async () => {
    // Clear WC session server-side (HttpOnly cookies can't be cleared via JS)
    await fetch('/api/cart/clear-session', { method: 'POST' }).catch(() => {});
    logout('/');
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="spinner h-8 w-8"></div>
        <span className="ml-3 text-[#666666]">Loading your account...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="error-alert max-w-md mx-auto">
          <p>Error loading account: {error.message}</p>
        </div>
      </div>
    );
  }

  const customer = data?.customer;
  const orders = customer?.orders?.nodes || [];

  const getStatusClasses = (status: string) => {
    const baseClasses = 'inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider';
    switch (status?.toLowerCase()) {
      case 'processing':
        return `${baseClasses} bg-black text-white`;
      case 'completed':
        return `${baseClasses} bg-[#f5f5f0] text-black border border-black`;
      case 'pending':
      case 'on-hold':
        return `${baseClasses} bg-[#f5f5f0] text-[#666666] border border-[#e0e0e0]`;
      case 'failed':
      case 'cancelled':
        return `${baseClasses} bg-white text-[#999999] border border-[#e0e0e0] line-through`;
      default:
        return `${baseClasses} bg-[#f5f5f0] text-[#666666]`;
    }
  };

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-[#e0e0e0]">
        <div>
          <h1 className="text-3xl font-bold text-black lowercase">my account.</h1>
          <p className="text-[#666666] mt-1">
            Welcome back, {customer?.firstName || customer?.displayName || 'Customer'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5f5f0] hover:bg-[#e0e0e0] text-black font-medium transition-colors"
        >
          <LogoutIcon />
          Sign Out
        </button>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Account Details Card */}
        <div className="border border-[#e0e0e0] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center">
              <UserIcon />
            </div>
            <h2 className="text-lg font-semibold text-black">Account Details</h2>
          </div>
          <div className="space-y-2 text-[#666666]">
            <p>
              <span className="font-medium text-black">Name:</span> {customer?.firstName} {customer?.lastName}
            </p>
            <p>
              <span className="font-medium text-black">Email:</span> {customer?.email}
            </p>
          </div>
          <Link
            href="/account/edit"
            className="inline-flex items-center mt-4 text-black hover:text-[#666666] font-medium text-sm gap-1 uppercase tracking-wider"
          >
            Edit Account
            <ChevronRightIcon />
          </Link>
        </div>

        {/* Billing Address Card */}
        <div className="border border-[#e0e0e0] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center">
              <CreditCardIcon />
            </div>
            <h2 className="text-lg font-semibold text-black">Billing Address</h2>
          </div>
          <div className="text-[#666666] space-y-1">
            {customer?.billing?.address1 ? (
              <>
                <p className="font-medium text-black">
                  {customer.billing.firstName} {customer.billing.lastName}
                </p>
                <p>{customer.billing.address1}</p>
                {customer.billing.address2 && <p>{customer.billing.address2}</p>}
                <p>
                  {customer.billing.city}, {customer.billing.state} {customer.billing.postcode}
                </p>
                <p>{customer.billing.country}</p>
                {customer.billing.phone && (
                  <p className="text-sm text-[#666666]">Phone: {customer.billing.phone}</p>
                )}
              </>
            ) : (
              <p className="text-[#999999] italic">No billing address saved</p>
            )}
          </div>
          <Link
            href="/account/addresses"
            className="inline-flex items-center mt-4 text-black hover:text-[#666666] font-medium text-sm gap-1 uppercase tracking-wider"
          >
            Edit Addresses
            <ChevronRightIcon />
          </Link>
        </div>

        {/* Shipping Address Card */}
        <div className="border border-[#e0e0e0] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center">
              <MapPinIcon />
            </div>
            <h2 className="text-lg font-semibold text-black">Shipping Address</h2>
          </div>
          <div className="text-[#666666] space-y-1">
            {customer?.shipping?.address1 ? (
              <>
                <p className="font-medium text-black">
                  {customer.shipping.firstName} {customer.shipping.lastName}
                </p>
                <p>{customer.shipping.address1}</p>
                {customer.shipping.address2 && <p>{customer.shipping.address2}</p>}
                <p>
                  {customer.shipping.city}, {customer.shipping.state} {customer.shipping.postcode}
                </p>
                <p>{customer.shipping.country}</p>
              </>
            ) : (
              <p className="text-[#999999] italic">No shipping address saved</p>
            )}
          </div>
          <Link
            href="/account/addresses"
            className="inline-flex items-center mt-4 text-black hover:text-[#666666] font-medium text-sm gap-1 uppercase tracking-wider"
          >
            Edit Addresses
            <ChevronRightIcon />
          </Link>
        </div>
      </div>

      {ready && loyaltyMyRewardsInstance && (
        <div
          key={token ?? 'guest'}
          className="mt-8 yotpo-widget-instance"
          data-yotpo-instance-id={loyaltyMyRewardsInstance}
          suppressHydrationWarning
        />
      )}

      <LoyaltyRedeem />

      {/* Orders Section */}
      <div className="mt-8 border border-[#e0e0e0] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center">
            <ShoppingBagIcon />
          </div>
          <h2 className="text-lg font-semibold text-black">Recent Orders</h2>
        </div>

        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e0e0e0]">
                  <th className="text-left py-3 px-4 font-semibold text-black text-xs uppercase tracking-wider">Order</th>
                  <th className="text-left py-3 px-4 font-semibold text-black text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-black text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-black text-xs uppercase tracking-wider">Total</th>
                  <th className="text-left py-3 px-4 font-semibold text-black text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id} className="border-b border-[#f5f5f0] hover:bg-[#f5f5f0] transition-colors">
                    <td className="py-4 px-4">
                      <span className="font-medium text-black">#{order.orderNumber}</span>
                    </td>
                    <td className="py-4 px-4 text-[#666666]">
                      {new Date(order.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-4">
                      <span className={getStatusClasses(order.status)}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-medium text-black">{order.total}</td>
                    <td className="py-4 px-4">
                      <Link
                        href={`/account/orders/${order.databaseId}`}
                        className="inline-flex items-center px-3 py-1.5 bg-black hover:bg-[#333333] text-white text-xs font-semibold uppercase tracking-wider transition-colors gap-1"
                      >
                        View
                        <ChevronRightIcon />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-[#f5f5f0] flex items-center justify-center mx-auto mb-4">
              <ShoppingBagIcon />
            </div>
            <p className="text-[#666666] mb-4">No orders yet</p>
            <Link
              href="/shop"
              className="inline-flex items-center px-6 py-3 bg-black hover:bg-[#333333] text-white font-semibold text-sm uppercase tracking-wider transition-colors gap-2"
            >
              Start Shopping
              <ChevronRightIcon />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, isReady, loginUrl } = useAuth();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.push('/login?redirect=/account');
    }
  }, [isReady, isAuthenticated, router]);

  if (!isReady) {
    return (
      <Layout title="My Account">
        <div className="flex items-center justify-center py-16">
          <div className="spinner h-8 w-8"></div>
          <span className="ml-3 text-[#666666]">Loading...</span>
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout title="My Account">
        <div className="text-center py-16">
          <p className="text-[#666666] mb-4">Please sign in to view your account.</p>
          <a
            href={loginUrl || '/login'}
            className="inline-flex items-center px-6 py-3 bg-black hover:bg-[#333333] text-white font-semibold text-sm uppercase tracking-wider transition-colors"
          >
            Sign In
          </a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="My Account">
      <AccountDashboard />
    </Layout>
  );
}
