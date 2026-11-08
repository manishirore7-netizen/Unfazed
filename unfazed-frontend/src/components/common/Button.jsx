export default function Button({
  children,
  type = "button",
  variant = "primary",
  isLoading = false,
  disabled = false,
  onClick,
  className = "",
  ...props
}) {
  const baseStyles =
    "w-full inline-flex items-center justify-center font-medium rounded-xl px-5 py-3 text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  const variants = {
    primary:
      "bg-[#1B3B2B] text-[#FAF7F2] hover:bg-[#234E39] active:bg-[#152F22] focus:ring-[#1B3B2B] shadow-sm",
    secondary:
      "bg-[#F3EFEA] text-[#1B3B2B] hover:bg-[#EAE4DD] active:bg-[#DFD8CF] focus:ring-[#1B3B2B]",
    outline:
      "border border-[#D9D1C5] text-[#242E28] hover:bg-[#FAF7F2] active:bg-[#F3EFEA] focus:ring-[#1B3B2B]",
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <svg
            className="animate-spin h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            ></path>
          </svg>
          <span>Please wait...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
