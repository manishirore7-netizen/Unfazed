import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import PackageFormModal from "../../components/payments/PackageFormModal";
import { formatPaiseToInr } from "../../utils/razorpay";

export default function PackagesPage() {
  const { logout } = useAuth();

  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [activeTab, setActiveTab] = useState("all"); // "all" | "active" | "inactive"

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);

  const fetchPackages = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const res = await axiosInstance.get("/packages");
      if (res.data?.success && Array.isArray(res.data.data)) {
        setPackages(res.data.data);
      } else {
        setPackages([]);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to load session packages."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingPackage(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pkg) => {
    setEditingPackage(pkg);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (pkg) => {
    try {
      const res = await axiosInstance.put(`/packages/${pkg._id}`, {
        isActive: !pkg.isActive,
      });
      if (res.data?.success) {
        setSuccessMessage(
          `Package "${pkg.title}" is now ${!pkg.isActive ? "active" : "deactivated"}.`
        );
        fetchPackages();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to update package status."
      );
    }
  };

  const handleDeletePackage = async (pkg) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${pkg.title}"? If client purchase records exist, it will be safely deactivated instead of deleted.`
    );
    if (!confirmed) return;

    try {
      const res = await axiosInstance.delete(`/packages/${pkg._id}`);
      if (res.data?.success) {
        setSuccessMessage(res.data.message || "Package deleted or deactivated.");
        fetchPackages();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to delete package."
      );
    }
  };

  const filteredPackages = packages.filter((pkg) => {
    if (activeTab === "active") return pkg.isActive;
    if (activeTab === "inactive") return !pkg.isActive;
    return true;
  });

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
              className="text-xs font-semibold text-[#1B3B2B] bg-[#EBF3ED] border border-[#CDE3D5] px-3.5 py-1.5 rounded-lg transition-colors"
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
              to="/analytics"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-3 py-1.5 rounded-lg transition-colors"
            >
              Analytics
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-medium text-[#14261D]">
              Session Packages
            </h1>
            <p className="text-xs sm:text-sm text-[#5C6C62] mt-1">
              Create, price, and manage multi-session bundles with automated credit tracking and
              validity.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleOpenCreateModal}
            className="w-auto px-5 py-2.5 text-xs font-medium shadow-xs"
          >
            + Create New Package
          </Button>
        </div>

        {/* Alerts */}
        {successMessage && (
          <Alert variant="success" message={successMessage} onClose={() => setSuccessMessage("")} />
        )}
        {errorMessage && (
          <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
        )}

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
            All Packages ({packages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "active"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            Active ({packages.filter((p) => p.isActive).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("inactive")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === "inactive"
                ? "bg-[#1B3B2B] text-white"
                : "text-[#596B60] hover:text-[#1B3B2B] hover:bg-[#F2ECE4]"
            }`}
          >
            Inactive ({packages.filter((p) => !p.isActive).length})
          </button>
        </div>

        {/* Content State */}
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
            <span className="text-xs text-[#6F7D74]">Loading session packages...</span>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-serif font-medium text-lg text-[#14261D]">
                {activeTab === "all" ? "No session packages created yet" : "No packages match filter"}
              </h3>
              <p className="text-xs text-[#6F7D74] mt-1 max-w-sm">
                Create packages to allow your clients to buy bundles in advance with automated
                credit deduction.
              </p>
            </div>
            {activeTab === "all" && (
              <Button
                type="button"
                variant="primary"
                onClick={handleOpenCreateModal}
                className="w-auto px-5 py-2 text-xs"
              >
                Create Your First Package
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackages.map((pkg) => (
              <div
                key={pkg._id}
                className={`bg-white border rounded-2xl p-6 flex flex-col justify-between shadow-xs transition-all ${
                  pkg.isActive
                    ? "border-[#E8DFD3] hover:border-[#C4DCB5]"
                    : "border-[#ECE5DA] opacity-75 bg-[#FAF9F7]"
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                        pkg.isActive
                          ? "bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]"
                          : "bg-[#F3EFEA] text-[#717E76] border border-[#E0D8CB]"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          pkg.isActive ? "bg-[#2A6543]" : "bg-[#8E9B93]"
                        }`}
                      ></span>
                      {pkg.isActive ? "Active" : "Inactive"}
                    </span>

                    {pkg.discountPercentage > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FAF0E6] text-[#78471A] border border-[#EBD4C1]">
                        {pkg.discountPercentage}% OFF
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="font-serif font-medium text-lg text-[#14261D] leading-snug">
                      {pkg.title}
                    </h3>
                    {pkg.description && (
                      <p className="text-xs text-[#596960] mt-1 line-clamp-2 leading-relaxed">
                        {pkg.description}
                      </p>
                    )}
                  </div>

                  {/* Structural Badges */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F2ECE3] text-xs">
                    <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#EAE2D6]">
                      <span className="text-[10px] text-[#78887F] block">Sessions</span>
                      <strong className="text-sm font-semibold text-[#14261D]">
                        {pkg.sessionCount} Sessions
                      </strong>
                    </div>

                    <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#EAE2D6]">
                      <span className="text-[10px] text-[#78887F] block">Duration</span>
                      <strong className="text-sm font-semibold text-[#14261D]">
                        {pkg.durationMinutes} mins / session
                      </strong>
                    </div>
                  </div>

                  <div className="text-xs text-[#6F7D74] flex justify-between items-center px-1">
                    <span>Validity Window:</span>
                    <strong className="text-[#14261D]">{pkg.validityDays} Days</strong>
                  </div>
                </div>

                {/* Price and Actions */}
                <div className="pt-5 mt-5 border-t border-[#F2ECE3] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#78887F] block uppercase tracking-wider">
                      Price (Paise-backed)
                    </span>
                    <span className="font-serif text-xl font-semibold text-[#1B3B2B]">
                      {formatPaiseToInr(pkg.price)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(pkg)}
                      title={pkg.isActive ? "Deactivate package" : "Activate package"}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#D9D1C5] text-[#4F6056] hover:bg-[#F2ECE4] transition-colors cursor-pointer"
                    >
                      {pkg.isActive ? "Deactivate" : "Activate"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(pkg)}
                      title="Edit Package"
                      className="p-1.5 rounded-lg border border-[#D9D1C5] text-[#1B3B2B] hover:bg-[#EBF3ED] transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePackage(pkg)}
                      title="Delete or safely deactivate package"
                      className="p-1.5 rounded-lg border border-[#F2D1D1] text-[#8C2C2C] hover:bg-[#FDF4F4] transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Package Form Modal */}
      <PackageFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        packageData={editingPackage}
        onSuccess={() => {
          setSuccessMessage(
            editingPackage ? "Package updated successfully." : "New package created successfully."
          );
          fetchPackages();
        }}
      />
    </div>
  );
}
