import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import ContactForm from '@/components/ContactForm';
import type { ContactFieldConfig } from '@/components/ContactForm/ContactForm';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import type { ContentPageData } from '@/types/mellow-fellow';
import styles from '@/styles/pages/contact-us.module.css';

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

export default function ContactUsPage({ page }: ContactUsPageProps) {
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

        {contactInfo && (
          <div
            className={styles.contactInfo}
            dangerouslySetInnerHTML={{ __html: contactInfo }}
          />
        )}

        <h2 className={styles.formHeading}>Send us a message</h2>

        <div className={styles.formWrap}>
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
