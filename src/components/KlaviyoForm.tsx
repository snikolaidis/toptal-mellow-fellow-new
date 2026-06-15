import { useEffect, useState } from 'react';

interface KlaviyoFormProps {
  formId: string;
}

/**
 * Renders a Klaviyo embedded form. The div is only mounted client-side so klaviyo.js
 * injects the form after React hydration, avoiding a hydration mismatch.
 */
export default function KlaviyoForm({ formId }: KlaviyoFormProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
  }

  return <div className={`klaviyo-form-${formId}`} />;
}
