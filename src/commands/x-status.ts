import { FileSystemService } from '../services/file-system.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService } from '../services/x-api.js';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return 'now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (diffMins > 0) {
    return `${diffMins}m ${diffSecs}s`;
  }
  return `${diffSecs}s`;
}

function renderBar(remaining: number, limit: number, width: number = 20): string {
  const { style } = logger;
  const percentage = remaining / limit;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  let color = style.green;
  if (percentage < 0.25) color = style.red;
  else if (percentage < 0.5) color = style.yellow;

  const bar = color('█'.repeat(filled)) + style.dim('░'.repeat(empty));
  return bar;
}

export async function xStatusCommand(): Promise<void> {
  const cwd = process.cwd();
  const { style } = logger;

  try {
    if (!isShippostProject(cwd)) {
      throw new NotInitializedError();
    }

    const fs = new FileSystemService(cwd);
    const config = fs.loadConfig();

    const clientId = config.x?.clientId;
    if (!clientId) {
      logger.error('X API not configured. Run `ship analyze-x --setup` first.');
      process.exit(1);
    }

    logger.info(style.bold('X API Status'));
    logger.info(style.dim(logger.box.line(50)));
    logger.blank();

    // Authenticate
    const authService = new XAuthService(cwd, clientId);
    const accessToken = await authService.getValidToken();
    const apiService = new XApiService(accessToken);

    // Get user info
    const user = await apiService.getMe();
    logger.info(`${style.cyan('Account:')} @${user.username}`);

    // Get API tier
    const apiTier = config.x?.apiTier || 'free';
    logger.info(`${style.cyan('API Tier:')} ${apiTier === 'basic' ? style.brightCyan('Basic') : 'Free'}`);
    logger.blank();

    // Get rate limits
    logger.info(style.bold('Rate Limits'));
    logger.info(style.dim('(requests remaining / limit, resets in)'));
    logger.blank();

    const rateLimits = await apiService.getRateLimitStatus();

    if (rateLimits.user) {
      const { remaining, limit, reset } = rateLimits.user;
      const bar = renderBar(remaining, limit);
      const resetIn = formatTimeUntil(reset);
      logger.info(`  ${style.dim('User API:')}    ${bar} ${remaining}/${limit} ${style.dim(`(${resetIn})`)}`);
    }

    if (rateLimits.timeline) {
      const { remaining, limit, reset } = rateLimits.timeline;
      const bar = renderBar(remaining, limit);
      const resetIn = formatTimeUntil(reset);
      logger.info(`  ${style.dim('Timeline:')}    ${bar} ${remaining}/${limit} ${style.dim(`(${resetIn})`)}`);
    }

    if (!rateLimits.user && !rateLimits.timeline) {
      logger.info(style.dim('  No rate limit data available'));
    }

    logger.blank();
    logger.info(style.dim(logger.box.line(50)));

    // Show tier-specific limits
    logger.blank();
    logger.info(style.bold('Monthly Limits'));
    if (apiTier === 'basic') {
      logger.info(`  ${style.dim('Posts:')}       10,000/month`);
      logger.info(`  ${style.dim('Reads:')}       10,000/month`);
      logger.info(`  ${style.dim('Timeline:')}    Access included`);
    } else {
      logger.info(`  ${style.dim('Posts:')}       500/month`);
      logger.info(`  ${style.dim('Reads:')}       Limited`);
      logger.info(`  ${style.dim('Timeline:')}    ~15 requests/15min`);
    }

    logger.blank();
    logger.info(style.dim('Note: Monthly usage tracking requires X Developer Portal'));
    logger.info(style.dim('      https://developer.x.com/en/portal/dashboard'));

  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
