require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const DatabaseWrapper = require('./database');
const path = require('path');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { body, validationResult } = require('express-validator');
const initPostgres = require('./init-postgres');

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

// Validate required environment variables for PostgreSQL
if (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB || !process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD) {
    console.error('ERROR: PostgreSQL configuration missing!');
    console.error('Required environment variables: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD');
    console.error('Please set these in your .env file or environment.');
    process.exit(1);
}

// Security Middleware - CSP enabled with proper configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdnjs.cloudflare.com"], // TODO: Replace with script hashes
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"], // Allow inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdnjs.cloudflare.com"], // Allow CDN for source maps
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS Configuration
// Allow ALL origins (best for now)
const corsOptions = {
  origin: true,
  credentials: true
};

app.use(cors(corsOptions));

// Rate Limiting Configuration (Optimized for small team with 4 users)
const limiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes (900000ms)
    max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000, // Max 1000 requests per window (generous for 4 users)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        console.error(`Rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.path}`);
        res.status(429).json({
            error: 'Too many requests',
            message: 'You have exceeded the rate limit. Please try again later.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 login attempts per window (more generous for small team)
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    handler: (req, res) => {
        console.error(`Login rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Too many login attempts',
            message: 'You have exceeded the maximum number of login attempts. Please try again after 15 minutes.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Rate limiter for write operations (POST, PUT, DELETE) - generous for small team
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Max 500 write operations per window (very generous for 4 users)
    message: 'Too many write operations, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET', // Only apply to non-GET requests
    handler: (req, res) => {
        console.error(`Write operation rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.path}`);
        res.status(429).json({
            error: 'Too many write operations',
            message: 'You have exceeded the rate limit for write operations. Please try again later.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Apply general rate limiting to all API routes
app.use('/api/', limiter);

// Apply strict rate limiting to write operations
app.use('/api/', strictLimiter);

// Session Configuration with PostgreSQL Store
if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET not set. Using default (INSECURE for production!)');
}

const sessionStore = new pgSession({
    conObject: {
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    },
    tableName: 'session', // Session table name
    createTableIfMissing: true, // Auto-create session table
    pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
});

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'default-insecure-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true only when using HTTPS (in production with SSL)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax' // Changed from 'strict' to 'lax' for better compatibility
    }
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Initialize PostgreSQL database
const db = new DatabaseWrapper({ type: 'postgres' });

// Start health check monitoring (every 30 seconds)
// This will automatically attempt to reconnect if connection is lost
db.startHealthCheck(30000);

// Database initialization happens separately via: npm run init-postgres
// This keeps the server startup fast and allows for proper async initialization
console.log('PostgreSQL database connection established with health monitoring');

// ===== API ROUTES =====

// Pagination helper
const getPaginationParams = (req) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50; // Default 50 records per page
    const offset = (page - 1) * limit;

    return { page, limit, offset };
};

const createPaginatedResponse = (data, total, page, limit) => {
    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    };
};

// Validation helper
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

// Authentication middleware - Checks if user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    next();
};

// Authorization middleware - Checks if user has admin role
const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }
    next();
};

// Pagination parameter validation
const validatePaginationParams = (req, res, next) => {
    const page = Number.parseInt(req.query.page, 10);
    const limit = Number.parseInt(req.query.limit, 10);

    if (req.query.page && (Number.isNaN(page) || page < 1)) {
        return res.status(400).json({ success: false, message: 'Invalid page parameter. Must be a positive integer.' });
    }

    if (req.query.limit && (Number.isNaN(limit) || limit < 1 || limit > 1000)) {
        return res.status(400).json({ success: false, message: 'Invalid limit parameter. Must be between 1 and 1000.' });
    }

    next();
};

// Safe JSON parse helper
const safeJSONParse = (jsonString, defaultValue = null) => {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('JSON parse error:', error);
        return defaultValue;
    }
};

// Mask email for privacy while giving a hint
// Example: admin@hrspares.com -> ad*****@hrspares.com
const maskEmail = (email) => {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    if (!domain) return email;

    // Show first 2 characters, then mask the rest
    const maskedLocal = localPart.length > 2
        ? localPart.substring(0, 2) + '*****'
        : localPart[0] + '*';

    return `${maskedLocal}@${domain}`;
};

// Mask phone number for privacy while giving a hint
// Example: +256700123456 -> +256***3456
const maskPhone = (phone) => {
    if (!phone) return '';
    // Show country code and last 4 digits
    if (phone.startsWith('+256')) {
        return '+256***' + phone.slice(-4);
    }
    // Generic: show first 4 and last 3
    if (phone.length > 7) {
        return phone.slice(0, 4) + '***' + phone.slice(-3);
    }
    return phone;
};

// Users - Step 1: Verify credentials and send OTP
app.post('/api/login',
    loginLimiter,
    [
        body('username').trim().notEmpty().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validate,
    async (req, res) => {
        try {
            const { username, password } = req.body;
            console.log('Login attempt for username:', username);
            const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

            if (!user) {
                console.log('User not found:', username);
                return res.json({ success: false, message: 'Invalid credentials' });
            }

            console.log('User found, checking password...');
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                console.log('Password match successful for:', username);

                // Create session for user
                req.session.regenerate((err) => {
                    if (err) {
                        console.error('Session regeneration error:', err);
                        return res.status(500).json({ success: false, message: 'Login failed' });
                    }

                    req.session.user = {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role === 'superadmin' ? 'admin' : user.role
                    };

                    req.session.save((err) => {
                        if (err) {
                            console.error('Session save error:', err);
                            return res.status(500).json({ success: false, message: 'Login failed' });
                        }

                        console.log('Login successful for:', username);
                        return res.json({
                            success: true,
                            user: req.session.user
                        });
                    });
                });
            } else {
                console.log('Password mismatch for:', username);
                res.json({ success: false, message: 'Invalid credentials' });
            }
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Server error during login' });
        }
    }
);

// Logout endpoint
app.post('/api/logout', requireAuth,  async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get current user from session
app.get('/api/me', requireAuth,  async (req, res) => {
    res.json({ success: true, user: req.session.user });
});

// Inventory
app.get('/api/inventory', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM inventory');
        const total = totalCount.count;

        // Get paginated data
        const inventory = await db.all('SELECT * FROM inventory LIMIT ? OFFSET ?', [limit, offset]);

        res.json(createPaginatedResponse(inventory, total, page, limit));
    } catch (error) {
        console.error('Error fetching inventory:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
    }
});

app.get('/api/inventory/:id', requireAuth, async (req, res) => {
    try {
        const item = await db.get('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
        res.json(item || null);
    } catch (error) {
        console.error('Error fetching inventory item:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch inventory item' });
    }
});

app.post('/api/inventory', requireAuth, [
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('costPrice').isFloat({ min: 0 }).withMessage('Cost price must be a non-negative number'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
    body('reorderLevel').isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
    body('supplier').trim().notEmpty().withMessage('Supplier is required'),
    body('lastRestock').isISO8601().withMessage('Last restock must be a valid date')
], validate, async (req, res) => {
    try {
        const { sku, name, category, quantity, costPrice, price, reorderLevel, supplier, lastRestock } = req.body;
        const result = await db.run('INSERT INTO inventory (sku, name, category, quantity, cost_price, price, reorder_level, supplier, last_restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sku, name, category, Number.parseInt(quantity, 10), Number.parseFloat(costPrice), Number.parseFloat(price), Number.parseInt(reorderLevel, 10), supplier, lastRestock]);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error creating inventory item:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'SKU already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to create inventory item' });
        }
    }
});

app.put('/api/inventory/:id', requireAuth, [
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('costPrice').isFloat({ min: 0 }).withMessage('Cost price must be a non-negative number'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
    body('reorderLevel').isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
    body('supplier').trim().notEmpty().withMessage('Supplier is required'),
    body('lastRestock').isISO8601().withMessage('Last restock must be a valid date')
], validate, async (req, res) => {
    try {
        const { sku, name, category, quantity, costPrice, price, reorderLevel, supplier, lastRestock } = req.body;
        console.log('Updating inventory item:', req.params.id);
        console.log('Data:', { sku, name, category, quantity, costPrice, price, reorderLevel, supplier, lastRestock });

        const result = await db.run('UPDATE inventory SET sku = ?, name = ?, category = ?, quantity = ?, cost_price = ?, price = ?, reorder_level = ?, supplier = ?, last_restock = ? WHERE id = ?',
            [sku, name, category, Number.parseInt(quantity, 10), Number.parseFloat(costPrice), Number.parseFloat(price), Number.parseInt(reorderLevel, 10), supplier, lastRestock, req.params.id]);

        console.log('Update result:', result);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating inventory item:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'SKU already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update inventory item' });
        }
    }
});

app.delete('/api/inventory/:id', requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM inventory WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting inventory item:', error);
        res.status(500).json({ success: false, message: 'Failed to delete inventory item' });
    }
});

// Sales
app.get('/api/sales', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { user } = req.session;
        const { page, limit, offset } = getPaginationParams(req);
        const { date, startDate, endDate } = req.query;

        let sales;
        let total;

        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];

        // Admin sees all sales, regular users see only their own sales
        if (user.role !== 'admin') {
            whereConditions.push('seller_id = ?');
            queryParams.push(user.id);
        }

        // Add date filtering
        if (date) {
            // Filter by specific date (for "today's sales" view)
            whereConditions.push('date = ?');
            queryParams.push(date);
        } else if (startDate && endDate) {
            // Filter by date range
            whereConditions.push('date BETWEEN ? AND ?');
            queryParams.push(startDate, endDate);
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Get total count
        const totalCount = await db.get(
            `SELECT COUNT(*) as count FROM sales ${whereClause}`,
            queryParams
        );
        total = totalCount.count;

        // Get paginated sales
        sales = await db.all(
            `SELECT * FROM sales ${whereClause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );

        const formatted = sales.map(sale => ({
            ...sale,
            items: safeJSONParse(sale.items, [])
        }));

        res.json(createPaginatedResponse(formatted, total, page, limit));
    } catch (error) {
        console.error('Error fetching sales:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sales' });
    }
});

