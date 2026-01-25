# Playwright Demonstration Videos

This folder contains Playwright test scripts designed to create demonstration videos for social media and marketing purposes.

## Available Demos

| Demo | File | Description | Duration |
|------|------|-------------|----------|
| Invoice Creation | `invoice-creation-demo.spec.ts` | Shows complete invoice creation workflow | ~45-60 seconds |
| AI Chat Assistant | `ai-chat-assistant-demo.spec.ts` | Showcases the AI accounting assistant | ~60-90 seconds |
| Dashboard Overview | `dashboard-overview-demo.spec.ts` | Tours the main dashboard and navigation | ~45-60 seconds |

## Prerequisites

1. **Start the development server** with auth bypass enabled:
   ```bash
   cd client
   set VITE_BYPASS_AUTH=true && npm run dev   # Windows
   VITE_BYPASS_AUTH=true npm run dev          # Mac/Linux
   ```

2. **Ensure test data exists** (customers, products, etc.) for realistic demos.

## Running Demos

### Run All Demos (Landscape 1920x1080)

```bash
cd client
npx playwright test --config=playwright.demo.config.ts --project=demo-landscape
```

### Run Specific Demo

```bash
# Invoice creation demo
npx playwright test --config=playwright.demo.config.ts invoice-creation-demo

# AI chat assistant demo
npx playwright test --config=playwright.demo.config.ts ai-chat-assistant-demo

# Dashboard overview demo
npx playwright test --config=playwright.demo.config.ts dashboard-overview-demo
```

### Different Video Formats

The configuration includes three projects for different social media formats:

```bash
# Landscape (YouTube, Twitter, LinkedIn) - 1920x1080
npx playwright test --config=playwright.demo.config.ts --project=demo-landscape

# Vertical (TikTok, Instagram Reels, YouTube Shorts) - 1080x1920
npx playwright test --config=playwright.demo.config.ts --project=demo-vertical

# Square (Instagram Feed, Facebook) - 1080x1080
npx playwright test --config=playwright.demo.config.ts --project=demo-square
```

### Run in Headed Mode (See the Browser)

```bash
npx playwright test --config=playwright.demo.config.ts --headed
```

### Debug Mode (Step Through)

```bash
npx playwright test --config=playwright.demo.config.ts --debug
```

## Video Output

Videos are saved to:
```
client/tests/demos/test-results/
```

After running, each test creates a subfolder with:
- `video.webm` - The recorded video
- `trace.zip` - Playwright trace for debugging
- Screenshots captured during the test

### HTML Report

View the demo report:
```bash
npx playwright show-report demo-report
```

## Customizing Demos

### Adjusting Timing

Each demo uses a `demoPause()` helper function for viewability. Modify pause durations as needed:

```typescript
// Longer pause for emphasis
await demoPause(3000); // 3 seconds

// Shorter pause for quick transitions
await demoPause(500);  // 0.5 seconds
```

### Adjusting Animation Speed

The config includes `slowMo: 100` which adds 100ms between each action. Modify in `playwright.demo.config.ts`:

```typescript
launchOptions: {
  slowMo: 200, // Slower for more dramatic effect
},
```

### Adding Custom Demos

1. Create a new file in `client/tests/demos/` with `.spec.ts` extension
2. Import the test framework:
   ```typescript
   import { test, expect } from '@playwright/test';
   ```
3. Add the `demoPause()` helper for viewability
4. Structure your demo with clear "scenes" for video editing

## Video Editing Tips

1. **Trimming**: Videos may need trimming at start/end
2. **Speed**: Consider speeding up form-filling sections (1.5x-2x)
3. **Captions**: Add captions explaining each action
4. **Music**: Add background music appropriate for your platform
5. **Branding**: Add logo watermark or intro/outro sequences

## Troubleshooting

### No Video Created
- Ensure the test passes (videos only save for passed tests by default)
- Check the `test-results` folder exists
- Run with `--headed` to debug visually

### Chat API Not Responding
- Ensure the chat-api server is running (`npm run dev` in chat-api folder)
- Check API URL in environment variables

### Test Data Missing
- Run database seeds to create sample customers, products, etc.
- The demos work best with realistic sample data

### Auth Redirect Issues
- Ensure `VITE_BYPASS_AUTH=true` is set when starting the dev server
- The bypass allows demo recording without login flows
