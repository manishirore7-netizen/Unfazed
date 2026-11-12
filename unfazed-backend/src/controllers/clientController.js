const mongoose = require("mongoose");
const Client = require("../models/Client");
const Booking = require("../models/Booking");

const VALID_STATUSES = ["active", "inactive", "lead", "archived", "discharged"];
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

/**
 * Helper to escape special characters for safe regular expressions
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new client record
 * Route: POST /api/clients
 * Access: Private (authMiddleware required)
 */
const createClient = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      status,
      tags,
      dateOfBirth,
      gender,
      pronouns,
      preferredLanguage,
      occupation,
      emergencyContact,
      address,
      presentingConcern,
      relevantHistory,
      medicalHistory,
      mentalHealthHistory,
      currentMedications,
      goals,
    } = req.body;

    // 1. Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client name is required and must be a valid string.",
      });
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "A valid client email address is required.",
      });
    }

    // 2. Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${VALID_STATUSES.join(", ")}.`,
      });
    }

    // 3. Process tags
    let processedTags = [];
    if (Array.isArray(tags)) {
      processedTags = tags
        .filter((t) => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim());
    }

    // 4. Construct client payload explicitly scoped to authenticated therapist
    const clientData = {
      therapist_id: req.therapistId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: typeof phone === "string" ? phone.trim() : "",
      status: status || "active",
      tags: processedTags,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: typeof gender === "string" ? gender.trim() : "",
      pronouns: typeof pronouns === "string" ? pronouns.trim() : "",
      preferredLanguage: typeof preferredLanguage === "string" ? preferredLanguage.trim() : "English",
      occupation: typeof occupation === "string" ? occupation.trim() : "",
      emergencyContact: emergencyContact && typeof emergencyContact === "object"
        ? {
            name: typeof emergencyContact.name === "string" ? emergencyContact.name.trim() : "",
            relationship: typeof emergencyContact.relationship === "string" ? emergencyContact.relationship.trim() : "",
            phone: typeof emergencyContact.phone === "string" ? emergencyContact.phone.trim() : "",
          }
        : undefined,
      address: address && typeof address === "object"
        ? {
            street: typeof address.street === "string" ? address.street.trim() : "",
            city: typeof address.city === "string" ? address.city.trim() : "",
            state: typeof address.state === "string" ? address.state.trim() : "",
            postalCode: typeof address.postalCode === "string" ? address.postalCode.trim() : "",
            country: typeof address.country === "string" ? address.country.trim() : "",
          }
        : undefined,
      presentingConcern: typeof presentingConcern === "string" ? presentingConcern.trim() : "",
      relevantHistory: typeof relevantHistory === "string" ? relevantHistory.trim() : "",
      medicalHistory: typeof medicalHistory === "string" ? medicalHistory.trim() : "",
      mentalHealthHistory: typeof mentalHealthHistory === "string" ? mentalHealthHistory.trim() : "",
      currentMedications: typeof currentMedications === "string" ? currentMedications.trim() : "",
      goals: typeof goals === "string" ? goals.trim() : "",
    };

    const client = await Client.create(clientData);

    return res.status(201).json({
      success: true,
      message: "Client created successfully.",
      data: client,
    });
  } catch (error) {
    // Duplicate email for the same therapist
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A client with this email address already exists in your records.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    console.error("Error creating client:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while creating the client.",
    });
  }
};

/**
 * List clients belonging to the authenticated therapist
 * Route: GET /api/clients
 * Access: Private (authMiddleware required)
 */
