const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const groqService = require('./groqService');
const { parseGitHubUrl } = require('./chatService');

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.java', '.go', '.rs',
  '.php', '.rb', '.cs', '.kt', '.swift', '.scala', '.vue', '.svelte',
]);

const CONFIG_FILES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'poetry.lock', 'setup.py',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'tsconfig.json', 'jsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts',
  'vite.config.js', 'vite.config.ts', 'webpack.config.js', 'angular.json',
  'README.md', 'readme.md', 'README', 'readme', '.env.example', 'Procfile', 'Makefile',
  'SECURITY.md', 'CONTRIBUTING.md',
]);

const ROOT_ENTRY_CANDIDATES = new Set([
  'index.js', 'index.ts', 'index.mjs', 'server.js', 'server.ts', 'app.js', 'app.ts',
  'main.py', 'app.py', 'main.go', 'main.rs', 'manage.py', 'wsgi.py', 'asgi.py',
]);

const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '__pycache__', 'venv', '.venv', '.git',
  'coverage', '.next', '.cache', 'artifacts', 'vendor', 'target', '.turbo',
  '.idea', '.vscode', 'Pods', 'DerivedData', 'tmp', 'temp', '.tox', '.mypy_cache',
]);

const LIMITS = {
  maxFiles: Number(process.env.ANALYSIS_MAX_FILES) || 40,
  maxFileSize: Number(process.env.ANALYSIS_MAX_FILE_SIZE) || 120000, // bytes
  maxTotalSize: Number(process.env.ANALYSIS_MAX_TOTAL_SIZE) || 1500000, // bytes sampled
  maxContentPerFile: Number(process.env.ANALYSIS_MAX_CONTENT_PER_FILE) || 2500, // chars
  maxTotalContent: Number(process.env.ANALYSIS_MAX_TOTAL_CONTENT) || 45000, // chars to Groq
  maxTreeEntries: 200,
  cloneTimeoutMs: Number(process.env.ANALYSIS_CLONE_TIMEOUT_MS) || 90000,
  analysisTimeoutMs: Number(process.env.ANALYSIS_TIMEOUT_MS) || 180000,
  groqTimeoutMs: Number(process.env.ANALYSIS_GROQ_TIMEOUT_MS) || 90000,
  groqMaxTokens: Number(process.env.ANALYSIS_GROQ_MAX_TOKENS) || 3500,
};

