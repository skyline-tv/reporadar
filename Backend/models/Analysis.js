const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    repoUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    owner: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    repo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    report: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    errorCode: {
      type: String,
      default: null,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  }
);

analysisSchema.index({ userId: 1, createdAt: -1 });
analysisSchema.index({ userId: 1, owner: 1, repo: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Analysis', analysisSchema);
