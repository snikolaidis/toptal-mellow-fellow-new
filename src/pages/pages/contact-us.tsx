import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import ContactForm from '@/components/ContactForm';
import type { ContactFieldConfig } from '@/components/ContactForm/ContactForm';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';
import styles from '@/styles/pages/contact-us.module.css';
import { PhoneIcon, EmailIcon, ChatIcon } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { ensureLiveAgentButton, isLiveAgentWidgetReady } from '@/components/LiveAgentChat';

const CONTACT_FORM_ID = process.env.NEXT_PUBLIC_CONTACT_FORM_ID || '0';

const HELP_TOPICS = [
  'ID Verification',
  'Returns',
  'Rewards Program',
  'Device Issues',
  'Shipping Inquiries',
  'Order Status',
  'Product Questions',
];

const PURCHASE_LOCATIONS = ['Online', 'In-Store'];

const toOptions = (labels: string[]) => labels.map((label) => ({ label, value: label }));

const CONTACT_FIELDS: ContactFieldConfig[] = [
  { id: 1, key: 'name', type: 'text', label: 'Name', autoComplete: 'name', span: 'half' },
  {
    id: 3,
    key: 'email',
    type: 'email',
    label: 'Email',
    required: true,
    autoComplete: 'email',
    span: 'half',
  },
  {
    id: 5,
    key: 'helpTopic',
    type: 'select',
    label: 'How can we help?',
    required: true,
    options: toOptions(HELP_TOPICS),
    span: 'half',
  },
  {
    id: 6,
    key: 'purchaseLocation',
    type: 'select',
    label: 'Where did you purchase?',
    options: toOptions(PURCHASE_LOCATIONS),
    span: 'half',
  },
  { id: 7, key: 'product', type: 'text', label: 'Which product are you contacting us about?' },
  { id: 8, key: 'orderNumber', type: 'text', label: 'Order number (if applicable)' },
  { id: 4, key: 'message', type: 'textarea', label: 'Message', required: true },
];

interface ContactUsPageProps {
  page: ContentPageData | null;
}

const CALL_BUTTON_ID = 'vh2pebhu';
const CHAT_BUTTON_ID = process.env.NEXT_PUBLIC_LIVEAGENT_BUTTON_ID || 'n3lhfezy';

const SETTLE_MS = 2500;
const POLL_MS = 250;

type ChannelStatus = 'pending' | 'ready' | 'offline';


