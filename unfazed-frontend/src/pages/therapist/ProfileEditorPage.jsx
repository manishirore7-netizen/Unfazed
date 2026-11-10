import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import TagInput from "../../components/common/TagInput";

export default function ProfileEditorPage() {
  const { therapist, updateTherapist } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    specializations: [],
    languages: [],
    email: "",
    slug: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 1. Fetch current profile on mount
  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get("/therapist/me");
        if (isMounted && response.data?.data) {
          const profile = response.data.data;
          setFormData({
            name: profile.name || "",
            bio: profile.bio || "",
            specializations: Array.isArray(profile.specializations)
              ? profile.specializations
              : [],
            languages: Array.isArray(profile.languages)
              ? profile.languages
              : [],
            email: profile.email || "",
            slug: profile.slug || "",
          });
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(
            err.response?.data?.message ||
              err.message ||
              "Unable to load profile. Please refresh."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Validate form fields
  const validate = () => {
    const errors = {};
    const trimmedName = formData.name.trim();

    if (!trimmedName) {
      errors.name = "Full name is required";
    } else if (trimmedName.length > 100) {
      errors.name = "Name cannot exceed 100 characters";
    }

    if (formData.bio && formData.bio.trim().length > 2500) {
      errors.bio = "Biography cannot exceed 2500 characters";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 3. Handle save
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const payload = {
        name: formData.name.trim(),
        bio: formData.bio.trim(),
        specializations: formData.specializations,
        languages: formData.languages,
      };

      const response = await axiosInstance.put("/therapist/me", payload);

      if (response.data && response.data.success) {
        const updated = response.data.data;
        // Update local state
        setFormData((prev) => ({
          ...prev,
          name: updated.name,
          bio: updated.bio,
          specializations: updated.specializations,
          languages: updated.languages,
        }));

        // Update global AuthContext state so dashboard and headers reflect changes
        updateTherapist(updated);

        setSuccessMessage("Your profile has been saved successfully.");
        // Scroll to top gently to view confirmation
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          "Failed to update profile. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4D5C53] hover:text-[#1B3B2B] transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span>Back to Workspace</span>
            </Link>

            <span className="text-[#D9D1C5] hidden sm:inline">|</span>

            <span className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] hidden sm:inline">
              Profile & Practice Details
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/clients"
              className="text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Clients
            </Link>
            <Link
              to="/schedule"
              className="text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Schedule & Availability
            </Link>
            <span className="text-xs text-[#717E76] hidden sm:inline">
              {therapist?.email}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10">
        {isLoading ? (
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <div className="w-9 h-9 rounded-xl bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2] mb-3 animate-pulse">
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
              Loading your profile details...
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-10 shadow-[0_8px_30px_rgb(27,59,43,0.04)]">
            {/* Header info */}
            <div className="mb-8 border-b border-[#EFE8DF] pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif text-[#152B20] tracking-tight">
                  Edit Therapist Profile
                </h1>
                <p className="text-xs sm:text-sm text-[#5B6A61] mt-1 leading-normal">
                  Customize your clinical identity, bio, therapeutic specializations, and languages.
                </p>
              </div>

              <div className="shrink-0">
                <Button
                  type="button"
                  onClick={handleSubmit}
                  isLoading={isSaving}
                  className="w-auto px-6 py-2.5 text-xs font-medium"
                >
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Notification Banners */}
            {successMessage && (
              <Alert
                type="success"
                message={successMessage}
                onClose={() => setSuccessMessage("")}
                className="mb-6"
              />
            )}

            {errorMessage && (
              <Alert
                type="error"
                message={errorMessage}
                onClose={() => setErrorMessage("")}
                className="mb-6"
              />
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
              {/* SECTION 1: Practice Identity */}
              <div className="flex flex-col gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1B3B2B] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1B3B2B]"></span>
                  <span>Practice Identity</span>
                </h2>

                <div className="grid grid-cols-1 gap-4">
                  {/* Name Input */}
                  <div>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      label="Professional Name"
                      placeholder="Dr. Eleanor Vance, PsyD"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, name: e.target.value }));
                        if (fieldErrors.name) {
                          setFieldErrors((prev) => ({ ...prev, name: "" }));
                        }
                      }}
                      error={fieldErrors.name}
                      maxLength={100}
                      required
                    />
                    <div className="flex justify-end text-[11px] text-[#7F8D84] mt-1">
                      <span>{formData.name.length}/100</span>
                    </div>
                  </div>

                  {/* Read-Only Account Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Email (Read-Only) */}
                    <div className="bg-[#FAF8F5] border border-[#EAE2D6] rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[#65736B]">
                            Account Email
                          </span>
                          <span className="text-[10px] bg-[#EBE4D8] text-[#55635B] px-1.5 py-0.5 rounded font-medium">
                            Read-only
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[#1A2820] break-all">
                          {formData.email}
                        </p>
                      </div>
                      <p className="text-[11px] text-[#7F8D84] mt-2">
                        Bound to your login credentials.
                      </p>
                    </div>

                    {/* Slug (Read-Only) */}
                    <div className="bg-[#FAF8F5] border border-[#EAE2D6] rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[#65736B]">
                            Public Booking Slug
                          </span>
                          <span className="text-[10px] bg-[#EBE4D8] text-[#55635B] px-1.5 py-0.5 rounded font-medium">
                            Read-only
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/${formData.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono font-medium text-[#245437] hover:underline break-all inline-flex items-center gap-1"
                          >
                            <span>/{formData.slug}</span>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#7F8D84] mt-2">
                        Assigned identifier for client booking.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Professional Biography */}
              <div className="flex flex-col gap-2 pt-4 border-t border-[#EFE8DF]">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="bio"
                    className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]"
                  >
                    Clinical Biography
                  </label>
                  <span className="text-[11px] text-[#7F8D84]">
                    {formData.bio.length}/2500
                  </span>
                </div>

                <textarea
                  id="bio"
                  name="bio"
                  rows="6"
                  maxLength={2500}
                  value={formData.bio}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, bio: e.target.value }));
                    if (fieldErrors.bio) {
                      setFieldErrors((prev) => ({ ...prev, bio: "" }));
                    }
                  }}
                  placeholder="Describe your background, therapeutic modalities (e.g. psychodynamic, somatic, ACT), philosophy of care, and who you work best with..."
                  className={`w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white resize-y ${
                    fieldErrors.bio
                      ? "border-[#D65454] focus:border-[#D65454] focus:ring-2 focus:ring-[#D65454]/15"
                      : "border-[#DCD4C7] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
                  }`}
                ></textarea>

                {fieldErrors.bio ? (
                  <p className="text-xs text-[#A23333] mt-0.5">
                    {fieldErrors.bio}
                  </p>
                ) : (
                  <p className="text-xs text-[#6F7D74] mt-0.5">
                    A thorough biography helps clients understand your therapeutic style.
                  </p>
                )}
              </div>

              {/* SECTION 3: Clinical Specializations */}
              <div className="pt-4 border-t border-[#EFE8DF]">
                <TagInput
                  label="Specializations & Focus Areas"
                  items={formData.specializations}
                  onChange={(updatedSpecializations) =>
                    setFormData((prev) => ({
                      ...prev,
                      specializations: updatedSpecializations,
                    }))
                  }
                  placeholder="e.g. Anxiety, CBT, Trauma, Relationship Issues..."
                  helperText="Press Enter, comma, or click 'Add' to attach a specialization tag."
                />
              </div>

              {/* SECTION 4: Languages Spoken */}
              <div className="pt-4 border-t border-[#EFE8DF]">
                <TagInput
                  label="Languages Spoken"
                  items={formData.languages}
                  onChange={(updatedLanguages) =>
                    setFormData((prev) => ({
                      ...prev,
                      languages: updatedLanguages,
                    }))
                  }
                  placeholder="e.g. English, Spanish, French, Hindi..."
                  helperText="Press Enter, comma, or click 'Add' to include languages offered in sessions."
                />
              </div>

              {/* Bottom Actions */}
              <div className="pt-6 border-t border-[#EFE8DF] flex flex-col sm:flex-row items-center justify-between gap-4">
                <Link
                  to="/"
                  className="text-xs font-medium text-[#5B6A61] hover:text-[#1B3B2B] underline-offset-4 hover:underline order-2 sm:order-1"
                >
                  Cancel and return to workspace
                </Link>

                <div className="w-full sm:w-auto order-1 sm:order-2">
                  <Button
                    type="submit"
                    isLoading={isSaving}
                    className="w-full sm:w-auto px-8"
                  >
                    Save Profile
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
