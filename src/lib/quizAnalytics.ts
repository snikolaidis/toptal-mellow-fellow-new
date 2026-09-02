import { klaviyoTrack } from '@/lib/klaviyo';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function gtagEvent(event: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag('event', event, params);
  }
}

export function trackQuizStart(quizSlug: string): void {
  const props = { quiz: quizSlug };
  gtagEvent('quiz_start', props);
  klaviyoTrack('quiz_start', props);
}

export function trackQuizAnswer(
  quizSlug: string,
  question: string,
  answerLabels: string[]
): void {
  const props = { quiz: quizSlug, question, answers: answerLabels };
  gtagEvent('quiz_answer', props);
  klaviyoTrack('quiz_answer', props);
}

export function trackQuizComplete(
  quizSlug: string,
  answersByQuestion: Record<string, string[]>
): void {
  const props = { quiz: quizSlug, answers: answersByQuestion };
  gtagEvent('quiz_complete', props);
  klaviyoTrack('quiz_complete', props);
}
