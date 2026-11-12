import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import ClientFormModal from "../../components/crm/ClientFormModal";
import TherapistBookingModal from "../../components/scheduling/TherapistBookingModal";
import IntakeShareModal from "../../components/crm/IntakeShareModal";
import PackageCheckoutModal from "../../components/payments/PackageCheckoutModal";
import ClinicalNotesSection from "../../components/clinical/ClinicalNotesSection";
import { formatUtcDate, formatUtcTimeRange12h } from "../../utils/dateHelpers";
import { formatPaiseToInr } from "../../utils/razorpay";

const INTAKE_BADGES = {
  not_sent: {
    label: "Intake Not Sent",
    bg: "bg-[#F0EAE2]",
    text: "text-[#55635B]",
    border: "border-[#DDD5C7]",
    dot: "bg-[#717E76]",
  },
  pending: {
    label: "Intake Sent (Pending)",
    bg: "bg-[#FFF8E6]",
    text: "text-[#8C6D1F]",
    border: "border-[#F2E3B3]",
    dot: "bg-[#C49B28]",
  },
  completed: {
    label: "Intake Completed",
    bg: "bg-[#EBF3ED]",
    text: "text-[#1E4D32]",
    border: "border-[#CDE3D5]",
    dot: "bg-[#2A6543]",
  },
};

const CONSENT_BADGES = {
  pending: {
    label: "Consent Pending",
    bg: "bg-[#FFF8E6]",
    text: "text-[#8C6D1F]",
    border: "border-[#F2E3B3]",
    dot: "bg-[#C49B28]",
  },
  completed: {
    label: "Consent Signed v1.0",
    bg: "bg-[#EBF3ED]",
    text: "text-[#1E4D32]",
    border: "border-[#CDE3D5]",
    dot: "bg-[#2A6543]",
  },
};

const STATUS_BADGES = {
  active: {
    label: "Active Client",
    bg: "bg-[#EBF3ED]",
    text: "text-[#1E4D32]",
    border: "border-[#CDE3D5]",
    dot: "bg-[#2A6543]",
  },
  lead: {
    label: "Intake Lead",
    bg: "bg-[#FFF8E6]",
    text: "text-[#8C6D1F]",
    border: "border-[#F2E3B3]",
    dot: "bg-[#C49B28]",
  },
  inactive: {
    label: "Inactive",
    bg: "bg-[#F0EAE2]",
    text: "text-[#55635B]",
    border: "border-[#DDD5C7]",
    dot: "bg-[#717E76]",
  },
  archived: {
    label: "Archived",
    bg: "bg-[#F3F0F7]",
    text: "text-[#594E68]",
    border: "border-[#E1DAE8]",
    dot: "bg-[#7D6B93]",
  },
  discharged: {
    label: "Discharged",
    bg: "bg-[#EAF3F5]",
    text: "text-[#245D68]",
    border: "border-[#CCE0E4]",
    dot: "bg-[#337F8F]",
  },
};

