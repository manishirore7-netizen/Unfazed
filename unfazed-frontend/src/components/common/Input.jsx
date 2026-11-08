import { useState } from "react";

export default function Input({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  helperText,
  required = false,
  autoComplete,
  maxLength,
  disabled = false,
  className = "",
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id || name}
          className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
        >
          {label} {required && <span className="text-[#A23333]">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          id={id || name}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          maxLength={maxLength}
          disabled={disabled}
          className={`w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white ${
            error
              ? "border-[#D65454] focus:border-[#D65454] focus:ring-2 focus:ring-[#D65454]/15"
              : "border-[#DCD4C7] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
          } ${isPassword ? "pr-12" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex="-1"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-[#5F6E65] hover:text-[#1B3B2B] focus:outline-none cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {error ? (
        <p className="text-xs text-[#A23333] mt-0.5">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-[#6F7D74] mt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
}
