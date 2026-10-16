// controllers/userController.js
const User = require('../models/User');
const githubService = require('../services/githubService');
const groqService = require('../services/groqService');
const chatService = require('../services/chatService');
const Chat = require('../models/Chat');

// Helper function for consistent error responses
const sendErrorResponse = (res, statusCode, message, error = null) => {
  console.error(`Error: ${message}`, error?.message || '');
  return res.status(statusCode).json({
    success: false,
    message,
    ...(error && { error: error.message }),
    ...(error?.code && { code: error.code }),
  });
};

// Helper function for successful responses
const sendSuccessResponse = (res, data, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data
  });
};

// Must export getMe
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found');
    }
    return sendSuccessResponse(res, { user });
  } catch (err) {
    return sendErrorResponse(res, 500, 'Failed to fetch user details', err);
  }
};

exports.check = async (req, res) => {
  try {
    const response = await groqService.queryLLM("Hi");
    return sendSuccessResponse(res, { response });
  } catch (err) {
    return sendErrorResponse(res, err.statusCode || 500, err.message || 'LLM query failed', err);
  }
};

exports.getRepos = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username?.trim()) {
      return sendErrorResponse(res, 400, 'Username is required');
    }

    const repos = await githubService.getUserRepos(username);
    return sendSuccessResponse(res, { repos }, 'Repositories fetched successfully');
  } catch (err) {
    return sendErrorResponse(res, err.statusCode || 500, 'Failed to fetch repositories', err);
  }
};

exports.getRepo = async (req, res) => {
  try {
    const { username, repo } = req.query;
    if (!username?.trim() || !repo?.trim()) {
      return sendErrorResponse(res, 400, 'Username and repository name are required');
    }

    const info = await githubService.getRepoInfo(username, repo);
    if (!info) {
      return sendErrorResponse(res, 404, 'Repository not found');
    }

    return sendSuccessResponse(res, { info }, 'Repository information fetched successfully');
  } catch (err) {
    return sendErrorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch repository information', err);
  }
};

exports.createIssue = async (req, res) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'User authentication required');
    }

    const { owner, repo, title, body, userAccessToken } = req.body;
    if (!owner || !repo || !title || !body) {
      return sendErrorResponse(res, 400, 'Provide all the values!');
    }

    // Writes only with an explicit per-user GitHub token — never the shared GITHUB_TOKEN
    const data = await githubService.createIssue(owner, repo, title, body, {
      userAccessToken
    });

    if (!data) {
      return sendErrorResponse(res, 404, 'No data!');
    }

    return sendSuccessResponse(res, { data }, 'Issue created successfully');
  } catch (err) {
    return sendErrorResponse(
      res,
      err.statusCode || 500,
      err.message || 'Failed to create issue',
      err
    );
  }
};

exports.getLatestContributors = async (req, res) => {
  try {
    const { owner, repo } = req.query;

    if (!owner || !repo) return sendErrorResponse(res, 400, 'Provide the owner and repo!');

    const data = await githubService.getLatestCommitContributors(owner, repo);

    if (!data) {
      return sendErrorResponse(res, 404, 'Nothing found!');
    }

    return sendSuccessResponse(res, { contributors: data }, 'Contributors fetched successfully');
  } catch (err) {
    return sendErrorResponse(res, err.statusCode || 500, 'Failed to fetch contributors', err);
  }
};

exports.getRepoTreeStructure = async (req, res) => {
  try {
    const { owner, repo, branch = 'main' } = req.query;

    if (!owner || !repo) {
      return sendErrorResponse(res, 400, 'Owner or repository name is missing!');
    }

    const repoStructure = await githubService.getRepoTreeStructure(owner, repo, branch);

    return sendSuccessResponse(res, { repoStructure }, 'Fetched repo structure');
  } catch (error) {
    return sendErrorResponse(res, error.statusCode || 500, error.message || 'Failed to fetch repo structure', error);
  }
};

exports.getAllContributors = async (req, res) => {
  try {
    const { owner, repo } = req.query;
    if (!owner?.trim() || !repo?.trim()) {
      return sendErrorResponse(res, 400, 'Owner and repository name are required');
    }

    const data = await githubService.getAllContributors(owner, repo);
    if (!data) {
      return sendErrorResponse(res, 404, 'No contributors found');
    }

    return sendSuccessResponse(res, { contributors: data }, 'Contributors fetched successfully');
  } catch (err) {
    return sendErrorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch contributors', err);
  }
};

exports.chatAboutRepo = async (req, res) => {
  try {
    const {
      question,
      repoUrl,
      additionalParams = {},
      sessionMessages = [],
    } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return sendErrorResponse(res, 401, 'User authentication required');
    }
    if (!question?.trim() || !repoUrl?.trim()) {
      return sendErrorResponse(res, 400, 'Question and repository URL are required');
    }

    const result = await chatService.processChatTurn({
      question,
      repoUrl,
      additionalParams,
      sessionMessages,
    });

    // Best-effort existing Chat model writes (no new persistence features)
    try {
      await Chat.create({
        userId,
        botId: 'github-assistant',
        message: question.trim().slice(0, 5000),
        senderType: 'user',
        context: {
          owner: result.owner,
          repo: result.repo,
          selectedTool: result.selectedTool,
        },
      });
      await Chat.create({
        userId,
        botId: 'github-assistant',
        message: String(result.message).slice(0, 5000),
        senderType: 'bot',
        context: {
          owner: result.owner,
          repo: result.repo,
          selectedTool: result.selectedTool,
        },
      });
    } catch (persistError) {
      console.error('Chat persist skipped:', persistError.message);
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      selectedTool: result.selectedTool,
      dataLabel: result.dataLabel,
      owner: result.owner,
      repo: result.repo,
      path: result.path,
      // Keep githubData for debugging/compatibility; string form matches prior clients
      githubData: JSON.stringify(result.githubData, null, 2),
    });
  } catch (err) {
    console.error('Error in chatAboutRepo:', {
      message: err.message,
      code: err.code,
      userId: req.user?.id,
    });
    let status = err.statusCode || 500;
    let message = err.message || 'Chat processing failed';
    if (err.code === 'GROQ_NOT_CONFIGURED') {
      status = 503;
      message =
        'AI chat is not configured. Set GROQ_API_KEY in the Backend environment and restart the server.';
    } else if (err.code === 'GROQ_TIMEOUT') {
      status = 504;
      message = 'The AI took too long to respond. Please try again in a moment.';
    } else if (err.code === 'GROQ_UNAVAILABLE') {
      status = 503;
      message = 'The AI service is temporarily unavailable. Please try again shortly.';
    }
    return sendErrorResponse(res, status, message, err);
  }
};