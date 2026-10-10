import React from "react";

interface FormFieldProps {
  id: string;
  label: string;
  type?: "text" | "email" | "tel" | "password";
  as?: "input" | "textarea";
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  placeholder: string;
  required?: boolean;
  readOnly?: boolean;
}

const FormField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  FormFieldProps
>(
  (
    {
      id,
      label,
      type = "text",
      as = "input",
      value,
      onChange,
      placeholder,
      required = false,
      readOnly = false,
    },
    ref,
  ) => {
    const commonProps = {
      id,
      name: id,
      value,
      onChange,
      placeholder,
      required,
      readOnly,
      className:
        "mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-800 dark:text-slate-200 shadow-sm dark:shadow-slate-900/50 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:border-slate-200 dark:disabled:border-slate-700 disabled:shadow-none invalid:border-pink-500 invalid:text-pink-600 focus:invalid:border-pink-500 focus:invalid:ring-pink-500 read-only:bg-slate-100 dark:read-only:bg-slate-700/50 read-only:cursor-not-allowed",
    };

    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          {label}
        </label>
        {as === "textarea" ? (
          <textarea
            {...commonProps}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            rows={4}
          />
        ) : (
          <input
            {...commonProps}
            type={type}
            ref={ref as React.Ref<HTMLInputElement>}
          />
        )}
      </div>
    );
  },
);

FormField.displayName = "FormField";

export default FormField;
