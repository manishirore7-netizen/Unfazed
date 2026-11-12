import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Alert from "../../components/common/Alert";
import { formatPaiseToInr } from "../../utils/razorpay";
import { formatUtcDate } from "../../utils/dateHelpers";

export default function PaymentsPage() {
  const { logout } = useAuth();

  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({
    totalGrossPaise: 0,
    totalPlatformFeePaise: 0,
    totalNetEarningsPaise: 0,
    capturedCount: 0,
    createdCount: 0,
    failedCount: 0,
    refundedCount: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "captured" | "created" | "failed"
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const res = await axiosInstance.get("/payments");
      if (res.data?.success && res.data?.data) {
        setPayments(Array.isArray(res.data.data.payments) ? res.data.data.payments : []);
        if (res.data.data.summary) {
          setSummary(res.data.data.summary);
        }
      } else {
        setPayments([]);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to load payment history."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleDownloadInvoice = async (payment) => {
    try {
      setDownloadingInvoiceId(payment._id);
      setErrorMessage("");

      const response = await axiosInstance.get(`/payments/${payment._id}/invoice`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const fileName = `invoice-${payment.invoiceNumber || payment._id}.pdf`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(`Invoice ${payment.invoiceNumber || ""} downloaded successfully.`);
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          "Failed to download PDF invoice. Ensure payment is captured."
      );
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (activeTab === "all") return true;
    return p.status === activeTab;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "captured":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2A6543]"></span>
            Captured
          </span>
        );
      case "created":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#FFF8E6] text-[#8C6D1F] border border-[#F2E3B3]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C49B28]"></span>
            Pending
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#FDF4F4] text-[#8C2C2C] border border-[#F2D1D1]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C53030]"></span>
            Failed
          </span>
        );
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#F5F2F8] text-[#553C7B] border border-[#E1DAE8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7D5A9B]"></span>
            Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#F0EAE2] text-[#637269] border border-[#DDD5C7]">
            {status}
          </span>
        );
    }
  };

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
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
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
              className="text-xs font-semibold text-[#1B3B2B] bg-[#EBF3ED] border border-[#CDE3D5] px-3.5 py-1.5 rounded-lg transition-colors"
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
        {/* Title Bar */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-[#14261D]">
            Billing & Payments
          </h1>
          <p className="text-xs sm:text-sm text-[#5C6C62] mt-1">
            Real-time practice ledger, automated fee allocations, and official PDF invoice
            downloads.
          </p>
        </div>

        {/* Alerts */}
        {successMessage && (
          <Alert variant="success" message={successMessage} onClose={() => setSuccessMessage("")} />
        )}
        {errorMessage && (
          <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
        )}

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#738279]">
              Gross Revenue
            </span>
            <div className="mt-3">
              <span className="font-serif text-2xl font-semibold text-[#14261D]">
                {formatPaiseToInr(summary.totalGrossPaise)}
              </span>
              <span className="text-[11px] text-[#717E76] block mt-0.5">
                Total client payments captured
              </span>
            </div>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#738279]">
              Net Practice Earnings
            </span>
            <div className="mt-3">
              <span className="font-serif text-2xl font-semibold text-[#1B3B2B]">
                {formatPaiseToInr(summary.totalNetEarningsPaise)}
              </span>
              <span className="text-[11px] text-[#2E6B45] font-medium block mt-0.5">
                Allocated after platform fee & tax
              </span>
            </div>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#738279]">
              Platform Deductions
            </span>
            <div className="mt-3">
              <span className="font-serif text-2xl font-semibold text-[#665446]">
                {formatPaiseToInr(summary.totalPlatformFeePaise)}
              </span>
              <span className="text-[11px] text-[#717E76] block mt-0.5">
                Includes platform fees & GST
              </span>
            </div>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#738279]">
              Captured Transactions
            </span>
            <div className="mt-3">
              <span className="font-serif text-2xl font-semibold text-[#14261D]">
                {summary.capturedCount}
              </span>
              <span className="text-[11px] text-[#717E76] block mt-0.5">
                {summary.createdCount} pending · {summary.failedCount} failed
              </span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-[#E8DFD3] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "all"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            All Transactions ({payments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("captured")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "captured"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            Captured ({summary.capturedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("created")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "created"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            Pending ({summary.createdCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("failed")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "failed"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            Failed ({summary.failedCount})
          </button>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-[#E8DFD3] rounded-2xl shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-16 flex flex-col items-center justify-center gap-3">
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
              <span className="text-xs text-[#6F7D74]">Loading transaction ledger...</span>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-2">
              <p className="font-serif text-lg text-[#14261D]">No transactions found</p>
              <p className="text-xs text-[#6F7D74]">
                Transactions from online bookings and package purchases will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#EBE3D7] text-[#697A70] uppercase font-semibold text-[10px] tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Reference / Invoice</th>
                    <th className="py-3 px-4">Item & Description</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Gross Amount</th>
                    <th className="py-3 px-4">Net Payout</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2ECE3]">
                  {filteredPayments.map((p) => {
                    const isCaptured = p.status === "captured";
                    return (
                      <tr key={p._id} className="hover:bg-[#FCFAF7] transition-colors">
                        <td className="py-3.5 px-4 text-[#4C5C52] whitespace-nowrap">
                          {formatUtcDate(p.createdAt)}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-[#14261D] whitespace-nowrap">
                          <div>{p.invoiceNumber || p.razorpayPaymentId || "—"}</div>
                          <span className="text-[10px] text-[#8A9890] block">
                            {p.razorpayOrderId?.slice(0, 16) || p._id.slice(-8)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-[#14261D]">
                            {p.itemType === "package"
                              ? p.packageId?.title || "Session Package"
                              : "Single Therapy Session"}
                          </div>
                          <span className="text-[10px] text-[#718077] block">
                            {p.itemType === "package"
                              ? `${p.packageId?.sessionCount || "Multi"}-session bundle`
                              : `${p.bookingId?.duration || 60}-minute appointment`}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-[#14261D]">
                            {p.clientId?.name || "Client"}
                          </div>
                          <span className="text-[10px] text-[#718077] block">
                            {p.clientId?.email || "—"}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-medium text-[#14261D] whitespace-nowrap">
                          {formatPaiseToInr(p.amount)}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-[#1B3B2B] whitespace-nowrap">
                          {isCaptured ? formatPaiseToInr(p.netTherapistAmount) : "—"}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getStatusBadge(p.status)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {isCaptured ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadInvoice(p)}
                              disabled={downloadingInvoiceId === p._id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D9D1C5] hover:border-[#1B3B2B] text-xs font-medium text-[#1B3B2B] bg-white hover:bg-[#EBF3ED] transition-colors cursor-pointer"
                            >
                              {downloadingInvoiceId === p._id ? (
                                <svg
                                  className="animate-spin w-3.5 h-3.5 text-[#1B3B2B]"
                                  viewBox="0 0 24 24"
                                  fill="none"
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
                              ) : (
                                <svg
                                  className="w-3.5 h-3.5 text-[#1B3B2B]"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                              )}
                              <span>Invoice</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#A3AEA7] italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
