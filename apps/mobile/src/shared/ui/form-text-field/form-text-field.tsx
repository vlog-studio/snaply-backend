import {
  useController,
  type Control,
  type FieldPathByValue,
  type FieldValues,
} from 'react-hook-form';

import { TextField, type TextFieldProps } from '@/shared/ui/text-field';

/**
 * `TextField` bound to a React Hook Form field.
 *
 * The wiring it removes is identical at every call site — read the value, feed
 * `onChange`/`onBlur` back, surface `fieldState.error.message` — so it lives here
 * rather than being repeated once per input across the auth forms. It is the
 * "common adapter" that [State and data placement](../../../../docs/frameworks/state-and-data.md)
 * allows in shared: it knows how a controlled field works and nothing about what
 * is being submitted, which mutation runs, or where the screen goes next.
 *
 * `name` is restricted to the form's string-valued paths, so a field pointing at
 * a non-string value is a type error rather than a value coerced at runtime.
 */
export type FormTextFieldProps<TValues extends FieldValues> = Omit<
  TextFieldProps,
  'value' | 'onChangeText' | 'onBlur' | 'error'
> & {
  control: Control<TValues>;
  name: FieldPathByValue<TValues, string>;
};

export function FormTextField<TValues extends FieldValues>({
  control,
  name,
  ...props
}: FormTextFieldProps<TValues>) {
  const { field, fieldState } = useController({ control, name });
  // `field.ref` is deliberately not forwarded. It exists for form-library focus
  // management (`setFocus`, scroll-to-first-error) that no screen here uses, and
  // reading it during render is what the refs lint rule correctly objects to.
  const { value, onChange, onBlur } = field;

  return (
    <TextField
      {...props}
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      error={fieldState.error?.message}
    />
  );
}
