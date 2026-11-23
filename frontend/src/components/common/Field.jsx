import { forwardRef, useId } from "react";
import { cn } from "../../lib/utils";

const control =
  "w-full rounded-[10px] border border-hairline bg-ink-900/90 px-3.5 text-[13.5px] text-slate-100 placeholder:text-slate-500 " +
  "transition-[border-color,background-color,box-shadow] focus:border-aurora-400/60 focus:bg-ink-900 " +
  "focus:shadow-[0_0_0_3px_rgba(157,183,150,0.08)] disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "py-3 leading-relaxed", className)} {...props} />;
});

const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-11 appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, htmlFor, hint, error, required, className, children }) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="flex items-center gap-1 text-[12.5px] font-medium text-slate-300">
          {label}
          {required ? <span className="text-aurora-400">*</span> : null}
        </label>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
        required,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-verypoor">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const LabeledInput = forwardRef(function LabeledInput(
  { label, hint, error, required, className, id, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      {(fieldProps) => <Input ref={ref} {...fieldProps} {...props} />}
    </Field>
  );
});

export const LabeledSelect = forwardRef(function LabeledSelect(
  { label, hint, error, required, className, id, children, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      {(fieldProps) => (
        <Select ref={ref} {...fieldProps} {...props}>
          {children}
        </Select>
      )}
    </Field>
  );
});
