import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@faustwp/core';
import Layout from '@/components/Layout';

interface AccountGuardProps {
  title: string;
  children: ReactNode;
}

export default function AccountGuard({ title, children }: AccountGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
    }
  }, [isReady, isAuthenticated, router]);

  return (
    <Layout title={title}>
      {!isReady && (
        <div className="account">
          <header className="account__header">
            <div className="account__skeleton-bar" style={{ width: '220px', height: 36 }} />
            <div className="account__skeleton-bar" style={{ width: '60px', height: 14 }} />
          </header>
          <div style={{ marginBottom: 28 }}>
            <div className="account__skeleton-bar" style={{ width: '240px', height: 16, marginBottom: 8 }} />
            <div className="account__skeleton-bar" style={{ width: '280px', height: 12 }} />
          </div>
          <div className="account__layout">
            <div>
              <div className="account__skeleton-bar" style={{ width: '140px', height: 20, marginBottom: 18 }} />
              <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: 12, marginBottom: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 90px 70px 40px', gap: 16 }}>
                  {[80, 100, 90, 70, 40].map((w, i) => (
                    <div key={i} className="account__skeleton-bar" style={{ width: w, height: 10 }} />
                  ))}
                </div>
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="account__skeleton-row">
                  <div className="account__skeleton-bar" style={{ width: '60px' }} />
                  <div className="account__skeleton-bar" style={{ width: '85px' }} />
                  <div className="account__skeleton-bar" style={{ width: '75px', height: 22, borderRadius: 2 }} />
                  <div className="account__skeleton-bar" style={{ width: '55px' }} />
                  <div className="account__skeleton-bar" style={{ width: '35px' }} />
                </div>
              ))}
            </div>
            <aside className="account__skeleton-sidebar">
              <div className="account__skeleton-bar" style={{ width: '150px', height: 20 }} />
              <div className="account__skeleton-bar" style={{ width: '180px', height: 16 }} />
              <div className="account__skeleton-bar" style={{ width: '120px' }} />
              <div className="account__skeleton-bar" style={{ width: '140px' }} />
              <div className="account__skeleton-bar" style={{ width: '160px' }} />
            </aside>
          </div>
        </div>
      )}

      {isReady && !isAuthenticated && (
        <div className="account">
          <p className="account__empty">Please sign in to view your account.</p>
          <div className="account__center">
            <a href="/login" className="account__button">
              Sign In
            </a>
          </div>
        </div>
      )}

      {isReady && isAuthenticated && children}
    </Layout>
  );
}
