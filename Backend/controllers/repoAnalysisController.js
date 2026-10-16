const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const repoAnalysisService = require('../services/repoAnalysisService');
const Analysis = require('../models/Analysis');
const { parseGitHubUrl } = require('../services/chatService');

const ACTIVE_STATUSES = ['pending', 'processing'];
const DUPLICATE_WINDOW_MS = Number(process.env.ANALYSIS_DUPLICATE_WINDOW_MS) || 15 * 60 * 1000;

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

/**
 * Strip internal filesystem paths / oversized blobs before persistence or response.
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;

  const skippedFiles = Array.isArray(metadata.skippedFiles)
    ? metadata.skippedFiles.slice(0, 100).map((item) => ({
        path: String(item?.path || '')
          .replace(/\\/g, '/')
          .replace(/^.*?temp_repos\/[^/]+\//i, '')
          .slice(0, 500),
        reason: String(item?.reason || 'skipped').slice(0, 300),
        ...(typeof item?.size === 'number' ? { size: item.size } : {}),
      }))
    : undefined;

  return {
    projectType: metadata.projectType || null,
    languages: metadata.languages || [],
    frameworks: metadata.frameworks || [],
    packageManagers: metadata.packageManagers || [],
    entryPoints: metadata.entryPoints || [],
    configFiles: Array.isArray(metadata.configFiles)
      ? metadata.configFiles.slice(0, 50)
      : [],
    filesAnalyzed: metadata.filesAnalyzed,
    filesSkipped: metadata.filesSkipped,
    llmEnabled: metadata.llmEnabled,
    structureTruncated: metadata.structureTruncated,
    limits: metadata.limits || undefined,
    analyzedAt: metadata.analyzedAt || undefined,
    ...(skippedFiles ? { skippedFiles } : {}),
  };
}

function toHistoryItem(doc) {
  return {
    id: doc._id,
    repoUrl: doc.repoUrl,
    owner: doc.owner,
    repo: doc.repo,
    status: doc.status,
    error: doc.status === 'failed' ? doc.error : undefined,
    errorCode: doc.status === 'failed' ? doc.errorCode : undefined,
    projectType: doc.metadata?.projectType || null,
    frameworks: doc.metadata?.frameworks || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.status === 'completed' ? doc.updatedAt : null,
  };
}

function toDetail(doc) {
  return {
    id: doc._id,
    repoUrl: doc.repoUrl,
    owner: doc.owner,
    repo: doc.repo,
    status: doc.status,
    report: doc.report,
    metadata: doc.metadata,
    error: doc.error,
    errorCode: doc.errorCode,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

exports.analyzeRepository = async (req, res) => {
  let analysisDoc = null;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array(),
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      });
    }

    const { repoUrl } = req.body;
    if (!repoUrl?.trim() || !repoUrl.includes('github.com')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GitHub repository URL',
      });
    }

    let owner;
    let repo;
    try {
      ({ owner, repo } = parseGitHubUrl(repoUrl));
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: parseError.message || 'Invalid GitHub repository URL',
      });
    }

    const normalizedUrl = `https://github.com/${owner}/${repo}`;

    // Prevent duplicate in-flight analyses for the same user + repo
    const duplicateCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const existingActive = await Analysis.findOne({
      userId,
      owner,
      repo,
      status: { $in: ACTIVE_STATUSES },
      createdAt: { $gte: duplicateCutoff },
    }).sort({ createdAt: -1 });

    if (existingActive) {
      return res.status(409).json({
        success: false,
        message: 'An analysis for this repository is already in progress',
        code: 'ANALYSIS_IN_PROGRESS',
        data: {
          analysisId: existingActive._id,
          status: existingActive.status,
          owner: existingActive.owner,
          repo: existingActive.repo,
        },
      });
    }

    analysisDoc = await Analysis.create({
      userId,
      repoUrl: normalizedUrl,
      owner,
      repo,
      status: 'pending',
    });

    analysisDoc.status = 'processing';
    await analysisDoc.save();

    const analysis = await repoAnalysisService.analyzeRepository(normalizedUrl);
    const safeMetadata = sanitizeMetadata(analysis.metadata);

    analysisDoc.status = 'completed';
    analysisDoc.report = analysis.report || '';
    analysisDoc.metadata = safeMetadata;
    analysisDoc.error = null;
    analysisDoc.errorCode = null;
    await analysisDoc.save();

    return res.status(200).json({
      success: true,
      message: 'Repository analysis completed successfully',
      data: {
        ...analysis,
        metadata: safeMetadata,
        analysisId: analysisDoc._id,
        status: analysisDoc.status,
      },
    });
  } catch (error) {
    console.error('Repository analysis error:', error.message);

    if (analysisDoc?._id) {
      try {
        analysisDoc.status = 'failed';
        analysisDoc.error = String(error.message || 'Analysis failed').slice(0, 2000);
        analysisDoc.errorCode = error.code || null;
        analysisDoc.report = null;
        await analysisDoc.save();
      } catch (persistError) {
        console.error('Failed to persist analysis failure:', persistError.message);
      }
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to analyze repository',
      error: error.message,
      code: error.code,
      data: analysisDoc
        ? {
            analysisId: analysisDoc._id,
            status: 'failed',
          }
        : undefined,
    });
  }
};

exports.getAnalysisHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { userId };
    if (req.query.status) {
      const status = String(req.query.status);
      if (['pending', 'processing', 'completed', 'failed'].includes(status)) {
        filter.status = status;
      }
    }

    const [total, docs] = await Promise.all([
      Analysis.countDocuments(filter),
      Analysis.find(filter)
        .select('-report -metadata.skippedFiles')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items: docs.map(toHistoryItem),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('getAnalysisHistory error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load analysis history',
    });
  }
};

exports.getAnalysisById = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid analysis id',
        code: 'INVALID_ID',
      });
    }

    const doc = await Analysis.findById(id).lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found',
      });
    }

    if (String(doc.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this analysis',
        code: 'FORBIDDEN',
      });
    }

    return res.status(200).json({
      success: true,
      data: toDetail(doc),
    });
  } catch (error) {
    console.error('getAnalysisById error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load analysis',
    });
  }
};

exports.deleteAnalysis = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid analysis id',
        code: 'INVALID_ID',
      });
    }

    const doc = await Analysis.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found',
      });
    }

    if (String(doc.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this analysis',
        code: 'FORBIDDEN',
      });
    }

    if (ACTIVE_STATUSES.includes(doc.status)) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete an analysis that is still in progress',
        code: 'ANALYSIS_IN_PROGRESS',
      });
    }

    await doc.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Analysis deleted',
      data: { id },
    });
  } catch (error) {
    console.error('deleteAnalysis error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete analysis',
    });
  }
};
