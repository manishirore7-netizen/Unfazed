const crypto = require("crypto");
const mongoose = require("mongoose");
const Client = require("../models/Client");
const Therapist = require("../models/Therapist");

/**
 * Hash raw token using SHA-256
 */
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Therapist initiates digital intake & consent workflow for a client
 * Route: POST /api/clients/:id/intake/initiate
 * Access: Private (Therapist authenticated)
 */
const initiateIntake = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    // Scoped strictly to the authenticated therapist
    const client = await Client.findOne({
      _id: id,
      therapist_id: req.therapistId,
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    // Generate cryptographically secure random token (64 hex characters)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    // 7-day token expiration
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    client.intakeStatus = "pending";
    client.intakeTokenHash = tokenHash;
    client.intakeTokenExpiresAt = expiresAt;
    await client.save();

    const intakePath = `/intake/${rawToken}`;

    return res.status(200).json({
      success: true,
      message: "Intake workflow initiated successfully.",
      data: {
        rawToken,
        intakePath,
        intakeStatus: client.intakeStatus,
        expiresAt: client.intakeTokenExpiresAt,
      },
    });
  } catch (error) {
    console.error("Error initiating client intake:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while initiating intake workflow.",
    });
  }
};

/**
 * Therapist retrieves intake responses & signed consent record for a client
 * Route: GET /api/clients/:id/intake
 * Access: Private (Therapist authenticated)
 */
const getClientIntakeDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    const client = await Client.findOne({
      _id: id,
      therapist_id: req.therapistId,
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        clientId: client._id,
        clientName: client.name,
        intakeStatus: client.intakeStatus,
        intakeSubmittedAt: client.intakeSubmittedAt,
        intakeResponses: client.intakeResponses,
        consentStatus: client.consentStatus,
        consentRecord: client.consentRecord,
        medicalHistory: client.medicalHistory,
        mentalHealthHistory: client.mentalHealthHistory,
        currentMedications: client.currentMedications,
        presentingConcern: client.presentingConcern,
        goals: client.goals,
      },
    });
  } catch (error) {
    console.error("Error retrieving client intake details:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching intake details.",
    });
  }
};

/**
 * Client accesses intake & consent form via secure token
 * Route: GET /api/intake/:token
 * Access: Public (Token-gated)
 */
const getIntakeByToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "Invalid or malformed intake invitation token.",
      });
    }

    const tokenHash = hashToken(token);

    const client = await Client.findOne({
      intakeTokenHash: tokenHash,
    }).populate("therapist_id", "name practiceName credentials title email");

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Intake invitation link is invalid or has already been used.",
      });
    }

    // Check if intake was already completed
    if (client.intakeStatus === "completed") {
      return res.status(400).json({
        success: false,
        message: "This intake form has already been completed and submitted.",
        alreadyCompleted: true,
      });
    }

    // Check token expiry
    if (client.intakeTokenExpiresAt && new Date(client.intakeTokenExpiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        message: "This intake invitation link has expired. Please contact your therapist to request a new link.",
        expired: true,
      });
    }

    const therapistInfo = client.therapist_id || {};

    return res.status(200).json({
      success: true,
      data: {
        client: {
          name: client.name,
          email: client.email,
          phone: client.phone || "",
          dateOfBirth: client.dateOfBirth || null,
          gender: client.gender || "",
          pronouns: client.pronouns || "",
          preferredLanguage: client.preferredLanguage || "English",
          occupation: client.occupation || "",
          emergencyContact: client.emergencyContact || {
            name: "",
            relationship: "",
            phone: "",
          },
          address: client.address || {
            street: "",
            city: "",
            state: "",
            postalCode: "",
            country: "",
          },
          presentingConcern: client.presentingConcern || "",
          medicalHistory: client.medicalHistory || "",
          mentalHealthHistory: client.mentalHealthHistory || "",
          currentMedications: client.currentMedications || "",
          goals: client.goals || "",
        },
        therapist: {
          name: therapistInfo.name || "Your Therapist",
          practiceName: therapistInfo.practiceName || therapistInfo.name || "Therapy Practice",
          credentials: therapistInfo.credentials || "",
          title: therapistInfo.title || "Licensed Mental Health Practitioner",
        },
        documentVersion: "1.0",
      },
    });
  } catch (error) {
    console.error("Error retrieving intake by token:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while loading the intake form.",
    });
  }
};

/**
 * Client submits digital intake form and signed consent agreement
 * Route: POST /api/intake/:token/submit
 * Access: Public (Token-gated)
 */
