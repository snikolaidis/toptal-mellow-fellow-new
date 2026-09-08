import { useEffect, useReducer, useRef, useState } from 'react';
import Image from 'next/image';
import { Quiz, QuizQuestion as QuizQuestionType, QuizSelection } from '@/types/quiz';
import { Product } from '@/types/woocommerce';
import { klaviyoIdentify, klaviyoTrack } from '@/lib/klaviyo';
import { trackQuizStart, trackQuizAnswer, trackQuizComplete } from '@/lib/quizAnalytics';
import QuizProgress from './QuizProgress';
import QuizQuestion from './QuizQuestion';
import QuizEmailCapture from './QuizEmailCapture';
import QuizResults from './QuizResults';

interface QuizFlowProps {
  quiz: Quiz;
}

type Phase = 'intro' | 'question' | 'capture' | 'results';

interface State {
  phase: Phase;
  step: number;
  answers: Record<number, number[]>;
}

type Action =
  | { type: 'START' }
  | { type: 'SET_ANSWER'; step: number; answers: number[] }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'CAPTURE' }
  | { type: 'FINISH' }
  | { type: 'RESTORE'; answers: Record<number, number[]>; step: number }
  | { type: 'RESTART' };

const INITIAL_STATE: State = { phase: 'intro', step: 0, answers: {} };

// Branching seam: future per-answer jump rules plug in here. Default is linear.
function getNextStep(current: number): number {
  return current + 1;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return { phase: 'question', step: 0, answers: {} };
    case 'SET_ANSWER':
      return { ...state, answers: { ...state.answers, [action.step]: action.answers } };
    case 'NEXT':
      return { ...state, step: getNextStep(state.step) };
    case 'BACK':
      return { ...state, step: Math.max(0, state.step - 1) };
    case 'CAPTURE':
      return { ...state, phase: 'capture' };
    case 'FINISH':
      return { ...state, phase: 'results' };
    case 'RESTORE':
      return { phase: 'results', step: action.step, answers: action.answers };
    case 'RESTART':
      return INITIAL_STATE;
    default:
      return state;
  }
}

// Shareable URL encoding: `0.1_1.0-2` = Q0 answer 1, Q1 answers 0 and 2.
function encodeSelections(answers: Record<number, number[]>): string {
  return Object.keys(answers)
    .map(Number)
    .filter((q) => (answers[q]?.length ?? 0) > 0)
    .sort((a, b) => a - b)
    .map((q) => `${q}.${answers[q].join('-')}`)
    .join('_');
}

