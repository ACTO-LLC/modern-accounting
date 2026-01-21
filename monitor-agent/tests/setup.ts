/**
 * Test setup and mocks for Monitor Agent tests
 *
 * Provides mock implementations of external dependencies:
 * - mssql (database)
 * - @octokit/rest (GitHub API)
 * - @anthropic-ai/sdk (Claude AI)
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
vi.stubEnv('DB_PASSWORD', 'TestPassword123');
vi.stubEnv('DB_SERVER', 'localhost');
vi.stubEnv('DB_PORT', '14330');
vi.stubEnv('DB_NAME', 'TestDB');
vi.stubEnv('ENABLE_EMAIL_NOTIFICATIONS', 'true');

// Use vi.hoisted() to ensure mocks are defined before vi.mock factory runs
// This is necessary because vi.mock() calls are hoisted to the top of the file
const hoistedMocks = vi.hoisted(() => {
  const mockRequest = {
    input: vi.fn().mockReturnThis(),
    query: vi.fn(),
    batch: vi.fn(),
  };

  const mockPool = {
    connected: true,
    request: vi.fn(() => mockRequest),
    close: vi.fn(),
  };

  return { mockRequest, mockPool };
});

// Export the mocks for use in tests
export const mockRequest = hoistedMocks.mockRequest;
export const mockPool = hoistedMocks.mockPool;

vi.mock('mssql', () => ({
  default: {
    connect: vi.fn(() => Promise.resolve(hoistedMocks.mockPool)),
    ConnectionPool: vi.fn(() => hoistedMocks.mockPool),
    Int: 'Int',
    NVarChar: vi.fn((size: number | string) => `NVarChar(${size})`),
    VarChar: vi.fn((size: number) => `VarChar(${size})`),
    DateTime2: 'DateTime2',
    MAX: 'MAX',
  },
}));

// Mock @octokit/rest
export const mockOctokit = {
  issues: {
    createComment: vi.fn(() => Promise.resolve({ data: { id: 123 } })),
    listComments: vi.fn(() => Promise.resolve({ data: [] })),
  },
  pulls: {
    create: vi.fn(() =>
      Promise.resolve({
        data: {
          number: 1,
          html_url: 'https://github.com/test/test/pull/1',
        },
      })
    ),
    get: vi.fn(() =>
      Promise.resolve({
        data: {
          number: 1,
          state: 'open',
          mergeable: true,
          mergeable_state: 'clean',
          merged: false,
          head: {
            sha: 'abc123def456',
            ref: 'feature/test-branch',
          },
          base: {
            ref: 'main',
          },
        },
      })
    ),
    merge: vi.fn(() => Promise.resolve({ data: { merged: true } })),
  },
  checks: {
    listForRef: vi.fn(() =>
      Promise.resolve({
        data: {
          check_runs: [],
        },
      })
    ),
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

// Mock @anthropic-ai/sdk
export const mockAnthropicResponse = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        summary: 'Test plan summary',
        tasks: [
          {
            id: 1,
            title: 'Task 1',
            description: 'Test task description',
            type: 'create',
            files: ['test.ts'],
          },
        ],
        estimatedEffort: '1 hour',
        risks: [],
      }),
    },
  ],
};

export const mockAnthropicClient = {
  messages: {
    create: vi.fn(() => Promise.resolve(mockAnthropicResponse)),
  },
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => mockAnthropicClient),
}));

// Mock simple-git
export const mockSimpleGit = {
  status: vi.fn(() =>
    Promise.resolve({
      isClean: () => true,
      files: [],
    })
  ),
  checkout: vi.fn(() => Promise.resolve()),
  checkoutLocalBranch: vi.fn(() => Promise.resolve()),
  add: vi.fn(() => Promise.resolve()),
  commit: vi.fn(() => Promise.resolve({ commit: 'abc123' })),
  push: vi.fn(() => Promise.resolve()),
  reset: vi.fn(() => Promise.resolve()),
  diff: vi.fn(() => Promise.resolve('')),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockSimpleGit),
  default: vi.fn(() => mockSimpleGit),
}));

// Mock nodemailer
export const mockTransporter = {
  sendMail: vi.fn(() =>
    Promise.resolve({
      messageId: 'test-message-id',
    })
  ),
};

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => mockTransporter),
  },
}));

/**
 * Mock enhancement record for testing
 */
export const mockEnhancement = {
  id: 1,
  title: 'Add new feature',
  description: 'Implement a new feature for the application',
  status: 'pending' as const,
  priority: 5,
  requested_by: 'test@example.com',
  assigned_to: null,
  branch_name: null,
  pr_number: null,
  pr_url: null,
  plan_json: null,
  error_message: null,
  notes: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  started_at: null,
  completed_at: null,
};

/**
 * Mock enhancement with PR created
 */
export const mockEnhancementWithPR = {
  ...mockEnhancement,
  id: 2,
  status: 'pr_created' as const,
  branch_name: 'feature/2-add-new-feature',
  pr_number: 42,
  pr_url: 'https://github.com/test/test/pull/42',
};

/**
 * Mock scheduled deployment record for testing
 */
export const mockDeployment = {
  Id: 1,
  EnhancementId: 1,
  ScheduledDate: new Date('2026-01-15T10:00:00Z'),
  Status: 'pending',
  Notes: null,
  BranchName: 'feature/1-add-new-feature',
  PrNumber: 42,
  Description: 'Add new feature implementation',
  RequestorName: 'test@example.com', // Must contain @ for sendDeploymentNotification to call sendEmail
};

/**
 * Mock PR status for scheduler tests
 */
export const mockPRStatus = {
  state: 'open',
  mergeable: true,
  checks: [
    { name: 'build', conclusion: 'success' },
    { name: 'test', conclusion: 'success' },
  ],
};

/**
 * Mock Copilot review result
 */
export const mockCopilotApproval = {
  responded: true,
  approved: true,
  suggestions: [],
  rawResponse: 'Looks good! LGTM.',
};

export const mockCopilotWithSuggestions = {
  responded: true,
  approved: false,
  suggestions: [
    '- Consider adding error handling for edge cases',
    '- Variable naming could be more descriptive',
  ],
  rawResponse: `I have a few suggestions:
- Consider adding error handling for edge cases
- Variable naming could be more descriptive`,
};

/**
 * Reset all mocks before each test
 */
beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock pool state
  mockPool.connected = true;
  // Re-establish mock implementations that may have been cleared
  mockPool.request.mockImplementation(() => mockRequest);
  mockRequest.input.mockImplementation(function (this: typeof mockRequest) {
    return this;
  });
});

/**
 * Clean up after each test
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper to create mock query result
 */
export function createMockQueryResult<T>(recordset: T[], rowsAffected: number[] = [1]) {
  return {
    recordset,
    rowsAffected,
  };
}

/**
 * Helper to simulate database error
 */
export function simulateDatabaseError(error: Error = new Error('Database connection failed')) {
  mockRequest.query.mockRejectedValueOnce(error);
}

/**
 * Helper to simulate GitHub API error
 */
export function simulateGitHubError(error: Error = new Error('GitHub API error')) {
  mockOctokit.pulls.get.mockRejectedValueOnce(error);
}
