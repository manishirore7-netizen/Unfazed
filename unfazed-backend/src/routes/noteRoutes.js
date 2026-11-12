const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  getClientSharedNotes,
  getClientSharedNoteById,
} = require("../controllers/noteController");

// ==========================================
// 1. PUBLIC / TOKEN-GATED CLIENT ENDPOINTS
// (No therapist auth required; strictly scoped to shared notes)
// ==========================================
router.get("/shared/:token", getClientSharedNotes);
router.get("/client/:token", getClientSharedNotes);
router.get("/shared", getClientSharedNotes);
router.get("/shared/:token/:noteId", getClientSharedNoteById);

// ==========================================
// 2. PROTECTED THERAPIST MANAGEMENT ENDPOINTS
// (Requires therapist JWT authentication)
// ==========================================
router.post("/", authMiddleware, createNote);
router.get("/", authMiddleware, getNotes);
router.get("/:id", authMiddleware, getNoteById);
router.put("/:id", authMiddleware, updateNote);
router.patch("/:id", authMiddleware, updateNote);
router.delete("/:id", authMiddleware, deleteNote);

module.exports = router;
