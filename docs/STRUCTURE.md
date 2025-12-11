# Repository Structure Documentation

This document describes the organized structure of the HR Family Inventory Management System.

## 📁 Directory Structure

```
garage-inventory-system/
├── src/                          # Backend source code
│   ├── server.js                 # Main application entry point
│   ├── app.js                    # Express app setup
│   ├── config/                   # Configuration files
│   │   └── database.js           # Database connection and abstraction layer
│   ├── middleware/               # Express middleware (future)
│   ├── routes/                   # API route handlers (future)
│   ├── controllers/              # Business logic (future)
│   ├── models/                   # Data models (future)
│   └── utils/                    # Helper functions (future)
│
├── public/                       # Frontend static assets
│   ├── index.html                # Main application HTML
│   ├── css/
│   │   └── styles.css            # Application styles
│   ├── js/                       # Frontend JavaScript (future)
│   └── images/                   # Images and assets
│       ├── logo.png              # HR Family logo
│       └── engine-bg.jpg.jpg     # Login background
│
├── scripts/                      # Utility and maintenance scripts
│   ├── setup/                    # Initial setup scripts
│   │   ├── init-postgres.js      # Database initialization
│   │   ├── create-demo-users.js  # Demo user creation
│   │   ├── create-production-users.js  # Production user setup
│   │   └── create-test-db.js     # Test database setup
│   ├── maintenance/              # Database maintenance
│   │   ├── clear-database.js     # Safe database reset
│   │   ├── clear-database-auto.js # Automated reset
│   │   └── modernize-code.js     # Code refactoring utility
│   ├── generators/               # Data generation
│   │   └── bulk-data-generator.js # Generate test data
│   └── debug/                    # Debugging utilities
│       ├── check-inventory.js
│       ├── check-sale.js
│       ├── check-sale-items.js
│       ├── debug-sales.js
│       ├── stress-test.js
│       ├── stress-test-aggressive.js
│       ├── test-optional-customer.js
│       ├── test-profit-api.js
│       ├── test-reconnection.js
│       ├── test-return-logic.js
│       ├── verify-database.js
│       └── verify-profit-analysis.js
│
├── tests/                        # Test suite
│   ├── integration/              # Integration tests
│   │   ├── __tests__/
│   │   │   ├── setup.js
│   │   │   ├── auth.test.js
│   │   │   ├── customers-suppliers.test.js
│   │   │   ├── database.test.js
│   │   │   ├── health.test.js
│   │   │   ├── inventory.test.js
│   │   │   └── sales.test.js
│   │   ├── test-login.html
│   │   └── test.html
│   ├── unit/                     # Unit tests (future)
│   └── manual/                   # Manual testing files (future)
│
├── config/                       # Configuration files
│   ├── .env.example              # Environment variables template
│   ├── ecosystem.config.js       # PM2 configuration
│   └── Procfile                  # Heroku deployment config
│
├── docs/                         # Documentation
│   ├── STRUCTURE.md              # This file
│   └── api/                      # API documentation (future)
│
├── logs/                         # Application logs
│
├── node_modules/                 # Dependencies (git-ignored)
│
├── .git/                         # Git repository
├── .gitignore                    # Git ignore patterns
├── package.json                  # Node.js project configuration
├── package-lock.json             # Dependency lock file
├── README.md                     # Main project documentation
└── screenshot.png                # Production screenshot

```

## 🎯 Key Directories Explained

### `/src` - Backend Source Code
Contains all Node.js/Express backend code:
- **server.js**: Main entry point, Express setup, all API routes
- **config/database.js**: PostgreSQL connection pool and query abstraction

**Future expansion planned**:
- `/middleware` - Authentication, validation, error handling
- `/routes` - Separated route handlers for each resource
- `/controllers` - Business logic for each domain
- `/models` - Data models and database queries
- `/utils` - Helper functions and utilities

