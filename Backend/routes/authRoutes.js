const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const asyncHandler = require('../middleware/asyncHandler');

// Public routes
router.post('/signup', asyncHandler(register));
router.post('/login', asyncHandler(login));

module.exports = router;