function decodeSelections(
  raw: string,
  questionCount: number
): Record<number, number[]> | null {
  if (!raw) return null;
  const answers: Record<number, number[]> = {};
  for (const group of raw.split('_')) {
    const [qStr, aStr] = group.split('.');
    const q = Number(qStr);
    if (!Number.isInteger(q) || q < 0 || q >= questionCount) return null;
    const a = (aStr ?? '')
      .split('-')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (a.length === 0) return null;
    answers[q] = a;
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

function toSelections(
  questions: QuizQuestionType[],
  answers: Record<number, number[]>
): QuizSelection[] {
  return questions
    .map((_, q) => ({ q, a: answers[q] ?? [] }))
    .filter((s) => s.a.length > 0);
}

function groupAnswerLabels(
  questions: QuizQuestionType[],
  answers: Record<number, number[]>
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  questions.forEach((question, qi) => {
    const selected = answers[qi];
    if (!selected || selected.length === 0) return;
    const labels = selected
      .map((ai) => question.answers?.[ai]?.label)
      .filter((label): label is string => !!label);
    const key = question.questionText || `Question ${qi + 1}`;
    grouped[key] = labels;
  });
  return grouped;
}

function deriveFirstName(email: string): string {
  const local = (email.split('@')[0] || '').trim();
  const first = local.split(/[._\-+]/)[0] || local;
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export default function QuizFlow({ quiz }: QuizFlowProps) {
  const fields = quiz.quizFields;
  const questions = fields?.questions ?? [];
  const introHeading = fields?.introHeading;
  const introSubcopy = fields?.introSubcopy;
  const introImageUrl = fields?.introImage?.node?.sourceUrl;
  const hasIntro = !!(introHeading || introSubcopy || introImageUrl);

  const initialState: State = hasIntro
    ? INITIAL_STATE
    : { phase: 'question', step: 0, answers: {} };
  const [state, dispatch] = useReducer(reducer, initialState);
  const [topMatches, setTopMatches] = useState<Product[]>([]);
  const [alsoLike, setAlsoLike] = useState<Product[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState(false);
  const [name, setName] = useState('');
  const restoredRef = useRef(false);
  const startedRef = useRef(false);

  const question = questions[state.step];
  const selected = state.answers[state.step] ?? [];
  const rawSelectionType = question?.selectionType;
  const isMulti = (Array.isArray(rawSelectionType) ? rawSelectionType[0] : rawSelectionType) === 'multi';
  const isLast = state.step === questions.length - 1;

  const fetchRecommendations = async (selections: QuizSelection[]) => {
    setResultsLoading(true);
    setResultsError(false);
    try {
      const res = await fetch('/api/quiz/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizSlug: quiz.slug, selections }),
      });
      const data = await res.json();
      const top: Product[] = Array.isArray(data?.topMatches)
        ? data.topMatches
        : Array.isArray(data?.products)
          ? data.products
          : [];
      setTopMatches(top);
      setAlsoLike(Array.isArray(data?.alsoLike) ? data.alsoLike : []);
    } catch {
      setResultsError(true);
      setTopMatches([]);
      setAlsoLike([]);
    } finally {
      setResultsLoading(false);
    }
  };

  const writeShareUrl = (answers: Record<number, number[]>) => {
    if (typeof window === 'undefined') return;
    try {
      const encoded = encodeSelections(answers);
      const url = new URL(window.location.href);
      if (encoded) url.searchParams.set('s', encoded);
      else url.searchParams.delete('s');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  // Restore straight to results from a shared link. Runs once, after hydration.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === 'undefined' || questions.length === 0) return;

    const raw = new URLSearchParams(window.location.search).get('s');
    if (!raw) return;

    const answers = decodeSelections(raw, questions.length);
    if (!answers) return;

    const selections = toSelections(questions, answers);
    if (selections.length === 0) return;

    dispatch({ type: 'RESTORE', answers, step: questions.length - 1 });
    fetchRecommendations(selections);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire the start event when the quiz opens straight into the questions (no intro screen).
  useEffect(() => {
    if (startedRef.current || hasIntro || questions.length === 0) return;
    startedRef.current = true;
    trackQuizStart(quiz.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (allAnswers: Record<number, number[]>, email: string) => {
    const selections = toSelections(questions, allAnswers);
    const grouped = groupAnswerLabels(questions, allAnswers);

    const firstName = email ? deriveFirstName(email) : '';
    setName(firstName);

    dispatch({ type: 'FINISH' });

    if (email) {
      klaviyoIdentify({ $email: email });
    }
    klaviyoTrack('Completed Quiz (MFF-WOO)', { quiz: quiz.slug, answers: grouped });
    trackQuizComplete(quiz.slug, grouped);

    writeShareUrl(allAnswers);
    fetchRecommendations(selections);
  };

  const advance = (allAnswers: Record<number, number[]>) => {
    if (question) {
      const labels = (allAnswers[state.step] ?? [])
        .map((ai) => question.answers?.[ai]?.label)
        .filter((label): label is string => !!label);
      trackQuizAnswer(quiz.slug, question.questionText || `Question ${state.step + 1}`, labels);
    }

    if (isLast) {
      dispatch({ type: 'CAPTURE' });
    } else {
      dispatch({ type: 'NEXT' });
    }
  };

  const handleSelect = (answerIndex: number) => {
    if (!question) return;

    if (isMulti) {
      const updated = selected.includes(answerIndex)
        ? selected.filter((i) => i !== answerIndex)
        : [...selected, answerIndex];
      dispatch({ type: 'SET_ANSWER', step: state.step, answers: updated });
    } else {
      const updated = [answerIndex];
      dispatch({ type: 'SET_ANSWER', step: state.step, answers: updated });
      advance({ ...state.answers, [state.step]: updated });
    }
  };

  const handleNext = () => {
    advance(state.answers);
  };

  const handleRestart = () => {
    dispatch({ type: 'RESTART' });
    setTopMatches([]);
    setAlsoLike([]);
    setName('');
    setResultsError(false);
    setResultsLoading(false);
    writeShareUrl({});
  };

  if (state.phase === 'intro') {
    return (
      <section className="quiz-flow quiz-flow--intro">
        <div className="quiz-flow__intro">
          {introImageUrl && (
            <div className="quiz-flow__intro-media">
              <Image
                src={introImageUrl}
                alt={fields?.introImage?.node?.altText || quiz.title || ''}
                fill
                sizes="(max-width: 640px) 90vw, 360px"
                className="quiz-flow__intro-image"
                priority
              />
            </div>
          )}
          {introHeading && (
            <h1 className="quiz-flow__intro-heading">{introHeading}</h1>
          )}
          {introSubcopy && (
            <p className="quiz-flow__intro-subcopy">{introSubcopy}</p>
          )}
          <button
            type="button"
            className="btn-primary quiz-flow__start"
            onClick={() => {
              trackQuizStart(quiz.slug);
              dispatch({ type: 'START' });
            }}
            disabled={questions.length === 0}
          >
            Start Quiz
          </button>
        </div>
      </section>
    );
  }

  if (state.phase === 'capture') {
    return (
      <section className="quiz-flow quiz-flow--capture">
        <QuizEmailCapture
          onSubmit={(email) => finish(state.answers, email)}
          onSkip={() => finish(state.answers, '')}
        />
      </section>
    );
  }

  if (state.phase === 'results') {
    return (
      <section className="quiz-flow quiz-flow--results">
        <QuizResults
          heading={fields?.resultsHeading}
          name={name}
          topMatches={topMatches}
          alsoLike={alsoLike}
          loading={resultsLoading}
          error={resultsError}
          onRetake={handleRestart}
        />
      </section>
    );
  }

  return (
    <section className="quiz-flow quiz-flow--question">
      <QuizProgress current={state.step + 1} total={questions.length} />

      {question && (
        <QuizQuestion question={question} selected={selected} onSelect={handleSelect} />
      )}

      <div className="quiz-flow__nav">
        <button
          type="button"
          className="quiz-flow__back"
          onClick={() => dispatch({ type: 'BACK' })}
          disabled={state.step === 0}
        >
          Back
        </button>

        {isMulti && (
          <button
            type="button"
            className="btn-primary quiz-flow__next"
            onClick={handleNext}
            disabled={selected.length === 0}
          >
            {isLast ? 'See Results' : 'Next'}
          </button>
        )}
      </div>
    </section>
  );
}
