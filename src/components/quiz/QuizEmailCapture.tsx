import { FormEvent, useState } from 'react';

interface QuizEmailCaptureProps {
  onSubmit: (email: string) => void;
  onSkip: () => void;
}

// Deliberately loose: good enough to block obvious typos without rejecting valid
// addresses. The real validation happens server-side in Klaviyo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function QuizEmailCapture({ onSubmit, onSkip }: QuizEmailCaptureProps) {
  const [email, setEmail] = useState('');
  const trimmed = email.trim();
  const isValid = EMAIL_RE.test(trimmed);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit(trimmed);
  };

  return (
    <div className="quiz-capture">
      <h2 className="quiz-capture__heading">Where should we send your matches?</h2>
      <p className="quiz-capture__subcopy">
        Drop your email and we will keep your results handy, plus send a little something for later.
      </p>

      <form className="quiz-capture__form" onSubmit={handleSubmit} noValidate>
        <label className="quiz-capture__label" htmlFor="quiz-capture-email">
          Email address
        </label>
        <input
          id="quiz-capture-email"
          className="quiz-capture__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary quiz-capture__submit" disabled={!isValid}>
          Get my results
        </button>
      </form>

      <button type="button" className="quiz-capture__skip" onClick={onSkip}>
        No thanks, just show me my results
      </button>
    </div>
  );
}
