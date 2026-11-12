const mongoose = require("mongoose");
const Package = require("../models/Package");
const ClientPackage = require("../models/ClientPackage");
const Client = require("../models/Client");
const Therapist = require("../models/Therapist");
const Payment = require("../models/Payment");
const { createOrder } = require("../services/razorpayService");
const { CURRENCY, calculatePaymentBreakdown } = require("../config/paymentConfig");
const { getPublicKeyId, isRazorpayConfigured } = require("../config/razorpay");
const { syncClientForBooking } = require("./bookingController");

/**
 * List all packages created by the authenticated therapist.
 * Route: GET /api/packages
 * Access: Private (Therapist)
 */
const getPackages = async (req, res) => {
  try {
    const filter = { therapistId: req.therapistId };

    if (req.query.active !== undefined) {
      filter.isActive = req.query.active === "true";
    }

    const packages = await Package.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: packages,
    });
  } catch (error) {
    console.error("Error fetching packages:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching packages.",
    });
  }
};

/**
 * Get a single package by ID scoped to the authenticated therapist.
 * Route: GET /api/packages/:id
 * Access: Private (Therapist)
 */
const getPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID.",
      });
    }

    const packageDoc = await Package.findOne({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: packageDoc,
    });
  } catch (error) {
    console.error("Error fetching package by ID:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching package.",
    });
  }
};

/**
 * Create a new package template for the authenticated therapist.
 * Route: POST /api/packages
 * Access: Private (Therapist)
 */
const createPackage = async (req, res) => {
  try {
    const {
      title,
      description,
      sessionCount,
      durationMinutes,
      price,
      discountPercentage,
      validityDays,
      isActive,
    } = req.body;

    // Validation
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Package title is required.",
      });
    }

    const parsedCount = parseInt(sessionCount, 10);
    if (isNaN(parsedCount) || parsedCount < 1) {
      return res.status(400).json({
        success: false,
        message: "Session count must be an integer of at least 1.",
      });
    }

    const parsedDuration = parseInt(durationMinutes, 10);
    if (![30, 45, 60, 90].includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: "Session duration must be 30, 45, 60, or 90 minutes.",
      });
    }

    const parsedPrice = parseInt(price, 10);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a non-negative integer (in paise).",
      });
    }

    const parsedDiscount =
      discountPercentage !== undefined ? Number(discountPercentage) : 0;
    if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount percentage must be between 0 and 100.",
      });
    }

    const parsedValidity =
      validityDays !== undefined ? parseInt(validityDays, 10) : 90;
    if (isNaN(parsedValidity) || parsedValidity < 1) {
      return res.status(400).json({
        success: false,
        message: "Validity days must be at least 1.",
      });
    }

    const newPackage = await Package.create({
      therapistId: req.therapistId,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      sessionCount: parsedCount,
      durationMinutes: parsedDuration,
      price: parsedPrice,
      discountPercentage: parsedDiscount,
      validityDays: parsedValidity,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: "Package created successfully.",
      data: newPackage,
    });
  } catch (error) {
    console.error("Error creating package:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while creating package.",
    });
  }
};

/**
 * Update a package owned by the authenticated therapist.
 * If purchases exist, prevents unsafe modifications (sessionCount, duration, price).
 * Route: PUT /api/packages/:id
 * Access: Private (Therapist)
 */
const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID.",
      });
    }

    const packageDoc = await Package.findOne({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

    // Check if client purchases already exist for this package
    const purchaseCount = await ClientPackage.countDocuments({
      packageId: packageDoc._id,
    });

    const {
      title,
      description,
      sessionCount,
      durationMinutes,
      price,
      discountPercentage,
      validityDays,
      isActive,
    } = req.body;

    // If purchases exist, reject unsafe modifications to structural fields
    if (purchaseCount > 0) {
      const isUnsafeAttempt =
        (sessionCount !== undefined && sessionCount !== packageDoc.sessionCount) ||
        (durationMinutes !== undefined && durationMinutes !== packageDoc.durationMinutes) ||
        (price !== undefined && price !== packageDoc.price);

      if (isUnsafeAttempt) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot alter session count, duration, or price of a package that has active purchase records. Please deactivate this package and create a new one instead.",
        });
      }
    }

    // Apply allowed updates
    if (title !== undefined) {
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ success: false, message: "Package title cannot be empty." });
      }
      packageDoc.title = title.trim();
    }

    if (description !== undefined) {
      packageDoc.description = typeof description === "string" ? description.trim() : "";
    }

    if (isActive !== undefined) {
      packageDoc.isActive = Boolean(isActive);
    }

    if (validityDays !== undefined) {
      const parsedValidity = parseInt(validityDays, 10);
      if (isNaN(parsedValidity) || parsedValidity < 1) {
        return res.status(400).json({ success: false, message: "Validity days must be at least 1." });
      }
      packageDoc.validityDays = parsedValidity;
    }

    if (discountPercentage !== undefined) {
      const parsedDiscount = Number(discountPercentage);
      if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        return res.status(400).json({ success: false, message: "Discount percentage must be 0-100." });
      }
      packageDoc.discountPercentage = parsedDiscount;
    }

    // Only allow changing sessionCount, duration, and price if no purchases exist
    if (purchaseCount === 0) {
      if (sessionCount !== undefined) {
        const parsedCount = parseInt(sessionCount, 10);
        if (isNaN(parsedCount) || parsedCount < 1) {
          return res.status(400).json({ success: false, message: "Session count must be at least 1." });
        }
        packageDoc.sessionCount = parsedCount;
      }

      if (durationMinutes !== undefined) {
        const parsedDuration = parseInt(durationMinutes, 10);
        if (![30, 45, 60, 90].includes(parsedDuration)) {
          return res.status(400).json({ success: false, message: "Duration must be 30, 45, 60, or 90." });
        }
        packageDoc.durationMinutes = parsedDuration;
      }

      if (price !== undefined) {
        const parsedPrice = parseInt(price, 10);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ success: false, message: "Price must be non-negative integer paise." });
        }
        packageDoc.price = parsedPrice;
      }
    }

    await packageDoc.save();

    return res.status(200).json({
      success: true,
      message: "Package updated successfully.",
      data: packageDoc,
    });
  } catch (error) {
    console.error("Error updating package:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while updating package.",
    });
  }
};

