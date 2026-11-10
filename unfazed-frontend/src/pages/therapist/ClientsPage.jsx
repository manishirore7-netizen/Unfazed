import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import ClientFormModal from "../../components/crm/ClientFormModal";
import { formatUtcDate } from "../../utils/dateHelpers";

const STATUS_BADGES = {
  active: {
    label: "Active",
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

export default function ClientsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Clients & Bookings state
  const [clients, setClients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [bookings, setBookings] = useState([]);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

  // Filter & Query states
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sortOption, setSortOption] = useState("created_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // UI & Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // reset to page 1 on new search
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch clients from GET /api/clients
  useEffect(() => {
    let isMounted = true;

    const params = {
      page: currentPage,
      limit,
      sort: sortOption,
    };

    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }
    if (statusFilter) {
      params.status = statusFilter;
    }
    if (tagFilter) {
      params.tag = tagFilter;
    }

    Promise.allSettled([
      axiosInstance.get("/clients", { params }),
      axiosInstance.get("/scheduling/bookings"),
    ])
      .then(([clientsRes, bookingsRes]) => {
        if (!isMounted) return;

        if (clientsRes.status === "fulfilled") {
          const resData = clientsRes.value.data;
          if (resData?.success && Array.isArray(resData?.data)) {
            setClients(resData.data);
            setTotalCount(resData.total ?? resData.count ?? 0);
            setTotalPages(resData.totalPages || 1);
          } else {
            setErrorMessage("Unexpected data format received from clients API.");
          }
        } else {
          setErrorMessage(
            clientsRes.reason.response?.data?.message ||
              clientsRes.reason.message ||
              "Failed to load clients."
          );
        }

        if (bookingsRes.status === "fulfilled") {
          const bData = bookingsRes.value.data;
          if (bData?.success && Array.isArray(bData?.data)) {
            setBookings(bData.data);
            setCurrentTimestamp(Date.now());
          }
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
  }, [currentPage, limit, sortOption, debouncedSearch, statusFilter, tagFilter, refreshKey]);

  // Compute Last Session map by client email
  const clientSessionMap = useMemo(() => {
    const map = new Map();

    bookings.forEach((b) => {
      if (!b.clientEmail || b.status === "cancelled") return;
      const email = b.clientEmail.toLowerCase();
      const sessionTime = new Date(b.startTime).getTime();

      const existing = map.get(email) || { lastPast: null, nextUpcoming: null };

      if (sessionTime <= currentTimestamp) {
        if (!existing.lastPast || sessionTime > existing.lastPast) {
          existing.lastPast = sessionTime;
          existing.lastPastBooking = b;
        }
      } else {
        if (!existing.nextUpcoming || sessionTime < existing.nextUpcoming) {
          existing.nextUpcoming = sessionTime;
          existing.nextUpcomingBooking = b;
        }
      }

      map.set(email, existing);
    });

    return map;
  }, [bookings, currentTimestamp]);

  // Extract all distinct tags for quick tag filter dropdown
  const allAvailableTags = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((t) => set.add(t));
      }
    });
    return Array.from(set).sort();
  }, [clients]);

  // Calculate status statistics
  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === "active").length;
    const leads = clients.filter((c) => c.status === "lead").length;
    const inactive = clients.filter(
      (c) => c.status === "inactive" || c.status === "archived" || c.status === "discharged"
    ).length;
    return { active, leads, inactive };
  }, [clients]);

  const handleOpenAddModal = () => {
    setClientToEdit(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (client, e) => {
    if (e) e.stopPropagation();
    setClientToEdit(client);
    setIsFormModalOpen(true);
  };

  const handleModalSuccess = (savedClient) => {
    setSuccessMessage(
      clientToEdit
        ? `Client "${savedClient.name}" updated successfully.`
        : `Client "${savedClient.name}" created successfully.`
    );
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("");
    setTagFilter("");
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() || statusFilter || tagFilter
  );

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Top Practice Navigation Header */}
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
        {/* Breadcrumb & Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs text-[#717E76]">
              <Link to="/" className="hover:underline">
                Workspace
              </Link>
              <span>/</span>
              <span className="text-[#1B3B2B] font-medium">Clients</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif text-[#14261D] tracking-tight">
              Client Management
            </h1>
            <p className="text-xs sm:text-sm text-[#4E5C53]">
              Manage patient demographics, intake details, clinical context, and session histories.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleOpenAddModal}
              className="w-auto px-4 py-2.5 text-xs rounded-xl shadow-xs inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Client</span>
            </Button>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <Alert variant="success" message={successMessage} onClose={() => setSuccessMessage("")} />
        )}

        {/* Error Alert */}
        {errorMessage && (
          <Alert
            variant="error"
            message={errorMessage}
            onClose={() => setErrorMessage("")}
          />
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-[#E9DFD2] rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#738278] block">
              Total Clients
            </span>
            <span className="font-serif text-2xl font-bold text-[#152B20] mt-1 block">
              {totalCount}
            </span>
          </div>

          <div className="bg-white border border-[#E9DFD2] rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2A6543] block">
              Active Clients
            </span>
            <span className="font-serif text-2xl font-bold text-[#1E4D32] mt-1 block">
              {stats.active}
            </span>
          </div>

          <div className="bg-white border border-[#E9DFD2] rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9C7924] block">
              Intake Leads
            </span>
            <span className="font-serif text-2xl font-bold text-[#8C6D1F] mt-1 block">
              {stats.leads}
            </span>
          </div>

          <div className="bg-white border border-[#E9DFD2] rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#69786F] block">
              Inactive / Archived
            </span>
            <span className="font-serif text-2xl font-bold text-[#4E5C53] mt-1 block">
              {stats.inactive}
            </span>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white border border-[#E9DFD2] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8E9B93]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients by name, email, or phone..."
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8E9B93] hover:text-[#1B3B2B] cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#24332B] focus:outline-none focus:border-[#1B3B2B] focus:bg-white cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="lead">Intake Lead</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
                <option value="discharged">Discharged</option>
              </select>

              {/* Tag Filter */}
              {allAvailableTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#24332B] focus:outline-none focus:border-[#1B3B2B] focus:bg-white cursor-pointer"
                >
                  <option value="">All Tags</option>
                  {allAvailableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      #{tag}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort Order */}
              <select
                value={sortOption}
                onChange={(e) => {
                  setSortOption(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#24332B] focus:outline-none focus:border-[#1B3B2B] focus:bg-white cursor-pointer"
              >
                <option value="created_desc">Newest Added</option>
                <option value="created_asc">Oldest Added</option>
                <option value="name_asc">Name (A – Z)</option>
                <option value="name_desc">Name (Z – A)</option>
              </select>

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3 py-2 text-xs font-medium text-[#7D3232] hover:text-[#5F2424] bg-[#FDF4F4] hover:bg-[#FAE8E8] border border-[#F2D1D1] rounded-xl transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Client Table / Content */}
        <div className="bg-white border border-[#E9DFD2] rounded-2xl shadow-[0_8px_30px_rgb(27,59,43,0.03)] overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <svg
                className="animate-spin h-6 w-6 text-[#1B3B2B]"
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
              <span className="text-xs text-[#6F7D74]">Loading client directory...</span>
            </div>
          ) : clients.length === 0 ? (
            /* Empty State */
            <div className="p-12 sm:p-16 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center mb-4">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>

              {hasActiveFilters ? (
                <>
                  <h3 className="font-serif text-lg font-semibold text-[#14261D] mb-1">
                    No clients match your filter criteria
                  </h3>
                  <p className="text-xs text-[#5E6D64] max-w-sm mb-5">
                    We couldn&apos;t find any clients matching &quot;{debouncedSearch || statusFilter || tagFilter}&quot;. Try resetting your filters.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-4 py-2 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-xl transition-colors cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-serif text-lg font-semibold text-[#14261D] mb-1">
                    No clients added yet
                  </h3>
                  <p className="text-xs text-[#5E6D64] max-w-sm mb-5">
                    Get started by adding your first client or letting patients book through your public calendar.
                  </p>
                  <Button
                    type="button"
                    onClick={handleOpenAddModal}
                    className="w-auto px-5 py-2.5 text-xs rounded-xl inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add First Client</span>
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* Client Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#EAE2D6] text-[#637269] font-medium uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-6">Client</th>
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Tags</th>
                    <th className="py-3.5 px-4">Last / Next Session</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE2D6]">
                  {clients.map((client) => {
                    const statusConfig = STATUS_BADGES[client.status] || STATUS_BADGES.active;
                    const sessionInfo = clientSessionMap.get(client.email.toLowerCase());

                    // Generate avatar initials
                    const initials = client.name
                      ? client.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "CL";

                    return (
                      <tr
                        key={client._id}
                        onClick={() => navigate(`/clients/${client._id}`)}
                        className="hover:bg-[#FAF8F5]/80 transition-colors cursor-pointer group"
                      >
                        {/* Name & Avatar */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#EBF3ED] text-[#1B3B2B] font-semibold text-xs flex items-center justify-center shrink-0 border border-[#CDE3D5]">
                              {initials}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm text-[#14261D] group-hover:text-[#1B3B2B] transition-colors">
                                {client.name}
                              </span>
                              <span className="text-[11px] text-[#717E76]">
                                {client.pronouns || client.occupation || "Client"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact details */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#2F3E35] font-medium break-all">
                              {client.email}
                            </span>
                            {client.phone && (
                              <span className="text-[11px] text-[#717E76]">
                                {client.phone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}
                            ></span>
                            {statusConfig.label}
                          </span>
                        </td>

                        {/* Tags */}
                        <td className="py-4 px-4">
                          {Array.isArray(client.tags) && client.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {client.tags.slice(0, 2).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#F3EFEA] text-[#4E5C53] border border-[#E5DCD0]"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {client.tags.length > 2 && (
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] text-[#717E76] bg-[#FAF8F5]">
                                  +{client.tags.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#9EA9A2]">—</span>
                          )}
                        </td>

                        {/* Last / Next Session */}
                        <td className="py-4 px-4">
                          {sessionInfo?.lastPast ? (
                            <div className="flex flex-col">
                              <span className="text-[#23352B] font-medium">
                                {formatUtcDate(
                                  sessionInfo.lastPastBooking.startTime
                                )}
                              </span>
                              <span className="text-[10px] text-[#717E76]">
                                Past session
                              </span>
                            </div>
                          ) : sessionInfo?.nextUpcoming ? (
                            <div className="flex flex-col">
                              <span className="text-[#1E4D32] font-medium">
                                {formatUtcDate(
                                  sessionInfo.nextUpcomingBooking.startTime
                                )}
                              </span>
                              <span className="text-[10px] text-[#2A6543]">
                                Upcoming session
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#8E9B93]">
                              No sessions yet
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/clients/${client._id}`);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] rounded-lg transition-colors cursor-pointer"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditModal(client, e)}
                              className="p-1.5 text-[#5D6D63] hover:text-[#1B3B2B] hover:bg-[#F2ECE4] rounded-lg transition-colors cursor-pointer"
                              title="Edit client"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Toolbar */}
          {!isLoading && clients.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#EAE2D6] bg-[#FAF8F5]">
              <div className="text-xs text-[#6F7D74]">
                Showing{" "}
                <span className="font-semibold text-[#1C2520]">
                  {(currentPage - 1) * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-[#1C2520]">
                  {Math.min(currentPage * limit, totalCount)}
                </span>{" "}
                of <span className="font-semibold text-[#1C2520]">{totalCount}</span> clients
              </div>

              <div className="flex items-center gap-2">
                {/* Page Size Selector */}
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-[#DCD4C7] text-[#24332B] focus:outline-none cursor-pointer"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>

                {/* Page Navigation */}
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D9D1C5] text-[#242E28] bg-white hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Previous
                </button>

                <span className="text-xs font-medium text-[#4D5C53] px-1">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D9D1C5] text-[#242E28] bg-white hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit Client Modal */}
      <ClientFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={handleModalSuccess}
        clientToEdit={clientToEdit}
      />
    </div>
  );
}
