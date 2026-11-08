const Therapist = require("../models/Therapist");

/**
 * Get authenticated therapist profile.
 * Route: GET /api/therapist/me
 * Access: Private (authMiddleware required)
 */
const getMe = async (req, res) => {
  try {
    // req.therapistId is attached by authMiddleware
    // password_hash is excluded by default in schema
    const therapist = await Therapist.findById(req.therapistId);

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: therapist._id,
        name: therapist.name,
        email: therapist.email,
        slug: therapist.slug,
        bio: therapist.bio,
        specializations: therapist.specializations,
        languages: therapist.languages,
        createdAt: therapist.createdAt,
        updatedAt: therapist.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching therapist profile:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the profile.",
    });
  }
};

/**
 * Update authenticated therapist profile.
 * Route: PUT /api/therapist/me
 * Access: Private (authMiddleware required)
 */
const updateMe = async (req, res) => {
  try {
    const { name, bio, specializations, languages } = req.body;

    const updates = {};

    // 1. Validate 'name' if provided
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name must be a non-empty string.",
        });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({
          success: false,
          message: "Name cannot exceed 100 characters.",
        });
      }
      updates.name = name.trim();
    }

    // 2. Validate 'bio' if provided
    if (bio !== undefined) {
      if (typeof bio !== "string") {
        return res.status(400).json({
          success: false,
          message: "Bio must be a string.",
        });
      }
      if (bio.trim().length > 2500) {
        return res.status(400).json({
          success: false,
          message: "Bio cannot exceed 2500 characters.",
        });
      }
      updates.bio = bio.trim();
    }

    // 3. Validate 'specializations' if provided
    if (specializations !== undefined) {
      if (
        !Array.isArray(specializations) ||
        !specializations.every((item) => typeof item === "string")
      ) {
        return res.status(400).json({
          success: false,
          message: "Specializations must be an array of strings.",
        });
      }
      updates.specializations = [
        ...new Set(
          specializations
            .map((item) => item.trim())
            .filter(Boolean)
        ),
      ];
    }

    // 4. Validate 'languages' if provided
    if (languages !== undefined) {
      if (
        !Array.isArray(languages) ||
        !languages.every((item) => typeof item === "string")
      ) {
        return res.status(400).json({
          success: false,
          message: "Languages must be an array of strings.",
        });
      }
      updates.languages = [
        ...new Set(
          languages
            .map((item) => item.trim())
            .filter(Boolean)
        ),
      ];
    }

    // 5. Ensure at least one updatable field was supplied
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "At least one valid field (name, bio, specializations, languages) must be provided for update.",
      });
    }

    // 6. Update document in MongoDB using authenticated therapistId (prevents modifying other accounts)
    // Mass assignment prevention: only 'updates' object is applied ($set: updates)
    const therapist = await Therapist.findByIdAndUpdate(
      req.therapistId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // 7. Return updated profile with safe fields only (no password_hash)
    return res.status(200).json({
      success: true,
      message: "Therapist profile updated successfully.",
      data: {
        id: therapist._id,
        name: therapist.name,
        email: therapist.email,
        slug: therapist.slug,
        bio: therapist.bio,
        specializations: therapist.specializations,
        languages: therapist.languages,
        createdAt: therapist.createdAt,
        updatedAt: therapist.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating therapist profile:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while updating the profile.",
    });
  }
};

/**
 * Get public therapist profile by unique slug.
 * Route: GET /api/therapist/:slug
 * Access: Public (no JWT required)
 */
const getTherapistBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== "string" || !slug.trim()) {
      return res.status(400).json({
        success: false,
        message: "Valid slug is required.",
      });
    }

    // Search for therapist by unique slug (case-insensitive) using field selection and .lean()
    const therapist = await Therapist.findOne({
      slug: slug.trim().toLowerCase(),
    })
      .select("name slug bio specializations languages _id")
      .lean();

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // Return ONLY public information: never return email, password_hash, or internal IDs
    return res.status(200).json({
      success: true,
      data: {
        name: therapist.name,
        slug: therapist.slug,
        bio: therapist.bio,
        specializations: therapist.specializations,
        languages: therapist.languages,
      },
    });
  } catch (error) {
    console.error("Error fetching therapist by slug:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the public profile.",
    });
  }
};

module.exports = {
  getMe,
  updateMe,
  getTherapistBySlug,
};

