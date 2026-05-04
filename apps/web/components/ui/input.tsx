"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-2 block text-sm font-medium text-[color:var(--text)]"
          >
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={cn(
            "w-full rounded-lg border bg-[color:var(--bg)] px-4 py-2.5 text-sm text-[color:var(--text)] placeholder:text-[color:var(--text-subtle)] transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
            error
              ? "border-rose-500/60 focus-visible:border-rose-500"
              : "border-[color:var(--border-strong)] focus-visible:border-[color:var(--accent)]",
            className,
          )}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${id}-error`}
            className="mt-1.5 text-xs text-rose-500 dark:text-rose-400"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
