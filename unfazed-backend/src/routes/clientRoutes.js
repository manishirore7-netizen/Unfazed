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
} = require("../controllers/intakeController");

// All client CRM routes require therapist authentication
router.use(authMiddleware);

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