const submitIntake = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "Invalid or malformed intake invitation token.",
      });
    }

    const tokenHash = hashToken(token);

    const client = await Client.findOne({
      intakeTokenHash: tokenHash,
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Intake invitation link is invalid or has already been used.",
      });
    }

    if (client.intakeStatus === "completed") {
      return res.status(400).json({
        success: false,
        message: "This intake form has already been completed.",
      });
    }

    if (client.intakeTokenExpiresAt && new Date(client.intakeTokenExpiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        message: "This intake invitation link has expired. Please contact your therapist for a new link.",
      });
    }

    const {
      name,
      phone,
      dateOfBirth,
      gender,
      pronouns,
      preferredLanguage,
      occupation,
      emergencyContact,
      address,
      presentingConcern,
      medicalHistory,
      mentalHealthHistory,
      currentMedications,
      goals,
      consentAgreed,
      signatureName,
    } = req.body;

    // Validate mandatory consent fields
    if (consentAgreed !== true) {
      return res.status(400).json({
        success: false,
        message: "You must review and agree to the practice policies and consent terms.",
      });
    }

    if (!signatureName || typeof signatureName !== "string" || signatureName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please provide your full legal name as your digital signature.",
      });
    }

    // Safely update demographics without wiping out pre-existing data with empty values
    if (name && typeof name === "string" && name.trim()) {
      client.name = name.trim();
    }
    if (phone && typeof phone === "string" && phone.trim()) {
      client.phone = phone.trim();
    }
    if (dateOfBirth) {
      const parsedDob = new Date(dateOfBirth);
      if (!isNaN(parsedDob.getTime())) {
        client.dateOfBirth = parsedDob;
      }
    }
    if (gender && typeof gender === "string" && gender.trim()) {
      client.gender = gender.trim();
    }
    if (pronouns && typeof pronouns === "string" && pronouns.trim()) {
      client.pronouns = pronouns.trim();
    }
    if (preferredLanguage && typeof preferredLanguage === "string" && preferredLanguage.trim()) {
      client.preferredLanguage = preferredLanguage.trim();
    }
    if (occupation && typeof occupation === "string" && occupation.trim()) {
      client.occupation = occupation.trim();
    }

    if (emergencyContact && typeof emergencyContact === "object") {
      if (!client.emergencyContact) client.emergencyContact = {};
      if (emergencyContact.name && typeof emergencyContact.name === "string" && emergencyContact.name.trim()) {
        client.emergencyContact.name = emergencyContact.name.trim();
      }
      if (
        emergencyContact.relationship &&
        typeof emergencyContact.relationship === "string" &&
        emergencyContact.relationship.trim()
      ) {
        client.emergencyContact.relationship = emergencyContact.relationship.trim();
      }
      if (
        emergencyContact.phone &&
        typeof emergencyContact.phone === "string" &&
        emergencyContact.phone.trim()
      ) {
        client.emergencyContact.phone = emergencyContact.phone.trim();
      }
    }

    if (address && typeof address === "object") {
      if (!client.address) client.address = {};
      if (address.street && typeof address.street === "string") client.address.street = address.street.trim();
      if (address.city && typeof address.city === "string") client.address.city = address.city.trim();
      if (address.state && typeof address.state === "string") client.address.state = address.state.trim();
      if (address.postalCode && typeof address.postalCode === "string") client.address.postalCode = address.postalCode.trim();
      if (address.country && typeof address.country === "string") client.address.country = address.country.trim();
    }

    // Clinical Context & Medical History
    if (presentingConcern !== undefined && typeof presentingConcern === "string") {
      client.presentingConcern = presentingConcern.trim();
    }
    if (medicalHistory !== undefined && typeof medicalHistory === "string") {
      client.medicalHistory = medicalHistory.trim();
    }
    if (mentalHealthHistory !== undefined && typeof mentalHealthHistory === "string") {
      client.mentalHealthHistory = mentalHealthHistory.trim();
    }
    if (currentMedications !== undefined && typeof currentMedications === "string") {
      client.currentMedications = currentMedications.trim();
    }
    if (goals !== undefined && typeof goals === "string") {
      client.goals = goals.trim();
    }

    const clientIp =
      (req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",")[0].trim()) ||
      req.ip ||
      "";

    const submissionTimestamp = new Date();

    // Snapshot full intake response
    client.intakeResponses = {
      submittedAt: submissionTimestamp,
      demographics: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        dateOfBirth: client.dateOfBirth,
        gender: client.gender,
        pronouns: client.pronouns,
        preferredLanguage: client.preferredLanguage,
        occupation: client.occupation,
        emergencyContact: client.emergencyContact,
        address: client.address,
      },
      clinical: {
        presentingConcern: client.presentingConcern,
        medicalHistory: client.medicalHistory,
        mentalHealthHistory: client.mentalHealthHistory,
        currentMedications: client.currentMedications,
        goals: client.goals,
      },
    };

    // Update status and audit trail
    client.intakeStatus = "completed";
    client.intakeSubmittedAt = submissionTimestamp;

    client.consentStatus = "completed";
    client.consentRecord = {
      agreed: true,
      signedName: signatureName.trim(),
      signedAt: submissionTimestamp,
      documentVersion: "1.0",
      ipAddress: clientIp,
    };

    // Single-use token invalidation: Clear hash and expiration
    client.intakeTokenHash = null;
    client.intakeTokenExpiresAt = null;

    await client.save();

    return res.status(200).json({
      success: true,
      message: "Intake form and consent agreement submitted successfully.",
      data: {
        submittedAt: submissionTimestamp,
        signedName: signatureName.trim(),
        consentStatus: "completed",
        intakeStatus: "completed",
      },
    });
  } catch (error) {
    console.error("Error submitting client intake:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while submitting your intake form.",
    });
  }
};

module.exports = {
  hashToken,
  initiateIntake,
  getClientIntakeDetails,
  getIntakeByToken,
  submitIntake,
};
