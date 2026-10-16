const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/userController.js');

// Protected route (requires JWT)
router.get('/profile', auth, asyncHandler(controller.getMe));

// Read-only GitHub helpers (public metadata via GitHub API)
router.get('/repos', asyncHandler(controller.getRepos));
router.get('/repo', asyncHandler(controller.getRepo));
router.get('/latest_contributors', asyncHandler(controller.getLatestContributors));
router.get('/all_contributors', asyncHandler(controller.getAllContributors));
router.get('/check', asyncHandler(controller.check));

// GitHub mutations require authentication (writes still need user-authorized token)
router.post('/issue', auth, asyncHandler(controller.createIssue));

// Chat requires authentication
router.post('/chat', auth, asyncHandler(controller.chatAboutRepo));

module.exports = router;
