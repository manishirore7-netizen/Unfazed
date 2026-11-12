const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
} = require("../controllers/clientController");
const {
  initiateIntake,
  getClientIntakeDetails,
  initiatePortal,
} = require("../controllers/intakeController");
const { createNote, getNotes } = require("../controllers/noteController");

// All client CRM routes require therapist authentication
router.use(authMiddleware);

// Client Portal endpoints (Therapist authenticated)
router.post("/:id/portal/initiate", initiatePortal);

// Client Clinical Notes endpoints (Therapist authenticated)
router.get("/:id/notes", (req, res, next) => {
  req.query.clientId = req.params.id;
  return getNotes(req, res, next);
});
router.post("/:id/notes", (req, res, next) => {
  req.body.clientId = req.params.id;
  return createNote(req, res, next);
});

// Client Intake & Consent endpoints (Therapist authenticated)
router.post("/:id/intake/initiate", initiateIntake);
router.get("/:id/intake", getClientIntakeDetails);

// Client CRUD endpoints
router.post("/", createClient);
router.get("/", getClients);
router.get("/:id", getClientById);
router.put("/:id", updateClient);
router.patch("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;