app.get('/api/sales/:id', requireAuth, async (req, res) => {
    try {
        const sale = await db.get('SELECT * FROM sales WHERE id = ?', [req.params.id]);
        if (sale) {
            sale.items = safeJSONParse(sale.items, []);
        }
        res.json(sale || null);
    } catch (error) {
        console.error('Error fetching sale:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sale' });
    }
});

app.post('/api/sales', async (req, res) => {
    try {
        const { date, customer_id, customer_name, seller_id, seller_name, items, total, payment_method, status } = req.body;

        // Use database transaction to prevent race conditions
        const transaction = db.transaction(async (tx, saleData) => {
            // Validate and update inventory for each item
            const parsedItems = typeof saleData.items === 'string' ? JSON.parse(saleData.items) : saleData.items;

            let totalCost = 0;
            let totalDiscount = 0;

            for (const item of parsedItems) {
                if (item.itemId || item.id) {
                    const itemId = item.itemId || item.id;
                    // Get current inventory with FOR UPDATE lock to prevent race conditions
                    const inventoryItem = await tx.get('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [itemId]);

                    if (!inventoryItem) {
                        throw new Error(`Inventory item ${itemId} not found`);
                    }

                    if (inventoryItem.quantity < item.quantity) {
                        throw new Error(`Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`);
                    }

                    // Calculate cost for this item
                    const itemCost = (inventoryItem.cost_price || 0) * item.quantity;
                    totalCost += itemCost;

                    // Calculate discount for this item
                    // actualPrice is the price entered by user at point of sale
                    // If not provided, use the system price
                    const actualPrice = item.actualPrice !== undefined ? item.actualPrice : item.price;
                    const systemPrice = inventoryItem.price;
                    const itemDiscount = (systemPrice - actualPrice) * item.quantity;
                    totalDiscount += itemDiscount;

                    // Store the actual price and discount in the item
                    item.systemPrice = Number.parseFloat(systemPrice);
                    item.actualPrice = Number.parseFloat(actualPrice);
                    item.discount = Number.parseFloat(itemDiscount.toFixed(2));
                    item.costPrice = Number.parseFloat(inventoryItem.cost_price || 0);

                    // Deduct inventory
                    const newQuantity = inventoryItem.quantity - item.quantity;
                    await tx.run('UPDATE inventory SET quantity = ? WHERE id = ?', [newQuantity, itemId]);
                }
            }

            // Calculate profit: total selling price - total cost
            const profit = saleData.total - totalCost;

            // Create the sale with temporary invoice number
            const result = await tx.run('INSERT INTO sales (invoice_number, date, customer_id, customer_name, seller_id, seller_name, items, total, total_cost, total_discount, profit, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                ['TEMP', saleData.date, saleData.customer_id, saleData.customer_name, saleData.seller_id, saleData.seller_name, JSON.stringify(parsedItems), saleData.total, totalCost, totalDiscount, profit, saleData.payment_method, saleData.status]);

            // Generate invoice number based on the actual database ID
            const invoiceNumber = `TRN-${String(result.lastInsertRowid).padStart(5, '0')}`;

            // Update the invoice number
            await tx.run('UPDATE sales SET invoice_number = ? WHERE id = ?', [invoiceNumber, result.lastInsertRowid]);

            return {
                id: result.lastInsertRowid,
                invoiceNumber: invoiceNumber,
                totalCost: Number.parseFloat(totalCost.toFixed(2)),
                totalDiscount: Number.parseFloat(totalDiscount.toFixed(2)),
                profit: Number.parseFloat(profit.toFixed(2))
            };
        });

        // Execute the transaction
        const result = await transaction({ date, customer_id: customer_id, customer_name: customer_name, seller_id: seller_id, seller_name: seller_name, items, total, payment_method: payment_method, status });

        res.json(result);
    } catch (error) {
        console.error('Error creating sale:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create sale' });
    }
});

// Dashboard Profits Endpoint (Admin Only)
app.get('/api/dashboard/profits', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, sellerId } = req.query;

        // Build WHERE clause
        let whereConditions = ['status = ?'];
        let params = ['completed'];

        if (startDate && endDate) {
            whereConditions.push('date BETWEEN ? AND ?');
            params.push(startDate, endDate);
        }

        if (sellerId) {
            whereConditions.push('seller_id = ?');
            params.push(sellerId);
        }

        const whereClause = whereConditions.join(' AND ');

        // Use SQL aggregation for summary statistics - much faster than JavaScript loops
        //PostgreSQL stores unquoted column names as lowercase
        const summaryQuery = `
            SELECT
                COUNT(*) as "totalSales",
                COALESCE(SUM(total), 0) as "totalRevenue",
                COALESCE(SUM(total_cost), 0) as "totalCost",
                COALESCE(SUM(profit), 0) as "totalProfit",
                COALESCE(SUM(total_discount), 0) as "totalDiscount"
            FROM sales
            WHERE ${whereClause}
        `;

        const summary = await db.get(summaryQuery, params);

        // Calculate profit margin
        const profitMargin = summary.totalRevenue > 0 ? ((summary.totalProfit / summary.totalRevenue) * 100) : 0;
        const averageOrderValue = summary.totalSales > 0 ? (summary.totalRevenue / summary.totalSales) : 0;

        // For top selling items, we need to fetch and aggregate from sales
        // Limit to 1000 most recent sales for performance if no date filter
        let itemsQuery = `SELECT items FROM sales WHERE ${whereClause} ORDER BY date DESC`;
        let itemsParams = [...params];

        // If no date filter, limit to recent sales to avoid processing too much data
        if (!startDate && !endDate) {
            itemsQuery += ' LIMIT 1000';
        }

        const sales = await db.all(itemsQuery, itemsParams);

        // Aggregate items from sales
        const itemsMap = new Map();

        sales.forEach(sale => {
            const items = safeJSONParse(sale.items, []);
            items.forEach(item => {
                const itemId = item.id || item.itemId;
                const actualPrice = item.actualPrice || item.price;
                const costPrice = item.costPrice || 0;
                const revenue = actualPrice * item.quantity;
                const profit = (actualPrice - costPrice) * item.quantity;

                if (itemsMap.has(itemId)) {
                    const existing = itemsMap.get(itemId);
                    existing.quantitySold += item.quantity;
                    existing.revenue += revenue;
                    existing.profit += profit;
                } else {
                    itemsMap.set(itemId, {
                        id: itemId,
                        name: item.name,
                        sku: item.sku,
                        quantitySold: item.quantity,
                        revenue: revenue,
                        profit: profit
                    });
                }
            });
        });

        // Convert to array, sort by profit, and get top 10
        const topSellingItems = Array.from(itemsMap.values())
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10)
            .map(item => ({
                ...item,
                revenue: Number.parseFloat(item.revenue.toFixed(2)),
                profit: Number.parseFloat(item.profit.toFixed(2))
            }));

        res.json({
            summary: {
                totalSales: summary.totalSales,
                totalRevenue: Number.parseFloat(Number(summary.totalRevenue).toFixed(2)),
                totalCost: Number.parseFloat(Number(summary.totalCost).toFixed(2)),
                totalProfit: Number.parseFloat(Number(summary.totalProfit).toFixed(2)),
                totalDiscount: Number.parseFloat(Number(summary.totalDiscount).toFixed(2)),
                profitMargin: Number.parseFloat(profitMargin.toFixed(2)),
                averageOrderValue: Number.parseFloat(averageOrderValue.toFixed(2)),
                averageProfit: summary.totalSales > 0 ? Number.parseFloat((summary.totalProfit / summary.totalSales).toFixed(2)) : 0
            },
            topSellingItems,
            period: {
                startDate: startDate || 'All time',
                endDate: endDate || 'All time'
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard profits:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch profit data' });
    }
});