class RepoAnalysisService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp_repos');
  }

  async createTempDirectory() {
    await fs.ensureDir(this.tempDir);
  }

  async cleanupTempDirectory(repoPath) {
    try {
      if (repoPath && (await fs.pathExists(repoPath))) {
        await fs.remove(repoPath);
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  }

  async cleanupOldRepositories() {
    try {
      // Default: remove clones older than analysis timeout (crash / hung clone leftovers)
      const MAX_AGE =
        Number(process.env.ANALYSIS_TEMP_MAX_AGE_MS) ||
        Math.max(LIMITS.analysisTimeoutMs, LIMITS.cloneTimeoutMs) + 5 * 60 * 1000;
      const now = Date.now();
      if (!(await fs.pathExists(this.tempDir))) return;
      const items = await fs.readdir(this.tempDir);
      for (const item of items) {
        // Only touch clone directories we create: owner-repo-timestamp
        if (!/^[A-Za-z0-9_.-]+-[A-Za-z0-9_.-]+-\d+$/.test(item)) continue;
        const itemPath = path.join(this.tempDir, item);
        const stats = await fs.stat(itemPath);
        if (now - stats.ctimeMs > MAX_AGE) {
          await fs.remove(itemPath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old repositories:', error.message);
    }
  }

  /**
   * Normalize GitHub URL for shallow clone (https only, no shell interpolation).
   */
  parseGitUrl(url) {
    const { owner, repo } = parseGitHubUrl(url);
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    return { owner, repo, cloneUrl };
  }

  runGitClone(cloneUrl, repoPath, timeoutMs) {
    return new Promise((resolve, reject) => {
      // Disable hooks template writes (safer + works on restricted filesystems)
      const args = [
        '-c',
        'core.hooksPath=/dev/null',
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--no-tags',
        cloneUrl,
        repoPath,
      ];
      const child = spawn('git', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        const err = new Error(`git clone timed out after ${timeoutMs}ms`);
        err.statusCode = 504;
        err.code = 'CLONE_TIMEOUT';
        reject(err);
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          const err = new Error(`Failed to clone repository: ${stderr.trim() || `exit ${code}`}`);
          err.statusCode = 502;
          err.code = 'CLONE_FAILED';
          reject(err);
        }
      });
    });
  }

  async cloneRepository(url) {
    const { owner, repo, cloneUrl } = this.parseGitUrl(url);
    const repoPath = path.join(this.tempDir, `${owner}-${repo}-${Date.now()}`);
    await this.createTempDirectory();

    try {
      await this.runGitClone(cloneUrl, repoPath, LIMITS.cloneTimeoutMs);
      return { repoPath, owner, repo, cloneUrl };
    } catch (error) {
      await this.cleanupTempDirectory(repoPath);
      throw error;
    }
  }

  async safeReadJson(filePath) {
    try {
      return await fs.readJson(filePath);
    } catch {
      return null;
    }
  }

  async safeReadText(filePath, maxChars = 8000) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.length > maxChars ? content.slice(0, maxChars) : content;
    } catch {
      return null;
    }
  }

  async listTopLevel(repoPath) {
    try {
      const entries = await fs.readdir(repoPath);
      const result = [];
      for (const name of entries) {
        if (name === '.git') continue;
        const full = path.join(repoPath, name);
        const stat = await fs.stat(full);
        result.push({ name, type: stat.isDirectory() ? 'dir' : 'file' });
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  /**
   * Deterministic project inspection (no LLM).
   */
  async inspectProject(repoPath, owner, repo) {
    const languages = {};
    const frameworks = new Set();
    const packageManagers = new Set();
    const entryPoints = [];
    const configFiles = [];
    const dependencySummary = {};
    const structureSample = [];
    const skippedDuringWalk = [];

    let fileCount = 0;

    const walkLimited = async (dir, depth = 0) => {
      if (structureSample.length >= LIMITS.maxTreeEntries) return;
      let entries;
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }

      for (const name of entries) {
        if (structureSample.length >= LIMITS.maxTreeEntries) break;
        if (EXCLUDED_DIRS.has(name)) continue;

        const full = path.join(dir, name);
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          continue;
        }

        const relative = path.relative(repoPath, full).replace(/\\/g, '/');

        if (stat.isDirectory()) {
          if (depth < 3) {
            structureSample.push(`${relative}/`);
            await walkLimited(full, depth + 1);
          }
        } else {
          fileCount += 1;
          structureSample.push(relative);
          const ext = path.extname(name).toLowerCase();
          if (SOURCE_EXTENSIONS.has(ext)) {
            languages[ext] = (languages[ext] || 0) + 1;
          }
          if (CONFIG_FILES.has(name)) {
            configFiles.push(relative);
          }
        }
      }
    };

    await walkLimited(repoPath);

    const topLevel = await this.listTopLevel(repoPath);
    const topNames = new Set(topLevel.map((t) => t.name));

    // package.json / Node
    const pkgPath = path.join(repoPath, 'package.json');
    if (await fs.pathExists(pkgPath)) {
      packageManagers.add('npm/yarn/pnpm (Node.js)');
      const pkg = await this.safeReadJson(pkgPath);
      if (pkg) {
        dependencySummary.packageJson = {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description || null,
          scripts: pkg.scripts ? Object.keys(pkg.scripts).slice(0, 20) : [],
          dependencies: pkg.dependencies ? Object.keys(pkg.dependencies).slice(0, 40) : [],
          devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies).slice(0, 40) : [],
          engines: pkg.engines || null,
          type: pkg.type || null,
        };

        const deps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        const depNames = Object.keys(deps);
        const pkgName = String(pkg.name || '').toLowerCase();

        if (depNames.some((d) => d === 'next' || d.startsWith('next/'))) frameworks.add('Next.js');
        if (depNames.includes('react') || pkgName === 'react') frameworks.add('React');
        if (depNames.includes('vue') || pkgName === 'vue') frameworks.add('Vue');
        if (depNames.includes('@angular/core')) frameworks.add('Angular');
        if (depNames.includes('express') || pkgName === 'express') frameworks.add('Express');
        if (depNames.includes('fastify') || pkgName === 'fastify') frameworks.add('Fastify');
        if (depNames.includes('nestjs') || depNames.some((d) => d.startsWith('@nestjs/'))) {
          frameworks.add('NestJS');
        }
        if (depNames.includes('svelte')) frameworks.add('Svelte');
        if (depNames.includes('django')) frameworks.add('Django');
        if (pkgName === 'lodash' || pkgName.startsWith('lodash.')) frameworks.add('Lodash utility library');

        for (const key of ['main', 'module', 'types']) {
          if (pkg[key]) entryPoints.push({ type: 'package.json', path: pkg[key] });
        }
        if (pkg.scripts?.start) entryPoints.push({ type: 'script:start', path: pkg.scripts.start });
        if (pkg.scripts?.dev) entryPoints.push({ type: 'script:dev', path: pkg.scripts.dev });
      }
      if (topNames.has('package-lock.json')) packageManagers.add('npm');
      if (topNames.has('yarn.lock')) packageManagers.add('yarn');
      if (topNames.has('pnpm-lock.yaml')) packageManagers.add('pnpm');
      if (topNames.has('bun.lockb')) packageManagers.add('bun');
    }

    // Python
    if (topNames.has('requirements.txt') || topNames.has('pyproject.toml') || topNames.has('Pipfile')) {
      packageManagers.add('pip/poetry (Python)');
      languages['.py'] = languages['.py'] || 0;
      if (topNames.has('manage.py')) {
        frameworks.add('Django');
        entryPoints.push({ type: 'django', path: 'manage.py' });
      }
      if (topNames.has('app.py') || topNames.has('wsgi.py') || topNames.has('asgi.py')) {
        frameworks.add('Flask/FastAPI (possible)');
      }
      const req = await this.safeReadText(path.join(repoPath, 'requirements.txt'), 4000);
      if (req) {
        dependencySummary.requirementsTxt = req
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .slice(0, 40);
        const joined = dependencySummary.requirementsTxt.join(' ').toLowerCase();
        if (joined.includes('django')) frameworks.add('Django');
        if (joined.includes('flask')) frameworks.add('Flask');
        if (joined.includes('fastapi')) frameworks.add('FastAPI');
      }
    }

    // Go / Rust / PHP / Ruby / Java
    if (topNames.has('go.mod')) {
      packageManagers.add('go modules');
      const goMod = await this.safeReadText(path.join(repoPath, 'go.mod'), 3000);
      if (goMod) dependencySummary.goMod = goMod.split('\n').slice(0, 30);
    }
    if (topNames.has('Cargo.toml')) {
      packageManagers.add('cargo');
      frameworks.add('Rust/Cargo');
    }
    if (topNames.has('composer.json')) packageManagers.add('composer');
    if (topNames.has('Gemfile')) packageManagers.add('bundler');
    if (topNames.has('pom.xml') || topNames.has('build.gradle') || topNames.has('build.gradle.kts')) {
      packageManagers.add('maven/gradle');
    }

    // Root entry candidates only (avoid treating every nested index.js as config)
    for (const candidate of ROOT_ENTRY_CANDIDATES) {
      if (topNames.has(candidate)) {
        entryPoints.push({ type: 'root-file', path: candidate });
      }
    }
    for (const candidate of ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'Procfile']) {
      if (topNames.has(candidate)) {
        entryPoints.push({ type: 'ops-file', path: candidate });
        configFiles.push(candidate);
      }
    }

    if (await fs.pathExists(path.join(repoPath, 'lib/express.js'))) {
      frameworks.add('Express');
    }
    if (await fs.pathExists(path.join(repoPath, 'lodash.js'))) {
      frameworks.add('Lodash utility library');
    }

    if (topNames.has('next.config.js') || topNames.has('next.config.mjs') || topNames.has('next.config.ts')) {
      frameworks.add('Next.js');
    }
    if (topNames.has('vite.config.js') || topNames.has('vite.config.ts')) {
      frameworks.add('Vite');
    }
    if (topNames.has('angular.json')) frameworks.add('Angular');

    // README without extension (e.g. octocat/Hello-World)
    if (topNames.has('README') || topNames.has('readme')) {
      configFiles.push(topNames.has('README') ? 'README' : 'readme');
    }

    const languageList = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => ({ extension: ext, files: count }));

    let projectType = 'Unknown / mixed';
    if (frameworks.has('Next.js')) projectType = 'Next.js full-stack / frontend app';
    else if (frameworks.has('React') && packageManagers.has('npm/yarn/pnpm (Node.js)')) {
      projectType = 'React frontend application';
    } else if (frameworks.has('Express') || frameworks.has('NestJS') || frameworks.has('Fastify')) {
      projectType = 'Node.js backend / API / framework';
    } else if (frameworks.has('Lodash utility library')) {
      projectType = 'JavaScript utility library';
    } else if (frameworks.has('Django') || frameworks.has('Flask') || frameworks.has('FastAPI')) {
      projectType = 'Python web application';
    } else if (topNames.has('go.mod')) projectType = 'Go application';
    else if (topNames.has('Cargo.toml')) projectType = 'Rust application';
    else if (languageList[0]?.extension === '.py') projectType = 'Python project';
    else if (languageList[0]?.extension === '.js' || languageList[0]?.extension === '.ts') {
      projectType = 'JavaScript/TypeScript project';
    } else if (fileCount < 5) projectType = 'Small / sample repository';

    // Deduplicate config/entry lists
    const uniqueConfigs = [...new Set(configFiles)].slice(0, 50);
    const uniqueEntries = [];
    const seenEntry = new Set();
    for (const e of entryPoints) {
      const key = `${e.type}:${e.path}`;
      if (!seenEntry.has(key)) {
        seenEntry.add(key);
        uniqueEntries.push(e);
      }
    }

    return {
      owner,
      repo,
      projectType,
      languages: languageList,
      frameworks: [...frameworks],
      packageManagers: [...packageManagers],
      entryPoints: uniqueEntries,
      configFiles: uniqueConfigs,
      dependencySummary,
      topLevel,
      structureSample: structureSample.slice(0, LIMITS.maxTreeEntries),
      stats: {
        approxSourceFilesSeen: fileCount,
        structureEntriesCaptured: Math.min(structureSample.length, LIMITS.maxTreeEntries),
        truncatedTree: structureSample.length >= LIMITS.maxTreeEntries,
      },
      skippedDuringWalk,
    };
  }

  scoreFileImportance(relativePath, basename) {
    let score = 0;
    const lower = relativePath.toLowerCase();
    const base = basename.toLowerCase();

    if (CONFIG_FILES.has(basename)) score += 100;
    if (['package.json', 'requirements.txt', 'go.mod', 'cargo.toml', 'pom.xml'].includes(base)) {
      score += 80;
    }
    if (['readme.md', 'dockerfile'].includes(base)) score += 40;
    if (/(^|\/)(src|app|server|api|backend|frontend|lib|core)\//.test(lower)) score += 25;
    if (/(route|controller|service|model|middleware|auth|config)/.test(lower)) score += 20;
    if (/(\.test\.|\.spec\.|__tests__|\/tests?\/)/.test(lower)) score -= 30;
    if (/(\.min\.|bundle|vendor)/.test(lower)) score -= 50;
    if (['index.js', 'index.ts', 'main.py', 'app.js', 'server.js', 'main.go'].includes(base)) {
      score += 35;
    }

    const ext = path.extname(base);
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go'].includes(ext)) score += 10;
    return score;
  }

  async findRelevantFiles(repoPath) {
    const candidates = [];
    const skipped = [];
    let walked = 0;

    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir);
      } catch (error) {
        skipped.push({ path: path.relative(repoPath, dir), reason: 'unreadable directory' });
        return;
      }

      for (const name of entries) {
        if (EXCLUDED_DIRS.has(name)) continue;
        const full = path.join(dir, name);
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          skipped.push({ path: path.relative(repoPath, full), reason: 'stat failed' });
          continue;
        }

        if (stat.isDirectory()) {
          await walk(full);
          continue;
        }

        walked += 1;
        const ext = path.extname(name).toLowerCase();
        const relative = path.relative(repoPath, full).replace(/\\/g, '/');
        const isConfig = CONFIG_FILES.has(name) || name === 'README' || name === 'readme';
        const isSource = SOURCE_EXTENSIONS.has(ext);
        const isRootEntry =
          path.relative(repoPath, path.dirname(full)) === '' && ROOT_ENTRY_CANDIDATES.has(name);

        if (!isConfig && !isSource && !isRootEntry) continue;

        if (stat.size > LIMITS.maxFileSize) {
          skipped.push({
            path: relative,
            reason: `file too large (${stat.size} bytes)`,
            size: stat.size,
          });
          continue;
        }

        candidates.push({
          absolutePath: full,
          relativePath: relative,
          size: stat.size,
          score: this.scoreFileImportance(relative, name),
        });
      }
    };

    await walk(repoPath);

    candidates.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));

    const selected = [];
    const seen = new Set();
    let totalSize = 0;

    for (const file of candidates) {
      if (selected.length >= LIMITS.maxFiles) {
        skipped.push({ path: file.relativePath, reason: 'over max file count after prioritization' });
        continue;
      }
      if (seen.has(file.relativePath)) continue;
      if (totalSize + file.size > LIMITS.maxTotalSize && selected.length > 5) {
        skipped.push({ path: file.relativePath, reason: 'over total sample size budget' });
        continue;
      }
      seen.add(file.relativePath);
      totalSize += file.size;
      selected.push(file);
    }

    return {
      files: selected,
      skipped,
      stats: {
        candidates: candidates.length,
        selected: selected.length,
        walkedFiles: walked,
        totalSelectedBytes: totalSize,
      },
    };
  }

  async analyzeFiles(fileEntries) {
    const fileContents = [];
    const unreadable = [];
    let totalContent = 0;
    const seen = new Set();

    for (const file of fileEntries) {
      if (seen.has(file.relativePath)) continue;
      seen.add(file.relativePath);

      if (totalContent >= LIMITS.maxTotalContent) {
        unreadable.push({ path: file.relativePath, reason: 'omitted — content budget exhausted' });
        continue;
      }

      try {
        const content = await fs.readFile(file.absolutePath, 'utf8');
        const max = LIMITS.maxContentPerFile;
        let truncated = content;
        let wasTruncated = false;
        if (content.length > max) {
          wasTruncated = true;
          truncated =
            `${content.slice(0, Math.floor(max / 2))}\n\n... (truncated; ${content.length} chars total) ...\n\n${content.slice(-Math.floor(max / 2))}`;
        }

        if (totalContent + truncated.length > LIMITS.maxTotalContent) {
          const remaining = LIMITS.maxTotalContent - totalContent;
          if (remaining < 200) {
            unreadable.push({ path: file.relativePath, reason: 'omitted — content budget exhausted' });
            continue;
          }
          truncated = `${truncated.slice(0, remaining)}\n... (truncated to fit budget) ...`;
          wasTruncated = true;
        }

        totalContent += truncated.length;
        fileContents.push({
          path: file.relativePath,
          size: file.size,
          truncated: wasTruncated,
          content: truncated,
        });
      } catch (error) {
        unreadable.push({
          path: file.relativePath,
          reason: `read failed: ${error.message}`,
        });
      }
    }

    return {
      fileContents,
      unreadable,
      stats: {
        filesWithContent: fileContents.length,
        totalChars: totalContent,
      },
    };
  }

  buildReportPrompt(inspection, fileContents, skippedFiles) {
    const systemPrompt = `You are RepoRadar's repository analysis engine.
You MUST:
- Base findings ONLY on the provided inspection metadata and file excerpts.
- Never invent files, dependencies, vulnerabilities, or commits that are not evidenced.
- Separate "Confirmed findings" (directly supported by excerpts/metadata) from "Potential risks" (reasonable concerns that need verification).
- For every bug, security, or quality finding, include a file path and a short evidence quote or concrete reference from the excerpts when available.
- If evidence is weak, say so. Do not claim CVEs or "confirmed vulnerabilities" without clear evidence in the provided text.
- Explicitly list files/paths that could not be inspected when relevant.
- Prefer actionable, prioritized recommendations.
- Output valid Markdown only, using the exact section headings requested.`;

    const inspectionJson = JSON.stringify(
      {
        projectType: inspection.projectType,
        languages: inspection.languages,
        frameworks: inspection.frameworks,
        packageManagers: inspection.packageManagers,
        entryPoints: inspection.entryPoints,
        configFiles: inspection.configFiles,
        dependencySummary: inspection.dependencySummary,
        topLevel: inspection.topLevel,
        structureSample: inspection.structureSample.slice(0, 120),
        stats: inspection.stats,
      },
      null,
      2
    );

    const skippedJson = JSON.stringify(skippedFiles.slice(0, 80), null, 2);

    const fileBlocks = fileContents
      .map(
        (f) => `### FILE: ${f.path} (size=${f.size}, truncated=${f.truncated})
\`\`\`
${f.content}
\`\`\``
      )
      .join('\n\n');

    const userPrompt = `Analyze GitHub repository ${inspection.owner}/${inspection.repo}.

## Deterministic inspection metadata
\`\`\`json
${inspectionJson}
\`\`\`

## Files not fully inspected / skipped
\`\`\`json
${skippedJson}
\`\`\`

## Sampled file contents
${fileBlocks || '_No source file contents were available for sampling._'}

Write a Markdown report with EXACTLY these top-level sections (use ## headings):

## Project overview
## Technology stack
## Architecture overview
## Critical bugs
## Security findings
## Code quality issues
## Missing functionality
## Recommended improvements
## Prioritized action plan

Within Critical bugs, Security findings, and Code quality issues, use subsections:
### Confirmed findings
### Potential risks

If a subsection has no items, write "None identified from the inspected evidence."
End with a short note listing any important files that could not be inspected.`;

    return { systemPrompt, userPrompt };
  }

  async generateReport(inspection, fileContents, skippedFiles) {
    if (!groqService.isGroqConfigured()) {
      // Deterministic fallback report when Groq is unavailable
      return this.buildFallbackReport(inspection, fileContents, skippedFiles);
    }

    const { systemPrompt, userPrompt } = this.buildReportPrompt(
      inspection,
      fileContents,
      skippedFiles
    );

    return groqService.queryLLM(userPrompt, {
      systemPrompt,
      temperature: 0.15,
      maxTokens: LIMITS.groqMaxTokens,
      timeoutMs: LIMITS.groqTimeoutMs,
    });
  }

  buildFallbackReport(inspection, fileContents, skippedFiles) {
    const langs = inspection.languages.map((l) => `${l.extension} (${l.files})`).join(', ') || 'Unknown';
    const frameworks = inspection.frameworks.join(', ') || 'None detected';
    const managers = inspection.packageManagers.join(', ') || 'None detected';
    const entries = inspection.entryPoints.map((e) => `- ${e.path} (${e.type})`).join('\n') || '- None detected';
    const sampled = fileContents.map((f) => `- \`${f.path}\`${f.truncated ? ' (truncated)' : ''}`).join('\n') || '- None';
    const skipped = skippedFiles.slice(0, 30).map((s) => `- \`${s.path}\`: ${s.reason}`).join('\n') || '- None';

    return `## Project overview
Repository **${inspection.owner}/${inspection.repo}** appears to be: **${inspection.projectType}**.
This report was generated from deterministic inspection only (Groq LLM unavailable or not configured). No speculative code-quality or security conclusions are asserted.

## Technology stack
- Languages (sampled counts): ${langs}
- Frameworks detected: ${frameworks}
- Package managers: ${managers}
- Config files observed: ${inspection.configFiles.slice(0, 20).map((c) => `\`${c}\``).join(', ') || 'None'}

