import { useState, useEffect } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Alert from "../common/Alert";
import { formatUtcDate, formatUtcTimeRange12h } from "../../utils/dateHelpers";

export default function NoteFormModal({
  isOpen,
  onClose,
  onSuccess,
  clientId,
  clientName,
  clientBookings = [],
  noteToEdit = null,
}) {
  const isEditing = Boolean(noteToEdit);

  const [type, setType] = useState(noteToEdit?.type || "private");
  const [bookingId, setBookingId] = useState(
    noteToEdit?.bookingId?._id || noteToEdit?.bookingId || ""
  );
  const [title, setTitle] = useState(noteToEdit?.title || "");
  const [content, setContent] = useState(noteToEdit?.content || "");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state when modal opens or noteToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (noteToEdit) {
        setType(noteToEdit.type || "private");
        setBookingId(noteToEdit.bookingId?._id || noteToEdit.bookingId || "");
        setTitle(noteToEdit.title || "");
        setContent(noteToEdit.content || "");
      } else {
        setType("private");
        setBookingId(clientBookings.length > 0 ? clientBookings[0]._id : "");
        setTitle("");
        setContent("");
      }
      setErrorMessage("");
    }
  }, [isOpen, noteToEdit, clientBookings]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!content.trim()) {
      setErrorMessage("Please enter clinical note content.");
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        clientId,
        bookingId: bookingId || null,
        type,
        title: title.trim(),
        content: content.trim(),
      };

      let response;
      if (isEditing) {
        response = await axiosInstance.put(`/notes/${noteToEdit._id}`, payload);
      } else {
        response = await axiosInstance.post("/notes", payload);
      }

      if (response.data?.success) {
        onSuccess(response.data.data);
        onClose();
      } else {
        setErrorMessage(response.data?.message || "Failed to save clinical note.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "An unexpected error occurred while saving the note.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231B]/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-[#E8DFD3] rounded-2xl max-w-xl w-full shadow-2xl p-6 sm:p-7 space-y-5 my-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#EAE2D6] pb-3.5">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6C7C72] block">
              Module 5 · Clinical Documentation
            </span>
            <h3 className="font-serif font-bold text-xl text-[#14261D] mt-0.5">
              {isEditing ? "Edit Clinical Note" : "Write Clinical Note"}
            </h3>
            <p className="text-xs text-[#6F7D74] mt-0.5">
              Documenting session with <strong className="text-[#14261D]">{clientName}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#FAF7F2] hover:bg-[#EAE2D6] text-[#637269] flex items-center justify-center text-xs transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Note Privacy Type Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-[#27382F] block">
              Note Privacy & Access Setting <span className="text-[#8C2828]">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Private Option */}
              <button
                type="button"
                onClick={() => setType("private")}
                className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  type === "private"
                    ? "bg-[#FAF8F5] border-[#1B3B2B] ring-1 ring-[#1B3B2B]"
                    : "bg-white border-[#E0D7CA] hover:border-[#C4B7A3]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-[#14261D]">
                    <span>🔒 Private Note</span>
                  </div>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      type === "private"
                        ? "border-[#1B3B2B] bg-[#1B3B2B]"
                        : "border-[#C7BEAF] bg-white"
                    }`}
                  >
                    {type === "private" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-[#6F7D74] leading-relaxed">
                  Therapist eyes only. Never visible to client in their portal.
                </p>
              </button>

              {/* Shared Option */}
              <button
                type="button"
                onClick={() => setType("shared")}
                className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  type === "shared"
                    ? "bg-[#EBF3ED] border-[#1B3B2B] ring-1 ring-[#1B3B2B]"
                    : "bg-white border-[#E0D7CA] hover:border-[#C4B7A3]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1E4D32]">
                    <span>🌐 Shared with Client</span>
                  </div>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      type === "shared"
                        ? "border-[#1B3B2B] bg-[#1B3B2B]"
                        : "border-[#C7BEAF] bg-white"
                    }`}
                  >
                    {type === "shared" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-[#2A6543] leading-relaxed">
                  Care summary, takeaways, or prompts visible to the client in their portal.
                </p>
              </button>
            </div>
          </div>

          {/* Associated Session / Booking */}
          <div className="space-y-1.5">
            <label htmlFor="session-select" className="font-semibold text-[#27382F] block">
              Associated Session (Optional)
            </label>
            <select
              id="session-select"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-[#D8CEBF] rounded-xl px-3.5 py-2.5 text-xs text-[#1C2520] focus:outline-none focus:border-[#1B3B2B] focus:ring-1 focus:ring-[#1B3B2B]"
            >
              <option value="">General Client Note (Not session-specific)</option>
              {clientBookings.map((b) => (
                <option key={b._id} value={b._id}>
                  {formatUtcDate(b.startTime)} — {formatUtcTimeRange12h(b.startTime, b.endTime)} (
                  {b.duration} mins) [{b.status}]
                </option>
              ))}
            </select>
          </div>

          {/* Note Title / Topic */}
          <div className="space-y-1.5">
            <label htmlFor="note-title" className="font-semibold text-[#27382F] block">
              Title or Topic (Optional)
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Session 1 Clinical Impressions, CBT Action Plan, Homework..."
              maxLength={200}
              className="w-full bg-[#FAF8F5] border border-[#D8CEBF] rounded-xl px-3.5 py-2.5 text-xs text-[#1C2520] focus:outline-none focus:border-[#1B3B2B] focus:ring-1 focus:ring-[#1B3B2B]"
            />
          </div>

          {/* Freeform Note Text Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="note-content" className="font-semibold text-[#27382F]">
                Clinical Note Content <span className="text-[#8C2828]">*</span>
              </label>
              <span className="text-[10px] text-[#717E76]">
                {content.length} characters
              </span>
            </div>
            <textarea
              id="note-content"
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                type === "private"
                  ? "Record private observations, diagnostic hypotheses, clinical impressions, risk assessments..."
                  : "Write reflections, agreed-upon exercises, takeaways, or session insights for your client..."
              }
              className="w-full bg-[#FAF8F5] border border-[#D8CEBF] rounded-xl p-3.5 text-xs text-[#1C2520] font-sans leading-relaxed focus:outline-none focus:border-[#1B3B2B] focus:ring-1 focus:ring-[#1B3B2B] resize-y"
            ></textarea>
          </div>

          {/* Shared Note Privacy Notice */}
          {type === "shared" && (
            <div className="p-3 bg-[#EBF3ED] border border-[#CDE3D5] rounded-xl text-xs text-[#1E4D32] flex items-center gap-2">
              <svg className="w-4 h-4 text-[#2A6543] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Client Visibility Active:</strong> This note will be published to the client portal and can be viewed by {clientName}.
              </span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EAE2D6]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <Button
              type="submit"
              isLoading={isLoading}
              className="w-auto px-5 py-2.5 text-xs bg-[#1B3B2B] hover:bg-[#24523C] text-white rounded-xl font-medium"
            >
              {isEditing ? "Save Changes" : "Save Clinical Note"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
