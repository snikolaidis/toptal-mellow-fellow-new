export interface CollectionCard {
  id: number;
  smallText: string;
  bigText: string;
  link: string;
  image: string;
}

export interface EditorBlock {
  __typename?: string;
  renderedHtml: string | null;
}

export interface ContentPageData {
  title: string;
  slug: string;
  editorBlocks?: EditorBlock[];
  seo?: {
    title?: string;
    metaDesc?: string;
  };
}