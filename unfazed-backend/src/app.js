const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const therapistRoutes = require("./routes/therapistRoutes");
const schedulingRoutes = require("./routes/schedulingRoutes");
const clientRoutes = require("./routes/clientRoutes");
const intakeRoutes = require("./routes/intakeRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const packageRoutes = require("./routes/packageRoutes");

const app = express();

const allowedOrigins = ["http://localhost:5173"];

if (process.env.CLIENT_URL) {
  process.env.CLIENT_URL.split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .forEach((origin) => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });
}

// Helper to identify localhost / 127.0.0.1 origins on any port during local development
const isLocalOrigin = (origin) => {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Allow explicitly configured production / client origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // During local development, allow localhost on any port (e.g. Vite on 5173, 5174, 5175)
    if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
      return callback(null, true);
    }

    // Disallow all other origins
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(cors(corsOptions));
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/therapist", therapistRoutes);
app.use("/api/scheduling", schedulingRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/intake", intakeRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/packages", packageRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Unfazed API is running!",
  });
});

module.exports = app;