// Returns
app.get('/api/returns', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM returns', []);
        const total = totalCount.count;

        // Get paginated data
        const returns = await db.all('SELECT * FROM returns LIMIT ? OFFSET ?', [limit, offset]);
        const formatted = returns.map(ret => ({
            ...ret,
            items: safeJSONParse(ret.items, [])
        }));

        res.json(createPaginatedResponse(formatted, total, page, limit));
    } catch (error) {
        console.error('Error fetching returns:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch returns' });
    }
});

app.get('/api/returns/:id', requireAuth,  async (req, res) => {
    try {
        const ret = await db.get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
        if (ret) {
            ret.items = safeJSONParse(ret.items, []);
        }
        res.json(ret || null);
    } catch (error) {
        console.error('Error fetching return:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch return' });
    }
});

app.post('/api/returns', requireAuth, [
    body('invoice_number').trim().notEmpty().withMessage('Invoice number is required'),
    body('invoice_id').isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer'),
    body('date').isISO8601().withMessage('Date must be a valid date'),
    body('customer_name').trim().notEmpty().withMessage('Customer name is required'),
    body('customer_id').isInt({ min: 1 }).withMessage('Customer ID must be a positive integer'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
    body('items').isArray({ min: 1 }).withMessage('Items must be a non-empty array')
], validate, async (req, res) => {
    try {
        const { invoice_number, invoice_id, date, customer_name, customer_id, amount, reason, status, items } = req.body;

        // Check if a return already exists for this invoice
        const existingReturn = await db.get('SELECT * FROM returns WHERE invoice_number = ?', [invoice_number]);

        if (existingReturn) {
            return res.status(400).json({
                success: false,
                message: `A return already exists for invoice ${invoice_number}. Only one return is allowed per sale.`
            });
        }

        // Use transaction to create return and add items to returned_items table
        const transaction = db.transaction(async (tx, returnData) => {
            // Create the return record
            const returnResult = await tx.run(
                'INSERT INTO returns (invoice_number, invoice_id, date, customer_name, customer_id, amount, reason, status, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [returnData.invoice_number, returnData.invoice_id, returnData.date, returnData.customer_name, returnData.customer_id, Number.parseFloat(returnData.amount), returnData.reason, returnData.status, JSON.stringify(returnData.items)]
            );

            const returnId = returnResult.lastInsertRowid;

            // Add each item to the returned_items table
            for (const item of returnData.items) {
                await tx.run(
                    'INSERT INTO returned_items (return_id, sku, name, category, quantity, original_price, condition, return_date, customer_name, return_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [returnId, item.sku, item.name, item.category || '', item.quantity, Number.parseFloat(item.price || item.original_price || 0), 'returned', returnData.date, returnData.customer_name, returnData.reason]
                );
            }

            return { id: returnId };
        });

        const result = await transaction({ invoice_number, invoice_id, date, customer_name, customer_id, amount, reason, status, items });

        res.json({ ...result, success: true });
    } catch (error) {
        console.error('Error creating return:', error);
        res.status(500).json({ success: false, message: 'Failed to create return' });
    }
});

app.put('/api/returns/:id', requireAuth, [
    body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status')
], validate, async (req, res) => {
    try {
        const { status, approved_by, approved_date, rejected_by, rejected_date, rejection_reason } = req.body;
        const returnId = req.params.id;

        // Use transaction to update return status
        const transaction = db.transaction(async (tx, updateData) => {
            // Get the return record to access the items and sale info
            const returnRecord = await tx.get('SELECT * FROM returns WHERE id = ?', [updateData.returnId]);

            if (!returnRecord) {
                throw new Error('Return record not found');
            }

            // If status is being changed to approved, update returned_items and sale
            if (updateData.status === 'approved' && returnRecord.status !== 'approved') {
                // Update returned_items condition to 'approved'
                await tx.run('UPDATE returned_items SET condition = ? WHERE return_id = ?', ['approved', updateData.returnId]);

                // Get the original sale to update its status and financials
                // Use FOR UPDATE to prevent race conditions if multiple admins approve simultaneously
                const sale = await tx.get('SELECT * FROM sales WHERE invoice_number = ? FOR UPDATE', [returnRecord.invoice_number]);

                if (sale) {
                    // Parse returned items to calculate the actual cost of returned items
                    const returnedItems = JSON.parse(returnRecord.items);
                    const saleItems = JSON.parse(sale.items);

                    let returnedCost = 0;
                    for (const returnedItem of returnedItems) {
                        // Find the matching item in the original sale to get its cost
                        const originalItem = saleItems.find(si => si.sku === returnedItem.sku);
                        if (originalItem && originalItem.costPrice) {
                            returnedCost += Number.parseFloat(originalItem.costPrice) * returnedItem.quantity;
                        }
                    }

                    // Calculate the new totals after deducting the return
                    const newTotal = Number.parseFloat(sale.total || 0) - Number.parseFloat(returnRecord.amount || 0);
                    const newTotalCost = Number.parseFloat(sale.total_cost || 0) - returnedCost; // Use actual item costs
                    const newProfit = newTotal - newTotalCost;

                    // Update the sale with new financials and status indicating return
                    await tx.run(
                        'UPDATE sales SET total = ?, total_cost = ?, profit = ?, status = ? WHERE invoice_number = ?',
                        [newTotal, newTotalCost, newProfit, 'returned', returnRecord.invoice_number]
                    );

                    // Update customer lifetime_value to reflect the returned amount
                    if (sale.customer_id) {
                        await tx.run(
                            'UPDATE customers SET lifetime_value = lifetime_value - ? WHERE id = ?',
                            [Number.parseFloat(returnRecord.amount || 0), sale.customer_id]
                        );
                    }
                }
            }

            // If status is being changed to rejected, remove items from returned_items
            // Items remain as part of the original sale
            if (updateData.status === 'rejected' && returnRecord.status !== 'rejected') {
                // Delete returned items since return was rejected
                await tx.run('DELETE FROM returned_items WHERE return_id = ?', [updateData.returnId]);
            }

            // Update the return record
            await tx.run('UPDATE returns SET status = ?, approved_by = ?, approved_date = ?, rejected_by = ?, rejected_date = ?, rejection_reason = ? WHERE id = ?',
                [updateData.status, updateData.approved_by || null, updateData.approved_date || null, updateData.rejected_by || null, updateData.rejected_date || null, updateData.rejection_reason || null, updateData.returnId]);

            return { success: true };
        });

        const result = await transaction({ returnId, status, approved_by, approved_date, rejected_by, rejected_date, rejection_reason });

        res.json(result);
    } catch (error) {
        console.error('Error updating return:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to update return' });
    }
});

