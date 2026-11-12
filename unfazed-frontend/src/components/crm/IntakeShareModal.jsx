import { useState } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";

export default function IntakeShareModal({ isOpen, onClose, client, onSuccess }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [intakeUrl, setIntakeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [hasGeneratedToken, setHasGeneratedToken] = useState(false);

  if (!isOpen || !client?._id) return null;

  const handleClose = () => {
    if (hasGeneratedToken && onSuccess) {
      onSuccess();
    }
    setIntakeUrl("");
    setError("");
    setCopied(false);
    setHasGeneratedToken(false);
    setIsGenerating(false);
    onClose();
  };

  const handleGenerateLink = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setError("");
    setCopied(false);

    try {
      const res = await axiosInstance.post(`/clients/${client._id}/intake/initiate`);
      if (res.data?.success && res.data?.data) {
        const rawToken = res.data.data.rawToken;
        const fullUrl = `${window.location.origin}/intake/${rawToken}`;
        setIntakeUrl(fullUrl);
        setHasGeneratedToken(true);
      } else {
        setError(res.data?.message || "Failed to generate intake link.");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "An error occurred while generating the secure intake link."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePortalLink = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setError("");
    setCopied(false);

    try {
      const res = await axiosInstance.post(`/clients/${client._id}/portal/initiate`);
      if (res.data?.success && res.data?.data) {
        const rawToken = res.data.data.portalToken;
        const fullUrl = `${window.location.origin}/portal/${rawToken}`;
        setIntakeUrl(fullUrl);
        setHasGeneratedToken(true);
      } else {
        setError(res.data?.message || "Failed to generate client portal link.");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "An error occurred while generating the client portal link."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!intakeUrl) return;
    navigator.clipboard.writeText(intakeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231B]/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-[#E8DFD3] rounded-2xl p-6 sm:p-7 max-w-lg w-full shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center shrink-0 border border-[#CDE3D5]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-serif font-bold text-lg text-[#14261D]">
                Client Intake & Consent Link
              </h2>
              <p className="text-xs text-[#717E76]">
                Secure invitation for {client.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-[#8E9B93] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <Alert variant="error" message={error} onClose={() => setError("")} />}

        {!intakeUrl ? (
          /* Step 1: Explicit User-Initiated Generation Prompt */
          <div className="space-y-4">
            <p className="text-xs text-[#526358] leading-relaxed">
              Generate a unique, cryptographically secure invitation link for <strong>{client.name}</strong>.
            </p>

            <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#EDE5DA] text-xs text-[#6F7D74] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#8E9B93]">Client:</span>
                <span className="font-semibold text-[#14261D]">{client.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E9B93]">Email:</span>
                <span className="text-[#2F3E35] font-mono text-[11px]">{client.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E9B93]">Intake Status:</span>
                <span className="capitalize font-medium text-[#14261D]">
                  {client.intakeStatus ? client.intakeStatus.replace("_", " ") : "Not sent"}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#717E76] leading-relaxed">
              This link allows the client to complete their demographics, clinical background, and sign the Informed Consent Agreement v1.0. Each link is single-use and expires in 7 days.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="w-auto px-4 py-2 text-xs rounded-xl"
              >
                Cancel
              </Button>
              {client.intakeStatus === "completed" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateLink}
                  isLoading={isGenerating}
                  disabled={isGenerating}
                  className="w-auto px-3.5 py-2 text-xs rounded-xl text-[#6F7D74]"
                >
                  Re-issue Intake
                </Button>
              )}
              <Button
                type="button"
                onClick={
                  client.intakeStatus === "completed"
                    ? handleGeneratePortalLink
                    : handleGenerateLink
                }
                isLoading={isGenerating}
                disabled={isGenerating}
                className="w-auto px-5 py-2 text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 bg-[#1B3B2B] hover:bg-[#234E39] text-white"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>
                  {client.intakeStatus === "completed"
                    ? "Generate Client Portal Link"
                    : client.intakeStatus === "pending"
                    ? "Generate New Link"
                    : "Generate Invitation Link"}
                </span>
              </Button>
            </div>
          </div>
        ) : (
          /* Step 2: Display Generated Link with Copy Action */
          <div className="space-y-4">
            <p className="text-xs text-[#526358] leading-relaxed">
              Invitation link generated successfully! Share this secure link with <strong>{client.name}</strong>.
            </p>

            {/* Link Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#738278] block">
                Secure Client Link (Single-use, 7-day validity)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={intakeUrl}
                  className="flex-1 px-3.5 py-2.5 text-xs rounded-xl bg-[#FAF8F5] border border-[#DCD4C7] text-[#24332B] font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-4 py-2.5 text-xs font-medium rounded-xl transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                    copied
                      ? "bg-[#1E4D32] text-white border border-[#1E4D32]"
                      : "bg-[#1B3B2B] text-white hover:bg-[#14261D]"
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Workflow Notice */}
            <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#EDE5DA] text-[11px] text-[#6F7D74] space-y-1.5">
              <div className="flex items-center gap-2 text-[#2A6543] font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Automated Workflow Details</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>Link is active and valid for 7 days.</li>
                <li>Submitted demographics and clinical history automatically sync to this profile.</li>
                <li>Digital signature and agreement audit timestamps will be stored securely.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={isGenerating}
                className="text-xs text-[#526358] hover:text-[#1B3B2B] hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Re-generate Link</span>
              </button>

              <Button
                type="button"
                onClick={handleClose}
                className="w-auto px-6 py-2 text-xs rounded-xl"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
