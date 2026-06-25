# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with the Turbodoc API.

## Project Overview

The Turbodoc API is a Cloudflare Workers-based REST API built with the Hono framework. It serves as the backend for the Turbodoc bookmark management application, handling data storage, user authentication, and bookmark operations.

## Development Commands

- **Development**: `npm run dev` - Start Vite dev server with hot reload
- **Build**: `npm run build` - Build for production deployment
- **Preview**: `npm run preview` - Build and preview with Wrangler locally
- **Deploy**: `npm run deploy` - Build and deploy to Cloudflare Workers
- **Type Generation**: `npm run cf-typegen` - Generate TypeScript types for Cloudflare Worker bindings

## API Documentation

- **Swagger UI**: Visit `/swagger` endpoint for interactive API documentation
- **OpenAPI Spec**: Available at `/swagger.json` endpoint
- **Root Endpoint**: `/` returns basic API info and documentation link

## Architecture

### Framework and Runtime

- **Framework**: Hono - Fast, lightweight web framework optimized for edge computing
- **Runtime**: Cloudflare Workers with Pages integration
- **Build Tool**: Vite with Hono-specific plugins
- **Language**: TypeScript with strict mode enabled

### Key Files

- `src/index.tsx`: Main application entry point and route definitions
- `vite.config.ts`: Vite configuration with Hono plugins
- `wrangler.jsonc`: Cloudflare Workers deployment configuration
- `tsconfig.json`: TypeScript configuration
- `worker-configuration.d.ts`: Cloudflare Workers type definitions

### Dependencies

- `hono`: Core framework
- `@hono/swagger-ui`: Swagger UI middleware for API documentation
- `@hono/vite-build`: Vite plugin for Cloudflare Workers
- `@hono/vite-dev-server`: Development server with Cloudflare adapter

## Development Workflow

1. **Setup**: Run `npm install` to install dependencies
2. **Development**: Use `npm run dev` for local development with hot reload
3. **Testing**: Test API endpoints using the Swagger UI at `/swagger`
4. **Type Safety**: Run `npm run cf-typegen` when Worker configuration changes
5. **Build**: Use `npm run build` to create production build
6. **Deploy**: Use `npm run deploy` to deploy to Cloudflare Workers

## API Design Guidelines

### OpenAPI Specification

- All endpoints should be documented in the OpenAPI spec served at `/swagger.json`
- Use proper HTTP status codes and response schemas
- Include request/response examples in the documentation
- Follow RESTful API design principles

### Error Handling

- Return consistent error response format
- Use appropriate HTTP status codes (400, 401, 403, 404, 500)
- Include helpful error messages for debugging

### Authentication

- Implement JWT-based authentication for protected endpoints
- Use Cloudflare Workers KV or D1 for session storage
- Follow OAuth 2.0 patterns where applicable

## Cloudflare Integration

### Workers Configuration

- Compatibility date set to latest stable version
- Observability enabled for monitoring and logging
- Build output directory configured for Pages deployment

### Bindings and Storage

- Use Cloudflare KV for caching and session data
- Use Cloudflare D1 for relational data storage
- Use Cloudflare R2 for file storage (bookmarks, images, etc.)
- Environment variables managed through Wrangler

### Performance Considerations

- Leverage edge computing for low latency responses
- Use appropriate caching strategies for static and dynamic content
- Minimize cold start times by keeping bundle size small

## Common Development Tasks

### Adding New Endpoints

1. Define route handler in `src/index.tsx`
2. Add OpenAPI documentation to the swagger.json response
3. Test using the Swagger UI interface
4. Update this AGENTS.md if new patterns are introduced

### Database Operations

- Use Cloudflare D1 for structured data
- Implement proper database migrations
- Use prepared statements for security
- Handle database connection errors gracefully

### File Upload/Storage

- Use Cloudflare R2 for file storage
- Implement proper file validation and sanitization
- Generate signed URLs for direct client uploads where appropriate
- Handle file size limits and type restrictions

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->
