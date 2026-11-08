import { Link } from "react-router-dom";
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

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-xs font-medium block text-[#1B3B2B]">
                {therapist?.name}
              </span>
              <span className="text-[11px] text-[#717E76] block">
                {therapist?.email}
              </span>
            </div>

            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              <span>Edit Profile</span>
            </Link>

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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-serif text-[#152B20] tracking-tight mb-1">
                Welcome to Unfazed, {therapist?.name}
              </h1>
              <p className="text-sm text-[#4F5D54] leading-relaxed">
                Your clinical workspace and therapist profile are active.
              </p>
            </div>

            <Link
              to="/profile"
              className="inline-flex items-center justify-center gap-2 text-xs font-medium bg-[#1B3B2B] text-white hover:bg-[#234E39] px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <span>Customize Profile</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Account Profile Card */}
          <div className="bg-[#FAF8F5] border border-[#EBE3D7] rounded-xl p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                Therapist Practice Profile
              </h2>
              <Link
                to="/profile"
                className="text-xs font-medium text-[#1B3B2B] hover:underline underline-offset-4"
              >
                Edit details →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#7F8D84] block mb-0.5">Professional Name</span>
                <span className="font-medium text-[#1A2820] text-sm">
                  {therapist?.name}
                </span>
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Account Email</span>
                <span className="font-medium text-[#1A2820] text-sm break-all">
                  {therapist?.email}
                </span>
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Public Booking Slug</span>
                {therapist?.slug ? (
                  <Link
                    to={`/${therapist.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[#245437] hover:underline bg-[#EBF3ED] px-2 py-0.5 rounded text-xs break-all inline-flex items-center gap-1"
                  >
                    <span>/{therapist.slug}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                ) : (
                  <span className="text-xs text-[#8E9B93]">Not assigned</span>
                )}
              </div>

              <div>
                <span className="text-[#7F8D84] block mb-0.5">Internal ID</span>
                <span className="font-mono text-[#717E76] text-xs">
                  {therapist?.id || therapist?._id}
                </span>
              </div>
            </div>

            {/* Bio Preview */}
            <div className="pt-2 border-t border-[#EAE2D6]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#7F8D84] block mb-1">
                Clinical Biography
              </span>
              <p className="text-xs text-[#3E4D44] leading-relaxed italic bg-white p-3 rounded-lg border border-[#EDE5DA]">
                {therapist?.bio?.trim()
                  ? therapist.bio
                  : "No biography added yet. Click 'Edit details' to share your approach to therapy."}
              </p>
            </div>

            {/* Specializations & Languages Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#EAE2D6]">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#7F8D84] block mb-1.5">
                  Specializations ({therapist?.specializations?.length || 0})
                </span>
                {therapist?.specializations && therapist.specializations.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {therapist.specializations.map((spec, index) => (
                      <span
                        key={`${spec}-${index}`}
                        className="px-2.5 py-0.5 bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5] rounded-full text-[11px] font-medium"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-[#8E9B93]">None specified</span>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#7F8D84] block mb-1.5">
                  Languages ({therapist?.languages?.length || 0})
                </span>
                {therapist?.languages && therapist.languages.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {therapist.languages.map((lang, index) => (
                      <span
                        key={`${lang}-${index}`}
                        className="px-2.5 py-0.5 bg-[#FAF0E6] text-[#6E4720] border border-[#E8D4C0] rounded-full text-[11px] font-medium"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-[#8E9B93]">None specified</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
