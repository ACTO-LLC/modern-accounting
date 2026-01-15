/**
 * Configuration module for Monitor Agent
 *
 * Loads configuration from environment variables with sensible defaults.
 */

import dotenv from 'dotenv';

// Load .env file
dotenv.config();

export interface Config {
  // Database
  db: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    trustServerCertificate: boolean;
  };

  // Claude API
  claude: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };

  // GitHub
  github: {
    token: string;
    owner: string;
    repo: string;
    baseBranch: string;
  };

  // Git
  git: {
    repoPath: string;
    authorName: string;
    authorEmail: string;
  };

  // SMTP for email notifications
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };

  // Slack (optional)
  slack: {
    webhookUrl: string | null;
  };

  // Polling
  pollInterval: number; // in milliseconds
  maxConcurrentJobs: number;

  // Feature flags
  features: {
    enableEmailNotifications: boolean;
    enableSlackNotifications: boolean;
    dryRun: boolean; // If true, don't actually create PRs or commits
  };
}

function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const config: Config = {
  db: {
    server: getEnv('DB_SERVER', 'localhost'),
    port: getEnvInt('DB_PORT', 14330),
    database: getEnv('DB_NAME', 'AccountingDB'),
    user: getEnv('DB_USER', 'sa'),
    password: getEnv('DB_PASSWORD', 'StrongPassword123!'),
    trustServerCertificate: getEnvBool('DB_TRUST_CERT', true),
  },

  claude: {
    apiKey: getEnv('ANTHROPIC_API_KEY'),
    model: getEnv('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
    maxTokens: getEnvInt('CLAUDE_MAX_TOKENS', 4096),
  },

  github: {
    token: getEnv('GITHUB_TOKEN'),
    owner: getEnv('GITHUB_OWNER', 'modern-accounting'),
    repo: getEnv('GITHUB_REPO', 'modern-accounting'),
    baseBranch: getEnv('GITHUB_BASE_BRANCH', 'main'),
  },

  git: {
    repoPath: getEnv('GIT_REPO_PATH', process.cwd()),
    authorName: getEnv('GIT_AUTHOR_NAME', 'Monitor Agent'),
    authorEmail: getEnv('GIT_AUTHOR_EMAIL', 'agent@modern-accounting.local'),
  },

  smtp: {
    host: getEnv('SMTP_HOST', 'localhost'),
    port: getEnvInt('SMTP_PORT', 587),
    secure: getEnvBool('SMTP_SECURE', false),
    user: getEnv('SMTP_USER'),
    password: getEnv('SMTP_PASSWORD'),
    from: getEnv('SMTP_FROM', 'noreply@modern-accounting.local'),
  },

  slack: {
    webhookUrl: getEnv('SLACK_WEBHOOK_URL') || null,
  },

  pollInterval: getEnvInt('POLL_INTERVAL_MS', 5 * 60 * 1000), // 5 minutes default
  maxConcurrentJobs: getEnvInt('MAX_CONCURRENT_JOBS', 1),

  features: {
    enableEmailNotifications: getEnvBool('ENABLE_EMAIL_NOTIFICATIONS', false),
    enableSlackNotifications: getEnvBool('ENABLE_SLACK_NOTIFICATIONS', false),
    dryRun: getEnvBool('DRY_RUN', false),
  },
};

/**
 * Validate required configuration values
 */
export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.claude.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (!config.github.token) {
    errors.push('GITHUB_TOKEN is required');
  }

  if (!config.db.password) {
    errors.push('DB_PASSWORD is required');
  }

  if (config.features.enableEmailNotifications) {
    if (!config.smtp.host) {
      errors.push('SMTP_HOST is required when email notifications are enabled');
    }
  }

  return errors;
}

export default config;
