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

// All client CRM routes require therapist authentication
router.use(authMiddleware);

// Client CRUD endpoints
router.post("/", createClient);
router.get("/", getClients);
router.get("/:id", getClientById);
router.put("/:id", updateClient);
router.patch("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;

