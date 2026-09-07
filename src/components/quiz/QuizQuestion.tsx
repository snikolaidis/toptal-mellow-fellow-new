import Image from 'next/image';
import { QuizQuestion as QuizQuestionType } from '@/types/quiz';

interface QuizQuestionProps {
  question: QuizQuestionType;
  selected: number[];
  onSelect: (answerIndex: number) => void;
}

function Check() {
  return (
    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 5.5L5 9.5L13 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function QuizQuestion({ question, selected, onSelect }: QuizQuestionProps) {
  const answers = question.answers ?? [];
  const rawSelectionType = question.selectionType;
  const isMulti = (Array.isArray(rawSelectionType) ? rawSelectionType[0] : rawSelectionType) === 'multi';
  const hasImages = answers.some((answer) => !!answer.image?.node?.sourceUrl);

  return (
    <div className="quiz-question">
      {question.questionText && (
        <h2 className="quiz-question__title">{question.questionText}</h2>
      )}
      {isMulti && (
        <p className="quiz-question__hint">Select all that apply</p>
      )}

      <div className={`quiz-question__options ${hasImages ? 'quiz-question__options--cards' : 'quiz-question__options--list'}`}>
        {answers.map((answer, index) => {
          const isSelected = selected.includes(index);
          const imageUrl = answer.image?.node?.sourceUrl;
          return (
            <button
              key={index}
              type="button"
              className={`quiz-question__option ${imageUrl ? 'quiz-question__option--card' : 'quiz-question__option--text'} ${isSelected ? 'quiz-question__option--selected' : ''}`}
              onClick={() => onSelect(index)}
              aria-pressed={isSelected}
            >
              {imageUrl && (
                <span className="quiz-question__media">
                  <Image
                    src={imageUrl}
                    alt={answer.image?.node?.altText || answer.label || ''}
                    fill
                    sizes="(max-width: 640px) 45vw, 220px"
                    className="quiz-question__image"
                  />
                  {isSelected && (
                    <span className="quiz-question__check" aria-hidden="true">
                      <Check />
                    </span>
                  )}
                </span>
              )}
              {answer.label && (
                <span className="quiz-question__label">{answer.label}</span>
              )}
              {!imageUrl && (
                <span className={`quiz-question__radio ${isSelected ? 'quiz-question__radio--on' : ''}`} aria-hidden="true">
                  {isSelected && <Check />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