/**
 * Delete or safely deactivate a package.
 * If purchase records exist, deactivates instead of deleting to preserve clinical and financial audit history.
 * Route: DELETE /api/packages/:id
 * Access: Private (Therapist)
 */
const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID.",
      });
    }

    const packageDoc = await Package.findOne({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

    const purchaseCount = await ClientPackage.countDocuments({
      packageId: packageDoc._id,
    });

    if (purchaseCount > 0) {
      // Deactivate instead of hard delete
      packageDoc.isActive = false;
      await packageDoc.save();

      return res.status(200).json({
        success: true,
        message: "Package has been deactivated instead of deleted because purchase records exist.",
        data: packageDoc,
      });
    }

    await packageDoc.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Package deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting package:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while deleting package.",
    });
  }
};

/**
 * List purchased packages associated with the authenticated therapist's clients.
 * Route: GET /api/packages/client-packages
 * Access: Private (Therapist)
 */
const getClientPackages = async (req, res) => {
  try {
    const filter = { therapistId: req.therapistId };

    if (req.query.clientId && mongoose.Types.ObjectId.isValid(req.query.clientId)) {
      filter.clientId = req.query.clientId;
    }

    if (req.query.status && ["active", "exhausted", "expired"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const clientPackages = await ClientPackage.find(filter)
      .populate("clientId", "name email phone")
      .populate("packageId", "title sessionCount durationMinutes price")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: clientPackages,
    });
  } catch (error) {
    console.error("Error fetching client packages:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching client packages.",
    });
  }
};

/**
 * Initiate package purchase order (creates Razorpay order + pending Payment record).
 * DOES NOT grant credits or activate ClientPackage until webhook verifies payment.
 * Route: POST /api/packages/:id/purchase
 * Access: Private (Therapist on behalf of client)
 */
const initiatePackagePurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid package ID." });
    }

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: "Valid clientId is required." });
    }

    const packageDoc = await Package.findOne({
      _id: id,
      therapistId: req.therapistId,
      isActive: true,
    });

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        message: "Package not found or is currently inactive.",
      });
    }

    const clientDoc = await Client.findOne({
      _id: clientId,
      therapist_id: req.therapistId,
    });

    if (!clientDoc) {
      return res.status(404).json({ success: false, message: "Client not found." });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment.",
      });
    }

    // Create order via Razorpay service
    const receipt = `pkg_${Date.now().toString().slice(-8)}`;
    const order = await createOrder({
      amount: packageDoc.price,
      currency: CURRENCY,
      receipt,
      notes: {
        therapistId: req.therapistId.toString(),
        clientId: clientDoc._id.toString(),
        packageId: packageDoc._id.toString(),
        itemType: "package",
      },
    });

    const breakdown = calculatePaymentBreakdown({ amountInPaise: packageDoc.price });

    // Record pending Payment in 'created' state
    const payment = await Payment.create({
      therapistId: req.therapistId,
      clientId: clientDoc._id,
      packageId: packageDoc._id,
      itemType: "package",
      razorpayOrderId: order.id,
      amount: packageDoc.price,
      currency: CURRENCY,
      platformFee: breakdown.platformFee,
      netTherapistAmount: breakdown.netTherapistAmount,
      status: "created",
    });

    return res.status(201).json({
      success: true,
      message: "Package purchase order initiated successfully.",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        key: getPublicKeyId(),
        package: {
          id: packageDoc._id,
          title: packageDoc.title,
          sessionCount: packageDoc.sessionCount,
        },
        client: {
          id: clientDoc._id,
          name: clientDoc.name,
          email: clientDoc.email,
        },
      },
    });
  } catch (error) {
    console.error("Error initiating package purchase:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while initiating purchase.",
    });
  }
};

