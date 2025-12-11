# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser/Client                          │
│                     (HTML, CSS, JavaScript)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/HTTPS
                             │ (RESTful API)
┌────────────────────────────▼────────────────────────────────────┐
│                      Express.js Server                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Middleware Stack                            │  │
│  │  • Helmet (Security Headers)                             │  │
│  │  • CORS (Cross-Origin)                                   │  │
│  │  • Morgan (Logging)                                      │  │
│  │  • Rate Limiting                                         │  │
│  │  • Session Management (PostgreSQL-backed)                │  │
│  │  • Body Parser                                           │  │
│  │  • Static File Serving                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              API Routes (server.js)                      │  │
│  │  • /api/login, /api/logout                               │  │
│  │  • /api/inventory (CRUD)                                 │  │
│  │  • /api/sales (CRUD)                                     │  │
│  │  • /api/returns (CRUD)                                   │  │
│  │  • /api/customers (CRUD)                                 │  │
│  │  • /api/suppliers (CRUD)                                 │  │
│  │  • /api/users (CRUD - Admin)                             │  │
│  │  • /api/dashboard/profits                                │  │
│  │  • /health, /ready                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Database Abstraction (database.js)               │  │
│  │  • Connection Pooling (max 20)                           │  │
│  │  • Query Methods (run, get, all)                         │  │
│  │  • Transaction Support                                   │  │
│  │  • Retry Logic                                           │  │
│  │  • Health Monitoring                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ pg (node-postgres)
                             │ Connection Pool
┌────────────────────────────▼────────────────────────────────────┐
│                      PostgreSQL Database                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tables:                                                  │  │
│  │  • users (authentication & authorization)                │  │
│  │  • inventory (products, stock, pricing)                  │  │
│  │  • sales (transactions, invoices)                        │  │
│  │  • returns (return requests, approvals)                  │  │
│  │  • returned_items (returned stock tracking)              │  │
│  │  • customers (CRM)                                       │  │
│  │  • suppliers (vendor management)                         │  │
│  │  • session (express-session store)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Indexes:                                                 │  │
│  │  • Primary keys on all tables                            │  │
│  │  • Unique constraints (sku, email, username, invoice)    │  │
│  │  • Performance indexes (date, status, etc.)              │  │
│  │  • Foreign keys (returned_items → returns)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Request Flow

### 1. User Authentication Flow
```
Browser                 Server                  Database
   │                      │                        │
   │──Login (POST)───────▶│                        │
   │                      │──Query users table────▶│
   │                      │◀──User data───────────│
   │                      │                        │
   │                      │──bcrypt.compare()      │
   │                      │                        │
   │                      │──Create session───────▶│
   │◀─Session cookie─────│◀──Session stored──────│
   │                      │                        │
```

### 2. Inventory Management Flow
```
Browser                 Server                  Database
   │                      │                        │
   │──GET /api/inventory─▶│                        │
   │                      │──Check session────────▶│
   │                      │◀──Session valid───────│
   │                      │                        │
   │                      │──Query inventory──────▶│
   │◀─JSON response──────│◀──Results─────────────│
   │                      │                        │
```

### 3. Sales Transaction Flow
```
Browser                 Server                  Database
   │                      │                        │
   │──POST /api/sales────▶│                        │
   │  (items, customer)   │──Check auth───────────▶│
   │                      │◀──Authorized──────────│
   │                      │                        │
   │                      │──BEGIN TRANSACTION────▶│
   │                      │                        │
   │                      │──Deduct inventory─────▶│
   │                      │──Create sale record───▶│
   │                      │──Update customer──────▶│
   │                      │                        │
   │                      │──COMMIT TRANSACTION───▶│
   │◀─Invoice JSON───────│◀──Success─────────────│
   │                      │                        │
```

