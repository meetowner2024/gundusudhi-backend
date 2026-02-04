# Gundusudhi News Backend API

Complete Node.js + MySQL backend for the Gundusudhi News Platform with authentication, dynamic sections, and news management.

## 🚀 Features

- **Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (ADMIN, EDITOR, PAID_USER, FREE_USER)
  - User profile management
  - Subscription management

- **Dynamic Content Management**
  - Sections and subsections (fully dynamic)
  - News articles with rich content
  - Tagging system
  - Premium content support
  - Breaking news and featured articles

- **Performance & Security**
  - Connection pooling
  - Rate limiting
  - CORS protection
  - Helmet security headers
  - Request compression
  - Input validation

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## 🛠️ Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

Create a MySQL database and run the schema:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE gundusudhi_news CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gundusudhi_news;
SOURCE database/schema.sql;
```

### 3. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=gundusudhi_news
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:3000
```

### 4. Create Admin User

After running the schema, update the admin password hash:

```bash
node scripts/create-admin.js
```

Or manually update in MySQL:

```sql
UPDATE users SET password_hash = '$2a$10$...' WHERE email = 'admin@gundusudhi.com';
```

### 5. Start Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## 📚 API Documentation

Base URL: `http://localhost:5000/api/v1`

### Authentication Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "mobile": "9876543210",
  "state": "Telangana",
  "district": "Hyderabad",
  "address": "123 Main St"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "FREE_USER",
      "subscription_type": "FREE"
    }
  }
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Get Profile
```http
GET /auth/profile
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Updated",
  "mobile": "9876543210",
  "state": "Telangana"
}
```

### Section Management

#### Get All Sections (with subsections)
```http
GET /sections
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "State News",
      "slug": "state-news",
      "description": "State level news",
      "display_order": 1,
      "subsections": [
        {
          "id": 1,
          "name": "Politics",
          "slug": "politics",
          "display_order": 1
        }
      ]
    }
  ]
}
```

#### Create Section (Admin/Editor only)
```http
POST /sections
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Technology",
  "slug": "technology",
  "description": "Tech news and updates",
  "display_order": 9,
  "icon": "cpu"
}
```

#### Update Section
```http
PUT /sections/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "display_order": 10
}
```

#### Delete Section
```http
DELETE /sections/:id
Authorization: Bearer <admin_token>
```

#### Create Subsection
```http
POST /sections/subsections
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "section_id": 1,
  "name": "Local Politics",
  "slug": "local-politics",
  "description": "Local political news",
  "display_order": 1
}
```

### News Article Management

#### Get All Articles (with filters)
```http
GET /news?section=state-news&page=1&limit=20&is_featured=true
```

**Query Parameters:**
- `section` - Filter by section slug
- `subsection` - Filter by subsection slug
- `status` - DRAFT, PUBLISHED, ARCHIVED (default: PUBLISHED)
- `is_premium` - true/false
- `is_breaking` - true/false
- `is_featured` - true/false
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `search` - Full-text search

**Response:**
```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": 1,
        "title": "Breaking News Title",
        "slug": "breaking-news-title",
        "summary": "Article summary...",
        "featured_image": "/uploads/image.jpg",
        "is_premium": false,
        "is_breaking": true,
        "is_featured": true,
        "published_at": "2024-01-15T10:30:00.000Z",
        "views_count": 1234,
        "section_name": "State News",
        "section_slug": "state-news",
        "author_name": "John Doe",
        "tags": ["politics", "breaking"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

#### Get Article by Slug
```http
GET /news/:slug
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Article Title",
    "slug": "article-slug",
    "summary": "Summary...",
    "content": "<p>Full HTML content...</p>",
    "featured_image": "/uploads/image.jpg",
    "is_premium": false,
    "section_name": "State News",
    "subsection_name": "Politics",
    "author_name": "John Doe",
    "author_email": "john@example.com",
    "published_at": "2024-01-15T10:30:00.000Z",
    "views_count": 1234,
    "tags": ["politics", "breaking"]
  }
}
```

#### Create Article (Admin/Editor only)
```http
POST /news
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "New Article Title",
  "slug": "new-article-title",
  "summary": "Brief summary of the article",
  "content": "<p>Full HTML content of the article...</p>",
  "section_id": 1,
  "subsection_id": 2,
  "featured_image": "/uploads/image.jpg",
  "is_premium": false,
  "is_breaking": true,
  "is_featured": false,
  "status": "PUBLISHED",
  "tags": ["politics", "state", "breaking"]
}
```

#### Update Article
```http
PUT /news/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "Updated Title",
  "status": "PUBLISHED",
  "is_featured": true
}
```

#### Delete Article
```http
DELETE /news/:id
Authorization: Bearer <admin_token>
```

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## 👥 User Roles

- **ADMIN** - Full access to all endpoints
- **EDITOR** - Can create and edit content
- **PAID_USER** - Access to premium content
- **FREE_USER** - Basic access

## 📊 Database Schema

See `database/schema.sql` for the complete database structure including:

- Users & Authentication
- Sections & Subsections
- News Articles
- Tags
- Blogs
- Magazines
- Videos
- Subscriptions
- Analytics

## 🚦 Rate Limiting

API requests are rate-limited to prevent abuse:
- 100 requests per 15 minutes per IP address
- Configurable via environment variables

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Helmet security headers
- CORS protection
- SQL injection prevention (parameterized queries)
- XSS protection
- Rate limiting

## 📝 Error Handling

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test
```

## 📦 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── newsController.js    # News CRUD operations
│   │   └── sectionController.js # Section management
│   ├── middleware/
│   │   └── auth.js              # Auth middleware
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── newsRoutes.js
│   │   └── sectionRoutes.js
│   └── server.js                # Main application
├── database/
│   └── schema.sql               # Database schema
├── .env.example                 # Environment template
├── package.json
└── README.md
```

## 🚀 Deployment

### Production Checklist

1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure proper CORS origins
4. Set up SSL/TLS
5. Use environment variables for sensitive data
6. Enable logging
7. Set up database backups
8. Configure reverse proxy (nginx)

## 📞 Support

For issues and questions, please contact the development team.

## 📄 License

Proprietary - Gundusudhi News Platform
