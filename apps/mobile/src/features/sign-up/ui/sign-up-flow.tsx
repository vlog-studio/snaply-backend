import { useSignUpFlow } from '../model/use-sign-up-flow';
import { EmailSentNotice } from './email-sent-notice';
import { SignUpForm } from './sign-up-form';

/**
 * The complete sign-up feature UI: the account-creation form, then a
 * check-your-email notice once the account is created. Confirmation completes
 * out of band when the user taps the emailed link (deep link → auto sign-in).
 */
export function SignUpFlow() {
  const { step, email, isPending, error, signUp, resend } = useSignUpFlow();

  if (step === 'sent') {
    return <EmailSentNotice email={email} onResend={resend} isPending={isPending} error={error} />;
  }

  return <SignUpForm onSubmit={signUp} isPending={isPending} error={error} />;
}
