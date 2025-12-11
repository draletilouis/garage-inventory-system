/**
 * Clear Database Script (Non-Interactive Version)
 * Automatically clears all data and recreates production users
 *
 *  WARNING: This will DELETE ALL DATA from the database!
 * Use with extreme caution in production environments.
 *
 * Usage: node clear-database-auto.js
 */

require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');

async function clearDatabaseAuto() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║     DATABASE CLEAR AND REINITIALIZE (AUTOMATIC)         ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // Check connection
        const connected = await db.ping();
        if (!connected) {
            throw new Error('Failed to connect to PostgreSQL');
        }
        console.log('✅ Connected to PostgreSQL database\n');

        // Get current environment
        const environment = process.env.NODE_ENV || 'development';
        console.log(`📋 Current Environment: ${environment}\n`);

        console.log('⚠️  WARNING: Clearing database in 3 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('🗑️  Clearing database...\n');

        // Drop all tables in correct order (respecting foreign key constraints)
        const tables = [
            'returned_items',
            'sale_items',
            'sales',
            'customers',
            'inventory',
            'suppliers',
            'users',
            'session'
        ];

        for (const table of tables) {
            try {
                await db.run(`DROP TABLE IF EXISTS ${table} CASCADE`);
                console.log(`✅ Dropped table: ${table}`);
            } catch (error) {
                console.log(`⚠️  Warning: Could not drop table ${table}: ${error.message}`);
            }
        }

        console.log('\n✅ All tables dropped successfully\n');

        // Reinitialize database
        console.log('🔧 Reinitializing database schema...\n');

        // Users table
        await db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created table: users');

        // Suppliers table
        await db.run(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                contact_person VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(20),
                address TEXT,
                payment_terms TEXT,
                product_categories TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created table: suppliers');

        // Inventory table
        await db.run(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                sku VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50),
                quantity INTEGER NOT NULL DEFAULT 0,
                cost_price DECIMAL(10, 2) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                reorder_level INTEGER DEFAULT 10,
                supplier VARCHAR(100),
                last_restock DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created table: inventory');

        // Customers table
        await db.run(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(20),
                address TEXT,
                total_purchases INTEGER DEFAULT 0,
                lifetime_value DECIMAL(10, 2) DEFAULT 0,
                last_purchase DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created table: customers');

        // Sales table
        await db.run(`
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                date DATE NOT NULL,
                customer_id INTEGER DEFAULT 0,
                customer_name VARCHAR(100) NOT NULL DEFAULT 'Walk-in Customer',
                seller_id INTEGER NOT NULL,
                seller_name VARCHAR(100) NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                profit DECIMAL(10, 2) DEFAULT 0,
                payment_method VARCHAR(50),
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created table: sales');

        // Sale items table
        await db.run(`
            CREATE TABLE IF NOT EXISTS sale_items (
                id SERIAL PRIMARY KEY,
                sale_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                item_name VARCHAR(100) NOT NULL,
                sku VARCHAR(50) NOT NULL,
                quantity INTEGER NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                cost_price DECIMAL(10, 2) NOT NULL,
                subtotal DECIMAL(10, 2) NOT NULL,
                profit DECIMAL(10, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created table: sale_items');

        // Returned items table
        await db.run(`
            CREATE TABLE IF NOT EXISTS returned_items (
                id SERIAL PRIMARY KEY,
                sale_id INTEGER NOT NULL,
                sale_item_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                item_name VARCHAR(100) NOT NULL,
                sku VARCHAR(50) NOT NULL,
                quantity INTEGER NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                cost_price DECIMAL(10, 2) NOT NULL,
                subtotal DECIMAL(10, 2) NOT NULL,
                return_reason TEXT,
                return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                returned_by INTEGER,
                status VARCHAR(20) DEFAULT 'pending',
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE,
                FOREIGN KEY (returned_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        console.log('✅ Created table: returned_items');

        // Session table (for express-session)
        await db.run(`
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default",
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL,
                PRIMARY KEY (sid)
            )
        `);
        await db.run(`CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire)`);
        console.log('✅ Created table: session');

        // Create indexes for better performance
        console.log('\n🔧 Creating indexes...\n');

        await db.run('CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_returned_items_status ON returned_items(status)');

        console.log('✅ All indexes created\n');

        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              DATABASE CLEARED & REINITIALIZED             ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // Automatically create production users
        console.log('🔧 Creating production users...\n');

        await db.close(); // Close current connection
        const createProductionUsers = require('./create-production-users');
        await createProductionUsers(); // This will create its own connection

        console.log('\n✅ Database cleared and production users created successfully!\n');

    } catch (error) {
        console.error('\n❌ Error clearing database:', error);
        await db.close();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    clearDatabaseAuto();
}

module.exports = clearDatabaseAuto;
