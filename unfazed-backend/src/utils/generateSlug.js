const Therapist = require("../models/Therapist");

/**
 * Generates a unique URL-friendly slug based on a therapist's name.
 * Handles conversion to lowercase, removal of special characters,
 * hyphen replacement, and appends a numeric suffix if duplicates exist.
 *
 * @param {string} name - The therapist's full name.
 * @returns {Promise<string>} - A unique slug (e.g., "dr-jane" or "dr-jane-2").
 */
const generateSlug = async (name) => {
  if (!name || typeof name !== "string") {
    name = "therapist";
  }

  // 1. Convert to lowercase, replace non-alphanumeric chars with hyphens, and strip leading/trailing hyphens
  const baseSlug =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "therapist";

  // 2. Ensure uniqueness by checking the database
  let slug = baseSlug;
  let counter = 2;

  while (await Therapist.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

module.exports = generateSlug;

