# Migration Guide: Old to New Structure

This guide helps you understand the changes made to the repository structure and how to work with the new organization.

## 🎯 Quick Start

If you're pulling this reorganized code:

1. **Install dependencies** (if needed):
   ```bash
   npm install
   ```

2. **Copy environment file**:
   ```bash
   cp config/.env.example .env
   ```

3. **Edit `.env`** with your PostgreSQL credentials

4. **Initialize database**:
   ```bash
   npm run init-postgres
   ```

5. **Start the application**:
   ```bash
   npm run dev
   ```

That's it! The application should work exactly as before.

## 📋 File Location Reference

Use this table to find where files moved:

| Old Location | New Location | Purpose |
|--------------|--------------|---------|
| `server.js` | `src/server.js` | Main entry point |
| `app.js` | `src/app.js` | Express setup |
| `database.js` | `src/config/database.js` | DB connection |
| `index.html` | `public/index.html` | Frontend HTML |
| `styles.css` | `public/css/styles.css` | Styles |
| `logo.png` | `public/images/logo.png` | Logo image |
| `engine-bg.jpg.jpg` | `public/images/engine-bg.jpg.jpg` | Background |
| `.env.example` | `config/.env.example` | Env template |
| `ecosystem.config.js` | `config/ecosystem.config.js` | PM2 config |
| `Procfile` | `config/Procfile` | Heroku config |
| `init-postgres.js` | `scripts/setup/init-postgres.js` | DB init |
| `create-demo-users.js` | `scripts/setup/create-demo-users.js` | Demo users |
| `create-production-users.js` | `scripts/setup/create-production-users.js` | Prod users |
| `create-test-db.js` | `scripts/setup/create-test-db.js` | Test DB |
| `clear-database.js` | `scripts/maintenance/clear-database.js` | DB reset |
| `clear-database-auto.js` | `scripts/maintenance/clear-database-auto.js` | Auto reset |
| `bulk-data-generator.js` | `scripts/generators/bulk-data-generator.js` | Test data |
| `modernize-code.js` | `scripts/maintenance/modernize-code.js` | Refactor |
| `debug-scripts/*` | `scripts/debug/*` | Debug utils |
| `tests/*` | `tests/integration/*` | Test suite |

## 🔧 What Changed

### 1. NPM Scripts Updated

All `package.json` scripts now use new paths:

**Before:**
```json
{
  "start": "node server.js",
  "dev": "nodemon server.js",
  "init-postgres": "node init-postgres.js"
}
```

**After:**
```json
{
  "start": "node src/server.js",
  "dev": "nodemon src/server.js",
  "init-postgres": "node scripts/setup/init-postgres.js"
}
```

### 2. Import Paths Updated

All JavaScript `require()` statements have been updated:

**In src/server.js:**
```javascript
// Before
const DatabaseWrapper = require('./database');
const initPostgres = require('./init-postgres');
app.use(express.static(__dirname));

// After
const DatabaseWrapper = require('./config/database');
const initPostgres = require('../scripts/setup/init-postgres');
app.use(express.static(path.join(__dirname, '../public')));
```

**In scripts:**
```javascript
// Before
const DatabaseWrapper = require('./database');

// After
const DatabaseWrapper = require('../../src/config/database');
```

### 3. Asset Paths Updated

**In public/index.html:**
```html
<!-- Before -->
<link rel="stylesheet" href="styles.css">
<img src="logo.png" alt="Logo">

<!-- After -->
<link rel="stylesheet" href="css/styles.css">
<img src="images/logo.png" alt="Logo">
```

**In public/css/styles.css:**
```css
/* Before */
background: url('engine-bg.jpg.jpg');

/* After */
background: url('../images/engine-bg.jpg.jpg');
```

### 4. Configuration Files Moved

**PM2 (ecosystem.config.js):**
```javascript
// Before
script: './server.js',

// After
script: './src/server.js',
```

**Heroku (Procfile):**
```
# Before
web: node server.js

# After
web: node src/server.js
```

**Environment:**
- Move `.env.example` to `config/.env.example`
- Keep `.env` in root (git-ignored)

## 🚨 Breaking Changes

### None for End Users
If you're just running the application, **nothing changes**. All functionality remains identical.

### For Developers

