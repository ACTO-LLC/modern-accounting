/**
 * Claude AI integration module for Monitor Agent
 *
 * Uses the Anthropic SDK to generate plans, code, and reviews.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

// Initialize Anthropic client
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
  }
  return client;
}

/**
 * Plan structure returned by Claude
 */
export interface EnhancementPlan {
  tasks: PlanTask[];
  risks: Risk[];
  estimatedFiles: string[];
  summary: string;
  estimatedEffort: string;
}

export interface PlanTask {
  id: number;
  title: string;
  description: string;
  type: 'create' | 'modify' | 'delete' | 'test' | 'config';
  files: string[];
  dependencies: number[];
}

export interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

/**
 * Code generation result
 */
export interface CodeGenResult {
  filePath: string;
  content: string;
  operation: 'create' | 'modify' | 'delete';
  explanation: string;
}

/**
 * Code review result
 */
export interface CodeReview {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  summary: string;
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
}

/**
 * Generate an implementation plan for an enhancement
 */
export async function generatePlan(
  title: string,
  description: string,
  codebaseContext?: string
): Promise<EnhancementPlan> {
  const anthropic = getClient();

  const systemPrompt = `You are an expert software architect helping to plan feature implementations for a modern accounting application.

The application uses:
- React + Vite + TypeScript + Tailwind CSS (client)
- Node.js Express (APIs)
- SQL Server with Data API Builder
- MCP servers for integrations

When creating a plan:
1. Break down the feature into discrete, testable tasks
2. Identify all files that need to be created or modified
3. Consider dependencies between tasks
4. Identify potential risks and mitigations
5. Estimate effort level

Respond with valid JSON matching this structure:
{
  "tasks": [
    {
      "id": 1,
      "title": "Task title",
      "description": "Detailed description",
      "type": "create|modify|delete|test|config",
      "files": ["path/to/file.ts"],
      "dependencies": []
    }
  ],
  "risks": [
    {
      "description": "Risk description",
      "severity": "low|medium|high",
      "mitigation": "How to mitigate"
    }
  ],
  "estimatedFiles": ["list", "of", "files"],
  "summary": "Brief summary of the plan",
  "estimatedEffort": "e.g., '2-4 hours' or '1-2 days'"
}`;

  const userPrompt = `Create an implementation plan for the following enhancement:

**Title:** ${title}

**Description:** ${description}

${codebaseContext ? `**Codebase Context:**\n${codebaseContext}` : ''}

Respond with only valid JSON, no markdown code blocks.`;

  const response = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: config.claude.maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  try {
    const plan = JSON.parse(textContent.text) as EnhancementPlan;
    return plan;
  } catch (parseError) {
    console.error('Failed to parse Claude response:', textContent.text);
    throw new Error(`Failed to parse plan from Claude: ${parseError}`);
  }
}

/**
 * Generate code for a specific task
 */
export async function generateCode(
  task: PlanTask,
  existingCode?: string,
  codebaseContext?: string
): Promise<CodeGenResult[]> {
  const anthropic = getClient();

  const systemPrompt = `You are an expert software developer implementing features for a modern accounting application.

Code style guidelines:
- Use TypeScript with strict typing
- Follow existing patterns in the codebase
- Use ES modules (import/export)
- Add JSDoc comments for public functions
- Use meaningful variable and function names
- Handle errors appropriately

Respond with valid JSON array of file operations:
[
  {
    "filePath": "relative/path/to/file.ts",
    "content": "// Full file content here",
    "operation": "create|modify|delete",
    "explanation": "Why this change is needed"
  }
]`;

  let userPrompt = `Implement the following task:

**Task:** ${task.title}
**Description:** ${task.description}
**Type:** ${task.type}
**Target Files:** ${task.files.join(', ')}

`;

  if (existingCode) {
    userPrompt += `**Existing Code:**
\`\`\`
${existingCode}
\`\`\`

`;
  }

  if (codebaseContext) {
    userPrompt += `**Codebase Context:**
${codebaseContext}

`;
  }

  userPrompt += `Respond with only valid JSON array, no markdown code blocks.`;

  const response = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: config.claude.maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  try {
    const results = JSON.parse(textContent.text) as CodeGenResult[];
    return results;
  } catch (parseError) {
    console.error('Failed to parse Claude response:', textContent.text);
    throw new Error(`Failed to parse code from Claude: ${parseError}`);
  }
}

/**
 * Review generated code (backup for GitHub Copilot)
 */
export async function reviewCode(
  files: Array<{ path: string; content: string }>,
  enhancement: { title: string; description: string }
): Promise<CodeReview> {
  const anthropic = getClient();

  const systemPrompt = `You are an expert code reviewer for a modern accounting application.

Review the code for:
1. Correctness - Does it implement the requirements?
2. Security - Any potential vulnerabilities?
3. Performance - Any obvious inefficiencies?
4. Style - Does it follow best practices?
5. Completeness - Are there missing pieces?

Respond with valid JSON:
{
  "approved": true|false,
  "issues": [
    {
      "severity": "error|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of issue"
    }
  ],
  "suggestions": ["Suggestion 1", "Suggestion 2"],
  "summary": "Overall review summary"
}`;

  const filesContent = files
    .map((f) => `**${f.path}:**\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const userPrompt = `Review the following code changes for this enhancement:

**Enhancement:** ${enhancement.title}
**Description:** ${enhancement.description}

**Files to review:**
${filesContent}

Respond with only valid JSON, no markdown code blocks.`;

  const response = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: config.claude.maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  try {
    const review = JSON.parse(textContent.text) as CodeReview;
    return review;
  } catch (parseError) {
    console.error('Failed to parse Claude response:', textContent.text);
    throw new Error(`Failed to parse review from Claude: ${parseError}`);
  }
}

/**
 * Generate commit message for changes
 */
export async function generateCommitMessage(
  files: string[],
  enhancement: { title: string; description: string }
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: 200,
    system:
      'Generate a concise, conventional commit message. Format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore. Respond with just the commit message, no quotes or explanation.',
    messages: [
      {
        role: 'user',
        content: `Enhancement: ${enhancement.title}
Description: ${enhancement.description}
Changed files: ${files.join(', ')}`,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return `feat: ${enhancement.title}`;
  }

  return textContent.text.trim();
}

/**
 * Generate PR description
 */
export async function generatePRDescription(
  enhancement: { title: string; description: string },
  plan: EnhancementPlan,
  changedFiles: string[]
): Promise<{ title: string; body: string }> {
  const anthropic = getClient();

  const systemPrompt = `Generate a GitHub Pull Request title and description.

Respond with JSON:
{
  "title": "PR title (50-72 chars)",
  "body": "Full PR description with sections: Summary, Changes, Testing, Related Issues"
}`;

  const response = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Enhancement: ${enhancement.title}
Description: ${enhancement.description}
Plan Summary: ${plan.summary}
Estimated Effort: ${plan.estimatedEffort}
Tasks Completed: ${plan.tasks.length}
Files Changed: ${changedFiles.join(', ')}
Risks: ${plan.risks.map((r) => r.description).join('; ')}

Respond with only valid JSON.`,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return {
      title: enhancement.title,
      body: enhancement.description,
    };
  }

  try {
    return JSON.parse(textContent.text);
  } catch {
    return {
      title: enhancement.title,
      body: enhancement.description,
    };
  }
}

export default {
  generatePlan,
  generateCode,
  reviewCode,
  generateCommitMessage,
  generatePRDescription,
};
