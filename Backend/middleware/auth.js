const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return res.status(500).json({
      success: false,
      message: 'Server authentication is misconfigured'
    });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: Missing user ID in payload'
      });
    }

    // Only attach the authenticated user id (ignore other JWT claims for authz)
    req.user = {
      id: String(decoded.id)
    };

    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: expired ? 'Token expired' : 'Malformed token'
    });
  }
};