1. **Custom Scripts**: If you wrote custom scripts that import files, update paths:
   ```javascript
   // Update any custom scripts
   const DatabaseWrapper = require('./src/config/database');
   ```

2. **Deployment Scripts**: Update deployment configurations to use `src/server.js`

3. **IDE Configuration**: Update run configurations to use new entry point

## ✅ Verification Steps

After migration, verify everything works:

### 1. Test Server Start
```bash
npm start
# Should start without errors
```

### 2. Test Development Mode
```bash
npm run dev
# Should start with nodemon watching
```

### 3. Test Database Scripts
```bash
npm run init-postgres
# Should initialize database successfully
```

### 4. Test Application
1. Open http://localhost:3000
2. Login with default credentials (admin/admin123)
3. Check that all pages load
4. Verify images and styles load correctly

### 5. Run Tests
```bash
npm test
# All tests should pass
```

## 🔄 Rollback (If Needed)

If you need to rollback to the old structure:

1. **Using Git:**
   ```bash
   git log --oneline
   git checkout <commit-before-reorganization>
   ```

2. **Manual Rollback:**
   - Copy files from organized directories back to root
   - Restore old package.json
   - Restore old file paths in HTML/CSS

## 📚 Additional Resources

- **Structure Overview**: See `docs/STRUCTURE.md`
- **Main README**: See root `README.md`
- **API Documentation**: Coming soon

## 🐛 Troubleshooting

### "Cannot find module" errors

**Problem**: Import paths not updated correctly

**Solution**:
1. Check the file you're running
2. Update require() paths based on new structure
3. Use relative paths: `../../src/config/database`

### Static files not loading (404)

**Problem**: Asset paths in HTML/CSS incorrect

**Solution**:
1. Check browser console for 404 errors
2. Verify paths in `public/index.html`:
   - CSS: `css/styles.css`
   - Images: `images/filename.png`
3. Verify CSS background images use: `../images/filename.jpg`

### Database connection fails

**Problem**: `.env` file not found

**Solution**:
1. Copy `config/.env.example` to `.env` (root directory)
2. Fill in your PostgreSQL credentials
3. Restart the server

### Tests failing

**Problem**: Test paths not updated

**Solution**:
1. Check `package.json` jest configuration
2. Verify `collectCoverageFrom` paths point to `src/` directory
3. Run: `npm test -- --verbose` for details

### PM2 won't start

**Problem**: ecosystem.config.js has wrong path

**Solution**:
1. Check `config/ecosystem.config.js`
2. Verify `script: './src/server.js'`
3. Run from root: `pm2 start config/ecosystem.config.js`

## 💡 Best Practices Going Forward

### Adding New Files

Follow the new structure:

1. **Backend code** → `src/`
   - Routes → `src/routes/`
   - Controllers → `src/controllers/`
   - Models → `src/models/`
   - Utilities → `src/utils/`

2. **Frontend code** → `public/`
   - HTML → `public/`
   - CSS → `public/css/`
   - JavaScript → `public/js/`
   - Images → `public/images/`

3. **Utility scripts** → `scripts/`
   - Setup → `scripts/setup/`
   - Maintenance → `scripts/maintenance/`
   - Debug → `scripts/debug/`

4. **Tests** → `tests/`
   - Integration → `tests/integration/`
   - Unit → `tests/unit/`

5. **Documentation** → `docs/`

### Importing Files

Use proper relative paths:

```javascript
// From src/server.js
require('./config/database')        // Same directory tree
require('../scripts/setup/init')    // Up then down

// From scripts/setup/init-postgres.js
require('../../src/config/database') // Up twice, then down
```

### Deployment

Update deployment configurations:

1. **Heroku**: Use `config/Procfile`
2. **PM2**: Use `config/ecosystem.config.js`
3. **Docker**: Update COPY commands in Dockerfile
4. **CI/CD**: Update build scripts to use new paths

## 📞 Getting Help

If you encounter issues:

1. Check this migration guide
2. Review `docs/STRUCTURE.md`
3. Check the main `README.md`
4. Open an issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Your Node.js version (`node --version`)
   - Your npm version (`npm --version`)

## ✨ Summary

The reorganization improves code organization without changing functionality. All scripts and imports have been updated. Simply pull the changes, copy the `.env` file, and run as before. Everything should work seamlessly!
