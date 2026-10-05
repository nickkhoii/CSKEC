'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

/** Accessible form field wrappers. Each renders label + control + error. */

const controlClasses =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted ' +
  'focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-ink-muted';

const Field = ({ label, htmlFor, error, hint, required, children, className }) => (
  <div className={cn('space-y-1.5', className)}>
    {label ? (
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </label>
    ) : null}
    {children}
    {hint && !error ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    {error ? (
      <p className="text-[11px] font-medium text-rose-600" role="alert">
        {error}
      </p>
    ) : null}
  </div>
);

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(controlClasses, error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, error, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={error ? 'true' : undefined}
      className={cn(controlClasses, 'resize-y', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100', className)}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, error, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(controlClasses, 'pr-8', error && 'border-rose-400', className)}
      {...props}
    >
      {children}
    </select>
  );
});

export function InputField({ label, error, hint, required, ...props }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Input id={id} error={error} required={required} {...props} />
    </Field>
  );
}

export function TextareaField({ label, error, hint, required, ...props }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Textarea id={id} error={error} required={required} {...props} />
    </Field>
  );
}

export function SelectField({ label, error, hint, required, options = [], placeholder, ...props }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Select id={id} error={error} required={required} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckboxField({ label, description, name, defaultChecked, value, className, ...props }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm',
        'hover:border-navy-300 has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value ?? 'on'}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
        {...props}
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-[11px] text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export { Field as FormField };