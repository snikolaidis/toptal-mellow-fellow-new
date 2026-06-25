import { Html, Head, Main, NextScript, DocumentContext } from 'next/document';
import { getBodyClass } from '@/lib/bodyClass';

const awinAdvertiserId = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID ?? '';
const klaviyoPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
const yotpoLoyaltyLoader = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER;
const aioaToken = process.env.NEXT_PUBLIC_AIOA_TOKEN ?? '';
const aioaColor = process.env.NEXT_PUBLIC_AIOA_COLOR ?? '000000';
const aioaPosition = process.env.NEXT_PUBLIC_AIOA_POSITION ?? 'bottom_left';
const aioaWidgetSrc = `https://www.skynettechnologies.com/accessibility/js/all-in-one-accessibility-js-widget-minify.js?colorcode=${aioaColor}&token=${aioaToken}&position=${aioaPosition}`;
const liveAgentUrl = process.env.NEXT_PUBLIC_LIVEAGENT_URL;
const liveAgentButtonId = process.env.NEXT_PUBLIC_LIVEAGENT_BUTTON_ID;

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
        {awinAdvertiserId && (
          <script
            type="text/javascript"
            defer
            src={`https://www.dwin1.com/${awinAdvertiserId}.js`}
          />
        )}
        {liveAgentUrl && liveAgentButtonId && (
          <script
            type="text/javascript"
            dangerouslySetInnerHTML={{
              __html: `(function(d,src,c){var t=d.scripts[d.scripts.length-1],s=d.createElement('script');s.id='la_x2s6df8d';s.defer=true;s.src=src;s.onload=s.onreadystatechange=function(){var rs=this.readyState;if(rs&&(rs!='complete')&&(rs!='loaded')){return;}c(this);};t.parentElement.insertBefore(s,t.nextSibling);})(document,'${liveAgentUrl}/scripts/track.js',function(e){LiveAgent.createButton('${liveAgentButtonId}',e);});`,
            }}
          />
        )}
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
