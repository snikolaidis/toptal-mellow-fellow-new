import { Html, Head, Main, NextScript } from 'next/document';

const klaviyoPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Authorize.net Accept.js - loaded from their CDN for security */}
        {process.env.NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT === 'production' ? (
          <script
            type="text/javascript"
            src="https://js.authorize.net/v1/Accept.js"
            charSet="utf-8"
          />
        ) : (
          <script
            type="text/javascript"
            src="https://jstest.authorize.net/v1/Accept.js"
            charSet="utf-8"
          />
        )}
        {klaviyoPublicKey && (
          <script
            type="text/javascript"
            async
            src={`https://static.klaviyo.com/onsite/js/${klaviyoPublicKey}/klaviyo.js`}
          />
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
