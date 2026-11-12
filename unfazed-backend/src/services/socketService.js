const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Client = require("../models/Client");
const Therapist = require("../models/Therapist");
const Message = require("../models/Message");

let io = null;

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow localhost on any port or configured origins
        if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        if (process.env.CLIENT_URL && process.env.CLIENT_URL.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Authentication Middleware for WebSocket Connections
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const token = auth.token || socket.handshake.query?.token;
      const role = auth.role || socket.handshake.query?.role || "therapist";

      if (!token) {
        return next(new Error("Authentication error: token required"));
      }

      if (role === "therapist") {
        if (!process.env.JWT_SECRET) {
          return next(new Error("Server error: JWT_SECRET not configured"));
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const therapistId = decoded.therapistId || decoded.id;
        const therapist = await Therapist.findById(therapistId);
        if (!therapist) {
          return next(new Error("Authentication error: therapist not found"));
        }
        socket.user = {
          role: "therapist",
          therapistId: therapist._id.toString(),
          name: therapist.name,
        };
        return next();
      } else if (role === "client") {
        const tokenHash = hashToken(token);
        const now = new Date();
        const client = await Client.findOne({
          $or: [
            { portalTokenHash: tokenHash },
            { intakeTokenHash: tokenHash },
          ],
        });

        if (!client) {
          return next(new Error("Authentication error: invalid client token"));
        }

        if (
          client.portalTokenHash === tokenHash &&
          client.portalTokenExpiresAt &&
          new Date(client.portalTokenExpiresAt) < now
        ) {
          return next(new Error("Authentication error: portal token expired"));
        }

        socket.user = {
          role: "client",
          clientId: client._id.toString(),
          therapistId: client.therapist_id.toString(),
          name: client.name,
        };
        return next();
      }

      return next(new Error("Authentication error: invalid role"));
    } catch (err) {
      return next(new Error("Authentication error: " + err.message));
    }
  });

  // Connection Handler
  io.on("connection", (socket) => {
    // 1. Join Conversation Room
    socket.on("join_conversation", async (data, ack) => {
      try {
        let roomClientId;

        if (socket.user.role === "therapist") {
          const requestedClientId = data?.clientId;
          if (!requestedClientId || !mongoose.Types.ObjectId.isValid(requestedClientId)) {
            if (typeof ack === "function") ack({ success: false, error: "Invalid client ID" });
            return;
          }

          // Verify therapist owns this client
          const client = await Client.findOne({
            _id: requestedClientId,
            therapist_id: socket.user.therapistId,
          });

          if (!client) {
            if (typeof ack === "function") ack({ success: false, error: "Unauthorized access to client chat" });
            return;
          }
          roomClientId = requestedClientId;
        } else {
          // Client can ONLY join their own room
          roomClientId = socket.user.clientId;
        }

        const roomName = `chat_${roomClientId}`;
        socket.join(roomName);

        if (typeof ack === "function") {
          ack({ success: true, room: roomName });
        }
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, error: err.message });
      }
    });

    // 2. Send Real-Time Message
    socket.on("send_message", async (data, ack) => {
      try {
        const content = data?.content?.trim();
        if (!content) {
          if (typeof ack === "function") ack({ success: false, error: "Message content cannot be empty" });
          return;
        }

        let therapistId;
        let clientId;
        let senderType;
        let senderName;

        if (socket.user.role === "therapist") {
          clientId = data?.clientId;
          if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            if (typeof ack === "function") ack({ success: false, error: "Valid clientId is required" });
            return;
          }

          const client = await Client.findOne({
            _id: clientId,
            therapist_id: socket.user.therapistId,
          });

          if (!client) {
            if (typeof ack === "function") ack({ success: false, error: "Unauthorized access to client" });
            return;
          }

          therapistId = socket.user.therapistId;
          senderType = "therapist";
          senderName = socket.user.name;
        } else {
          clientId = socket.user.clientId;
          therapistId = socket.user.therapistId;
          senderType = "client";
          senderName = socket.user.name;
        }

        const messageDoc = await Message.create({
          therapistId,
          clientId,
          senderType,
          senderId: socket.user.role === "therapist" ? therapistId : clientId,
          senderName,
          content,
        });

        // Broadcast to conversation room
        const roomName = `chat_${clientId}`;
        io.to(roomName).emit("new_message", messageDoc);

        if (typeof ack === "function") {
          ack({ success: true, data: messageDoc });
        }
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, error: err.message });
      }
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

module.exports = {
  initSocket,
  getIO,
};