## Directory Structure Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Project Root                                │
└─────────────────────────────────────────────────────────────────┘
          │
          ├──► src/                    Backend Source Code
          │    ├── server.js            • Main entry point
          │    ├── app.js               • Express setup
          │    └── config/
          │        └── database.js      • PostgreSQL abstraction
          │
          ├──► public/                  Frontend Static Assets
          │    ├── index.html           • Single-page app
          │    ├── css/
          │    │   └── styles.css       • All styles
          │    └── images/
          │        ├── logo.png         • Brand assets
          │        └── engine-bg.jpg.jpg
          │
          ├──► scripts/                 Utility Scripts
          │    ├── setup/               • Database initialization
          │    ├── maintenance/         • Cleanup & refactoring
          │    ├── generators/          • Test data generation
          │    └── debug/               • Debugging utilities
          │
          ├──► tests/                   Testing Infrastructure
          │    ├── integration/         • API & DB tests (Jest)
          │    ├── unit/                • Function tests (future)
          │    └── manual/              • Manual test pages
          │
          ├──► config/                  Configuration Files
          │    ├── .env.example         • Environment template
          │    ├── ecosystem.config.js  • PM2 configuration
          │    └── Procfile             • Heroku deployment
          │
          ├──► docs/                    Documentation
          │    ├── STRUCTURE.md         • Directory structure
          │    ├── MIGRATION_GUIDE.md   • Migration help
          │    └── ARCHITECTURE.md      • This file
          │
          └──► logs/                    Application Logs
               ├── out.log              • stdout (PM2)
               ├── err.log              • stderr (PM2)
               └── combined.log         • Combined (PM2)
```

## Technology Stack

### Backend
```
┌─────────────────────────────────────────┐
│           Node.js v20.x                 │
│  ┌───────────────────────────────────┐  │
│  │       Express.js 4.x              │  │
│  │  • Web framework                  │  │
│  │  • Middleware support             │  │
│  │  • Routing                        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      Security Packages            │  │
│  │  • helmet (security headers)      │  │
│  │  • bcrypt (password hashing)      │  │
│  │  • express-rate-limit             │  │
│  │  • express-validator              │  │
│  │  • cors                           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      Session Management           │  │
│  │  • express-session                │  │
│  │  • connect-pg-simple              │  │
│  │  • PostgreSQL-backed sessions     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Database
```
┌─────────────────────────────────────────┐
│      PostgreSQL 12+ Database            │
│  ┌───────────────────────────────────┐  │
│  │     Connection Pool (pg)          │  │
│  │  • Max 20 connections             │  │
│  │  • 30s idle timeout               │  │
│  │  • 10s connection timeout         │  │
│  │  • Automatic reconnection         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │          8 Tables                 │  │
│  │  users, inventory, sales,         │  │
│  │  returns, returned_items,         │  │
│  │  customers, suppliers, session    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │        12 Indexes                 │  │
│  │  Performance optimization         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Frontend
```
┌─────────────────────────────────────────┐
│         Vanilla JavaScript              │
│  ┌───────────────────────────────────┐  │
│  │      No Framework Used            │  │
│  │  • Vanilla JS                     │  │
│  │  • HTML5                          │  │
│  │  • CSS3                           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      Features                     │  │
│  │  • Single-page application        │  │
│  │  • Tab-based navigation           │  │
│  │  • Modal dialogs                  │  │
│  │  • Responsive design              │  │
│  │  • Mobile-friendly                │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Security Architecture

### Authentication & Authorization
```
┌──────────────────────────────────────────────────────────┐
│                   Security Layers                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Transport Security                                   │
│     • HTTPS (production)                                 │
│     • Secure headers (Helmet)                            │
│                                                          │
│  2. Authentication                                       │
│     • Session-based (express-session)                    │
│     • bcrypt password hashing (10 rounds)                │
│     • PostgreSQL session store                           │
│                                                          │
│  3. Authorization                                        │
│     • Role-based access control (admin/user)             │
│     • Middleware: requireAuth, requireAdmin              │
│     • Per-endpoint permission checks                     │
│                                                          │
│  4. Input Validation                                     │
│     • express-validator                                  │
│     • Parameterized queries                              │
│     • SQL injection prevention                           │
│                                                          │
│  5. Rate Limiting                                        │
│     • General: 1000 req/15min                            │
│     • Login: 20 attempts/15min                           │
│     • Write ops: 500 req/15min                           │
│                                                          │
│  6. CORS Protection                                      │
│     • Configurable allowed origins                       │
│     • Credentials support                                │
│                                                          │
│  7. Content Security Policy                              │
│     • Helmet CSP directives                              │
│     • Script/style restrictions                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Deployment Architecture

### Development
```
Developer Machine
    │
    ├── npm run dev (nodemon)
    │   └── Watches: src/server.js
    │
    ├── PostgreSQL (local)
    │   └── Port: 5432
    │
    └── Browser
        └── http://localhost:3000
```

### Production (PM2)
```
Production Server
    │
    ├── PM2 Process Manager
    │   ├── Instances: 1 (can be scaled)
    │   ├── Auto-restart: enabled
    │   ├── Max memory: 1GB
    │   └── Logs: ./logs/
    │
    ├── PostgreSQL
    │   ├── Connection pool: 20
    │   └── Session store
    │
    ├── Nginx (optional)
    │   ├── Reverse proxy
    │   ├── SSL termination
    │   └── Static file caching
    │
    └── Monitoring
        ├── /health endpoint
        ├── /ready endpoint
        └── PM2 monitoring
