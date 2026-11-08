export default function Alert({
  type = "error",
  message,
  onClose,
  className = "",
}) {
  if (!message) return null;

  const styles = {
    error: {
      container: "bg-[#FDF4F4] border-[#F1C8C8] text-[#8C2828]",
      icon: (
        <svg
          className="w-4 h-4 text-[#8C2828] shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
    },
    success: {
      container: "bg-[#EFF7F2] border-[#CDE5D5] text-[#1E5733]",
      icon: (
        <svg
          className="w-4 h-4 text-[#1E5733] shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    info: {
      container: "bg-[#F2F6F4] border-[#D5E1DA] text-[#294B37]",
      icon: (
        <svg
          className="w-4 h-4 text-[#294B37] shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  };

  const current = styles[type] || styles.error;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm leading-snug ${current.container} ${className}`}
    >
      {current.icon}
      <div className="flex-1 text-xs sm:text-sm font-normal">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-current opacity-60 hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
          aria-label="Dismiss alert"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
