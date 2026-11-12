const mongoose = require("mongoose");
const crypto = require("crypto");
const Message = require("../models/Message");
const Client = require("../models/Client");
const Therapist = require("../models/Therapist");
const { getIO } = require("../services/socketService");

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Therapist retrieves chat history with a client
 * Route: GET /api/chat/messages/:clientId
 * Access: Private (Therapist authenticated via JWT)
 */
const getTherapistMessages = async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client ID format.",
      });
    }

    // Verify ownership: client belongs strictly to this therapist
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

    const messages = await Message.find({
      therapistId: req.therapistId,
      clientId: client._id,
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
      client: {
        id: client._id,
        name: client.name,
      },
    });
  } catch (error) {
    console.error("Error retrieving therapist messages:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching messages.",
    });
  }
};

/**
 * Therapist sends a message to a client
 * Route: POST /api/chat/messages/:clientId
 * Access: Private (Therapist authenticated via JWT)
 */
const sendTherapistMessage = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { content } = req.body;

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client ID format.",
      });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty.",
      });
    }

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

    const therapist = await Therapist.findById(req.therapistId);

    const message = await Message.create({
      therapistId: req.therapistId,
      clientId: client._id,
      senderType: "therapist",
      senderId: req.therapistId,
      senderName: therapist ? therapist.name : "Therapist",
      content: content.trim(),
    });

    // Real-time broadcast via Socket.IO if active
    const io = getIO();
    if (io) {
      io.to(`chat_${client._id}`).emit("new_message", message);
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: message,
    });
  } catch (error) {
    console.error("Error sending therapist message:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while sending message.",
    });
  }
};

/**
 * Client retrieves chat history with their therapist via secure portal token
 * Route: GET /api/chat/portal/:token/messages
 * Access: Public (Token-gated client portal access)
 */
const getClientMessages = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "A valid client portal token is required.",
      });
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    const client = await Client.findOne({
      $or: [
        { portalTokenHash: tokenHash },
        { intakeTokenHash: tokenHash },
      ],
    }).populate("therapist_id", "name practiceName credentials title");

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client portal link is invalid or expired.",
      });
    }

    if (
      client.portalTokenHash === tokenHash &&
      client.portalTokenExpiresAt &&
      new Date(client.portalTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "Client portal link has expired.",
        expired: true,
      });
    }

    const messages = await Message.find({
      clientId: client._id,
      therapistId: client.therapist_id._id,
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
      therapist: client.therapist_id,
      client: {
        id: client._id,
        name: client.name,
      },
    });
  } catch (error) {
    console.error("Error retrieving client messages:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching messages.",
    });
  }
};

/**
 * Client sends a message to their therapist via secure portal token
 * Route: POST /api/chat/portal/:token/messages
 * Access: Public (Token-gated client portal access)
 */
const sendClientMessage = async (req, res) => {
  try {
    const { token } = req.params;
    const { content } = req.body;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        success: false,
        message: "A valid client portal token is required.",
      });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty.",
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
        message: "Client portal link is invalid or expired.",
      });
    }

    if (
      client.portalTokenHash === tokenHash &&
      client.portalTokenExpiresAt &&
      new Date(client.portalTokenExpiresAt) < now
    ) {
      return res.status(410).json({
        success: false,
        message: "Client portal link has expired.",
        expired: true,
      });
    }

    const message = await Message.create({
      therapistId: client.therapist_id,
      clientId: client._id,
      senderType: "client",
      senderId: client._id,
      senderName: client.name,
      content: content.trim(),
    });

    // Real-time broadcast via Socket.IO if active
    const io = getIO();
    if (io) {
      io.to(`chat_${client._id}`).emit("new_message", message);
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: message,
    });
  } catch (error) {
    console.error("Error sending client message:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while sending message.",
    });
  }
};

module.exports = {
  getTherapistMessages,
  sendTherapistMessage,
  getClientMessages,
  sendClientMessage,
};
