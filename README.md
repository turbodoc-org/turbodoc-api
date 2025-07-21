# Turbodoc API

A modern REST API built with Hono framework and deployed on Cloudflare Workers. This API serves as the backend for the Turbodoc bookmark management platform, providing secure bookmark operations with built-in authentication and OpenAPI documentation.

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- npm or yarn
- Cloudflare account (for deployment)
- Supabase project (for database and authentication)

### Installation

```bash
npm install
```

### Development

Start the development server with hot reload:

```bash
npm run dev
```

The API will be available at `http://localhost:3000` with Swagger UI documentation.

### Environment Setup

Configure your Supabase environment variables:

1. Copy `supabase/config.toml.example` to `supabase/config.toml`
2. Update with your Supabase project URL and service key
3. Run migrations: `npm run migrate`

## 📖 API Documentation

- **Swagger UI**: Visit `http://localhost:3000/` for interactive API documentation
- **OpenAPI Spec**: Available at `http://localhost:3000/swagger.json`

## 🏗️ Architecture

### Tech Stack

- **Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework for edge computing
- **Runtime**: Cloudflare Workers
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with JWT tokens
- **Build Tool**: Vite with Hono plugins
- **Language**: TypeScript with strict mode

### Project Structure

```txt
src/
├── endpoints/
│   └── v1/
│       └── bookmarks/          # Bookmark CRUD operations
│           ├── createBookmark.ts
│           ├── deleteBookmark.ts  
│           ├── getBookmarks.ts
│           ├── getOgImage.ts
│           └── updateBookmark.ts
├── types/
│   ├── app-context.ts          # Application context types
│   └── database.types.ts       # Database schema types
├── utils/
│   ├── auth/
│   │   └── middleware.ts       # Authentication middleware
│   └── clients/
│       └── supabase/          # Supabase client configuration
│           ├── admin.ts       # Admin client for server operations
│           └── api.ts         # API client for user operations
└── index.tsx                  # Main application entry point
```

### Key Features

- **OpenAPI Integration**: Automatic API documentation with Swagger UI
- **Authentication**: JWT-based auth with Supabase integration
- **CORS Configuration**: Supports web and iOS clients
- **Error Handling**: Consistent error responses with proper HTTP status codes
- **TypeScript**: Full type safety with generated database types
- **Edge Computing**: Optimized for Cloudflare Workers performance

## 🔗 API Endpoints

### Authentication

All endpoints require Bearer token authentication via the `Authorization` header:

```txt
Authorization: Bearer <your-jwt-token>
```

### Bookmarks

- `GET /v1/bookmarks` - Retrieve user's bookmarks
- `POST /v1/bookmarks` - Create a new bookmark
- `PUT /v1/bookmarks/:id` - Update an existing bookmark
- `DELETE /v1/bookmarks/:id` - Delete a bookmark
- `GET /v1/bookmarks/og-image` - Fetch Open Graph image for URL

## 🗄️ Database Schema

The API uses Supabase PostgreSQL with the following main table:

### `bookmarks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | User identifier (FK) |
| `title` | TEXT | Bookmark title |
| `url` | TEXT | Bookmark URL |
| `time_added` | BIGINT | Unix timestamp |
| `tags` | TEXT | Comma-separated tags |
| `status` | TEXT | Status: 'unread', 'read', 'archived' |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Security Features:**

- Row Level Security (RLS) enabled
- Users can only access their own bookmarks
- Automatic `updated_at` triggers
- Indexed for performance (user_id, time_added, status, tags)

## 🔧 Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Build and preview locally with Wrangler |
| `npm run deploy` | Build and deploy to Cloudflare Pages |
| `npm run cf-typegen` | Generate Cloudflare Worker types |
| `npm run migrate` | Run Supabase migrations |
| `npm run format` | Format code with Biome |

## 🚀 Deployment

### Cloudflare Pages

1. Build the application:

   ```bash
   npm run build
   ```

2. Deploy to Cloudflare Pages:

   ```bash
   npm run deploy
   ```

### Environment Variables

Configure these in your Cloudflare Pages dashboard:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_ANON_KEY`: Supabase anonymous key

## 🛡️ Authentication & Security

### JWT Authentication

- Uses Supabase Auth for user management
- JWT tokens validated on every request
- Automatic token refresh supported
- Row Level Security enforces data isolation

### CORS Policy

Configured to accept requests from:

- `http://localhost:3000` (local development)
- `https://turbodoc.ai` (production web app)
- iOS app (no origin header)

### Rate Limiting

Cloudflare Workers provides built-in DDoS protection and rate limiting.

## 🔄 Integration

### With iOS App

The API is designed to work seamlessly with the SwiftUI iOS app:

- Supports bearer token authentication
- Returns JSON responses compatible with Swift Codable
- Handles iOS-specific request patterns (no CORS origin)

### With Web App

Integrated with Next.js web frontend:

- Full CORS support for browser requests
- Compatible with Supabase SSR patterns
- Consistent error handling

## 🧪 Testing

### Local Testing

Use the Swagger UI at `http://localhost:3000` to test all endpoints interactively.

### API Testing

```bash
# Health check
curl http://localhost:3000/v1/bookmarks \
  -H "Authorization: Bearer <your-token>"

# Create bookmark
curl -X POST http://localhost:3000/v1/bookmarks \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Example","url":"https://example.com","tags":"test"}'
```

## 📝 Contributing

### Code Style

- Use Biome for code formatting: `npm run format`
- Follow TypeScript strict mode requirements
- Use proper OpenAPI documentation for new endpoints

### Adding New Endpoints

1. Create endpoint file in `src/endpoints/v1/`
2. Register route in `src/index.tsx`
3. Add OpenAPI documentation
4. Update this README if needed

### Database Changes

1. Create migration in `supabase/migrations/`
2. Update types in `src/types/database.types.ts`
3. Run `npm run migrate` to apply changes

## 🔍 Monitoring & Logs

- Cloudflare Workers Analytics for performance metrics
- Console logs available in Wrangler and Cloudflare dashboard
- Error tracking with proper HTTP status codes

## 📚 Learn More

- [Hono Documentation](https://hono.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [OpenAPI Specification](https://swagger.io/specification/)
