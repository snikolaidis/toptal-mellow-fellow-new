import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
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
          <p className="account__empty">Loading...</p>
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
