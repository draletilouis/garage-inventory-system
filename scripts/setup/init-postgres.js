require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

/**
 * Initialize PostgreSQL database with tables and default data
 */
async function initPostgres() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Initializing PostgreSQL database...');

        // Check connection
        const connected = await db.ping();
        if (!connected) {
            throw new Error('Failed to connect to PostgreSQL');
        }

        // Create tables
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                sku TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
                price DECIMAL(10, 2) NOT NULL,
                reorder_level INTEGER NOT NULL,
                supplier TEXT NOT NULL,
                last_restock TEXT NOT NULL
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                invoice_number TEXT UNIQUE NOT NULL,
                date TEXT NOT NULL,
                customer_id INTEGER NOT NULL,
                customer_name TEXT NOT NULL,
                seller_id INTEGER NOT NULL,
                seller_name TEXT NOT NULL,
                items TEXT NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                total_cost DECIMAL(10, 2) DEFAULT 0,
                total_discount DECIMAL(10, 2) DEFAULT 0,
                profit DECIMAL(10, 2) DEFAULT 0,
                payment_method TEXT NOT NULL,
                status TEXT NOT NULL
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS returns (
                id SERIAL PRIMARY KEY,
                invoice_number TEXT NOT NULL,
                invoice_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                customer_id INTEGER NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL,
                items TEXT NOT NULL,
                approved_by TEXT,
                approved_date TEXT,
                rejected_by TEXT,
                rejected_date TEXT,
                rejection_reason TEXT
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT NOT NULL,
                address TEXT,
                total_purchases INTEGER DEFAULT 0,
                lifetime_value DECIMAL(10, 2) DEFAULT 0,
                last_purchase TEXT
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                company TEXT NOT NULL,
                contact TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                terms TEXT NOT NULL,
                categories TEXT NOT NULL,
                products TEXT NOT NULL
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS returned_items (
                id SERIAL PRIMARY KEY,
                return_id INTEGER NOT NULL,
                sku TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT,
                quantity INTEGER NOT NULL,
                original_price DECIMAL(10, 2) NOT NULL,
                condition TEXT DEFAULT 'returned',
                return_date TEXT NOT NULL,
                customer_name TEXT,
                return_reason TEXT,
                FOREIGN KEY (return_id) REFERENCES returns(id)
            )
        `);

        console.log('Tables created successfully');

        // Create indexes for better query performance
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_seller_id ON sales(seller_id)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_status_date ON sales(status, date)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_invoice_number ON returns(invoice_number)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_returned_items_return_id ON returned_items(return_id)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_returned_items_condition ON returned_items(condition)`);

        console.log('Indexes created successfully');

        // Check if demo admin user exists
        const adminUser = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);

        if (!adminUser) {
            console.log('Creating demo users...');

            // Create demo users
            const adminHash = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
            const userHash = await bcrypt.hash('user123', BCRYPT_ROUNDS);

            await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
                ['admin', adminHash, 'admin', 'Admin User']);
            await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
                ['user', userHash, 'user', 'Regular User']);

            console.log('Demo users created: admin/admin123 and user/user123');
        } else {
            console.log('Demo users already exist');
        }

        // Check if default data exists
        const supplierCount = await db.get('SELECT COUNT(*) as count FROM suppliers');
        const customerCount = await db.get('SELECT COUNT(*) as count FROM customers');

        if (supplierCount.count === 0) {
            console.log('Creating default suppliers and customers...');

            // Create default suppliers
            await db.run('INSERT INTO suppliers (company, contact, email, phone, terms, categories, products) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['TechParts Inc', 'John Doe', 'john@techparts.com', '+1234567890', 'Net 30', 'Electronics, Computer Hardware', 'Electronics, Computer Parts']);
            await db.run('INSERT INTO suppliers (company, contact, email, phone, terms, categories, products) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Global Supplies Co', 'Jane Smith', 'jane@globalsupplies.com', '+1234567891', 'Net 60', 'Office Supplies, Hardware', 'Office Supplies, Hardware']);

            // Create default customers
            await db.run('INSERT INTO customers (name, email, phone, address, total_purchases, lifetime_value, last_purchase) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Alice Johnson', 'alice@email.com', '+1234567892', '123 Main St, City', 0, 0, null]);
            await db.run('INSERT INTO customers (name, email, phone, address, total_purchases, lifetime_value, last_purchase) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Bob Williams', 'bob@email.com', '+1234567893', '456 Oak Ave, City', 0, 0, null]);

            console.log('Default suppliers and customers created');
        }

        console.log('PostgreSQL database initialized successfully!');
        await db.close();

    } catch (error) {
        console.error('Error initializing PostgreSQL:', error);
        await db.close();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    initPostgres();
}

module.exports = initPostgres;
