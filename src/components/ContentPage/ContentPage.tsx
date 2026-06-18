import type { ContentPageData } from '@/types/mellow-fellow';
import styles from './ContentPage.module.css';

interface ContentPageProps {
  page: ContentPageData;
}

export default function ContentPage({ page }: ContentPageProps) {
  return (
    <div className={styles.prose}>
      {page.editorBlocks?.length ? (
        page.editorBlocks.map((block, index) => (
          block.renderedHtml ? (
            <div
              key={index}
              dangerouslySetInnerHTML={{ __html: block.renderedHtml }}
            />
          ) : null
        ))
      ) : (
        <h1>{page.title}</h1>
      )}
    </div>
  );
}