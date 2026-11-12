const crypto = require("crypto");
const mongoose = require("mongoose");
const Note = require("../models/Note");
const Client = require("../models/Client");
const Booking = require("../models/Booking");

/**
 * Hash raw token using SHA-256 for secure client lookup
 */
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Therapist creates a clinical session note
 * Route: POST /api/notes
 * Access: Private (Therapist authenticated via JWT)
 */
const createNote = async (req, res) => {
  try {
    const { clientId, bookingId, type = "private", title = "", content } = req.body;

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: "A valid client ID is required.",
      });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Note content is required.",
      });
    }

    if (!["private", "shared"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Note type must be either 'private' or 'shared'.",
      });
    }

    // Verify client exists and belongs strictly to the authenticated therapist
    const client = await Client.findOne({
      _id: clientId,
      therapist_id: req.therapistId,
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found or belongs to another practice.",
      });
    }

    // If bookingId is provided, verify it belongs to this therapist and client
    let validBookingId = null;
    if (bookingId) {
      if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID format.",
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        therapistId: req.therapistId,
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Selected session was not found or belongs to another therapist.",
        });
      }

      validBookingId = booking._id;
    }

    const note = await Note.create({
      therapistId: req.therapistId,
      clientId: client._id,
      bookingId: validBookingId,
      type,
      title: title.trim(),
      content: content.trim(),
      sharedAt: type === "shared" ? new Date() : null,
    });

    return res.status(201).json({
      success: true,
      message: "Clinical note created successfully.",
      data: note,
    });
  } catch (error) {
    console.error("Error creating clinical note:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while creating the note.",
    });
  }
};

/**
 * Therapist lists clinical notes (optionally filtered by client, booking, or type)
 * Route: GET /api/notes
 * Access: Private (Therapist authenticated via JWT)
 */
const getNotes = async (req, res) => {
  try {
    const { clientId, bookingId, type } = req.query;

    const query = { therapistId: req.therapistId };

    if (clientId) {
      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID format.",
        });
      }

      // Verify the client belongs to this therapist
      const client = await Client.findOne({
        _id: clientId,
        therapist_id: req.therapistId,
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found or belongs to another practice.",
        });
      }

      query.clientId = clientId;
    }

    if (bookingId) {
      if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID format.",
        });
      }
      query.bookingId = bookingId;
    }

    if (type && ["private", "shared"].includes(type)) {
      query.type = type;
    }

    const notes = await Note.find(query)
      .populate("bookingId", "startTime endTime duration status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: notes.length,
      data: notes,
    });
  } catch (error) {
    console.error("Error fetching clinical notes:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching clinical notes.",
    });
  }
};

/**
 * Therapist retrieves a single clinical note by ID
 * Route: GET /api/notes/:id
 * Access: Private (Therapist authenticated via JWT)
 */
const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID format.",
      });
    }

    const note = await Note.findOne({
      _id: id,
      therapistId: req.therapistId,
    }).populate("bookingId", "startTime endTime duration status");

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Clinical note not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error("Error fetching note by ID:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the note.",
    });
  }
};

/**
 * Therapist updates an existing clinical note
 * Route: PUT /api/notes/:id
 * Access: Private (Therapist authenticated via JWT)
 */
const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, bookingId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID format.",
      });
    }

    const note = await Note.findOne({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Clinical note not found.",
      });
    }

    if (title !== undefined) {
      note.title = String(title).trim();
    }

    if (content !== undefined) {
      if (!String(content).trim()) {
        return res.status(400).json({
          success: false,
          message: "Note content cannot be empty.",
        });
      }
      note.content = String(content).trim();
    }

    if (type !== undefined) {
      if (!["private", "shared"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Note type must be either 'private' or 'shared'.",
        });
      }
      note.type = type;
      if (type === "shared" && !note.sharedAt) {
        note.sharedAt = new Date();
      } else if (type === "private") {
        note.sharedAt = null;
      }
    }

    if (bookingId !== undefined) {
      if (bookingId === null || bookingId === "") {
        note.bookingId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(bookingId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking ID format.",
          });
        }

        const booking = await Booking.findOne({
          _id: bookingId,
          therapistId: req.therapistId,
        });

        if (!booking) {
          return res.status(404).json({
            success: false,
            message: "Selected session was not found or belongs to another therapist.",
          });
        }
        note.bookingId = booking._id;
      }
    }

    await note.save();

    const populated = await Note.findById(note._id).populate(
      "bookingId",
      "startTime endTime duration status"
    );

    return res.status(200).json({
      success: true,
      message: "Clinical note updated successfully.",
      data: populated,
    });
  } catch (error) {
    console.error("Error updating clinical note:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while updating the note.",
    });
  }
};

/**
 * Therapist deletes a clinical note
 * Route: DELETE /api/notes/:id
 * Access: Private (Therapist authenticated via JWT)
 */
