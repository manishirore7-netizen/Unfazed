export default function AuthLayout({
  children,
  title,
  subtitle,
}) {
  return (
    <div className="min-h-screen w-full bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans selection:bg-[#234E39]/15 selection:text-[#1B3B2B]">
      {/* Header / Brand Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Unfazed emblem: calming sage/forest geometric leaf mark */}
          <div className="w-9 h-9 rounded-xl bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2] shadow-sm">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-[#1B3B2B]">
              Unfazed
            </span>
            <span className="text-[10px] tracking-wider uppercase text-[#6E7B73] font-medium -mt-1">
              Therapist OS
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Brand & Therapist Values (Desktop) */}
          <div className="hidden lg:flex lg:col-span-5 flex-col gap-6 pr-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBF3ED] text-[#245437] text-xs font-medium w-fit">
              <span>Peaceful Practice Management</span>
            </div>

            <h1 className="text-3xl font-serif text-[#152B20] leading-tight tracking-tight">
              A serene, focused space for your clinical practice.
            </h1>

            <p className="text-sm leading-relaxed text-[#4F5D54]">
              Manage notes, client appointments, and sessions without the overwhelm of bloated software. Built with care for independent therapists.
            </p>

            <div className="pt-4 border-t border-[#E8DFC0]/40 flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs text-[#3C4A42]">
                <div className="w-5 h-5 rounded-full bg-[#1B3B2B]/10 flex items-center justify-center text-[#1B3B2B]">
                  ✓
                </div>
                <span>Zero administrative clutter</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#3C4A42]">
                <div className="w-5 h-5 rounded-full bg-[#1B3B2B]/10 flex items-center justify-center text-[#1B3B2B]">
                  ✓
                </div>
                <span>Private therapist profiles & custom booking slug</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#3C4A42]">
                <div className="w-5 h-5 rounded-full bg-[#1B3B2B]/10 flex items-center justify-center text-[#1B3B2B]">
                  ✓
                </div>
                <span>Encrypted credentials & secure JWT sessions</span>
              </div>
            </div>
          </div>

          {/* Right Column: Active Auth Form Card */}
          <div className="w-full lg:col-span-7 flex justify-center">
            <div className="w-full max-w-md bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-9 shadow-[0_8px_30px_rgb(27,59,43,0.04)]">
              {(title || subtitle) && (
                <div className="mb-6">
                  {title && (
                    <h2 className="text-2xl font-serif font-medium text-[#14261D] tracking-tight">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-xs sm:text-sm text-[#5B6A61] mt-1.5 leading-normal">
                      {subtitle}
                    </p>
                  )}
                </div>
              )}

              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