/**
 * Public endpoint for clients to check their active package balance for a given therapist.
 * Route: GET /api/packages/public/:slug/balance
 * Access: Public
 */
const getPublicClientPackageBalance = async (req, res) => {
  try {
    const { slug } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ success: false, message: "Client email is required." });
    }

    const therapist = await Therapist.findOne({ slug: slug.trim().toLowerCase() }).lean();
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    const client = await Client.findOne({
      therapist_id: therapist._id,
      email: email.trim().toLowerCase(),
    }).lean();

    if (!client) {
      return res.status(200).json({
        success: true,
        data: {
          hasActivePackage: false,
          remainingCredits: 0,
          packages: [],
        },
      });
    }

    const activePackages = await ClientPackage.find({
      therapistId: therapist._id,
      clientId: client._id,
      status: "active",
      remainingSessions: { $gt: 0 },
      expiresAt: { $gt: new Date() },
    })
      .populate("packageId", "title durationMinutes")
      .sort({ expiresAt: 1 });

    const totalRemaining = activePackages.reduce((acc, p) => acc + p.remainingSessions, 0);

    return res.status(200).json({
      success: true,
      data: {
        hasActivePackage: totalRemaining > 0,
        remainingCredits: totalRemaining,
        packages: activePackages.map((p) => ({
          clientPackageId: p._id,
          packageTitle: p.packageId?.title || "Session Package",
          durationMinutes: p.packageId?.durationMinutes || 60,
          totalSessions: p.totalSessions,
          usedSessions: p.usedSessions,
          remainingSessions: p.remainingSessions,
          expiresAt: p.expiresAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error checking package balance:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while checking package balance.",
    });
  }
};

/**
 * Public endpoint to list active packages for a therapist profile.
 * Route: GET /api/packages/public/:slug
 * Access: Public
 */
const getPublicPackages = async (req, res) => {
  try {
    const { slug } = req.params;
    const therapist = await Therapist.findOne({ slug: slug.trim().toLowerCase() }).lean();
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    const packages = await Package.find({
      therapistId: therapist._id,
      isActive: true,
    })
      .select("title description sessionCount durationMinutes price discountPercentage validityDays")
      .sort({ price: 1 });

    return res.status(200).json({
      success: true,
      data: packages,
    });
  } catch (error) {
    console.error("Error fetching public packages:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching packages.",
    });
  }
};

/**
 * Public endpoint for clients to initiate a package purchase order.
 * Route: POST /api/packages/public/:slug/:id/purchase
 * Access: Public
 */
const initiatePublicPackagePurchase = async (req, res) => {
  try {
    const { slug, id } = req.params;
    const { clientName, clientEmail, clientPhone } = req.body;

    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return res.status(400).json({ success: false, message: "Client name is required." });
    }

    if (!clientEmail || typeof clientEmail !== "string" || !clientEmail.trim()) {
      return res.status(400).json({ success: false, message: "Client email is required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email format." });
    }

    const therapist = await Therapist.findOne({ slug: slug.trim().toLowerCase() }).lean();
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid package ID." });
    }

    const packageDoc = await Package.findOne({
      _id: id,
      therapistId: therapist._id,
      isActive: true,
    });

    if (!packageDoc) {
      return res.status(404).json({ success: false, message: "Package not found or is inactive." });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment.",
      });
    }

    // Safely sync client record for this therapist
    const clientDoc = await syncClientForBooking({
      therapistId: therapist._id,
      clientName: clientName.trim(),
      clientEmail: normalizedEmail,
      clientPhone: clientPhone || "",
    });

    // Create Razorpay order
    const receipt = `pkg_${Date.now().toString().slice(-8)}`;
    const order = await createOrder({
      amount: packageDoc.price,
      currency: CURRENCY,
      receipt,
      notes: {
        therapistId: therapist._id.toString(),
        clientId: clientDoc._id.toString(),
        packageId: packageDoc._id.toString(),
        itemType: "package",
      },
    });

    const breakdown = calculatePaymentBreakdown({ amountInPaise: packageDoc.price });

    const payment = await Payment.create({
      therapistId: therapist._id,
      clientId: clientDoc._id,
      packageId: packageDoc._id,
      itemType: "package",
      razorpayOrderId: order.id,
      amount: packageDoc.price,
      currency: CURRENCY,
      platformFee: breakdown.platformFee,
      netTherapistAmount: breakdown.netTherapistAmount,
      status: "created",
    });

    return res.status(201).json({
      success: true,
      message: "Package purchase order initiated successfully.",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        key: getPublicKeyId(),
        package: {
          id: packageDoc._id,
          title: packageDoc.title,
          sessionCount: packageDoc.sessionCount,
          price: packageDoc.price,
        },
        client: {
          id: clientDoc._id,
          name: clientDoc.name,
          email: clientDoc.email,
        },
      },
    });
  } catch (error) {
    console.error("Error initiating public package purchase:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while initiating package purchase.",
    });
  }
};

module.exports = {
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
};
