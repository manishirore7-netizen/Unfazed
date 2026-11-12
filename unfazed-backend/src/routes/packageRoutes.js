const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  getClientPackages,
  initiatePackagePurchase,
  getPublicClientPackageBalance,
  getPublicPackages,
  initiatePublicPackagePurchase,
} = require("../controllers/packageController");

const router = express.Router();

// Public routes for clients
router.get("/public/:slug/balance", getPublicClientPackageBalance);
router.get("/public/:slug", getPublicPackages);
router.post("/public/:slug/:id/purchase", initiatePublicPackagePurchase);

// Protected therapist package routes
router.use(authMiddleware);

router.get("/", getPackages);
router.post("/", createPackage);
router.get("/client-packages", getClientPackages);
router.get("/:id", getPackageById);
router.put("/:id", updatePackage);
router.delete("/:id", deletePackage);
router.post("/:id/purchase", initiatePackagePurchase);

module.exports = router;
