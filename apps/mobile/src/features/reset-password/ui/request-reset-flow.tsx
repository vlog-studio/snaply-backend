import { useRequestReset } from '../model/use-request-reset';
import { RequestResetForm } from './request-reset-form';
import { ResetEmailSentNotice } from './reset-email-sent-notice';

/**
 * Step 1 UI of password reset: enter the email to receive a recovery link, then
 * a check-your-email notice. The actual reset continues on the update-password
 * screen once the deep link lands.
 */
export function RequestResetFlow() {
  const { sent, email, isPending, error, requestReset, resend } = useRequestReset();

  if (sent) {
    return (
      <ResetEmailSentNotice email={email} onResend={resend} isPending={isPending} error={error} />
    );
  }

  return <RequestResetForm onSubmit={requestReset} isPending={isPending} error={error} />;
}
