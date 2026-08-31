import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { EmailSignInForm } from './email-sign-in-form';

const mockSignIn = jest.fn();
let mockIsPending = false;
let mockError: string | null = null;

jest.mock('../model/use-email-sign-in', () => ({
  useEmailSignIn: () => ({
    signIn: mockSignIn,
    isPending: mockIsPending,
    error: mockError,
  }),
}));

const EmailLabel = '이메일';
const PasswordLabel = '비밀번호';
const SubmitTitle = '로그인';
const InvalidEmailMessage = '올바른 이메일 주소를 입력해 주세요.';
const MissingPasswordMessage = '비밀번호를 입력해 주세요.';

/**
 * Schema validation runs asynchronously, so every interaction is driven inside
 * `await act` — resolving after the test would otherwise leak an update into the
 * next one and leave it rendering nothing.
 */
async function type(label: string, value: string): Promise<void> {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
}

async function press(name: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

/**
 * Covers the form's wiring rather than its validation rules — those are
 * `email-sign-in-schema.test.ts`. What matters here is that typing reaches the
 * form state, that a schema error reaches the input it belongs to, and that a
 * valid submit hands the action hook the typed values.
 */
describe('EmailSignInForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
    mockError = null;
  });

  it('renders a schema error under the offending field and does not sign in', async () => {
    await render(<EmailSignInForm />);

    await press(SubmitTitle);

    expect(screen.getByText(InvalidEmailMessage)).toBeTruthy();
    expect(screen.getByText(MissingPasswordMessage)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('hands the typed values to the action hook on a valid submit', async () => {
    await render(<EmailSignInForm />);

    await type(EmailLabel, 'user@example.com');
    await type(PasswordLabel, 'secret123');
    await press(SubmitTitle);

    expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'secret123');
  });

  it('clears a field error once the value is corrected', async () => {
    await render(<EmailSignInForm />);

    await press(SubmitTitle);
    expect(screen.getByText(InvalidEmailMessage)).toBeTruthy();

    await type(EmailLabel, 'user@example.com');

    expect(screen.queryByText(InvalidEmailMessage)).toBeNull();
  });

  it('disables the inputs and the button while the sign-in is pending', async () => {
    mockIsPending = true;
    await render(<EmailSignInForm />);

    expect(screen.getByLabelText(EmailLabel).props.editable).toBe(false);
    expect(
      screen.getByRole('button', { name: '로그인 중…' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('renders the action hook error near the button', async () => {
    mockError = '이메일 또는 비밀번호를 확인해 주세요.';
    await render(<EmailSignInForm />);

    expect(screen.getByText(mockError)).toBeTruthy();
  });
});