### `/public` - Frontend Assets
All static files served to the browser:
- **index.html**: Single-page application with embedded JavaScript
- **css/styles.css**: Complete responsive styling
- **images/**: Logo and background images

### `/scripts` - Utility Scripts
Organized into logical subdirectories:

#### `setup/`
First-time setup and initialization:
- Database schema creation
- User account setup
- Test environment preparation

#### `maintenance/`
Database and code maintenance:
- Database reset and cleanup
- Code refactoring utilities

#### `generators/`
Test data generation:
- Bulk data creation for load testing

#### `debug/`
Debugging and verification tools:
- Data integrity checks
- Performance stress tests
- API endpoint testing
- Database reconnection testing

### `/tests` - Test Suite
Jest-based testing infrastructure:
- **integration/**: Full API and database tests
- **unit/**: Individual function tests (future)
- **manual/**: HTML test pages for manual testing

### `/config` - Configuration
Environment and deployment configuration:
- Environment variables template
- PM2 process manager config
- Heroku Procfile

### `/docs` - Documentation
Project documentation:
- Structure documentation (this file)
- API documentation (future)

## 🚀 Running the Application

### Development
```bash
npm run dev
```
Runs the server with auto-reload via nodemon.

### Production
```bash
npm start
```
Runs the server in production mode.

### Database Setup
```bash
npm run init-postgres
```
Initializes database schema and creates default users.

### Testing
```bash
npm test
```
Runs the Jest test suite with coverage.

## 📝 NPM Scripts

All scripts have been updated to use the new structure:

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node src/server.js` | Production server |
| `dev` | `nodemon src/server.js` | Development with auto-reload |
| `test` | `jest --coverage` | Run test suite |
| `test:watch` | `jest --watch` | Watch mode testing |
| `init-postgres` | `node scripts/setup/init-postgres.js` | Initialize database |
| `clear-database` | `node scripts/maintenance/clear-database.js` | Reset database |
| `create-demo-users` | `node scripts/setup/create-demo-users.js` | Create demo accounts |
| `create-production-users` | `node scripts/setup/create-production-users.js` | Create production users |
| `generate-secret` | Generate SESSION_SECRET | Create secure random key |

## 🔄 Migration from Old Structure

### What Changed

**Before** (Root-level files):
```
server.js
database.js
index.html
styles.css
logo.png
clear-database.js
init-postgres.js
...
```

**After** (Organized structure):
```
src/server.js
src/config/database.js
public/index.html
public/css/styles.css
public/images/logo.png
scripts/maintenance/clear-database.js
scripts/setup/init-postgres.js
...
```

### Updated Imports

All require() paths have been updated:
- `require('./database')` → `require('./config/database')` or `require('../../src/config/database')`
- `express.static(__dirname)` → `express.static(path.join(__dirname, '../public'))`

### Updated Asset Paths

HTML and CSS asset references:
- `href="styles.css"` → `href="css/styles.css"`
- `src="logo.png"` → `src="images/logo.png"`
- `url('engine-bg.jpg.jpg')` → `url('../images/engine-bg.jpg.jpg')`

## 🎨 Benefits of New Structure

1. **Separation of Concerns**: Frontend, backend, scripts, and config are clearly separated
2. **Scalability**: Easy to add new routes, controllers, and models as the app grows
3. **Maintainability**: Logical organization makes code easier to find and update
4. **Best Practices**: Follows Node.js/Express community standards
5. **Professional**: Standard structure recognized by developers
6. **Deployment**: Clear entry points for various deployment platforms

## 🔮 Future Improvements

1. **Backend Refactoring**:
   - Split server.js into separate route files
   - Extract middleware into /middleware directory
   - Create controller layer for business logic
   - Add model layer for database operations

2. **Frontend Enhancement**:
   - Extract JavaScript from index.html to /public/js
   - Create modular JS files (auth.js, api.js, ui.js)
   - Add frontend build process (optional)

3. **Testing Expansion**:
   - Add unit tests for individual functions
   - Increase test coverage
   - Add E2E tests

4. **Documentation**:
   - Generate API documentation (Swagger/OpenAPI)
   - Add inline JSDoc comments
   - Create developer onboarding guide

## 📞 Support

For questions about the new structure, refer to:
- Main README.md for project overview
- This file (STRUCTURE.md) for organization details
- GitHub Issues for bug reports and feature requests
