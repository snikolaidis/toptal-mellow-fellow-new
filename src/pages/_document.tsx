import { Html, Head, Main, NextScript } from 'next/document';

const klaviyoPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
const yotpoLoyaltyLoader = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER;
const aioaToken = process.env.NEXT_PUBLIC_AIOA_TOKEN ?? '';
const aioaColor = process.env.NEXT_PUBLIC_AIOA_COLOR ?? '000000';
const aioaPosition = process.env.NEXT_PUBLIC_AIOA_POSITION ?? 'bottom_left';
const aioaWidgetSrc = `https://www.skynettechnologies.com/accessibility/js/all-in-one-accessibility-js-widget-minify.js?colorcode=${aioaColor}&token=${aioaToken}&position=${aioaPosition}`;

export default function Document() {
  return (
    <Html lang="en" translate="no">
      <Head>
        <meta name="google" content="notranslate" />
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
        {yotpoLoyaltyLoader && (
          <script type="text/javascript" async src={yotpoLoyaltyLoader} />
        )}
        <script src={aioaWidgetSrc} async />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
