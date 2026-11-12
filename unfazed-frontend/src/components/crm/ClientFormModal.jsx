import { useState } from "react";
import axiosInstance from "../../api/axiosInstance";
import Alert from "../common/Alert";
import Button from "../common/Button";
import Input from "../common/Input";
import TagInput from "../common/TagInput";
import UpgradeModal from "../subscription/UpgradeModal";

const STATUS_OPTIONS = [
  { value: "active", label: "Active Client" },
  { value: "lead", label: "Intake Lead / Consultation" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "discharged", label: "Discharged" },
];

function ClientFormContent({ clientToEdit, onClose, onSuccess }) {
  const isEditMode = Boolean(clientToEdit);

  // Form Section Tabs
  const [activeSection, setActiveSection] = useState("essential"); // "essential" | "demographics" | "clinical"

  // Form State initialized directly from props without cascading renders
  const [formData, setFormData] = useState(() => {
    if (clientToEdit) {
      return {
        name: clientToEdit.name || "",
        email: clientToEdit.email || "",
        phone: clientToEdit.phone || "",
        status: clientToEdit.status || "active",
        tags: Array.isArray(clientToEdit.tags) ? clientToEdit.tags : [],
        dateOfBirth: clientToEdit.dateOfBirth
          ? new Date(clientToEdit.dateOfBirth).toISOString().split("T")[0]
          : "",
        gender: clientToEdit.gender || "",
        pronouns: clientToEdit.pronouns || "",
        preferredLanguage: clientToEdit.preferredLanguage || "English",
        occupation: clientToEdit.occupation || "",
        emergencyContact: {
          name: clientToEdit.emergencyContact?.name || "",
          relationship: clientToEdit.emergencyContact?.relationship || "",
          phone: clientToEdit.emergencyContact?.phone || "",
        },
        address: {
          street: clientToEdit.address?.street || "",
          city: clientToEdit.address?.city || "",
          state: clientToEdit.address?.state || "",
          postalCode: clientToEdit.address?.postalCode || "",
          country: clientToEdit.address?.country || "",
        },
        presentingConcern: clientToEdit.presentingConcern || "",
        relevantHistory: clientToEdit.relevantHistory || "",
        medicalHistory: clientToEdit.medicalHistory || "",
        mentalHealthHistory: clientToEdit.mentalHealthHistory || "",
        currentMedications: clientToEdit.currentMedications || "",
        goals: clientToEdit.goals || "",
      };
    }
    return {
      name: "",
      email: "",
      phone: "",
      status: "active",
      tags: [],
      dateOfBirth: "",
      gender: "",
      pronouns: "",
      preferredLanguage: "English",
      occupation: "",
      emergencyContact: {
        name: "",
        relationship: "",
        phone: "",
      },
      address: {
        street: "",
        city: "",
        state: "",
        postalCode: "",
        country: "",
      },
      presentingConcern: "",
      relevantHistory: "",
      medicalHistory: "",
      mentalHealthHistory: "",
      currentMedications: "",
      goals: "",
    };
  });

  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  // Validation
  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = "Client name is required.";
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!formData.email.trim()) {
      errors.email = "Client email is required.";
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleNestedChange = (group, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      setActiveSection("essential");
      return;
    }

    setIsSubmitting(true);
    setServerError("");

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        status: formData.status,
        tags: formData.tags,
        dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth : null,
        gender: formData.gender.trim(),
        pronouns: formData.pronouns.trim(),
        preferredLanguage: formData.preferredLanguage.trim(),
        occupation: formData.occupation.trim(),
        emergencyContact: formData.emergencyContact,
        address: formData.address,
        presentingConcern: formData.presentingConcern.trim(),
        relevantHistory: formData.relevantHistory.trim(),
        goals: formData.goals.trim(),
      };

      let response;
      if (isEditMode) {
        response = await axiosInstance.put(`/clients/${clientToEdit._id}`, payload);
      } else {
        response = await axiosInstance.post("/clients", payload);
      }

      if (response.data && response.data.success) {
        if (onSuccess) {
          onSuccess(response.data.data);
        }
        onClose();
      }
    } catch (err) {
      console.error("Client form submission error:", err);
      if (err.response?.status === 403 && err.response?.data?.code === "FEATURE_RESTRICTED") {
        const msg = err.response.data.message || "Active client limit reached for your plan.";
        setServerError(msg);
        setUpgradeMessage(msg);
      } else {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "An unexpected error occurred while saving the client.";
        setServerError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative w-full max-w-2xl bg-white border border-[#E8DFD3] rounded-2xl shadow-[0_20px_50px_rgba(27,59,43,0.15)] overflow-hidden my-8"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#EAE2D6] bg-[#FAF8F5]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-serif text-lg font-semibold text-[#14261D]">
              {isEditMode ? "Edit Client Profile" : "Add New Client"}
            </h2>
            <p className="text-xs text-[#5E6D64]">
              {isEditMode
                ? `Update information for ${clientToEdit.name}`
                : "Create a new client record in your practice directory."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#717E76] hover:text-[#1B3B2B] hover:bg-[#F2ECE4] transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-[#EAE2D6] px-6 bg-white gap-2 pt-2">
        <button
          type="button"
          onClick={() => setActiveSection("essential")}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeSection === "essential"
              ? "border-[#1B3B2B] text-[#1B3B2B] font-semibold"
              : "border-transparent text-[#6F7D74] hover:text-[#1B3B2B]"
          }`}
        >
          1. Essential Info
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("demographics")}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeSection === "demographics"
              ? "border-[#1B3B2B] text-[#1B3B2B] font-semibold"
              : "border-transparent text-[#6F7D74] hover:text-[#1B3B2B]"
          }`}
        >
          2. Demographics & Address
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("clinical")}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeSection === "clinical"
              ? "border-[#1B3B2B] text-[#1B3B2B] font-semibold"
              : "border-transparent text-[#6F7D74] hover:text-[#1B3B2B]"
          }`}
        >
          3. Clinical Context
        </button>
      </div>

      {/* Server Error Alert */}
      {serverError && (
        <div className="px-6 pt-4 space-y-2">
          {upgradeMessage ? (
            <div className="p-3.5 rounded-xl bg-[#FFF8E6] border border-[#F2E3B3] flex items-center justify-between gap-3 text-xs">
              <span className="text-[#8C6D1F] font-medium leading-relaxed">
                {upgradeMessage}
              </span>
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#8C6D1F] hover:bg-[#735817] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
              >
                Upgrade Plan
              </button>
            </div>
          ) : (
            <Alert variant="error" message={serverError} />
          )}
        </div>
      )}

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
        {/* SECTION 1: ESSENTIAL DETAILS */}
        {activeSection === "essential" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="client-name"
                name="name"
                label="Full Name"
                placeholder="e.g. Jane Cooper"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                error={formErrors.name}
                required
              />

              <Input
                id="client-email"
                name="email"
                type="email"
                label="Email Address"
                placeholder="jane.cooper@example.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                error={formErrors.email}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="client-phone"
                name="phone"
                type="tel"
                label="Phone Number"
                placeholder="+1 (555) 234-5678"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="client-status"
                  className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
                >
                  Client Status
                </label>
                <select
                  id="client-status"
                  value={formData.status}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <TagInput
              label="Tags / Modalities"
              placeholder="e.g. anxiety, cbt, student (press Enter)"
              items={formData.tags}
              onChange={(tags) => handleInputChange("tags", tags)}
              helperText="Use tags to categorize clinical focus, referrals, or client attributes."
            />
          </div>
        )}

        {/* SECTION 2: DEMOGRAPHICS & ADDRESS */}
        {activeSection === "demographics" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="client-dob"
                name="dateOfBirth"
                type="date"
                label="Date of Birth"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
              />

              <Input
                id="client-occupation"
                name="occupation"
                label="Occupation"
                placeholder="e.g. Software Engineer"
                value={formData.occupation}
                onChange={(e) => handleInputChange("occupation", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                id="client-gender"
                name="gender"
                label="Gender"
                placeholder="e.g. Female, Non-binary"
                value={formData.gender}
                onChange={(e) => handleInputChange("gender", e.target.value)}
              />

              <Input
                id="client-pronouns"
                name="pronouns"
                label="Pronouns"
                placeholder="e.g. she/her, they/them"
                value={formData.pronouns}
                onChange={(e) => handleInputChange("pronouns", e.target.value)}
              />

              <Input
                id="client-language"
                name="preferredLanguage"
                label="Preferred Language"
                placeholder="e.g. English, Hindi"
                value={formData.preferredLanguage}
                onChange={(e) => handleInputChange("preferredLanguage", e.target.value)}
              />
            </div>

            {/* Emergency Contact */}
            <div className="pt-2 border-t border-[#EAE2D6]">
              <h3 className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43] mb-3">
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  id="emergency-name"
                  name="emergencyContactName"
                  label="Contact Name"
                  placeholder="e.g. John Cooper"
                  value={formData.emergencyContact.name}
                  onChange={(e) =>
                    handleNestedChange("emergencyContact", "name", e.target.value)
                  }
                />
                <Input
                  id="emergency-rel"
                  name="emergencyContactRelationship"
                  label="Relationship"
                  placeholder="e.g. Spouse, Parent"
                  value={formData.emergencyContact.relationship}
                  onChange={(e) =>
                    handleNestedChange("emergencyContact", "relationship", e.target.value)
                  }
                />
                <Input
                  id="emergency-phone"
                  name="emergencyContactPhone"
                  type="tel"
                  label="Phone"
                  placeholder="+1 (555) 999-0000"
                  value={formData.emergencyContact.phone}
                  onChange={(e) =>
                    handleNestedChange("emergencyContact", "phone", e.target.value)
                  }
                />
              </div>
            </div>

            {/* Address */}
            <div className="pt-2 border-t border-[#EAE2D6]">
              <h3 className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43] mb-3">
                Residential Address
              </h3>
              <div className="space-y-3">
                <Input
                  id="addr-street"
                  name="street"
                  label="Street Address"
                  placeholder="e.g. 124 Park Avenue, Apt 4B"
                  value={formData.address.street}
                  onChange={(e) => handleNestedChange("address", "street", e.target.value)}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Input
                    id="addr-city"
                    name="city"
                    label="City"
                    placeholder="New York"
                    value={formData.address.city}
                    onChange={(e) => handleNestedChange("address", "city", e.target.value)}
                  />
                  <Input
                    id="addr-state"
                    name="state"
                    label="State / Province"
                    placeholder="NY"
                    value={formData.address.state}
                    onChange={(e) => handleNestedChange("address", "state", e.target.value)}
                  />
                  <Input
                    id="addr-postal"
                    name="postalCode"
                    label="Postal Code"
                    placeholder="10001"
                    value={formData.address.postalCode}
                    onChange={(e) => handleNestedChange("address", "postalCode", e.target.value)}
                  />
                  <Input
                    id="addr-country"
                    name="country"
                    label="Country"
                    placeholder="USA"
                    value={formData.address.country}
                    onChange={(e) => handleNestedChange("address", "country", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: CLINICAL CONTEXT */}
        {activeSection === "clinical" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="presenting-concern"
                className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
              >
                Presenting Concern
              </label>
              <textarea
                id="presenting-concern"
                rows={3}
                value={formData.presentingConcern}
                onChange={(e) => handleInputChange("presentingConcern", e.target.value)}
                placeholder="Primary reason client is seeking therapy (e.g. anxiety symptoms, life transitions, panic attacks)..."
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="relevant-history"
                className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
              >
                Relevant History & Background
              </label>
              <textarea
                id="relevant-history"
                rows={3}
                value={formData.relevantHistory}
                onChange={(e) => handleInputChange("relevantHistory", e.target.value)}
                placeholder="Key background context, family dynamics, or psychosocial history..."
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="medical-history"
                  className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
                >
                  Medical Conditions
                </label>
                <textarea
                  id="medical-history"
                  rows={2}
                  value={formData.medicalHistory}
                  onChange={(e) => handleInputChange("medicalHistory", e.target.value)}
                  placeholder="Chronic conditions, physical health issues..."
                  className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="mental-health-history"
                  className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
                >
                  Mental Health History
                </label>
                <textarea
                  id="mental-health-history"
                  rows={2}
                  value={formData.mentalHealthHistory}
                  onChange={(e) => handleInputChange("mentalHealthHistory", e.target.value)}
                  placeholder="Prior therapy, diagnoses, psychiatric care..."
                  className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="current-medications"
                className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
              >
                Current Medications
              </label>
              <input
                id="current-medications"
                type="text"
                value={formData.currentMedications}
                onChange={(e) => handleInputChange("currentMedications", e.target.value)}
                placeholder="Prescriptions, supplements, dosages..."
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="client-goals"
                className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
              >
                Therapeutic Goals
              </label>
              <textarea
                id="client-goals"
                rows={3}
                value={formData.goals}
                onChange={(e) => handleInputChange("goals", e.target.value)}
                placeholder="Client's desired treatment outcomes, coping skills to develop, or milestones to achieve..."
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
              />
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="pt-4 border-t border-[#EAE2D6] flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {activeSection !== "essential" && (
              <button
                type="button"
                onClick={() =>
                  setActiveSection(
                    activeSection === "clinical" ? "demographics" : "essential"
                  )
                }
                className="text-xs text-[#526257] hover:text-[#1B3B2B] font-medium px-3 py-2 rounded-lg hover:bg-[#F2ECE4] transition-colors cursor-pointer"
              >
                ← Back
              </button>
            )}
            {activeSection !== "clinical" && (
              <button
                type="button"
                onClick={() =>
                  setActiveSection(
                    activeSection === "essential" ? "demographics" : "clinical"
                  )
                }
                className="text-xs text-[#1B3B2B] font-medium px-3 py-2 rounded-lg hover:bg-[#EBF3ED] transition-colors cursor-pointer"
              >
                Next Section →
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="w-auto px-5 py-2.5 text-xs rounded-xl"
            >
              {isEditMode ? "Save Changes" : "Create Client"}
            </Button>
          </div>
        </div>
      </form>

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onUpgraded={() => {
          setIsUpgradeModalOpen(false);
          setServerError("");
          setUpgradeMessage("");
        }}
        title="Upgrade to Add More Active Clients"
        message={upgradeMessage}
        requiredTier="pro"
      />
    </div>
  );
}

export default function ClientFormModal({
  isOpen,
  onClose,
  onSuccess,
  clientToEdit = null,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231B]/50 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <ClientFormContent
        key={clientToEdit?._id || "new-client"}
        clientToEdit={clientToEdit}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </div>
  );
}