const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID format.",
      });
    }

    const note = await Note.findOneAndDelete({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Clinical note not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Clinical note deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting clinical note:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while deleting the note.",
    });
  }
};

/**
 * Client retrieves ONLY shared notes via secure token
 * Routes:
 *   GET /api/notes/shared/:token
 *   GET /api/notes/client/:token
 *   GET /api/notes/shared?token=...
 * Access: Public (Token-gated client portal access)
 *
 * CRITICAL PRIVACY & SECURITY REQUIREMENT:
 * Under NO circumstances are 'private' notes ever returned by this endpoint.
 * Multi-layer enforcement:
 * 1. Explicit 403 rejection if client query specifies 'private'.
 * 2. Database query strictly enforces { type: 'shared' }.
 * 3. Serialization safeguard post-filters ensuring only shared notes leave the process.
 */
const getClientSharedNotes = async (req, res) => {
  try {
    const token = req.params.token || req.query.token;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "A valid client invitation token is required.",
      });
    }

    // Explicit rejection if caller attempts to override note privacy
    if (req.query.type && req.query.type !== "shared") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Private clinical notes cannot be accessed via client endpoints.",
      });
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    const client = await Client.findOne({
      $or: [
        { portalTokenHash: tokenHash },
        { intakeTokenHash: tokenHash },
      ],
    }).populate("therapist_id", "name practiceName credentials title email");

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client invitation link is invalid or expired.",
      });
    }

    // Validate token expiry based on which token matched
    if (
      client.portalTokenHash === tokenHash &&
      client.portalTokenExpiresAt &&
      new Date(client.portalTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "This client portal link has expired. Please contact your therapist to request a new link.",
        expired: true,
      });
    }

    if (
      client.intakeTokenHash === tokenHash &&
      client.intakeTokenExpiresAt &&
      new Date(client.intakeTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "This client portal link has expired. Please contact your therapist to request a new link.",
        expired: true,
      });
    }

    // Database query hardcoded to 'shared' notes for this client
    const rawNotes = await Note.find({
      clientId: client._id,
      type: "shared",
    })
      .populate("bookingId", "startTime endTime duration")
      .sort({ createdAt: -1 });

    // Serialization safeguard: Ensure zero private notes can ever leak
    const sanitizedNotes = rawNotes
      .filter((n) => n.type === "shared")
      .map((n) => ({
        _id: n._id,
        title: n.title,
        content: n.content,
        type: "shared",
        booking: n.bookingId
          ? {
              startTime: n.bookingId.startTime,
              endTime: n.bookingId.endTime,
              duration: n.bookingId.duration,
            }
          : null,
        sharedAt: n.sharedAt || n.createdAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }));

    return res.status(200).json({
      success: true,
      data: sanitizedNotes,
      client: {
        id: client._id,
        name: client.name,
      },
      therapist: client.therapist_id
        ? {
            name: client.therapist_id.name,
            practiceName: client.therapist_id.practiceName,
            credentials: client.therapist_id.credentials,
            title: client.therapist_id.title,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching client shared notes:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching shared notes.",
    });
  }
};

/**
 * Client retrieves a single shared note by ID via secure token
 * Route: GET /api/notes/shared/:token/:noteId
 * Access: Public (Token-gated client portal access)
 */
const getClientSharedNoteById = async (req, res) => {
  try {
    const { token, noteId } = req.params;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "A valid client invitation token is required.",
      });
    }

    if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID format.",
      });
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    const client = await Client.findOne({
      $or: [
        { portalTokenHash: tokenHash },
        { intakeTokenHash: tokenHash },
      ],
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client invitation link is invalid or expired.",
      });
    }

    if (
      client.portalTokenHash === tokenHash &&
      client.portalTokenExpiresAt &&
      new Date(client.portalTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "This client portal link has expired.",
        expired: true,
      });
    }

    if (
      client.intakeTokenHash === tokenHash &&
      client.intakeTokenExpiresAt &&
      new Date(client.intakeTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "This client portal link has expired.",
        expired: true,
      });
    }

    // Must match this client AND be explicitly shared
    const note = await Note.findOne({
      _id: noteId,
      clientId: client._id,
      type: "shared",
    }).populate("bookingId", "startTime endTime duration");

    if (!note || note.type !== "shared") {
      return res.status(404).json({
        success: false,
        message: "Shared note not found or not accessible.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: note._id,
        title: note.title,
        content: note.content,
        type: "shared",
        booking: note.bookingId
          ? {
              startTime: note.bookingId.startTime,
              endTime: note.bookingId.endTime,
              duration: note.bookingId.duration,
            }
          : null,
        sharedAt: note.sharedAt || note.createdAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching single shared note:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the shared note.",
    });
  }
};

module.exports = {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  getClientSharedNotes,
  getClientSharedNoteById,
};
