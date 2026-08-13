import type { MouseEvent } from 'react';
import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import Layout from '@/components/Layout';
import blocks from '@/wp-blocks';
import * as blockFragments from '@/wp-blocks/fragments';

interface LearnAboutCannabinoidsData {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    editorBlocks: any[];
  } | null;
}

const PageLearnAboutCannabinoids: FaustTemplate<LearnAboutCannabinoidsData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const hasBlocks = Array.isArray(page.editorBlocks) && page.editorBlocks.length > 0;

  const handleNavClick = (event: MouseEvent<HTMLUListElement>) => {
    const anchor = (event.target as HTMLElement).closest('a[href^="#"]');
    if (!anchor) return;
    const id = anchor.getAttribute('href')?.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
  };

  return (
    <Layout title={page.title} seo={page.seo}>
      <div className="learn-cannabinoids-page">
        <div className="learn-cannabinoids-page__intro">
          <h2 className="learn-cannabinoids-page__heading">Learn About Cannabinoids</h2>
        </div>
        <nav className="learn-cannabinoids-page__nav" aria-label="Choose a cannabinoid">
          <h2 className="learn-cannabinoids-page__nav-heading">Choose a Cannabinoid to learn more</h2>
          <ul className="learn-cannabinoids-page__nav-list" onClick={handleNavClick}>
            <li>
              <a href="#learn-about-delta-8-thc">
                <img src="/D8_whitebox.webp" alt="Delta-8-THC" />
              </a>
            </li>
            <li>
              <a href="#learn-about-delta-9-thc">
                <img src="/D9_whitebox.webp" alt="Delta-9-THC" />
              </a>
            </li>
            <li>
              <a href="#learn-about-delta-10-thc">
                <img src="/D10_whitebox.webp" alt="Delta-10-THC" />
              </a>
            </li>
            <li>
              <a href="#learn-about-delta-11-thc">
                <img src="/D11_whitebox.webp" alt="Delta-11-THC" />
              </a>
            </li>
            <li>
              <a href="#learn-about-thcv">
                <img src="/THCv_whitebox.webp" alt="THCv" />
              </a>
            </li>
            <li>
              <a href="#learn-about-thcp">
                <img src="/THCp_whitebox.webp" alt="THCp" />
              </a>
            </li>
            <li>
              <a href="#learn-about-thcb">
                <img src="/THCb_whitebox.webp" alt="THCb" />
              </a>
            </li>
            <li>
              <a href="#learn-about-thcm">
                <img src="/THCm_whitebox.webp" alt="THCm" />
              </a>
            </li>
            <li>
              <a href="#learn-about-thch">
                <img src="/THCh_whitebox.webp" alt="THCh" />
              </a>
            </li>
            <li>
              <a href="#learn-about-cbg">
                <img src="/CBG_whitebox.webp" alt="CBG" />
              </a>
            </li>
            <li>
              <a href="#learn-about-cbn">
                <img src="/CBN_whitebox.webp" alt="CBN" />
              </a>
            </li>
            <li>
              <a href="#learn-about-cbd">
                <img src="/CBD_whitebox.webp" alt="CBD" />
              </a>
            </li>
            <li>
              <a href="#learn-about-h4cbd">
                <img src="/H4CBD_whitebox.webp" alt="H4CBD" />
              </a>
            </li>
          </ul>
        </nav>
        {hasBlocks ? (
          <WordPressBlocksViewer blocks={page.editorBlocks} />
        ) : (
          <h1>{page.title}</h1>
        )}
      </div>
    </Layout>
  );
};

PageLearnAboutCannabinoids.query = gql`
  ${blockFragments.AcfCannabinoidCallout.entry}
  ${blockFragments.CoreParagraph.entry}
  query GetLearnAboutCannabinoids($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
      title
      seo {
        title
        metaDesc
      }
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blockFragments.AcfCannabinoidCallout.key}
        ...${blockFragments.CoreParagraph.key}
      }
    }
  }
`;

PageLearnAboutCannabinoids.variables = (seedNode) => ({ id: seedNode.databaseId });

export default PageLearnAboutCannabinoids;
