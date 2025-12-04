import { join } from 'path';
import { readlineSync } from '../utils/readline.js';
import { FileSystemService } from '../services/file-system.js';
import { OllamaService } from '../services/ollama.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService } from '../services/x-api.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import { buildStyleAnalysisPrompt, parseStyleGuide } from '../utils/style-analysis.js';

interface AnalyzeXOptions {
  count?: number;
  overwrite?: boolean;
  setup?: boolean;
}

export async function analyzeXCommand(options: AnalyzeXOptions): Promise<void> {
  const cwd = process.cwd();

  try {
    // Step 1: Validate environment
    logger.section('[1/5] Checking environment...');

    if (!isT2pProject(cwd)) {
      throw new NotInitializedError();
    }

    const fs = new FileSystemService(cwd);
    const config = fs.loadConfig();

    // Initialize Ollama service
    const ollama = new OllamaService(config);
    await ollama.ensureAvailable();
    logger.success(`Connected to Ollama (model: ${ollama.getModelName()})`);

    // Step 2: Configure X API
    logger.section('[2/5] Configuring X API...');

    let clientId = config.x?.clientId;

    if (!clientId || options.setup) {
      logger.info('X API not configured. Let\'s set it up!');
      logger.blank();
      logger.info('Step 1: Create an X Developer Account');
      logger.info('→ Visit: https://developer.x.com/en/portal/dashboard');
      logger.blank();
      logger.info('Step 2: Create a new app and enable OAuth 2.0');
      logger.info('→ Type of App: Select "Native App" (not Web App or Bot)');
      logger.info('→ Set redirect URI to: http://127.0.0.1:3000/callback');
      logger.info('→ Enable scopes: tweet.read, users.read, offline.access');
      logger.blank();

      const input = await readlineSync('Enter your Client ID: ');
      clientId = input.trim();

      if (!clientId) {
        logger.error('Client ID is required');
        process.exit(1);
      }

      // Save to config
      config.x = { clientId };
      fs.saveConfig(config);
      logger.success('Configuration saved to .t2prc.json');
      logger.blank();
    } else {
      logger.success('Using existing X API configuration');
    }

    // Step 3: Authenticate and fetch tweets
    logger.section('[3/5] Authenticating with X...');

    const authService = new XAuthService(cwd, clientId);
    const accessToken = await authService.getValidToken();
    logger.success('Authentication successful!');

    logger.blank();
    logger.info('Fetching tweets...');

    const apiService = new XApiService(accessToken);
    const user = await apiService.getMe();
    logger.success(`Authenticated as: @${user.username}`);

    const maxResults = Math.min(options.count || 33, 100);
    const tweets = await apiService.getMyTweets(maxResults);

    if (tweets.length === 0) {
      logger.error('No tweets found');
      logger.info('Make sure your account has posted tweets');
      process.exit(1);
    }

    logger.success(`Fetched ${tweets.length} tweets`);

    // Step 4: Analyze with Ollama
    logger.section('[4/5] Analyzing writing style...');

    const analysisPrompt = fs.loadPrompt('analysis.md');
    const prompt = buildStyleAnalysisPrompt(analysisPrompt, tweets);
    logger.info(`Analyzing ${tweets.length} tweets to understand your style...`);

    const response = await ollama.generate(prompt);
    const styleGuide = parseStyleGuide(response);

    logger.success('Style analysis complete!');

    // Step 5: Save style guide
    logger.section('[5/5] Saving style guide...');

    const stylePath = join(cwd, 'prompts', 'style-from-analysis.md');
    const styleExists = fs.fileExists(stylePath);

    if (styleExists && !options.overwrite) {
      logger.info('Style guide already exists at prompts/style-from-analysis.md');
      const answer = await readlineSync('Overwrite existing style guide? (y/n): ');

      if (answer.toLowerCase() !== 'y') {
        logger.info('Cancelled. Use --overwrite flag to skip this prompt.');
        process.exit(0);
      }
    }

    fs.writeFile(stylePath, styleGuide);
    logger.success('Style guide saved to prompts/style-from-analysis.md');

    // Summary
    logger.blank();
    logger.success('Complete!');
    logger.blank();
    logger.info('Summary:');
    logger.info(`- Analyzed ${tweets.length} tweets from @${user.username}`);
    logger.info(`- Style guide saved to: prompts/style-from-analysis.md`);
    logger.blank();
    logger.info('Next steps:');
    logger.info('- Review prompts/style-from-analysis.md');
    logger.info('- Copy/merge insights into prompts/style.md if desired');
    logger.info('- Add transcripts to input/');
    logger.info('- Run: t2p work');
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