function calculateAge(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [client, setClient] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [clientPackages, setClientPackages] = useState([]);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isIntakeShareModalOpen, setIsIntakeShareModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Package Purchase on behalf of client
  const [isPackagePickerOpen, setIsPackagePickerOpen] = useState(false);
  const [selectedPackageToBuy, setSelectedPackageToBuy] = useState(null);
  const [isPackageCheckoutOpen, setIsPackageCheckoutOpen] = useState(false);

  // Fetch client details, bookings, and purchased packages
  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      axiosInstance.get(`/clients/${id}`),
      axiosInstance.get("/scheduling/bookings"),
      axiosInstance.get("/packages/client-packages", { params: { clientId: id } }),
      axiosInstance.get("/packages", { params: { active: true } }),
    ])
      .then(([clientRes, bookingsRes, clientPkgRes, availPkgRes]) => {
        if (!isMounted) return;

        if (clientRes.status === "fulfilled" && clientRes.value.data?.success) {
          setClient(clientRes.value.data.data);
        } else {
          setErrorMessage(
            clientRes.reason?.response?.data?.message ||
              clientRes.reason?.message ||
              "Failed to load client details. The client may not exist or belongs to another practice."
          );
        }

        if (bookingsRes.status === "fulfilled" && bookingsRes.value.data?.success) {
          setBookings(bookingsRes.value.data.data || []);
          setCurrentTimestamp(Date.now());
        }

        if (clientPkgRes.status === "fulfilled" && clientPkgRes.value.data?.success) {
          setClientPackages(clientPkgRes.value.data.data || []);
        }

        if (availPkgRes.status === "fulfilled" && availPkgRes.value.data?.success) {
          setAvailablePackages(availPkgRes.value.data.data || []);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  // Filter bookings associated with this client
  const clientBookings = useMemo(() => {
    if (!client?.email) return [];
    const clientEmail = client.email.toLowerCase();
    return bookings
      .filter((b) => b.clientEmail && b.clientEmail.toLowerCase() === clientEmail)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }, [client, bookings]);

  const calculatedAge = calculateAge(client?.dateOfBirth);

  const handleEditSuccess = (updatedClient) => {
    setClient(updatedClient);
    setSuccessMessage("Client details updated successfully.");
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const handleDeleteClient = async () => {
    setIsDeleting(true);
    setDeleteError("");

    try {
      const response = await axiosInstance.delete(`/clients/${id}`);
      if (response.data && response.data.success) {
        navigate("/clients", {
          state: { notification: `Client "${client.name}" was successfully removed.` },
        });
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to delete client.";
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const statusConfig = client?.status
    ? STATUS_BADGES[client.status] || STATUS_BADGES.active
    : STATUS_BADGES.active;

  const intakeConfig = client?.intakeStatus
    ? INTAKE_BADGES[client.intakeStatus] || INTAKE_BADGES.not_sent
    : INTAKE_BADGES.not_sent;

  const consentConfig = client?.consentStatus
    ? CONSENT_BADGES[client.consentStatus] || CONSENT_BADGES.pending
    : CONSENT_BADGES.pending;

  const initials = client?.name
    ? client.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "CL";

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3">
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
                  Practice Workspace
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/schedule"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Schedule
            </Link>
            <Link
              to="/clients"
              className="text-xs font-semibold text-[#1B3B2B] bg-[#EBF3ED] border border-[#CDE3D5] px-3.5 py-1.5 rounded-lg transition-colors"
            >
              Clients
            </Link>
            <Link
              to="/packages"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Packages
            </Link>
            <Link
              to="/payments"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Billing
            </Link>
            <Link
              to="/profile"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Profile
            </Link>

            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-[#7D3232] hover:text-[#5F2424] bg-[#FDF4F4] hover:bg-[#FAE8E8] border border-[#F2D1D1] px-3 py-1.5 rounded-lg transition-colors cursor-pointer ml-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-xs text-[#717E76]">
            <Link to="/" className="hover:underline">
              Workspace
            </Link>
            <span>/</span>
            <Link to="/clients" className="hover:underline">
              Clients
            </Link>
            <span>/</span>
            <span className="text-[#1B3B2B] font-medium truncate max-w-[200px]">
              {client?.name || "Client Details"}
            </span>
          </div>

          <Link
            to="/clients"
            className="text-xs font-medium text-[#526358] hover:text-[#1B3B2B] inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to All Clients</span>
          </Link>
        </div>

        {/* Feedback Alerts */}
        {successMessage && (
          <Alert variant="success" message={successMessage} onClose={() => setSuccessMessage("")} />
        )}
        {errorMessage && (
          <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
        )}

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
            <span className="text-xs text-[#6F7D74]">Loading client profile...</span>
          </div>
        ) : !client ? (
          <div className="p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center">
            <h2 className="font-serif text-lg font-semibold text-[#14261D] mb-2">
              Client Not Found
            </h2>
            <p className="text-xs text-[#5E6D64] mb-4">
              This client record could not be loaded or was removed.
            </p>
            <Link
              to="/clients"
              className="px-4 py-2 text-xs font-medium bg-[#1B3B2B] text-white rounded-xl inline-block"
            >
              Return to Directory
            </Link>
          </div>
        ) : (
          <>
            {/* Top Client Profile Banner Card */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(27,59,43,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start sm:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] font-serif font-bold text-xl flex items-center justify-center shrink-0 border border-[#CDE3D5]">
                  {initials}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-serif text-2xl font-bold text-[#14261D]">
                      {client.name}
                    </h1>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                      {statusConfig.label}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${intakeConfig.bg} ${intakeConfig.text} ${intakeConfig.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${intakeConfig.dot}`}></span>
                      {intakeConfig.label}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${consentConfig.bg} ${consentConfig.text} ${consentConfig.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${consentConfig.dot}`}></span>
                      {consentConfig.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6F7D74]">
                    {client.occupation && <span>{client.occupation}</span>}
                    {client.pronouns && <span>({client.pronouns})</span>}
                    {client.createdAt && (
                      <span>
                        Client since {formatUtcDate(client.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
                <button
                  type="button"
                  onClick={() => setIsIntakeShareModalOpen(true)}
                  className="px-4 py-2 text-xs font-medium text-[#1B3B2B] bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#DCD4C7] rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>
                    {client.intakeStatus === "completed"
                      ? "Intake & Consent Completed"
                      : client.intakeStatus === "pending"
                      ? "Copy Intake Link"
                      : "Send Intake Link"}
                  </span>
                </button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(true)}
                  className="w-auto px-4 py-2 text-xs rounded-xl inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span>Edit Details</span>
                </Button>

                <button
                  type="button"
                  onClick={() => setIsBookingModalOpen(true)}
                  className="px-4 py-2 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Schedule Session</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setIsDeleteModalOpen(true);
                  }}
                  className="p-2 text-[#8C2828] hover:bg-[#FDF4F4] border border-transparent hover:border-[#F2D1D1] rounded-xl transition-colors cursor-pointer"
                  title="Delete Client"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Profile Grid: 2 Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Demographics & Contact */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                {/* Contact Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269] border-b border-[#EAE2D6] pb-2.5">
                    Contact Information
                  </h2>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[#7F8D84] block mb-0.5">Email Address</span>
                      <a
                        href={`mailto:${client.email}`}
                        className="font-medium text-[#1E4D32] hover:underline break-all"
                      >
                        {client.email}
                      </a>
                    </div>

                    <div>
                      <span className="text-[#7F8D84] block mb-0.5">Phone Number</span>
                      {client.phone ? (
                        <a
                          href={`tel:${client.phone}`}
                          className="font-medium text-[#1C2520] hover:underline"
                        >
                          {client.phone}
                        </a>
                      ) : (
                        <span className="text-[#9EA9A2] italic">Not provided</span>
                      )}
                    </div>

                    <div>
                      <span className="text-[#7F8D84] block mb-0.5">Preferred Language</span>
                      <span className="font-medium text-[#1C2520]">
                        {client.preferredLanguage || "English"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Demographics Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269] border-b border-[#EAE2D6] pb-2.5">
                    Demographics
                  </h2>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[#7F8D84] block mb-0.5">Date of Birth / Age</span>
                      {client.dateOfBirth ? (
                        <span className="font-medium text-[#1C2520]">
                          {formatUtcDate(client.dateOfBirth)}
                          {calculatedAge !== null && ` (${calculatedAge} years)`}
                        </span>
                      ) : (
                        <span className="text-[#9EA9A2] italic">Not specified</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[#7F8D84] block mb-0.5">Gender</span>
                        <span className="font-medium text-[#1C2520]">
                          {client.gender || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7F8D84] block mb-0.5">Pronouns</span>
                        <span className="font-medium text-[#1C2520]">
                          {client.pronouns || "—"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[#7F8D84] block mb-0.5">Occupation</span>
                      <span className="font-medium text-[#1C2520]">
                        {client.occupation || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269] border-b border-[#EAE2D6] pb-2.5">
                    Emergency Contact
                  </h2>

                  {client.emergencyContact?.name ? (
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[#7F8D84] block mb-0.5">Contact Person</span>
                        <span className="font-medium text-[#1C2520]">
                          {client.emergencyContact.name}{" "}
                          {client.emergencyContact.relationship &&
                            `(${client.emergencyContact.relationship})`}
                        </span>
                      </div>
                      {client.emergencyContact.phone && (
                        <div>
                          <span className="text-[#7F8D84] block mb-0.5">Phone</span>
                          <a
                            href={`tel:${client.emergencyContact.phone}`}
                            className="font-medium text-[#1E4D32] hover:underline"
                          >
                            {client.emergencyContact.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-[#9EA9A2] italic">
                      No emergency contact registered.
                    </span>
                  )}
                </div>

                {/* Address Card */}
                {client.address && (client.address.street || client.address.city) && (
                  <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269] border-b border-[#EAE2D6] pb-2.5">
                      Residential Address
                    </h2>
                    <div className="text-xs text-[#2A3830] leading-relaxed">
                      {client.address.street && <div>{client.address.street}</div>}
                      <div>
                        {[client.address.city, client.address.state, client.address.postalCode]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      {client.address.country && <div>{client.address.country}</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Clinical Context & Session History */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {/* Intake & Consent Workflow Status Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                        Digital Intake & Informed Consent
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsIntakeShareModalOpen(true)}
                      className="text-xs font-medium text-[#1B3B2B] hover:underline cursor-pointer"
                    >
                      {client.intakeStatus === "completed"
                        ? "Re-issue Intake Link →"
                        : client.intakeStatus === "pending"
                        ? "Copy Active Link →"
                        : "Send Intake Link →"}
                    </button>
                  </div>

                  {client.intakeStatus === "completed" ? (
                    <div className="space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#EBF3ED] border border-[#CDE3D5] rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#2A6543]"></span>
                          <span className="font-semibold text-[#1E4D32]">
                            Intake & Consent Completed
                          </span>
                        </div>
                        {client.intakeSubmittedAt && (
                          <span className="text-[11px] text-[#2A6543]">
                            Submitted on {formatUtcDate(client.intakeSubmittedAt)}
                          </span>
                        )}
                      </div>

                      {/* Signed Consent Record Audit */}
                      <div className="p-4 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#14261D]">
                            Informed Consent Agreement (v{client.consentRecord?.documentVersion || "1.0"})
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
                            Signed & Verified
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#55635B] pt-1">
                          <div>
                            <span className="text-[#8E9B93]">Digitally Signed By: </span>
                            <strong className="text-[#14261D]">
                              {client.consentRecord?.signedName || client.name}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[#8E9B93]">Timestamp: </span>
                            <span>
                              {client.consentRecord?.signedAt
                                ? new Date(client.consentRecord.signedAt).toLocaleString()
                                : "On file"}
                            </span>
                          </div>
                          {client.consentRecord?.ipAddress && (
                            <div className="sm:col-span-2">
                              <span className="text-[#8E9B93]">Audit IP: </span>
                              <span className="font-mono text-[10px]">
                                {client.consentRecord.ipAddress}
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="text-[10px] text-[#717E76] pt-1 italic">
                          Client verified scope of services, confidentiality limitations, 24h cancellation terms, billing policy, and emergency crisis protocols.
                        </p>
                      </div>
                    </div>
                  ) : client.intakeStatus === "pending" ? (
                    <div className="p-4 bg-[#FFF8E6] border border-[#F2E3B3] rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold text-[#8C6D1F]">
                          <span className="w-2 h-2 rounded-full bg-[#C49B28]"></span>
                          <span>Intake Link Active — Awaiting Client Submission</span>
                        </div>
                        <p className="text-[11px] text-[#786026] mt-0.5">
                          Invitation link was generated and is valid for 7 days. Once submitted, clinical notes and signature will appear here.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsIntakeShareModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-medium text-[#8C6D1F] bg-white border border-[#E8D49E] hover:bg-[#FFF5D6] rounded-lg transition-colors shrink-0 cursor-pointer"
                      >
                        Copy Link
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#FAF8F5] border border-[#E9DFD2] rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-[#3D4C42] block">
                          No digital intake workflow initiated
                        </span>
                        <p className="text-[11px] text-[#6F7D74] mt-0.5">
                          Generate a secure, single-use link for this client to complete their clinical background and digital consent before their appointment.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsIntakeShareModalOpen(true)}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors shrink-0 cursor-pointer"
                      >
                        Send Intake Link
                      </button>
                    </div>
                  )}
                </div>

                {/* Purchased Packages & Session Credits Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                      </div>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                        Purchased Packages & Session Credits ({clientPackages.length})
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsPackagePickerOpen(true)}
                      className="text-xs font-medium text-[#1B3B2B] hover:underline cursor-pointer"
                    >
                      + Sell / Assign Package →
                    </button>
                  </div>

                  {clientPackages.length === 0 ? (
                    <div className="p-4 bg-[#FAF8F5] border border-[#E9DFD2] rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-[#3D4C42] block">
                          No active session packages
                        </span>
                        <p className="text-[11px] text-[#6F7D74] mt-0.5">
                          This client currently has no prepaid package credits. Assign a bundle to enable automated credit-based bookings.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPackagePickerOpen(true)}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors shrink-0 cursor-pointer"
                      >
                        Assign Package
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clientPackages.map((cp) => {
                        const isExhausted = cp.status === "exhausted" || cp.remainingSessions <= 0;
                        const isExpired =
                          cp.status === "expired" ||
                          (cp.expiresAt ? Date.parse(cp.expiresAt) < currentTimestamp : false);
                        const progressPercent = Math.min(
                          100,
                          Math.round((cp.usedSessions / cp.totalSessions) * 100)
                        );

                        return (
                          <div
                            key={cp._id}
                            className="p-4 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl flex flex-col gap-3 text-xs"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <h4 className="font-serif font-medium text-sm text-[#14261D]">
                                  {cp.packageId?.title || "Session Package"}
                                </h4>
                                <p className="text-[11px] text-[#697970] mt-0.5">
                                  {cp.packageId?.durationMinutes || 60} mins per session · Purchased{" "}
                                  {formatUtcDate(cp.createdAt)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                    cp.status === "active" && !isExpired && !isExhausted
                                      ? "bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]"
                                      : isExhausted
                                      ? "bg-[#FFF8E6] text-[#8C6D1F] border border-[#F2E3B3]"
                                      : "bg-[#F3EFEA] text-[#717E76] border border-[#E0D8CB]"
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      cp.status === "active" && !isExpired && !isExhausted
                                        ? "bg-[#2A6543]"
                                        : isExhausted
                                        ? "bg-[#C49B28]"
                                        : "bg-[#8E9B93]"
                                    }`}
                                  ></span>
                                  {cp.status === "active" && !isExpired && !isExhausted
                                    ? "Active"
                                    : isExhausted
                                    ? "Exhausted"
                                    : "Expired"}
                                </span>

                                <span className="text-[11px] font-semibold text-[#1B3B2B] bg-white border border-[#D9D1C5] px-2.5 py-0.5 rounded-md">
                                  {cp.remainingSessions} / {cp.totalSessions} credits left
                                </span>
                              </div>
                            </div>

                            {/* Credit Usage Progress Bar */}
                            <div className="space-y-1">
                              <div className="w-full bg-[#E5DDCF] h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-[#1B3B2B] h-full transition-all duration-300"
                                  style={{ width: `${progressPercent}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[10px] text-[#717E76]">
                                <span>{cp.usedSessions} used</span>
                                <span>Valid until {formatUtcDate(cp.expiresAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Clinical Context Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                      Clinical & Intake Context
                    </h2>
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(true)}
                      className="text-xs font-medium text-[#1B3B2B] hover:underline cursor-pointer"
                    >
                      Edit Context →
                    </button>
                  </div>

                  {/* Presenting Concern */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                      Presenting Concern
                    </span>
                    <p className="text-xs sm:text-sm text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EDE5DA]">
                      {client.presentingConcern ||
                        "No presenting concern documented. Click 'Edit Context' or send intake form to add."}
                    </p>
                  </div>

                  {/* Relevant History */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                      Relevant History & Background
                    </span>
                    <p className="text-xs sm:text-sm text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EDE5DA]">
                      {client.relevantHistory ||
                        "No relevant history documented."}
                    </p>
                  </div>

                  {/* Medical Conditions & Mental Health History Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                        Medical History
                      </span>
                      <p className="text-xs text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE5DA] min-h-[60px]">
                        {client.medicalHistory || "None documented."}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                        Mental Health History
                      </span>
                      <p className="text-xs text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE5DA] min-h-[60px]">
                        {client.mentalHealthHistory || "None documented."}
                      </p>
                    </div>
                  </div>

                  {/* Current Medications */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                      Current Medications
                    </span>
                    <p className="text-xs text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE5DA]">
                      {client.currentMedications || "None reported."}
                    </p>
                  </div>

                  {/* Treatment Goals */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block">
                      Therapeutic Goals
                    </span>
                    <p className="text-xs sm:text-sm text-[#27382F] leading-relaxed bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EDE5DA]">
                      {client.goals || "No clinical goals established yet."}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="pt-2 border-t border-[#EAE2D6]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526358] block mb-2">
                      Tags & Modalities
                    </span>
                    {Array.isArray(client.tags) && client.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {client.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[#9EA9A2] italic">
                        No tags applied.
                      </span>
                    )}
                  </div>
                </div>

                {/* Clinical Documentation Notes Section (Module 5) */}
                <ClinicalNotesSection
                  clientId={id}
                  clientName={client.name}
                  clientBookings={clientBookings}
                />

                {/* Session History Card */}
                <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                      Appointment History ({clientBookings.length})
                    </h2>
                    <Link
                      to="/schedule?tab=appointments"
                      className="text-xs font-medium text-[#1B3B2B] hover:underline"
                    >
                      Manage Schedule →
                    </Link>
                  </div>

                  {clientBookings.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-xs text-[#6F7D74] mb-3">
                        No scheduled or completed appointments found for this client.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsBookingModalOpen(true)}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors inline-block cursor-pointer"
                      >
                        Book Appointment
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EAE2D6]">
                      {clientBookings.map((b) => {
                        const isFuture = Date.parse(b.startTime) > currentTimestamp;
                        const isConfirmed = b.status === "confirmed";

                        return (
                          <div
                            key={b._id}
                            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[#14261D]">
                                  {formatUtcDate(b.startTime)}
                                </span>
                                {isConfirmed ? (
                                  isFuture ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
                                      Upcoming
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0EAE2] text-[#55635B] border border-[#DDD5C7]">
                                      Past
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF4F4] text-[#8C2828] border border-[#F2D1D1]">
                                    Cancelled
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#6F7D74] block mt-0.5">
                                {formatUtcTimeRange12h(b.startTime, b.endTime)} ({b.duration} mins)
                              </span>
                            </div>

                            {b.clientNotes && (
                              <p className="text-[11px] text-[#717E76] italic max-w-xs truncate">
                                &quot;{b.clientNotes}&quot;
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Edit Client Modal */}
      <ClientFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        clientToEdit={client}
      />

      {/* Therapist Client-Specific Booking Modal */}
      <TherapistBookingModal
        client={client}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
          setSuccessMessage("Appointment scheduled successfully.");
          setTimeout(() => setSuccessMessage(""), 4000);
        }}
      />

      {/* Intake & Consent Share Modal */}
      <IntakeShareModal
        isOpen={isIntakeShareModalOpen}
        onClose={() => setIsIntakeShareModalOpen(false)}
        client={client}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Package Picker Modal */}
      {isPackagePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231B]/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
              <div>
                <h3 className="font-serif font-medium text-lg text-[#14261D]">
                  Select Package to Assign
                </h3>
                <p className="text-xs text-[#6F7D74]">
                  Assign a multi-session bundle to {client?.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPackagePickerOpen(false)}
                className="w-7 h-7 rounded-full bg-[#FAF7F2] hover:bg-[#EAE2D6] text-[#637269] flex items-center justify-center text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {availablePackages.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#6F7D74]">
                No active packages available. Please create a package in the{" "}
                <Link to="/packages" className="text-[#1B3B2B] font-medium underline">
                  Packages
                </Link>{" "}
                section first.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {availablePackages.map((pkg) => (
                  <div
                    key={pkg._id}
                    className="p-3.5 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl flex items-center justify-between gap-3 hover:border-[#1B3B2B]/40 transition-colors"
                  >
                    <div>
                      <h4 className="font-medium text-xs text-[#14261D]">{pkg.title}</h4>
                      <p className="text-[11px] text-[#697970] mt-0.5">
                        {pkg.sessionCount} Sessions · {pkg.durationMinutes} mins · {pkg.validityDays} Days
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-serif font-semibold text-xs text-[#1B3B2B]">
                        {formatPaiseToInr(pkg.price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPackageToBuy(pkg);
                          setIsPackagePickerOpen(false);
                          setIsPackageCheckoutOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#1B3B2B] text-white hover:bg-[#234E39] text-xs font-medium transition-colors cursor-pointer"
                      >
                        Select & Checkout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[#EAE2D6]">
              <button
                type="button"
                onClick={() => setIsPackagePickerOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Package Checkout Modal */}
      {selectedPackageToBuy && (
        <PackageCheckoutModal
          isOpen={isPackageCheckoutOpen}
          onClose={() => {
            setIsPackageCheckoutOpen(false);
            setSelectedPackageToBuy(null);
          }}
          packageData={selectedPackageToBuy}
          prefilledClient={client}
          isTherapistInitiated={true}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
            setSuccessMessage("Package credits successfully activated for this client.");
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
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
                  Delete Client Record?
                </h3>
                <p className="text-xs text-[#717E76]">
                  Are you sure you want to remove {client?.name}?
                </p>
              </div>
            </div>

            {deleteError && (
              <Alert variant="error" message={deleteError} />
            )}

            <p className="text-xs text-[#526358] leading-relaxed">
              This action cannot be undone. All demographic and clinical background records for this client will be deleted.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={handleDeleteClient}
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
