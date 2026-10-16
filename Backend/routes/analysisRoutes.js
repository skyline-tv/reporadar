const express = require('express');
const router = express.Router();
const {
  analyzeRepository,
  getAnalysisHistory,
  getAnalysisById,
  deleteAnalysis,
} = require('../controllers/repoAnalysisController');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { body } = require('express-validator');

// All analysis routes require JWT
router.use(auth);

/**
 * POST /analysis/repository — run analysis and persist result
 */
router.post(
  '/repository',
  [
    body('repoUrl')
      .trim()
      .notEmpty()
      .withMessage('Repository URL is required')
      .matches(/^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i)
      .withMessage('Invalid GitHub repository URL format'),
  ],
  asyncHandler(analyzeRepository)
);

/**
 * GET /analysis/history?page=&limit=&status=
 * Listing omits full report bodies.
 */
router.get('/history', asyncHandler(getAnalysisHistory));

/**
 * GET /analysis/:id — full report for owner only
 */
router.get('/:id', asyncHandler(getAnalysisById));

/**
 * DELETE /analysis/:id — owner only
 */
router.delete('/:id', asyncHandler(deleteAnalysis));

module.exports = router;
