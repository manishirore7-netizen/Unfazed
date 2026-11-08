import useAuth from "../hooks/useAuth";

export default function DashboardHome() {
  const { therapist, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg
                className="w-4 h-4"
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
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#1B3B2B]">
                Unfazed
              </span>
              <span className="text-[10px] text-[#717E76] block -mt-0.5">
                Practice Workspace
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-xs font-medium block text-[#1B3B2B]">
                {therapist?.name}
              </span>
              <span className="text-[11px] text-[#717E76] block">
                {therapist?.email}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-[#7D3232] hover:text-[#5F2424] bg-[#FDF4F4] hover:bg-[#FAE8E8] border border-[#F2D1D1] px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10 flex flex-col justify-center">
        <div className="bg-white border border-[#E9DFD2] rounded-2xl p-8 sm:p-10 shadow-[0_8px_30px_rgb(27,59,43,0.04)]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBF3ED] text-[#245437] text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2E6B45]"></span>
            <span>Session Active · Authenticated via JWT</span>
          </div>

          <h1 className="text-3xl font-serif text-[#152B20] tracking-tight mb-2">
            Welcome to Unfazed, {therapist?.name}
          </h1>
          <p className="text-sm text-[#4F5D54] leading-relaxed mb-8">
            Your clinical authentication is functioning seamlessly. Future milestones will unlock your appointment schedule, secure client notes, and billing management.
          </p>

          {/* Account Profile Card */}
          <div className="bg-[#FAF8F5] border border-[#EBE3D7] rounded-xl p-6 flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
              Therapist Practice Profile
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#7F8D84] block mb-0.5">Full Name</span>
                <span className="font-medium text-[#1A2820] text-sm">
                  {therapist?.name}
                </span>
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Email Address</span>
                <span className="font-medium text-[#1A2820] text-sm">
                  {therapist?.email}
                </span>
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Public Booking Slug</span>
                <span className="font-mono text-[#245437] bg-[#EBF3ED] px-2 py-0.5 rounded text-xs">
                  /api/therapist/{therapist?.slug}
                </span>
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Internal ID</span>
                <span className="font-mono text-[#717E76] text-xs">
                  {therapist?.id || therapist?._id}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
