interface QuizProgressProps {
  current: number;
  total: number;
}

export default function QuizProgress({ current, total }: QuizProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="quiz-progress">
      <p className="quiz-progress__label">
        Question {current} of {total}
      </p>
      <div
        className="quiz-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <span className="quiz-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
