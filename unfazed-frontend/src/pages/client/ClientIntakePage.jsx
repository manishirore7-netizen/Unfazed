import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";

export default function ClientIntakePage() {
  const { token } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false);
  const [submittedTimestamp, setSubmittedTimestamp] = useState("");
  const [portalToken, setPortalToken] = useState("");
  const [currentDateFormatted] = useState(() => new Date().toLocaleDateString());

  // Loaded intake form data
  const [therapist, setTherapist] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    pronouns: "",
    preferredLanguage: "English",
    occupation: "",
    address: {
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
    },
    emergencyContact: {
      name: "",
      relationship: "",
      phone: "",
    },
    presentingConcern: "",
    medicalHistory: "",
    mentalHealthHistory: "",
    currentMedications: "",
    goals: "",
    consentAgreed: false,
    signatureName: "",
  });

  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    let isMounted = true;

    axiosInstance
      .get(`/intake/${token}`)
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && res.data?.data) {
          const { client, therapist: thData } = res.data.data;
          setTherapist(thData);
          setFormData((prev) => ({
            ...prev,
            name: client.name || "",
            email: client.email || "",
            phone: client.phone || "",
            dateOfBirth: client.dateOfBirth
              ? new Date(client.dateOfBirth).toISOString().split("T")[0]
              : "",
            gender: client.gender || "",
            pronouns: client.pronouns || "",
            preferredLanguage: client.preferredLanguage || "English",
            occupation: client.occupation || "",
            address: {
              street: client.address?.street || "",
              city: client.address?.city || "",
              state: client.address?.state || "",
              postalCode: client.address?.postalCode || "",
              country: client.address?.country || "",
            },
            emergencyContact: {
              name: client.emergencyContact?.name || "",
              relationship: client.emergencyContact?.relationship || "",
              phone: client.emergencyContact?.phone || "",
            },
            presentingConcern: client.presentingConcern || "",
            medicalHistory: client.medicalHistory || "",
            mentalHealthHistory: client.mentalHealthHistory || "",
            currentMedications: client.currentMedications || "",
            goals: client.goals || "",
            signatureName: client.name || "",
          }));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;

        if (status === 410 || err.response?.data?.expired) {
          setIsExpired(true);
        } else if (err.response?.data?.alreadyCompleted) {
          setIsAlreadyCompleted(true);
        } else {
          setErrorMessage(msg || "Unable to load intake invitation. Link may be invalid or expired.");
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
  }, [token]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValidationError("");

    if (name.startsWith("address.")) {
      const field = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        address: { ...prev.address, [field]: value },
      }));
    } else if (name.startsWith("emergencyContact.")) {
      const field = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        emergencyContact: { ...prev.emergencyContact, [field]: value },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError("");

    if (!formData.name.trim()) {
      setValidationError("Please provide your full name.");
      return;
    }

    if (!formData.consentAgreed) {
      setValidationError("You must review and agree to the practice informed consent terms to submit.");
      return;
    }

    if (!formData.signatureName.trim()) {
      setValidationError("Please provide your typed digital signature.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender.trim(),
        pronouns: formData.pronouns.trim(),
        preferredLanguage: formData.preferredLanguage.trim(),
        occupation: formData.occupation.trim(),
        address: formData.address,
        emergencyContact: formData.emergencyContact,
        presentingConcern: formData.presentingConcern.trim(),
        medicalHistory: formData.medicalHistory.trim(),
        mentalHealthHistory: formData.mentalHealthHistory.trim(),
        currentMedications: formData.currentMedications.trim(),
        goals: formData.goals.trim(),
        consentAgreed: formData.consentAgreed,
        signatureName: formData.signatureName.trim(),
      };

      const res = await axiosInstance.post(`/intake/${token}/submit`, payload);
      if (res.data?.success) {
        setSubmittedTimestamp(new Date().toLocaleString());
        if (res.data?.data?.portalToken) {
          setPortalToken(res.data.data.portalToken);
        }
        setIsSubmittedSuccessfully(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "An error occurred while submitting your intake form. Please try again.";
      setValidationError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Client Header */}
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
                Client Intake & Consent Portal
              </span>
            </div>
          </div>

          {therapist && (
            <div className="text-right">
              <span className="text-xs font-semibold text-[#14261D] block">
                {therapist.practiceName || therapist.name}
              </span>
              <span className="text-[10px] text-[#6F7D74]">
                {therapist.title || "Mental Health Practitioner"}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
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
            <span className="text-xs text-[#6F7D74]">
              Loading your intake questionnaire & consent form...
            </span>
          </div>
        ) : isExpired ? (
          <div className="p-12 sm:p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF8E6] text-[#8C6D1F] flex items-center justify-center mx-auto border border-[#F2E3B3]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl font-bold text-[#14261D]">
              Intake Invitation Expired
            </h2>
            <p className="text-xs sm:text-sm text-[#5E6D64] max-w-md mx-auto leading-relaxed">
              For your privacy and security, intake invitation links expire after 7 days. Please reach out to your therapist to request a new link.
            </p>
          </div>
        ) : isAlreadyCompleted ? (
          <div className="p-12 sm:p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mx-auto border border-[#CDE3D5]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-serif text-xl font-bold text-[#14261D]">
              Intake Form Already Completed
            </h2>
            <p className="text-xs sm:text-sm text-[#5E6D64] max-w-md mx-auto leading-relaxed">
              Your intake questionnaire and digital consent document have already been submitted and securely filed with your therapist.
            </p>
            <div className="pt-2">
              <Link
                to={`/portal/${token}`}
                className="px-5 py-2.5 text-xs font-medium text-white bg-[#1B3B2B] hover:bg-[#234E39] rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <span>View Client Portal & Shared Care Notes →</span>
              </Link>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="p-12 sm:p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[#FDF4F4] text-[#8C2828] flex items-center justify-center mx-auto border border-[#F2D1D1]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl font-bold text-[#14261D]">
              Invalid Invitation Link
            </h2>
            <p className="text-xs sm:text-sm text-[#5E6D64] max-w-md mx-auto leading-relaxed">
              {errorMessage}
            </p>
          </div>
        ) : isSubmittedSuccessfully ? (
          <div className="p-12 sm:p-16 bg-white border border-[#E9DFD2] rounded-2xl text-center space-y-5 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mx-auto border border-[#CDE3D5]">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#14261D]">
              Intake & Consent Submitted!
            </h1>
            <p className="text-xs sm:text-sm text-[#4E5C53] max-w-lg mx-auto leading-relaxed">
              Thank you, <strong className="text-[#1B3B2B]">{formData.name}</strong>. Your clinical history, intake questionnaire, and signed consent agreement have been securely submitted to{" "}
              <strong>{therapist?.practiceName || therapist?.name || "your therapist"}</strong>.
            </p>
            <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#EDE5DA] max-w-md mx-auto text-xs text-[#6F7D74] text-left space-y-1">
              <div>
                <span className="font-semibold text-[#14261D]">Document: </span>
                Informed Consent Agreement v1.0
              </div>
              <div>
                <span className="font-semibold text-[#14261D]">Digitally signed by: </span>
                {formData.signatureName}
              </div>
              <div>
                <span className="font-semibold text-[#14261D]">Timestamp: </span>
                {submittedTimestamp}
              </div>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={portalToken ? `/portal/${portalToken}` : `/portal/${token}`}
                className="px-5 py-2.5 text-xs font-medium text-white bg-[#1B3B2B] hover:bg-[#234E39] rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <span>Access Client Portal & Shared Care Notes →</span>
              </Link>
            </div>
            <p className="text-[11px] text-[#8E9B93]">
              You may bookmark your client portal link to access future shared notes and session takeaways.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* Intro Banner Card */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(27,59,43,0.03)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1B3B2B] bg-[#EBF3ED] px-2.5 py-1 rounded-full border border-[#CDE3D5] inline-block mb-3">
                Confidential Client Intake
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14261D] tracking-tight">
                Welcome to {therapist?.practiceName || therapist?.name}
              </h1>
              <p className="text-xs sm:text-sm text-[#4E5C53] mt-2 leading-relaxed max-w-2xl">
                Please complete this confidential intake form and review the informed consent agreement prior to your session. Your responses allow your therapist to understand your needs and provide the highest standard of care.
              </p>
            </div>

            {validationError && (
              <Alert variant="error" message={validationError} onClose={() => setValidationError("")} />
            )}

            {/* SECTION 1: Personal & Contact Details */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col gap-6">
              <div className="border-b border-[#EAE2D6] pb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#738278] block">
                  Part 1 of 3
                </span>
                <h2 className="font-serif text-xl font-bold text-[#14261D]">
                  Personal & Contact Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Full Legal Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F2EB] border border-[#DCD4C7] text-[#717E76] cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Gender Identity
                  </label>
                  <input
                    type="text"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    placeholder="e.g. Female, Male, Non-binary"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Pronouns
                  </label>
                  <input
                    type="text"
                    name="pronouns"
                    value={formData.pronouns}
                    onChange={handleChange}
                    placeholder="e.g. she/her, they/them, he/him"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Preferred Language
                  </label>
                  <input
                    type="text"
                    name="preferredLanguage"
                    value={formData.preferredLanguage}
                    onChange={handleChange}
                    placeholder="e.g. English, Spanish"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Occupation
                  </label>
                  <input
                    type="text"
                    name="occupation"
                    value={formData.occupation}
                    onChange={handleChange}
                    placeholder="e.g. Software Engineer, Teacher"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="pt-4 border-t border-[#EAE2D6]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#526358] mb-3">
                  Emergency Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      name="emergencyContact.name"
                      value={formData.emergencyContact.name}
                      onChange={handleChange}
                      placeholder="Full name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Relationship
                    </label>
                    <input
                      type="text"
                      name="emergencyContact.relationship"
                      value={formData.emergencyContact.relationship}
                      onChange={handleChange}
                      placeholder="e.g. Spouse, Parent, Friend"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      name="emergencyContact.phone"
                      value={formData.emergencyContact.phone}
                      onChange={handleChange}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                </div>
              </div>

              {/* Residential Address */}
              <div className="pt-4 border-t border-[#EAE2D6]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#526358] mb-3">
                  Residential Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      name="address.street"
                      value={formData.address.street}
                      onChange={handleChange}
                      placeholder="123 Main St, Apt 4B"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      name="address.city"
                      value={formData.address.city}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      State / Province
                    </label>
                    <input
                      type="text"
                      name="address.state"
                      value={formData.address.state}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      name="address.postalCode"
                      value={formData.address.postalCode}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#4C5B52] font-semibold mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      name="address.country"
                      value={formData.address.country}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: Clinical & Medical Background */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col gap-6">
              <div className="border-b border-[#EAE2D6] pb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#738278] block">
                  Part 2 of 3
                </span>
                <h2 className="font-serif text-xl font-bold text-[#14261D]">
                  Clinical & Medical History
                </h2>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Presenting Concerns
                  </label>
                  <p className="text-[11px] text-[#717E76] mb-1.5">
                    What primary issues, life events, or symptoms bring you to therapy at this time?
                  </p>
                  <textarea
                    rows={3}
                    name="presentingConcern"
                    value={formData.presentingConcern}
                    onChange={handleChange}
                    placeholder="Briefly describe what you would like support with..."
                    className="w-full p-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Mental Health History
                  </label>
                  <p className="text-[11px] text-[#717E76] mb-1.5">
                    Have you previously received counseling or psychiatric care? Any prior mental health diagnoses?
                  </p>
                  <textarea
                    rows={3}
                    name="mentalHealthHistory"
                    value={formData.mentalHealthHistory}
                    onChange={handleChange}
                    placeholder="Details about prior counseling, diagnoses, or family mental health history..."
                    className="w-full p-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Medical Conditions & Physical Health
                  </label>
                  <p className="text-[11px] text-[#717E76] mb-1.5">
                    Do you have any current or chronic medical conditions, allergies, or physical health concerns?
                  </p>
                  <textarea
                    rows={2}
                    name="medicalHistory"
                    value={formData.medicalHistory}
                    onChange={handleChange}
                    placeholder="e.g. Hypertension, thyroid conditions, migraines, chronic pain..."
                    className="w-full p-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Current Medications & Supplements
                  </label>
                  <p className="text-[11px] text-[#717E76] mb-1.5">
                    Please list any prescription or over-the-counter medications and approximate dosages.
                  </p>
                  <textarea
                    rows={2}
                    name="currentMedications"
                    value={formData.currentMedications}
                    onChange={handleChange}
                    placeholder="e.g. Sertraline 50mg daily, Vitamin D, etc. (or 'None')"
                    className="w-full p-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[#4C5B52] font-semibold mb-1">
                    Therapeutic Goals
                  </label>
                  <p className="text-[11px] text-[#717E76] mb-1.5">
                    What specific changes, skills, or outcomes would you like to experience through our sessions?
                  </p>
                  <textarea
                    rows={2}
                    name="goals"
                    value={formData.goals}
                    onChange={handleChange}
                    placeholder="e.g. Better anxiety management, improved communication with partner..."
                    className="w-full p-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: Informed Consent & Digital Signature */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col gap-6">
              <div className="border-b border-[#EAE2D6] pb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#738278] block">
                    Part 3 of 3
                  </span>
                  <h2 className="font-serif text-xl font-bold text-[#14261D]">
                    Informed Consent & Practice Agreement
                  </h2>
                </div>
                <span className="px-2.5 py-1 text-[10px] font-semibold bg-[#FAF8F5] text-[#55635B] border border-[#DDD5C7] rounded-md">
                  Version 1.0
                </span>
              </div>

              {/* Consent Terms Document Box */}
              <div className="p-5 bg-[#FAF8F5] border border-[#E9DFD2] rounded-xl text-xs text-[#2A3830] space-y-4 max-h-96 overflow-y-auto leading-relaxed">
                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    1. Scope of Psychotherapeutic Services
                  </h3>
                  <p className="text-[#4E5C53]">
                    Psychotherapy is a collaborative process between you and your licensed therapist designed to help you clarify goals, cope with distress, and foster psychological growth. Therapy involves discussing personal and emotional matters; while positive outcomes are intended, therapy may also evoke uncomfortable feelings.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    2. Confidentiality & Ethical Limits
                  </h3>
                  <p className="text-[#4E5C53]">
                    All communications, session notes, and client records are strictly protected by clinical confidentiality laws and standards. However, under law, confidentiality must be breached under specific exceptional circumstances: (a) reasonable suspicion of child, elder, or dependent adult abuse or neglect; (b) clear and imminent threat of severe physical harm or danger to self or others; (c) a valid judicial court order or subpoena.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    3. Cancellation & Rescheduling Policy
                  </h3>
                  <p className="text-[#4E5C53]">
                    Your session time is reserved exclusively for you. If you need to cancel or reschedule, please provide at least <strong>24 hours advance notice</strong>. Appointments cancelled or rescheduled with less than 24 hours notice may be billed at the standard session fee.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    4. Professional Fees & Payment Terms
                  </h3>
                  <p className="text-[#4E5C53]">
                    Payment is due at the time of each session unless other billing arrangements have been agreed in writing. Outstanding balances must be settled promptly to continue ongoing treatment.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    5. Electronic Communication & Privacy
                  </h3>
                  <p className="text-[#4E5C53]">
                    Email, text messages, and portal notifications are utilized primarily for administrative and scheduling functions. Standard electronic communication cannot be guaranteed to be fully encrypted or confidential. Please avoid sending sensitive clinical emergencies over email.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[#14261D] mb-1">
                    6. Crisis & Acute Emergency Limitations
                  </h3>
                  <p className="text-[#4E5C53]">
                    This practice does not offer 24/7 crisis intervention services. If you are experiencing a life-threatening crisis, suicidal thoughts, or a psychiatric emergency, please immediately call <strong>988</strong> (Suicide & Crisis Lifeline), <strong>911 / 112</strong>, or proceed to the nearest hospital emergency room.
                  </p>
                </div>
              </div>

              {/* Agreement Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="consentAgreed"
                    checked={formData.consentAgreed}
                    onChange={handleChange}
                    className="mt-0.5 h-4 w-4 rounded text-[#1B3B2B] focus:ring-[#1B3B2B] border-[#CDE3D5] cursor-pointer"
                  />
                  <span className="text-xs text-[#2A3830] font-medium leading-relaxed">
                    I acknowledge that I have read, understood, and voluntarily agree to the informed consent terms, practice policies, and limitations stated above.
                  </span>
                </label>
              </div>

              {/* Signature Field */}
              <div className="pt-3 border-t border-[#EAE2D6] space-y-3">
                <label className="block text-xs font-semibold text-[#14261D]">
                  Digital Signature <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-[#717E76]">
                  Please type your full legal name below. By typing your name, you acknowledge that this constitutes a legally binding digital signature under applicable electronic transaction laws.
                </p>

                <div className="max-w-md">
                  <input
                    type="text"
                    name="signatureName"
                    value={formData.signatureName}
                    onChange={handleChange}
                    placeholder="Type your full legal name"
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] focus:outline-none focus:bg-white focus:border-[#1B3B2B] font-serif text-sm tracking-wide"
                  />

                  {formData.signatureName.trim() && (
                    <div className="mt-2 p-3 bg-[#FAF8F5] border border-[#EDE5DA] rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[#717E76]">Signed as:</span>
                        <span className="font-serif italic text-base font-semibold text-[#1B3B2B]">
                          {formData.signatureName}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#8E9B93]">
                        {currentDateFormatted}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-[#EAE2D6] flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-[11px] text-[#717E76]">
                  Your submission is encrypted and securely sent directly to your therapist.
                </span>

                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3 text-xs rounded-xl shadow-sm"
                >
                  Submit Intake & Signed Consent
                </Button>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#EAE2D6] bg-white py-4 px-6 mt-12 text-center text-[11px] text-[#8E9B93]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Powered by <strong>Unfazed</strong> Practice Management
          </span>
          <span>Encrypted HIPAA-compliant data exchange</span>
        </div>
      </footer>
    </div>
  );
}
