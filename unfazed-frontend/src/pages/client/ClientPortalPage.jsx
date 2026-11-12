import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axiosInstance from "../../api/axiosInstance";
import { formatUtcDate } from "../../utils/dateHelpers";

export default function ClientPortalPage() {
  const { token } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sharedNotes, setSharedNotes] = useState([]);
  const [client, setClient] = useState(null);
  const [therapist, setTherapist] = useState(null);

  useEffect(() => {
    let isMounted = true;

    axiosInstance
      .get(`/notes/shared/${token}`)
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success) {
          setSharedNotes(res.data.data || []);
          setClient(res.data.client || null);
          setTherapist(res.data.therapist || null);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const status = err.response?.status;
        if (status === 404) {
          setErrorMessage("This client portal link is invalid, expired, or has been revoked.");
        } else {
          setErrorMessage(
            err.response?.data?.message ||
              "Unable to load your client portal. Please try again later."
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Client Portal Header */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
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
                Client Healthcare Portal
              </span>
            </div>
          </div>

          {therapist && (
            <div className="text-right">
              <span className="text-xs font-semibold text-[#14261D] block">
                {therapist.practiceName || therapist.name}
              </span>
              <span className="text-[10px] text-[#6F7D74]">
                {therapist.title || therapist.credentials || "Mental Health Practitioner"}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
        {isLoading ? (
          <div className="p-16 bg-white border border-[#E9DFD2] rounded-2xl flex flex-col items-center justify-center gap-3">
            <svg
              className="animate-spin h-7 w-7 text-[#1B3B2B]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
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
                d="M4 12a8 8 0 018-8v8H4z"
              ></path>
            </svg>
            <span className="text-xs text-[#6F7D74]">Loading your client portal...</span>
          </div>
        ) : errorMessage ? (
          <div className="p-12 sm:p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF8E6] text-[#8C6D1F] flex items-center justify-center mx-auto border border-[#F2E3B3]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl font-bold text-[#14261D]">
              Portal Access Error
            </h2>
            <p className="text-xs sm:text-sm text-[#5E6D64] max-w-md mx-auto leading-relaxed">
              {errorMessage}
            </p>
          </div>
        ) : (
          <>
            {/* Top Welcome Banner Card */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(27,59,43,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6C7C72] block">
                  Confidential Patient Portal
                </span>
                <h1 className="font-serif text-2xl font-bold text-[#14261D] mt-0.5">
                  Welcome, {client?.name || "Client"}
                </h1>
                <p className="text-xs text-[#6F7D74] mt-1">
                  Access your care plans, shared session summaries, and intake records securely.
                </p>
              </div>

              <Link
                to={`/intake/${token}`}
                className="px-4 py-2 text-xs font-medium text-[#1B3B2B] bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#DCD4C7] rounded-xl transition-colors inline-flex items-center gap-1.5 self-start sm:self-center"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>View Intake Form →</span>
              </Link>
            </div>

            {/* Privacy Assurance Banner */}
            <div className="p-4 bg-[#EBF3ED] border border-[#CDE3D5] rounded-xl text-xs text-[#1E4D32] flex items-center gap-3">
              <svg className="w-5 h-5 text-[#2A6543] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <strong className="block">Clinical Privacy Guaranteed</strong>
                <span className="text-[11px] text-[#2A6543] leading-relaxed">
                  Only notes and takeaway prompts explicitly marked as shared by your therapist are displayed here. Your therapist&apos;s private internal records remain fully isolated and confidential.
                </span>
              </div>
            </div>

            {/* Shared Notes Section */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                    Shared Session Notes & Care Summaries ({sharedNotes.length})
                  </h2>
                </div>
              </div>

              {sharedNotes.length === 0 ? (
                <div className="p-8 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="font-medium text-xs text-[#14261D]">
                    No Shared Notes Yet
                  </h4>
                  <p className="text-[11px] text-[#6F7D74] max-w-sm mx-auto">
                    When your therapist publishes session reflections, exercise prompts, or care takeaways, they will appear securely in this section.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sharedNotes.map((note) => (
                    <div
                      key={note._id}
                      className="p-5 rounded-xl border border-[#CDE3D5] bg-[#FAFDFB] text-xs flex flex-col gap-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDECE2] pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2A6543]"></span>
                            Shared by Therapist
                          </span>

                          <h3 className="font-serif font-bold text-sm text-[#14261D]">
                            {note.title || "Session Care Summary"}
                          </h3>

                          {note.booking && (
                            <span className="text-[11px] text-[#697970] bg-white border border-[#D5E3DB] px-2 py-0.5 rounded-md">
                              Session Date: {formatUtcDate(note.booking.startTime)}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] text-[#78887F]">
                          Shared on {formatUtcDate(note.sharedAt || note.createdAt)}
                        </span>
                      </div>

                      <div className="text-[#27382F] leading-relaxed whitespace-pre-wrap font-sans text-xs sm:text-[13px] bg-white p-4 rounded-xl border border-[#E0ECE5]">
                        {note.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
