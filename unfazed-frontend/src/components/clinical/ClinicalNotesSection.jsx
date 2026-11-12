import { useState, useEffect, useMemo, useCallback } from "react";
import axiosInstance from "../../api/axiosInstance";
import NoteFormModal from "./NoteFormModal";
import Alert from "../common/Alert";
import Button from "../common/Button";
import { formatUtcDate } from "../../utils/dateHelpers";

export default function ClinicalNotesSection({
  clientId,
  clientName,
  clientBookings = [],
}) {
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all"); // 'all' | 'private' | 'shared'
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Modals & Active Edit/Delete State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState(null);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingId, setIsTogglingId] = useState(null);

  const fetchNotes = useCallback(async () => {
    if (!clientId) return;
    try {
      setIsLoading(true);
      const res = await axiosInstance.get("/notes", {
        params: { clientId },
      });
      if (res.data?.success) {
        setNotes(res.data.data || []);
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to load clinical notes.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Counts
  const counts = useMemo(() => {
    const total = notes.length;
    const privateCount = notes.filter((n) => n.type === "private").length;
    const sharedCount = notes.filter((n) => n.type === "shared").length;
    return { total, privateCount, sharedCount };
  }, [notes]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    if (filterType === "private") {
      return notes.filter((n) => n.type === "private");
    }
    if (filterType === "shared") {
      return notes.filter((n) => n.type === "shared");
    }
    return notes;
  }, [notes, filterType]);

  // Quick Privacy Toggle
  const handleTogglePrivacy = async (note) => {
    const newType = note.type === "private" ? "shared" : "private";
    setIsTogglingId(note._id);
    try {
      const res = await axiosInstance.put(`/notes/${note._id}`, {
        type: newType,
      });
      if (res.data?.success) {
        setNotes((prev) =>
          prev.map((n) => (n._id === note._id ? res.data.data : n))
        );
        setSuccessMessage(
          newType === "shared"
            ? "Note is now shared and accessible in the client portal."
            : "Note is now private and hidden from the client portal."
        );
        setTimeout(() => setSuccessMessage(""), 4000);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || "Failed to update note privacy."
      );
      setTimeout(() => setErrorMessage(""), 4000);
    } finally {
      setIsTogglingId(null);
    }
  };

  // Delete Note
  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    setIsDeleting(true);
    try {
      const res = await axiosInstance.delete(`/notes/${noteToDelete._id}`);
      if (res.data?.success) {
        setNotes((prev) => prev.filter((n) => n._id !== noteToDelete._id));
        setSuccessMessage("Clinical note was permanently deleted.");
        setTimeout(() => setSuccessMessage(""), 4000);
        setNoteToDelete(null);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || "Failed to delete clinical note."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE2D6] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
              Clinical Session Notes ({counts.total})
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-[#717E76] mt-0.5">
              <span>{counts.privateCount} Private</span>
              <span>·</span>
              <span className="text-[#1E4D32] font-medium">{counts.sharedCount} Shared with Client</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedNoteToEdit(null);
            setIsModalOpen(true);
          }}
          className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B3B2B] hover:bg-[#234E39] rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Write Clinical Note</span>
        </button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <Alert variant="success" message={successMessage} onClose={() => setSuccessMessage("")} />
      )}
      {errorMessage && (
        <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#F0EAE2] pb-2 text-xs">
        <button
          type="button"
          onClick={() => setFilterType("all")}
          className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
            filterType === "all"
              ? "bg-[#1B3B2B] text-white"
              : "text-[#5F6F66] hover:bg-[#F3EFEA]"
          }`}
        >
          All Notes ({counts.total})
        </button>
        <button
          type="button"
          onClick={() => setFilterType("private")}
          className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
            filterType === "private"
              ? "bg-[#1B3B2B] text-white"
              : "text-[#5F6F66] hover:bg-[#F3EFEA]"
          }`}
        >
          <span>🔒 Private Only</span>
          <span>({counts.privateCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterType("shared")}
          className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
            filterType === "shared"
              ? "bg-[#1B3B2B] text-white"
              : "text-[#5F6F66] hover:bg-[#F3EFEA]"
          }`}
        >
          <span>🌐 Shared with Client</span>
          <span>({counts.sharedCount})</span>
        </button>
      </div>

      {/* Notes List / Empty State */}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-[#717E76] flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4 text-[#1B3B2B]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Loading clinical documentation...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="p-8 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center mx-auto">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-xs text-[#14261D]">
              {filterType === "all"
                ? "No Clinical Notes Documented"
                : filterType === "private"
                ? "No Private Notes Found"
                : "No Shared Notes Found"}
            </h4>
            <p className="text-[11px] text-[#6F7D74] mt-0.5 max-w-sm mx-auto">
              {filterType === "all"
                ? "Record private clinical impressions, SOAP/DAP notes, or share care summaries with your client."
                : "No notes matching the selected privacy filter."}
            </p>
          </div>
          {filterType === "all" && (
            <button
              type="button"
              onClick={() => {
                setSelectedNoteToEdit(null);
                setIsModalOpen(true);
              }}
              className="px-3.5 py-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors inline-block cursor-pointer"
            >
              Write First Clinical Note
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const isShared = note.type === "shared";
            const isToggling = isTogglingId === note._id;

            return (
              <div
                key={note._id}
                className={`p-4 rounded-xl border transition-all text-xs flex flex-col gap-3 ${
                  isShared
                    ? "bg-[#FAFDFB] border-[#D4E8DC] hover:border-[#B1DAC2]"
                    : "bg-[#FAF8F5] border-[#EDE5DA] hover:border-[#D5C9B8]"
                }`}
              >
                {/* Note Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ECE3D7] pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isShared
                          ? "bg-[#EBF3ED] text-[#1E4D32] border-[#CDE3D5]"
                          : "bg-[#F0EAE2] text-[#55635B] border-[#DDD5C7]"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isShared ? "bg-[#2A6543]" : "bg-[#717E76]"
                        }`}
                      ></span>
                      {isShared ? "🌐 Shared with Client" : "🔒 Private Note"}
                    </span>

                    {note.title && (
                      <h4 className="font-serif font-bold text-sm text-[#14261D]">
                        {note.title}
                      </h4>
                    )}

                    {note.bookingId && (
                      <span className="text-[11px] text-[#697970] bg-white border border-[#E3DCD1] px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        <svg className="w-3 h-3 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>
                          {formatUtcDate(note.bookingId.startTime)}
                        </span>
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#85948B]">
                    {formatUtcDate(note.createdAt)}
                  </span>
                </div>

                {/* Freeform Content */}
                <div className="text-[#27382F] leading-relaxed whitespace-pre-wrap font-sans text-xs sm:text-[13px] bg-white/70 p-3.5 rounded-lg border border-[#EDE5DA]/70">
                  {note.content}
                </div>

                {/* Card Actions Footer */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[10px] text-[#7E8E84]">
                    {isShared
                      ? "✓ Published to client portal"
                      : "🔒 Stored securely · Private to therapist"}
                  </span>

                  <div className="flex items-center gap-2">
                    {/* Quick Toggle Privacy Button */}
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleTogglePrivacy(note)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                        isShared
                          ? "bg-white text-[#717E76] border-[#D9D1C5] hover:bg-[#F3EFEA]"
                          : "bg-[#EBF3ED] text-[#1E4D32] border-[#CDE3D5] hover:bg-[#DEEDE2]"
                      }`}
                      title={isShared ? "Hide note from client portal" : "Share note in client portal"}
                    >
                      {isToggling ? "Updating..." : isShared ? "Make Private" : "Share with Client"}
                    </button>

                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteToEdit(note);
                        setIsModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-[#1B3B2B] bg-white border border-[#D9D1C5] hover:bg-[#F3EFEA] rounded-lg transition-colors cursor-pointer"
                    >
                      Edit
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setNoteToDelete(note)}
                      className="p-1 text-[#8C2828] hover:bg-[#FDF4F4] border border-transparent hover:border-[#F2D1D1] rounded-lg transition-colors cursor-pointer"
                      title="Delete Clinical Note"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Note Form Modal (Create / Edit) */}
      <NoteFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedNoteToEdit(null);
        }}
        onSuccess={() => {
          fetchNotes();
          setSuccessMessage(
            selectedNoteToEdit
              ? "Clinical note updated successfully."
              : "Clinical note recorded successfully."
          );
          setTimeout(() => setSuccessMessage(""), 4000);
        }}
        clientId={clientId}
        clientName={clientName}
        clientBookings={clientBookings}
        noteToEdit={selectedNoteToEdit}
      />

      {/* Delete Confirmation Modal */}
      {noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231B]/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-[#8C2828]">
              <div className="w-10 h-10 rounded-xl bg-[#FDF4F4] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-[#14261D]">
                  Delete Clinical Note?
                </h3>
                <p className="text-xs text-[#717E76]">
                  Are you sure you want to permanently delete this clinical record?
                </p>
              </div>
            </div>

            <p className="text-xs text-[#526358] leading-relaxed">
              This action cannot be undone. The clinical note content will be permanently removed from the system.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setNoteToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={handleDeleteNote}
                isLoading={isDeleting}
                className="w-auto px-4 py-2 text-xs bg-[#8C2828] hover:bg-[#722020] text-white rounded-xl"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
