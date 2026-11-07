const jwt = require("jsonwebtoken");

/**
 * Authentication Middleware
 * Strictly validates the Authorization header format (`Bearer <token>`),
 * verifies the JWT token, and attaches `req.therapistId`.
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Reject requests where Authorization header is missing or not a string
    if (!authHeader || typeof authHeader !== "string") {
      return res.status(401).json({
        success: false,
        message: "Access denied. Missing authorization header.",
      });
    }

    // 2. Reject headers that do not start with the exact 'Bearer ' prefix
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Authorization header must use Bearer scheme.",
      });
    }

    // 3. Extract the token safely using slice(7).trim()
    const token = authHeader.slice(7).trim();

    // 4. Reject an empty token or a token containing spaces
    if (!token || token.includes(" ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token is missing or malformed.",
      });
    }

    // 5. Ensure server has JWT_SECRET configured
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured in environment variables.");
      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error.",
      });
    }

    // 6. Verify the JWT using process.env.JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 7. Attach the decoded therapistId to req.therapistId
    req.therapistId = decoded.therapistId;

    // 8. Call next() only after successful verification
    next();
  } catch (error) {
    // Return HTTP 401 for invalid, tampered, or expired tokens
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

module.exports = authMiddleware;
