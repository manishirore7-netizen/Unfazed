import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axiosInstance from "../../api/axiosInstance";

const CURRENT_YEAR = new Date().getFullYear();

export default function PublicProfilePage() {
  const { slug } = useParams();

  const [therapist, setTherapist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [showInquiryModal, setShowInquiryModal] = useState(false);

  // 1. Fetch public therapist profile by slug
  useEffect(() => {
    let isMounted = true;

    const fetchPublicProfile = async () => {
      try {
        setIsLoading(true);
        setNotFound(false);
        setError(null);

        const response = await axiosInstance.get(`/therapist/${slug}`);
        if (isMounted && response.data?.data) {
          setTherapist(response.data.data);
        }
      } catch (err) {
        if (isMounted) {
          if (err.response?.status === 404) {
            setNotFound(true);
          } else {
            setError(
              err.response?.data?.message ||
                err.message ||
                "Unable to load profile. Please try again later."
            );
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (slug) {
      fetchPublicProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [slug]);

  // 2. Open Graph & Dynamic Page Metadata
  useEffect(() => {
    if (!therapist) return;

    const originalTitle = document.title;
    document.title = `${therapist.name} — Therapist Profile | Unfazed`;

    // Helper to update or inject meta tags dynamically
    const setMetaTag = (nameAttr, propertyAttr, content) => {
      const selector = propertyAttr
        ? `meta[property="${propertyAttr}"]`
        : `meta[name="${nameAttr}"]`;
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement("meta");
        if (propertyAttr) element.setAttribute("property", propertyAttr);
        if (nameAttr) element.setAttribute("name", nameAttr);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    const description =
      therapist.bio && therapist.bio.trim().length > 0
        ? therapist.bio.slice(0, 160) + (therapist.bio.length > 160 ? "..." : "")
        : `View ${therapist.name}'s therapist profile, focus areas, and languages on Unfazed.`;

    setMetaTag("description", null, description);
    setMetaTag(null, "og:title", `${therapist.name} — Therapist Profile`);
    setMetaTag(null, "og:description", description);
    setMetaTag(null, "og:type", "profile");
    setMetaTag(null, "og:url", window.location.href);

    return () => {
      document.title = originalTitle;
    };
  }, [therapist]);

  // 3. Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-10 h-10 rounded-xl bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2] mb-4 animate-pulse">
          <svg
            className="w-5 h-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
        </div>
        <p className="text-xs uppercase tracking-wider text-[#6E7B73] font-medium">
          Loading therapist profile...
        </p>
      </div>
    );
  }

  // 4. 404 Profile Not Found State
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col justify-between font-sans selection:bg-[#234E39]/15">
        <header className="w-full max-w-5xl mx-auto px-6 py-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-tight text-[#1B3B2B]">
              Unfazed
            </span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-md w-full bg-white border border-[#E9DFD2] rounded-2xl p-8 sm:p-10 text-center shadow-[0_8px_30px_rgb(27,59,43,0.04)]">
            <div className="w-12 h-12 rounded-full bg-[#FAF0E6] text-[#7A4B1A] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-serif font-medium text-[#14261D] mb-2">
              Therapist Not Found
            </h1>
            <p className="text-xs sm:text-sm text-[#5B6A61] leading-relaxed mb-6">
              We couldn&apos;t find an active therapist profile registered under &quot;{slug}&quot;. Please verify the URL or contact the practice directly.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full px-5 py-2.5 text-xs font-medium rounded-xl bg-[#1B3B2B] text-white hover:bg-[#234E39] transition-colors"
            >
              Return to Unfazed
            </Link>
          </div>
        </main>

        <footer className="w-full max-w-5xl mx-auto px-6 py-6 text-center text-xs text-[#7F8D84]">
          <p>© {CURRENT_YEAR} Unfazed Practice Directory.</p>
        </footer>
      </div>
    );
  }

  // 5. Network/API Error State
  if (error || !therapist) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-[#E9DFD2] rounded-2xl p-8 text-center">
          <h2 className="text-lg font-serif font-medium text-[#14261D] mb-2">
            Unable to Display Profile
          </h2>
          <p className="text-xs text-[#5B6A61] mb-6">{error || "An unexpected error occurred."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 text-xs font-medium rounded-xl bg-[#1B3B2B] text-white hover:bg-[#234E39] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Derived values for clean presentation
  const specializations = Array.isArray(therapist.specializations)
    ? therapist.specializations
    : [];
  const languages = Array.isArray(therapist.languages)
    ? therapist.languages
    : [];
  const bioText = therapist.bio?.trim();

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans selection:bg-[#234E39]/15 selection:text-[#1B3B2B]">
      {/* Top Navbar */}
      <nav className="w-full bg-[#FAF7F2]/80 backdrop-blur-md border-b border-[#EBE3D7] sticky top-0 z-20 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-semibold text-sm tracking-tight text-[#1B3B2B]">
                {therapist.name}
              </span>
              <span className="text-[10px] text-[#717E76] -mt-0.5">
                Practice Profile
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowInquiryModal(true)}
              className="text-xs font-medium bg-[#1B3B2B] text-white hover:bg-[#234E39] px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-sm"
            >
              Contact & Info
            </button>
          </div>
        </div>
      </nav>

      {/* Main Page Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 sm:py-16 flex flex-col gap-12 sm:gap-16">
        {/* A. HERO SECTION */}
        <section className="bg-white border border-[#E9DFD2] rounded-3xl p-8 sm:p-12 shadow-[0_12px_40px_rgb(27,59,43,0.03)] relative overflow-hidden">
          {/* Subtle decorative background gradient accent */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#EBF3ED]/60 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

          <div className="relative z-10 max-w-2xl flex flex-col gap-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBF3ED] text-[#245437] text-xs font-medium w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E6B45]"></span>
              <span>Therapist Profile</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-serif text-[#14261D] tracking-tight leading-[1.15]">
              {therapist.name}
            </h1>

            {/* Factual introduction derived solely from specializations, bio, or name */}
            {specializations.length > 0 ? (
              <p className="text-base sm:text-lg text-[#4A574F] font-serif leading-relaxed">
                Areas of focus include {specializations.join(", ")}.
              </p>
            ) : bioText ? (
              <p className="text-base sm:text-lg text-[#4A574F] font-serif leading-relaxed line-clamp-2">
                {bioText}
              </p>
            ) : (
              <p className="text-base sm:text-lg text-[#4A574F] font-serif leading-relaxed">
                Professional practice profile for {therapist.name}.
              </p>
            )}

            {/* Factual languages chip (if available) */}
            {languages.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[#5D6B63]">
                <div className="inline-flex items-center gap-1.5 bg-[#FAF7F2] border border-[#E8DFD3] px-3 py-1.5 rounded-lg">
                  <svg className="w-3.5 h-3.5 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <span>Languages: {languages.join(", ")}</span>
                </div>
              </div>
            )}

            {/* Hero CTA */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => setShowInquiryModal(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#1B3B2B] text-white hover:bg-[#234E39] font-medium text-sm transition-all shadow-sm cursor-pointer"
              >
                <span>Contact & Scheduling Info</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              <a
                href="#about"
                className="inline-flex items-center justify-center px-5 py-3.5 rounded-xl bg-[#F4EFE9] text-[#24332B] hover:bg-[#EAE4DC] font-medium text-sm transition-colors text-center"
              >
                View Profile Details
              </a>
            </div>
          </div>
        </section>

        {/* B. ABOUT SECTION */}
        <section id="about" className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start scroll-mt-24">
          <div className="md:col-span-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] mb-2">
              Practice Background
            </h2>
            <h3 className="text-2xl font-serif font-medium text-[#152B20]">
              About the Therapist
            </h3>
          </div>

          <div className="md:col-span-8 bg-white border border-[#E9DFD2] rounded-2xl p-7 sm:p-9 shadow-sm">
            {bioText ? (
              <div className="text-sm leading-relaxed text-[#3E4E45] space-y-4 whitespace-pre-line">
                {bioText}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-[#717E76] italic">
                No biography has been provided yet.
              </p>
            )}
          </div>
        </section>

        {/* C. AREAS OF SUPPORT / SERVICE CARDS (Informational Overview) */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#E8DFD3] pb-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] mb-1">
                Areas of Practice
              </h2>
              <h3 className="text-2xl font-serif font-medium text-[#152B20]">
                Areas of Support & Services
              </h3>
            </div>
            <span className="text-xs text-[#7F8D84]">
              Informational overview · Subject to therapist confirmation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Card 1: Individual Therapy */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:border-[#CDE3D5] transition-colors">
              <div>
                <div className="w-9 h-9 rounded-xl bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h4 className="font-serif font-medium text-lg text-[#152B20] mb-2">
                  Individual Therapy
                </h4>
                <p className="text-xs leading-relaxed text-[#4F5E55]">
                  One-on-one sessions focused on personal concerns, self-exploration, and emotional health.
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-[#F0EAE2] text-[11px] font-medium text-[#65766C]">
                Informational overview
              </div>
            </div>

            {/* Card 2: Targeted Topics */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:border-[#CDE3D5] transition-colors">
              <div>
                <div className="w-9 h-9 rounded-xl bg-[#FAF0E6] text-[#6E4720] flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h4 className="font-serif font-medium text-lg text-[#152B20] mb-2">
                  Targeted Topics
                </h4>
                <p className="text-xs leading-relaxed text-[#4F5E55]">
                  {specializations.length > 0
                    ? `Sessions addressing client-identified topics, including ${specializations.slice(0, 2).join(" and ")}.`
                    : "Sessions addressing client-identified areas of concern and support."}
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-[#F0EAE2] text-[11px] font-medium text-[#65766C]">
                Based on listed specializations
              </div>
            </div>

            {/* Card 3: Initial Consultation */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:border-[#CDE3D5] transition-colors">
              <div>
                <div className="w-9 h-9 rounded-xl bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h4 className="font-serif font-medium text-lg text-[#152B20] mb-2">
                  Initial Consultation
                </h4>
                <p className="text-xs leading-relaxed text-[#4F5E55]">
                  An introductory conversation to discuss therapeutic fit, mutual expectations, and next steps before beginning therapy.
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-[#F0EAE2] text-[11px] font-medium text-[#65766C]">
                Introductory conversation
              </div>
            </div>
          </div>
        </section>

        {/* D. CLINICAL SPECIALIZATIONS */}
        {specializations.length > 0 && (
          <section className="flex flex-col gap-5 border-t border-[#E8DFD3] pt-10">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] mb-1">
                Areas of Focus
              </h2>
              <h3 className="text-2xl font-serif font-medium text-[#152B20]">
                Specializations & Focus Areas
              </h3>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {specializations.map((spec, index) => (
                <div
                  key={`${spec}-${index}`}
                  className="bg-white border border-[#DCD3C7] rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-[#1E3B2C] shadow-sm flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2A6543]"></span>
                  <span>{spec}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* E. LANGUAGES */}
        {languages.length > 0 && (
          <section className="flex flex-col gap-5 border-t border-[#E8DFD3] pt-10">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] mb-1">
                Communication
              </h2>
              <h3 className="text-2xl font-serif font-medium text-[#152B20]">
                Languages Offered in Sessions
              </h3>
            </div>

            <div className="flex flex-wrap gap-3">
              {languages.map((lang, index) => (
                <div
                  key={`${lang}-${index}`}
                  className="bg-[#FAF0E6] border border-[#E8D4C0] rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-[#6E4720] shadow-sm flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-[#6E4720]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span>{lang}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* F. FOOTER */}
      <footer className="w-full border-t border-[#E8DFD3] bg-white py-10 px-6 mt-16">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[#717E76]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <span className="font-serif font-medium text-[#1B3B2B]">
              {therapist.name}
            </span>
            <span>· Practice Profile</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[#8E9B93]">
              Powered by <strong className="font-medium text-[#1B3B2B]">Unfazed</strong>
            </span>
            <span className="text-[#D8CFBF]">|</span>
            <Link to="/login" className="text-[#1B3B2B] hover:underline underline-offset-4 font-medium">
              Therapist Portal
            </Link>
          </div>
        </div>
      </footer>

      {/* Booking Notice Modal (Informational for Module 1) */}
      {showInquiryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-[#E9DFD2] rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>

            <h3 className="text-xl font-serif font-medium text-[#152B20] mb-2">
              Scheduling Information
            </h3>

            <p className="text-xs sm:text-sm text-[#4F5E55] leading-relaxed mb-6">
              Online client scheduling and interactive calendar bookings for <strong>{therapist.name}</strong> will be enabled in a future update. This page currently provides profile information only.
            </p>

            <button
              type="button"
              onClick={() => setShowInquiryModal(false)}
              className="w-full px-5 py-2.5 rounded-xl bg-[#1B3B2B] text-white hover:bg-[#234E39] text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
