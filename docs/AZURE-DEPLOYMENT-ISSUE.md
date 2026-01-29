# Azure App Service Deployment Issue

## Problem Summary

Node.js application fails to start on Azure App Service (Linux) due to Oryx build system interference, despite configuring settings to disable the build process.

## Environment

- **App Service**: `app-modern-accounting-prod`
- **Resource Group**: `rg-modern-accounting-prod`
- **Runtime**: Node.js 20 LTS (Linux)
- **App Type**: Express.js API with React SPA (ES Modules)

## Symptoms

1. Deployment via GitHub Actions uploads successfully
2. App Service container starts but crashes with exit code 243
3. Error: `ERR_MODULE_NOT_FOUND: Cannot find package '/home/site/wwwroot/node_modules/cors/lib/index.js'`

## Root Cause Analysis

Azure App Service's **Oryx build system** runs automatically during container startup, even when disabled via app settings. The build process:

1. Detects `package.json` and attempts to run `npm install --omit=dev`
2. Extracts any existing `node_modules.tar.gz` but then tries to modify it
3. Fails with `EACCES: permission denied` when renaming packages
4. Node.js then fails to find dependencies because the extraction was incomplete

### Settings That Were Tried (Did NOT Work)

```bash
SCM_DO_BUILD_DURING_DEPLOYMENT=false
ENABLE_ORYX_BUILD=false
WEBSITE_RUN_FROM_PACKAGE=1
```

These settings are supposed to disable the Oryx build, but the container startup script still runs `npm install` before `npm start`.

### Log Evidence

From `/LogFiles/*_default_docker.log`:

```
PATH="$PATH:/home/site/wwwroot" npm install --omit=dev && npm start
...
npm error code EACCES
npm error syscall rename
npm error path /home/site/wwwroot/node_modules/execa
npm error errno -13
npm error Error: EACCES: permission denied, rename '/home/site/wwwroot/node_modules/execa' -> '/home/site/wwwroot/node_modules/.execa-S8zsTMZk'
```

## Attempted Solutions

| Approach | Result |
|----------|--------|
| Zip deploy with node_modules pre-installed | Oryx still runs npm install, corrupts modules |
| Set `SCM_DO_BUILD_DURING_DEPLOYMENT=false` | Ignored during container startup |
| Set `ENABLE_ORYX_BUILD=false` | Ignored during container startup |
| Set `WEBSITE_RUN_FROM_PACKAGE=1` | Requires blob storage URL, not zip deploy |
| Custom startup command `node server.js` | Not yet tested |
| `az webapp deploy --type zip --async` | Upload succeeded but Oryx still runs |

## Recommended Next Steps

### Option 1: Custom Startup Command (Most Promising)

Set a custom startup file that directly runs Node.js without Oryx:

```bash
az webapp config set \
  --resource-group rg-modern-accounting-prod \
  --name app-modern-accounting-prod \
  --startup-file "node server.js"
```

This bypasses the default Oryx startup script that runs `npm install`.

### Option 2: Use Azure Container Apps

Deploy as a Docker container instead of using the built-in Node.js runtime:

1. Create a Dockerfile with pre-installed dependencies
2. Build and push to Azure Container Registry
3. Deploy to Container Apps (or App Service with custom container)

### Option 3: Use Run From Package with Blob Storage

1. Upload the zip to Azure Blob Storage
2. Set `WEBSITE_RUN_FROM_PACKAGE` to the blob URL
3. App runs directly from the package without extraction

### Option 4: Use Azure Static Web Apps + Azure Functions

For the React SPA + API pattern:
- Deploy frontend to Azure Static Web Apps
- Deploy API as Azure Functions

## Files Modified During Troubleshooting

- `.github/workflows/deploy-production.yml` - GitHub Actions workflow (partially complete)
- `chat-api/server.js` - Added static file serving for production

## Related Issues

- Issue #350: Set up GitHub Actions production deployment workflow

## References

- [Azure App Service Oryx Build](https://docs.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Run From Package](https://docs.microsoft.com/en-us/azure/app-service/deploy-run-package)
- [Custom Startup Commands](https://docs.microsoft.com/en-us/azure/app-service/configure-language-nodejs#run-custom-startup-file)