```

### Production (Heroku)
```
Heroku Platform
    │
    ├── Web Dyno
    │   └── node src/server.js
    │
    ├── Heroku Postgres
    │   └── Automatic provisioning
    │
    ├── Environment Config
    │   └── Config vars
    │
    └── Automatic Scaling
        └── Based on dyno type
```

## Data Flow Architecture

### Create Sale Transaction
```
1. Browser submits sale data
   ↓
2. Server validates input (express-validator)
   ↓
3. Server checks authentication & authorization
   ↓
4. Database begins transaction
   ↓
5. Check inventory availability
   ↓
6. Deduct inventory quantities
   ↓
7. Generate invoice number (TRN-00001)
   ↓
8. Calculate profit (price - cost)
   ↓
9. Insert sale record
   ↓
10. Update customer lifetime value
   ↓
11. Commit transaction
   ↓
12. Return invoice to client
```

### Return Processing
```
1. User submits return request
   ↓
2. Server validates return data
   ↓
3. Begin transaction
   ↓
4. Create return record (status: pending)
   ↓
5. Admin reviews and approves/rejects
   ↓
6. If approved:
   ├── Update sale record
   ├── Adjust customer lifetime value
   ├── Record returned items
   └── Optionally restock inventory
   ↓
7. Commit transaction
   ↓
8. Notify user of status
```

## Scalability Considerations

### Current Scale
- **Users**: 4 team members
- **Transactions**: ~100-500 per day
- **Database**: Single PostgreSQL instance
- **Server**: Single Node.js process

### Scaling Options

#### Vertical Scaling
```
Current: 1 CPU, 1GB RAM
    ↓
Scale Up: 2-4 CPUs, 2-4GB RAM
    ↓
Benefits:
  • Simple configuration
  • No code changes
  • Handles more connections
```

#### Horizontal Scaling
```
Current: 1 PM2 instance
    ↓
Scale Out: Multiple PM2 instances
    ↓
ecosystem.config.js:
  instances: 'max'  // Use all CPU cores
    ↓
Benefits:
  • Better CPU utilization
  • Fault tolerance
  • Load balancing
```

#### Database Scaling
```
Current: Single PostgreSQL
    ↓
Options:
  1. Read replicas (for reports)
  2. Connection pooling tuning
  3. Query optimization
  4. Index optimization
  5. Managed database (AWS RDS, etc.)
```

## Monitoring & Health Checks

```
┌─────────────────────────────────────────┐
│         Health Check Endpoints          │
├─────────────────────────────────────────┤
│                                         │
│  GET /health                            │
│  • Basic health check                   │
│  • Returns: 200 OK                      │
│  • Use: Load balancer health check      │
│                                         │
│  GET /ready                             │
│  • Readiness probe                      │
│  • Checks database connectivity         │
│  • Returns: 200 OK or 503 Unavailable   │
│                                         │
│  GET /api/health/memory (Admin)         │
│  • Memory usage statistics              │
│  • Heap usage details                   │
│  • Connection pool status               │
│  • Process uptime                       │
│                                         │
└─────────────────────────────────────────┘
```

## Future Architecture Enhancements

### Phase 1: Modularization
```
Current: Monolithic server.js
    ↓
Future: Separated concerns
  ├── src/routes/       (Route definitions)
  ├── src/controllers/  (Business logic)
  ├── src/models/       (Data access)
  └── src/middleware/   (Auth, validation)
```

### Phase 2: Frontend Build
```
Current: Vanilla JS in HTML
    ↓
Future: Modern frontend
  ├── React/Vue (optional)
  ├── Webpack/Vite
  ├── TypeScript
  └── Component architecture
```

### Phase 3: Microservices (Long-term)
```
Current: Monolithic application
    ↓
Future: Service-oriented
  ├── Auth Service
  ├── Inventory Service
  ├── Sales Service
  ├── Customer Service
  └── API Gateway
```

## Summary

This architecture provides:
- ✅ Clean separation of concerns
- ✅ Scalable PostgreSQL database
- ✅ Secure authentication & authorization
- ✅ RESTful API design
- ✅ Organized codebase
- ✅ Production-ready deployment
- ✅ Comprehensive testing
- ✅ Easy maintenance & updates

The current architecture is suitable for small teams (4 users) and can scale to medium-sized operations with minimal changes.
