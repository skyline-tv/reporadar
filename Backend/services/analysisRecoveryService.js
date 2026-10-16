const Analysis = require('../models/Analysis');
const repoAnalysisService = require('./repoAnalysisService');

/**
 * Analyses left in pending/processing after a crash or hung request.
 * Default: older than analysis timeout (+ buffer), or ANALYSIS_STALE_MS.
 */
function getStaleCutoffMs() {
  const configured = Number(process.env.ANALYSIS_STALE_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const analysisTimeout = Number(process.env.ANALYSIS_TIMEOUT_MS) || 180000;
  return analysisTimeout + 5 * 60 * 1000;
}

/**
 * Mark stale in-flight analyses as failed so users can retry and history stays accurate.
 */
async function recoverStaleAnalyses() {
  const cutoff = new Date(Date.now() - getStaleCutoffMs());
  const result = await Analysis.updateMany(
    {
      status: { $in: ['pending', 'processing'] },
      updatedAt: { $lt: cutoff },
    },
    {
      $set: {
        status: 'failed',
        error:
          'Analysis timed out or was interrupted before completion. Please retry.',
        errorCode: 'STALE_JOB',
        report: null,
      },
    }
  );

  const recovered = result.modifiedCount || result.nModified || 0;
  if (recovered > 0) {
    console.warn(`Recovered ${recovered} stale analysis job(s) older than ${cutoff.toISOString()}`);
  }
  return recovered;
}

/**
 * Remove leftover clone directories after crashes / timeouts.
 */
async function cleanupTempRepositories() {
  await repoAnalysisService.cleanupOldRepositories();
}

async function runStartupRecovery() {
  try {
    const recovered = await recoverStaleAnalyses();
    await cleanupTempRepositories();
    return { recovered };
  } catch (error) {
    console.error('Startup analysis recovery failed:', error.message);
    return { recovered: 0, error: error.message };
  }
}

function startPeriodicRecovery(intervalMs = Number(process.env.ANALYSIS_RECOVERY_INTERVAL_MS) || 10 * 60 * 1000) {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 60000 ? intervalMs : 10 * 60 * 1000;
  const timer = setInterval(() => {
    runStartupRecovery().catch((err) => {
      console.error('Periodic analysis recovery failed:', err.message);
    });
  }, safeInterval);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  recoverStaleAnalyses,
  cleanupTempRepositories,
  runStartupRecovery,
  startPeriodicRecovery,
  getStaleCutoffMs,
};