## Architecture overview
Top-level layout:
${inspection.topLevel.map((t) => `- ${t.type === 'dir' ? `${t.name}/` : t.name}`).join('\n') || '- Unavailable'}

Likely entry points:
${entries}

## Critical bugs
### Confirmed findings
None identified from the inspected evidence.
### Potential risks
None identified from the inspected evidence (LLM analysis unavailable).

## Security findings
### Confirmed findings
None identified from the inspected evidence.
### Potential risks
None identified from the inspected evidence (LLM analysis unavailable). Review authentication, secrets handling, and dependency advisories manually.

## Code quality issues
### Confirmed findings
None identified from the inspected evidence.
### Potential risks
None identified from the inspected evidence (LLM analysis unavailable).

## Missing functionality
Cannot assess feature completeness without LLM review of implementation details. Inspected ${fileContents.length} file excerpt(s).

## Recommended improvements
- Configure \`GROQ_API_KEY\` to enable full AI code analysis.
- Review skipped/unreadable files listed below.
- Validate dependency advisories with \`npm audit\` / equivalent tools.

## Prioritized action plan
1. Enable Groq-backed analysis for deeper findings.
2. Manually review entry points and auth/config files.
3. Re-run analysis after configuring LLM access.

### Files sampled
${sampled}

### Files not fully inspected
${skipped}
`;
  }

  withTimeout(promise, ms, code = 'ANALYSIS_TIMEOUT') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(`Repository analysis timed out after ${ms}ms`);
        err.statusCode = 504;
        err.code = code;
        reject(err);
      }, ms);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async analyzeRepository(repoUrl) {
    return this.withTimeout(this._analyzeRepository(repoUrl), LIMITS.analysisTimeoutMs);
  }

  async _analyzeRepository(repoUrl) {
    let repoPath;
    try {
      await this.cleanupOldRepositories();

      const debug = process.env.NODE_ENV === 'development';
      if (debug) console.log('Cloning repository:', repoUrl);
      const repoInfo = await this.cloneRepository(repoUrl);
      repoPath = repoInfo.repoPath;

      if (debug) console.log('Inspecting project structure...');
      const inspection = await this.inspectProject(repoPath, repoInfo.owner, repoInfo.repo);

      if (debug) console.log('Selecting relevant files...');
      const { files, skipped, stats: fileStats } = await this.findRelevantFiles(repoPath);

      if (debug) console.log('Reading file samples...');
      const { fileContents, unreadable, stats: contentStats } = await this.analyzeFiles(files);

      const skippedFiles = [...skipped, ...unreadable];

      if (debug) console.log('Generating analysis report...');
      const report = await this.generateReport(inspection, fileContents, skippedFiles);

      return {
        success: true,
        report,
        metadata: {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          analyzedAt: new Date().toISOString(),
          projectType: inspection.projectType,
          languages: inspection.languages,
          frameworks: inspection.frameworks,
          packageManagers: inspection.packageManagers,
          entryPoints: inspection.entryPoints,
          configFiles: inspection.configFiles,
          filesAnalyzed: fileContents.length,
          filesSkipped: skippedFiles.length,
          fileSelection: fileStats,
          contentStats,
          structureTruncated: inspection.stats.truncatedTree,
          llmEnabled: groqService.isGroqConfigured(),
          limits: {
            maxFiles: LIMITS.maxFiles,
            maxContentPerFile: LIMITS.maxContentPerFile,
            maxTotalContent: LIMITS.maxTotalContent,
          },
          skippedFiles: skippedFiles.slice(0, 100),
        },
      };
    } catch (error) {
      console.error('Analysis failed:', error.message);
      if (!error.statusCode) {
        error.statusCode = 500;
      }
      throw error;
    } finally {
      if (repoPath) {
        await this.cleanupTempDirectory(repoPath);
      }
    }
  }
}

module.exports = new RepoAnalysisService();
