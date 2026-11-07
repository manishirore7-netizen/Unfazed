const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const therapistRoutes = require("./routes/therapistRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/therapist", therapistRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Unfazed API is running!",
  });
});

module.exports = app;
