# Quick Start Guide - Gundusudhi News Backend

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup MySQL Database

Open MySQL command line or MySQL Workbench:

```sql
-- Create database
CREATE DATABASE gundusudhi_news CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE gundusudhi_news;

-- Run the schema file
SOURCE database/schema.sql;
```

Or from command line:
```bash
mysql -u root -p < database/schema.sql
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your settings
```

**Important settings in .env:**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=gundusudhi_news
JWT_SECRET=change_this_to_random_string
FRONTEND_URL=http://localhost:3000
```

### 4. Create Admin User

Generate admin password hash:
```bash
node scripts/create-admin.js your_password
```

Copy the generated hash and run in MySQL:
```sql
UPDATE users SET password_hash = 'your_generated_hash' WHERE email = 'admin@gundusudhi.com';
```

### 5. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### 6. Test the API

Open your browser or Postman and test:

**Health Check:**
```
GET http://localhost:5000/health
```

**Login as Admin:**
```
POST http://localhost:5000/api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@gundusudhi.com",
  "password": "your_password"
}
```

**Get Sections:**
```
GET http://localhost:5000/api/v1/sections
```

## Common Issues

### Database Connection Failed
- Check if MySQL is running
- Verify credentials in .env
- Ensure database exists

### Port Already in Use
- Change PORT in .env file
- Or kill the process using port 5000

### JWT Token Errors
- Ensure JWT_SECRET is set in .env
- Token might be expired (default: 7 days)

## Next Steps

1. **Create News Articles** - Use POST /api/v1/news endpoint
2. **Add Sections** - Customize your news categories
3. **Integrate with Frontend** - Update frontend API URLs
4. **Add File Upload** - Implement image upload for articles
5. **Setup Email** - Configure SMTP for notifications

## API Testing with Postman

Import this collection structure:

```
Gundusudhi News API
├── Auth
│   ├── Register
│   ├── Login
│   └── Get Profile
├── Sections
│   ├── Get All Sections
│   ├── Create Section
│   └── Create Subsection
└── News
    ├── Get All Articles
    ├── Get Article by Slug
    ├── Create Article
    └── Update Article
```

## Production Deployment

1. Set NODE_ENV=production
2. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name gundusudhi-api
   pm2 save
   pm2 startup
   ```
3. Setup nginx reverse proxy
4. Enable SSL with Let's Encrypt
5. Setup database backups

## Support

For help, refer to:
- README.md - Full documentation
- database/schema.sql - Database structure
- .env.example - Configuration options
