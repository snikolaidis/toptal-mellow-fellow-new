import { fragments } from './QuizBlock.fragments';
import QuizFlow from '@/components/quiz/QuizFlow';
import { decodeEntities } from '@/lib/decodeEntities';
import type { Quiz } from '@/types/quiz';

interface QuizBlockProps {
  quizBlock?: {
    quiz?: { nodes?: Quiz[] | null } | null;
  } | null;
}

function decodeQuiz(raw: Quiz): Quiz {
  const fields = raw.quizFields;
  if (!fields) {
    return { ...raw, title: decodeEntities(raw.title) };
  }
  return {
    ...raw,
    title: decodeEntities(raw.title),
    quizFields: {
      ...fields,
      introHeading: decodeEntities(fields.introHeading),
      introSubcopy: decodeEntities(fields.introSubcopy),
      resultsHeading: decodeEntities(fields.resultsHeading),
      questions: (fields.questions ?? []).map((question) => ({
        ...question,
        questionText: decodeEntities(question.questionText),
        answers: (question.answers ?? []).map((answer) => ({
          ...answer,
          label: decodeEntities(answer.label),
        })),
      })),
    },
  };
}

export default function QuizBlock(props: QuizBlockProps) {
  const node = props.quizBlock?.quiz?.nodes?.[0];
  if (!node?.quizFields) {
    return null;
  }

  return (
    <section className="quiz-block">
      <QuizFlow quiz={decodeQuiz(node)} />
    </section>
  );
}

QuizBlock.displayName = 'AcfQuiz';

QuizBlock.fragments = fragments;
