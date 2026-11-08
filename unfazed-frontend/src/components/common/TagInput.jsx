import { useState } from "react";

export default function TagInput({
  label,
  items = [],
  onChange,
  placeholder = "Type and press Add or Enter...",
  helperText,
  error,
  disabled = false,
  className = "",
}) {
  const [inputValue, setInputValue] = useState("");
  const [duplicateError, setDuplicateError] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Check for duplicate (case-insensitive)
    const isDuplicate = items.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setDuplicateError(`"${trimmed}" has already been added.`);
      return;
    }

    onChange([...items, trimmed]);
    setInputValue("");
    setDuplicateError("");
  };

  const handleRemove = (indexToRemove) => {
    onChange(items.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAdd();
    }
  };

  const activeError = error || duplicateError;

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]">
          {label}
        </label>
      )}

      {/* Input bar with Add button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (duplicateError) setDuplicateError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !inputValue.trim()}
          className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[#EBF3ED] text-[#1E4D32] hover:bg-[#DDECE1] active:bg-[#CEE3D3] transition-colors border border-[#CDE3D5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          Add
        </button>
      </div>

      {activeError && (
        <p className="text-xs text-[#A23333]">{activeError}</p>
      )}

      {/* Tag pills list */}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5] text-xs font-medium animate-fadeIn"
            >
              <span>{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="hover:text-[#A23333] transition-colors p-0.5 rounded-full hover:bg-black/5 cursor-pointer"
                  aria-label={`Remove ${item}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
        </div>
      ) : helperText && !activeError ? (
        <p className="text-xs text-[#6F7D74]">{helperText}</p>
      ) : null}
    </div>
  );
}