const getClients = async (req, res) => {
  try {
    const { status, tag, search, sort, page = 1, limit = 50 } = req.query;

    // Base query scoped strictly to authenticated therapist
    const query = { therapist_id: req.therapistId };

    // Status filter
    if (status && VALID_STATUSES.includes(status)) {
      query.status = status;
    }

    // Tag filter
    if (tag && typeof tag === "string" && tag.trim()) {
      query.tags = tag.trim();
    }

    // Search filter across name, email, phone
    if (search && typeof search === "string" && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Sorting
    let sortObj = { createdAt: -1 };
    if (sort === "name_asc") {
      sortObj = { name: 1 };
    } else if (sort === "name_desc") {
      sortObj = { name: -1 };
    } else if (sort === "created_asc") {
      sortObj = { createdAt: 1 };
    } else if (sort === "created_desc") {
      sortObj = { createdAt: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [total, clients] = await Promise.all([
      Client.countDocuments(query),
      Client.find(query).sort(sortObj).skip(skip).limit(limitNum),
    ]);

    return res.status(200).json({
      success: true,
      count: clients.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      data: clients,
    });
  } catch (error) {
    console.error("Error retrieving clients:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching clients.",
    });
  }
};

/**
 * Retrieve one client by ID, scoped to the authenticated therapist
 * Route: GET /api/clients/:id
 * Access: Private (authMiddleware required)
 */
const getClientById = async (req, res) => {
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
      data: client,
    });
  } catch (error) {
    console.error("Error retrieving client by ID:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the client.",
    });
  }
};

/**
 * Update client details
 * Route: PUT /api/clients/:id or PATCH /api/clients/:id
 * Access: Private (authMiddleware required)
 */
const updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    // Verify ownership first
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

    const updates = {};
    const allowedFields = [
      "name",
      "email",
      "phone",
      "status",
      "tags",
      "dateOfBirth",
      "gender",
      "pronouns",
      "preferredLanguage",
      "occupation",
      "emergencyContact",
      "address",
      "presentingConcern",
      "relevantHistory",
      "medicalHistory",
      "mentalHealthHistory",
      "currentMedications",
      "goals",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate name if updated
    if (updates.name !== undefined) {
      if (typeof updates.name !== "string" || !updates.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Client name must be a non-empty string.",
        });
      }
      updates.name = updates.name.trim();
    }

    // Validate email if updated
    if (updates.email !== undefined) {
      if (typeof updates.email !== "string" || !EMAIL_REGEX.test(updates.email.trim())) {
        return res.status(400).json({
          success: false,
          message: "A valid client email address is required.",
        });
      }
      updates.email = updates.email.trim().toLowerCase();
    }

    // Validate status if updated
    if (updates.status !== undefined) {
      if (!VALID_STATUSES.includes(updates.status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${VALID_STATUSES.join(", ")}.`,
        });
      }
    }

    // Clean tags if updated
    if (updates.tags !== undefined) {
      if (Array.isArray(updates.tags)) {
        updates.tags = updates.tags
          .filter((t) => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim());
      } else {
        return res.status(400).json({
          success: false,
          message: "Tags must be an array of strings.",
        });
      }
    }

    // Update fields on the found document
    Object.assign(client, updates);
    const updatedClient = await client.save();

    return res.status(200).json({
      success: true,
      message: "Client updated successfully.",
      data: updatedClient,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Another client with this email address already exists in your records.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    console.error("Error updating client:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while updating the client.",
    });
  }
};

/**
 * Delete a client, with safeguards against deleting clients with confirmed bookings
 * Route: DELETE /api/clients/:id
 * Access: Private (authMiddleware required)
 */
const deleteClient = async (req, res) => {
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

    // Safeguard: Check if confirmed bookings exist for this client with this therapist
    const activeBooking = await Booking.findOne({
      therapistId: req.therapistId,
      status: "confirmed",
      $or: [
        { clientId: client._id },
        { clientEmail: client.email.toLowerCase() },
      ],
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete client with active or confirmed bookings. Please cancel or complete related appointments first.",
      });
    }

    await Client.deleteOne({ _id: client._id });

    return res.status(200).json({
      success: true,
      message: "Client deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting client:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while deleting the client.",
    });
  }
};

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};

