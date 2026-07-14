import type { ComponentType } from 'react';
import type { ContentPageData } from '@/types/mellow-fellow';
import blocks from '@/wp-blocks';
import styles from './ContentPage.module.css';

interface ContentPageProps {
  page: ContentPageData;
}

export default function ContentPage({ page }: ContentPageProps) {
  const registered = blocks as unknown as Record<string, ComponentType<Record<string, unknown>>>;

  return (
    <div className={styles.prose}>
      {page.editorBlocks?.length ? (
        page.editorBlocks.map((block, index) => {
          const typename = (block as { __typename?: string }).__typename;
          const Component = typename?.startsWith('Acf') ? registered[typename] : undefined;

          if (Component) {
            return <Component key={index} {...(block as unknown as Record<string, unknown>)} />;
          }

          return block.renderedHtml ? (
            <div
              key={index}
              dangerouslySetInnerHTML={{ __html: block.renderedHtml }}
            />
          ) : null;
        })
      ) : (
        <h1>{page.title}</h1>
      )}
    </div>
  );
}