// Customers
app.get('/api/customers', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM customers', []);
        const total = totalCount.count;

        // Get paginated data
        const customers = await db.all('SELECT * FROM customers LIMIT ? OFFSET ?', [limit, offset]);

        res.json(createPaginatedResponse(customers, total, page, limit));
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch customers' });
    }
});

app.get('/api/customers/:id', requireAuth,  async (req, res) => {
    try {
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        res.json(customer || null);
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch customer' });
    }
});

app.post('/api/customers', requireAuth, [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('phone').optional().trim(),
    body('address').optional().trim(),
    body('total_purchases').optional().isInt({ min: 0 }).withMessage('Total purchases must be non-negative'),
    body('lifetime_value').optional().isFloat({ min: 0 }).withMessage('Lifetime value must be non-negative')
], validate, async (req, res) => {
    try {
        const { name, email, phone, address, total_purchases, lifetime_value, last_purchase } = req.body;
        const result = await db.run('INSERT INTO customers (name, email, phone, address, total_purchases, lifetime_value, last_purchase) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone || '', address || '', total_purchases || 0, lifetime_value || 0, last_purchase || null]);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error creating customer:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'Email already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to create customer' });
        }
    }
});

app.put('/api/customers/:id', requireAuth, [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('phone').optional().trim(),
    body('address').optional().trim(),
    body('total_purchases').optional().isInt({ min: 0 }).withMessage('Total purchases must be non-negative'),
    body('lifetime_value').optional().isFloat({ min: 0 }).withMessage('Lifetime value must be non-negative')
], validate, async (req, res) => {
    try {
        const { name, email, phone, address, total_purchases, lifetime_value, last_purchase } = req.body;
        await db.run('UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, total_purchases = ?, lifetime_value = ?, last_purchase = ? WHERE id = ?',
            [name, email, phone || '', address || '', total_purchases || 0, lifetime_value || 0, last_purchase || null, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating customer:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'Email already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update customer' });
        }
    }
});

