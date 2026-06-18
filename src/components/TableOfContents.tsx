import styles from '@/styles/pages/blogs.module.css';

interface Heading {
  id: string;
  text: string;
}

interface TableOfContentsProps {
  headings: Heading[];
}

function handleScroll(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function TableOfContents({ headings }: TableOfContentsProps) {
  if (!headings.length) return null;

  return (
    <nav className={styles.toc}>
      <p className={styles.tocTitle}>Table of contents</p>
      <ul className={styles.tocList}>
        {headings.map((heading) => (
          <li key={heading.id} className={styles.tocItem}>
            <a
              href={`#${heading.id}`}
              className={styles.tocLink}
              onClick={(e) => handleScroll(e, heading.id)}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
