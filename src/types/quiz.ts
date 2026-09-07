import { AcfImageField } from '@/types/woocommerce';

export interface QuizAnswer {
  label?: string | null;
  image?: AcfImageField | null;
}

export interface QuizQuestion {
  questionText?: string | null;
  selectionType?: 'single' | 'multi' | string[] | null;
  answers?: QuizAnswer[] | null;
}

export interface QuizFields {
  introHeading?: string | null;
  introSubcopy?: string | null;
  introImage?: AcfImageField | null;
  resultsHeading?: string | null;
  resultCount?: number | null;
  questions?: QuizQuestion[] | null;
}

export interface Quiz {
  databaseId: number;
  title: string;
  slug: string;
  quizFields?: QuizFields | null;
}

// The client identifies a choice by the question and answer indices as they
// appear in quizFields.questions; the recommendation endpoint reads the same
// positions server-side to resolve the mapped taxonomy terms.
export interface QuizSelection {
  q: number;
  a: number[];
}
