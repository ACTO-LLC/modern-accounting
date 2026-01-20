# Contributing to Modern Accounting

Thank you for your interest in contributing! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Getting Help](#getting-help)

## Code of Conduct

Be respectful and constructive. We're building software to help small businesses—let's keep the community welcoming for everyone.

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Docker Desktop** (for SQL Server)
- **Git**

### Fork & Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/modern-accounting.git
cd modern-accounting
```

## Development Setup

### 1. Start the Database

```bash
docker compose up -d
```

This starts SQL Server on port 14330. Wait ~30 seconds for initialization.

### 2. Install Dependencies

```bash
# Root dependencies
npm install

# Client (React/Vite)
cd client && npm install && cd ..

# API (Express)
cd chat-api && npm install && cd ..
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings (API keys, etc.)
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts:
- **Client**: http://localhost:5173
- **API**: http://localhost:3001
- **DAB (Data API)**: http://localhost:5000

## Making Changes

### Branch Naming

```
feature/123-short-description   # New features (reference issue #)
fix/456-bug-description         # Bug fixes
docs/update-readme              # Documentation only
refactor/component-name         # Code refactoring
```

### Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/123-my-feature
   ```

2. **Make your changes** with clear, focused commits

3. **Run tests** before pushing:
   ```bash
   npm test                        # Playwright E2E tests
   cd client && npm run test:unit  # Vitest unit tests
   cd chat-api && npm test         # API tests
   ```

4. **Push and create a PR**:
   ```bash
   git push -u origin feature/123-my-feature
   ```

## Pull Request Process

1. **Fill out the PR template** with:
   - Summary of changes
   - Related issue number (`Closes #123`)
   - Test plan

2. **Ensure all checks pass**:
   - Tests must pass
   - No merge conflicts

3. **Request review** - a maintainer will review your PR

4. **Address feedback** - push additional commits as needed

5. **Merge** - maintainer will merge once approved

### PR Title Format

```
feat: Add customer export functionality
fix: Resolve invoice calculation error
docs: Update API documentation
refactor: Simplify transaction filtering
test: Add tests for bill creation
```

## Code Style

### TypeScript/React (Client)

- Use functional components with hooks
- Use TypeScript strict mode
- Follow existing patterns in the codebase

```typescript
// Good
export default function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  // ...
}

// Avoid class components
```

### JavaScript (API)

- Use ES6+ features
- Use async/await over callbacks
- Handle errors appropriately

### CSS

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Use dark mode classes (`dark:bg-gray-800`)

## Testing

### Running Tests

```bash
# All Playwright E2E tests
npm test

# Specific test file
cd client && npx playwright test tests/invoices.spec.ts

# Unit tests
cd client && npm run test:unit
cd chat-api && npm test
```

### Writing Tests

- Add tests for new features
- Update tests when modifying existing functionality
- Use descriptive test names

```typescript
test('should create invoice with line items', async ({ page }) => {
  // Arrange
  await page.goto('/invoices/new');

  // Act
  await page.getByLabel('Customer').selectOption('Test Customer');

  // Assert
  await expect(page.getByText('Invoice Created')).toBeVisible();
});
```

## Project Structure

```
modern-accounting/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route pages
│   │   ├── contexts/    # React contexts
│   │   └── lib/         # Utilities
│   └── tests/           # Playwright E2E tests
├── chat-api/            # Express API server
├── database/            # SQL migrations & scripts
├── docs/                # Documentation
└── docker-compose.yml   # Local development stack
```

## Getting Help

- **Questions?** Open a [Discussion](https://github.com/ehalsey/modern-accounting/discussions)
- **Bug reports?** Open an [Issue](https://github.com/ehalsey/modern-accounting/issues)
- **Security issues?** Email the maintainer directly (do not open public issues)

---

Thank you for contributing!