export default function ContactUsPage({ page }: ContactUsPageProps) {
  const callTriggerRef = useRef<HTMLElement | null>(null);
  const chatTriggerRef = useRef<HTMLElement | null>(null);
  const [callStatus, setCallStatus] = useState<ChannelStatus>('pending');
  const [chatStatus, setChatStatus] = useState<ChannelStatus>('pending');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    document.body.classList.add(styles.laTriggersHidden);

    const track = (
      buttonId: string,
      attach: (el: HTMLElement) => void,
      setStatus: (status: ChannelStatus) => void
    ) => {
      ensureLiveAgentButton(buttonId)
        .then((el) => {
          if (cancelled) return;
          if (!el) {
            setStatus('offline');
            return;
          }
          attach(el);
          const startedAt = Date.now();
          timers.push(
            window.setInterval(() => {
              if (cancelled) return;
              if (isLiveAgentWidgetReady(buttonId)) {
                setStatus('ready');
              } else if (Date.now() - startedAt >= SETTLE_MS) {
                setStatus('offline');
              }
            }, POLL_MS)
          );
        })
        .catch(() => {
          if (!cancelled) setStatus('offline');
        });
    };

    track(
      CALL_BUTTON_ID,
      (el) => {
        el.style.display = 'none';
        callTriggerRef.current = el;
      },
      setCallStatus
    );

    track(
      CHAT_BUTTON_ID,
      (el) => {
        chatTriggerRef.current = el;
      },
      setChatStatus
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearInterval(timer));
      document.body.classList.remove(styles.laTriggersHidden);
    };
  }, []);

  const handleCallClick = () => {
    try {
      callTriggerRef.current?.click();
    } catch {}
  };
  const handleChatClick = () => {
    try {
      chatTriggerRef.current?.click();
    } catch {}
  };

  const contactInfo = (page?.editorBlocks || [])
    .map((block) => block.renderedHtml)
    .filter(Boolean)
    .join('');

  return (
    <Layout title={page?.title ?? 'Contact Us'} seo={page?.seo}>
      <div className={styles.page}>
        <h1 className={styles.title}>{page?.title ?? 'Contact Us'}</h1>
        <p className={styles.intro}>
          Have a question about an order, a product, or your rewards? Send us a message and our team
          will get back to you.
        </p>
        <section className={styles.channels}>
          <h2 className={styles.channelsHeading}>Get in touch</h2>

          <p className={styles.channelsSubtext}>
            Pick the channel that works for you. Our support team is available Monday to Friday and aims to respond within 24 hours.
          </p>

          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <span className={styles.cardBadge} aria-hidden="true"><PhoneIcon /></span>
              <h3 className={styles.cardTitle}>Call us</h3>
              <p className={styles.cardText}>Speak with a real agent directly from your browser. No phone number needed.</p>
              {callStatus === 'offline' ? (
                <p className={`${styles.cardFootnote} ${styles.cardOffline}`}>
                  Phone support is offline, <a href="#contact-form">use the form</a>.
                </p>
              ) : (
                <button
                  type="button"
                  id="contact-call-us"
                  onClick={handleCallClick}
                  disabled={callStatus !== 'ready'}
                  className={`${styles.cardBtn} ${styles.cardBtnRust}`}
                >
                  Call us now
                </button>
              )}
              <p className={styles.cardFootnote}>Mon to Fri, 9am to 5pm PT</p>
            </div>

            <div className={styles.card}>
              <span className={styles.cardBadge} aria-hidden="true"><EmailIcon /></span>
              <h3 className={styles.cardTitle}>Email us</h3>
              <p className={styles.cardText}>Send a detailed message. Best for order issues, returns, and anything that needs a paper trail.</p>
              <a
                href="#contact-form"
                id="contact-email-form"
                className={`${styles.cardBtn} ${styles.cardBtnBrown}`}
              >
                Use the form
              </a>
              <p className={styles.cardFootnote}>Reply within 24 hours</p>
            </div>

            <div className={styles.card}>
              <span className={styles.cardBadge} aria-hidden="true"><ChatIcon /></span>
              <h3 className={styles.cardTitle}>Live chat</h3>
              <p className={styles.cardText}>Quick questions get quick answers. Our chat assistant handles common issues and can hand off to an agent.</p>
              {chatStatus === 'offline' ? (
                <p className={`${styles.cardFootnote} ${styles.cardOffline}`}>
                  Chat is offline, <a href="#contact-form">use the form</a>.
                </p>
              ) : (
                <button
                  type="button"
                  id="contact-live-chat"
                  onClick={handleChatClick}
                  disabled={chatStatus !== 'ready'}
                  className={`${styles.cardBtn} ${styles.cardBtnOutline}`}
                >
                  Open chat
                </button>
              )}
              <p className={styles.cardFootnote}>Typical reply under 2 min</p>
            </div>
          </div>
        </section>

        {contactInfo && (
          <div
            className={styles.contactInfo}
            dangerouslySetInnerHTML={{ __html: contactInfo }}
          />
        )}

        <h2 className={styles.formHeading}>Send us a message</h2>

        <div id="contact-form" className={styles.formWrap}>
          <ContactForm formId={CONTACT_FORM_ID} fields={CONTACT_FIELDS} />
        </div>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<ContactUsPageProps> = async () => {
  try {
    const client = getClient();
    const pageResult = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: '/contact-us' },
    });

    return {
      props: { page: pageResult.data?.page ?? null },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching contact-us page:', error);
    return { props: { page: null }, revalidate: 60 };
  }
};