app.delete('/api/customers/:id', requireAdmin,  async (req, res) => {
    try {
        await db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ success: false, message: 'Failed to delete customer' });
    }
});

// Suppliers
app.get('/api/suppliers', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM suppliers', []);
        const total = totalCount.count;

        // Get paginated data
        const suppliers = await db.all('SELECT * FROM suppliers LIMIT ? OFFSET ?', [limit, offset]);

        res.json(createPaginatedResponse(suppliers, total, page, limit));
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch suppliers' });
    }
});

app.get('/api/suppliers/:id', requireAuth,  async (req, res) => {
    try {
        const supplier = await db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        res.json(supplier || null);
    } catch (error) {
        console.error('Error fetching supplier:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch supplier' });
    }
});

app.post('/api/suppliers', requireAuth, [
    body('company').trim().notEmpty().withMessage('Company name is required'),
    body('contact').trim().notEmpty().withMessage('Contact name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('terms').trim().notEmpty().withMessage('Payment terms are required'),
    body('categories').trim().notEmpty().withMessage('Categories are required'),
    body('products').trim().notEmpty().withMessage('Products are required')
], validate, async (req, res) => {
    try {
        const { company, contact, email, phone, terms, categories, products } = req.body;
        const result = await db.run('INSERT INTO suppliers (company, contact, email, phone, terms, categories, products) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [company, contact, email, phone, terms, categories, products]);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error creating supplier:', error);
        res.status(500).json({ success: false, message: 'Failed to create supplier' });
    }
});

app.put('/api/suppliers/:id', requireAuth, [
    body('company').trim().notEmpty().withMessage('Company name is required'),
    body('contact').trim().notEmpty().withMessage('Contact name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('terms').trim().notEmpty().withMessage('Payment terms are required'),
    body('categories').trim().notEmpty().withMessage('Categories are required'),
    body('products').trim().notEmpty().withMessage('Products are required')
], validate, async (req, res) => {
    try {
        const { company, contact, email, phone, terms, categories, products } = req.body;
        await db.run('UPDATE suppliers SET company = ?, contact = ?, email = ?, phone = ?, terms = ?, categories = ?, products = ? WHERE id = ?',
            [company, contact, email, phone, terms, categories, products, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating supplier:', error);
        res.status(500).json({ success: false, message: 'Failed to update supplier' });
    }
});

app.delete('/api/suppliers/:id', requireAdmin,  async (req, res) => {
    try {
        await db.run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting supplier:', error);
        res.status(500).json({ success: false, message: 'Failed to delete supplier' });
    }
});

// Users Management
app.get('/api/users', requireAdmin, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM users', []);
        const total = totalCount.count;

        // Get paginated data
        const users = await db.all('SELECT id, username, name, email, mobile_number, role FROM users LIMIT ? OFFSET ?', [limit, offset]);

        res.json(createPaginatedResponse(users, total, page, limit));
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

app.get('/api/users/:id', requireAdmin,  async (req, res) => {
    try {
        const user = await db.get('SELECT id, username, name, email, mobile_number, role FROM users WHERE id = ?', [req.params.id]);
        res.json(user || null);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
});

app.post('/api/users', requireAdmin, [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('mobile_number').optional().trim().matches(/^\+256\d{9}$/).withMessage('Mobile number must be in format +256XXXXXXXXX (Uganda)'),
    body('role').isIn(['admin', 'user']).withMessage('Invalid role')
], validate, async (req, res) => {
    try {
        const { username, password, name, email, mobile_number, role } = req.body;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Create user with verified=true by default (no OTP required)
        const result = await db.run('INSERT INTO users (username, password, name, email, mobile_number, role, verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, name, email, mobile_number, role, true]);

        const userId = result.lastInsertRowid;

        res.json({
            id: userId,
            success: true,
            message: 'User created successfully'
        });
    } catch (error) {
        console.error('User creation error:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'Username already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Server error creating user' });
        }
    }
});

app.put('/api/users/:id', requireAdmin, [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('mobile_number').optional().trim().matches(/^\+256\d{9}$/).withMessage('Mobile number must be in format +256XXXXXXXXX (Uganda)'),
    body('role').isIn(['admin', 'user']).withMessage('Invalid role')
], validate, async (req, res) => {
    try {
        const { username, password, name, email, mobile_number, role } = req.body;
        if (password) {
            // Hash new password
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await db.run('UPDATE users SET username = ?, password = ?, name = ?, email = ?, mobile_number = ?, role = ? WHERE id = ?',
                [username, hashedPassword, name, email || '', mobile_number || '', role, req.params.id]);
        } else {
            await db.run('UPDATE users SET username = ?, name = ?, email = ?, mobile_number = ?, role = ? WHERE id = ?',
                [username, name, email || '', mobile_number || '', role, req.params.id]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('User update error:', error);
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            res.status(400).json({ success: false, message: 'Username already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Server error updating user' });
        }
    }
});

app.delete('/api/users/:id', requireAdmin,  async (req, res) => {
    try {
        // Prevent deleting yourself
        if (req.session.user && req.session.user.id === Number.parseInt(req.params.id, 10)) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        }
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});


// Returned Items Inventory endpoints
app.get('/api/returned-items', requireAuth, validatePaginationParams, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalCount = await db.get('SELECT COUNT(*) as count FROM returned_items', []);
        const total = totalCount.count;

        // Get paginated data
        const returnedItems = await db.all('SELECT * FROM returned_items ORDER BY return_date DESC LIMIT ? OFFSET ?', [limit, offset]);

        res.json(createPaginatedResponse(returnedItems, total, page, limit));
    } catch (error) {
        console.error('Error fetching returned items:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch returned items' });
    }
});

app.get('/api/returned-items/:id', requireAuth,  async (req, res) => {
    try {
        const item = await db.get('SELECT * FROM returned_items WHERE id = ?', [req.params.id]);
        res.json(item || null);
    } catch (error) {
        console.error('Error fetching returned item:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch returned item' });
    }
});

// Get returned items by return ID
app.get('/api/returns/:returnId/items', requireAuth, async (req, res) => {
    try {
        const returnId = req.params.returnId;
        const items = await db.all('SELECT * FROM returned_items WHERE return_id = ? ORDER BY id ASC', [returnId]);
        res.json({ success: true, items });
    } catch (error) {
        console.error('Error fetching returned items by return ID:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch returned items' });
    }
});

app.post('/api/returned-items', requireAuth, [
    body('return_id').isInt({ min: 1 }).withMessage('Return ID must be a positive integer'),
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').optional().trim(),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
    body('original_price').isFloat({ min: 0 }).withMessage('Original price must be non-negative'),
    body('condition').optional().isIn(['returned', 'damaged', 'defective', 'opened']).withMessage('Invalid condition'),
    body('return_date').isISO8601().withMessage('Return date must be a valid date'),
    body('customer_name').optional().trim(),
    body('return_reason').optional().trim()
], validate, async (req, res) => {
    try {
        const { return_id, sku, name, category, quantity, original_price, condition, return_date, customer_name, return_reason } = req.body;
        const result = await db.run('INSERT INTO returned_items (return_id, sku, name, category, quantity, original_price, condition, return_date, customer_name, return_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [return_id, sku, name, category || '', Number.parseInt(quantity, 10), Number.parseFloat(original_price), condition || 'returned', return_date, customer_name || '', return_reason || '']);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error creating returned item:', error);
        res.status(500).json({ success: false, message: 'Failed to create returned item' });
    }
});

app.put('/api/returned-items/:id', requireAuth, [
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').optional().trim(),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
    body('original_price').isFloat({ min: 0 }).withMessage('Original price must be non-negative'),
    body('condition').optional().isIn(['returned', 'damaged', 'defective', 'opened']).withMessage('Invalid condition'),
    body('return_date').isISO8601().withMessage('Return date must be a valid date'),
    body('customer_name').optional().trim(),
    body('return_reason').optional().trim()
], validate, async (req, res) => {
    try {
        const { sku, name, category, quantity, original_price, condition, return_date, customer_name, return_reason } = req.body;
        await db.run('UPDATE returned_items SET sku = ?, name = ?, category = ?, quantity = ?, original_price = ?, condition = ?, return_date = ?, customer_name = ?, return_reason = ? WHERE id = ?',
            [sku, name, category || '', Number.parseInt(quantity, 10), Number.parseFloat(original_price), condition || 'returned', return_date, customer_name || '', return_reason || '', req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating returned item:', error);
        res.status(500).json({ success: false, message: 'Failed to update returned item' });
    }
});

app.delete('/api/returned-items/:id', requireAdmin,  async (req, res) => {
    try {
        await db.run('DELETE FROM returned_items WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting returned item:', error);
        res.status(500).json({ success: false, message: 'Failed to delete returned item' });
    }
});

// ===== HEALTH CHECK ENDPOINTS =====

/**
 * Basic health check endpoint
 * Returns 200 OK if server is running
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

/**
 * Readiness check endpoint
 * Checks if server is ready to accept traffic (database connectivity)
 */
app.get('/ready', async (req, res) => {
    try {
        // Check database connectivity
        const dbHealthy = await db.ping();
        const healthStatus = db.getHealthStatus();

        if (!dbHealthy) {
            return res.status(503).json({
                status: 'not_ready',
                message: 'Database connection failed',
                timestamp: new Date().toISOString(),
                database: healthStatus
            });
        }

        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            database: {
                status: 'connected',
                ...healthStatus
            },
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Readiness check failed:', error);
        res.status(503).json({
            status: 'not_ready',
            message: 'Service unavailable',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Memory usage endpoint (Admin only)
 * Returns current memory usage statistics
 */
app.get('/api/health/memory', requireAdmin, (req, res) => {
    try {
        const usage = process.memoryUsage();

        res.json({
            timestamp: new Date().toISOString(),
            memory: {
                heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
                arrayBuffers: `${(usage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`
            },
            database: {
                poolTotal: db.pool.totalCount,
                poolIdle: db.pool.idleCount,
                poolWaiting: db.pool.waitingCount
            },
            uptime: `${(process.uptime() / 60).toFixed(2)} minutes`
        });
    } catch (error) {
        console.error('Memory check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve memory statistics'
        });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'An error occurred'
            : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Start server (only when not in test mode)
let server;
if (process.env.NODE_ENV !== 'test') {
    // Initialize database before starting server
    (async () => {
        try {
            await initPostgres();

            server = app.listen(PORT, () => {
                console.log(`
========================================
Server running in ${process.env.NODE_ENV || 'development'} mode
Port: ${PORT}
Database: PostgreSQL
========================================
                `);
            });
        } catch (error) {
            console.error('Failed to initialize database:', error);
            process.exit(1);
        }
    })();

    // Graceful shutdown
    const gracefulShutdown = async () => {
        console.log('\nReceived shutdown signal, closing server gracefully...');
        server.close(async () => {
            console.log('Server closed');
            await db.close();
            console.log('Database connection closed');
            process.exit(0);
        });

        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('FATAL: Uncaught Exception:', error);
        console.error('Stack:', error.stack);

        // Attempt graceful shutdown
        server.close(async () => {
            await db.close();
            process.exit(1); // PM2 will restart
        });

        // Force exit after 5 seconds if graceful shutdown fails
        setTimeout(() => {
            console.error('Forced exit after uncaught exception');
            process.exit(1);
        }, 5000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('FATAL: Unhandled Promise Rejection:', reason);
        console.error('Promise:', promise);
        // Don't exit - log and continue (rejection might not be fatal)
    });
}

// Export app for testing
module.exports = app;
