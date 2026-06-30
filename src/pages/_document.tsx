import { Html, Head, Main, NextScript, DocumentContext } from 'next/document';
import { getBodyClass } from '@/lib/bodyClass';

const awinAdvertiserId = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID ?? '';
const klaviyoPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
const klaviyoReviewsPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_REVIEWS_PUBLIC_KEY;
const yotpoLoyaltyLoader = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER;
const aioaToken = process.env.NEXT_PUBLIC_AIOA_TOKEN ?? '';
const aioaColor = process.env.NEXT_PUBLIC_AIOA_COLOR ?? '000000';
const aioaPosition = process.env.NEXT_PUBLIC_AIOA_POSITION ?? 'bottom_left';
const aioaWidgetSrc = `https://www.skynettechnologies.com/accessibility/js/all-in-one-accessibility-js-widget-minify.js?colorcode=${aioaColor}&token=${aioaToken}&position=${aioaPosition}`;
const klaviyoEnabled =
  !!klaviyoPublicKey &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_KLAVIYO_DEV === 'true');
const klaviyoReviewsEnabled =
  !!klaviyoReviewsPublicKey &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_KLAVIYO_DEV === 'true');

export default function Document({ bodyClass }: { bodyClass: string }) {
  return (
    <Html lang="en" translate="no">
      <Head>
        <meta name="google" content="notranslate" />
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
        {klaviyoEnabled && (
          <script
            type="text/javascript"
            async
            src={`https://static.klaviyo.com/onsite/js/${klaviyoPublicKey}/klaviyo.js`}
          />
        )}
        {klaviyoReviewsEnabled && (
          <script
            type="text/javascript"
            async
            src={`https://static.klaviyo.com/onsite/js/${klaviyoReviewsPublicKey}/klaviyo.js`}
          />
        )}
        {yotpoLoyaltyLoader && (
          <script type="text/javascript" async src={yotpoLoyaltyLoader} />
        )}
        <script src={aioaWidgetSrc} async />
        {awinAdvertiserId && (
          <script
            type="text/javascript"
            defer
            src={`https://www.dwin1.com/${awinAdvertiserId}.js`}
          />
        )}
        <script
          type="text/javascript"
          src="https://www.bugherd.com/sidebarv2.js?apikey=bwflzgc1semyy4bqdgyjeq"
          async
        />
      </Head>
      <body className={bodyClass}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (ctx: DocumentContext) => {
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  return { ...initialProps, bodyClass: getBodyClass(ctx.asPath || ctx.pathname || '/') };
};
