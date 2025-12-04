const request = require('supertest');
const bcrypt = require('bcrypt');
require('./setup');

let app;
let db;
let adminAgent;

beforeAll(async () => {
    const DatabaseWrapper = require('../database');
    db = new DatabaseWrapper({ type: 'postgres' });

    // Initialize test database
    await db.exec(`DROP TABLE IF EXISTS users CASCADE`);
    await db.exec(`DROP TABLE IF EXISTS inventory CASCADE`);
    await db.exec(`DROP TABLE IF EXISTS sales CASCADE`);
    await db.exec(`DROP TABLE IF EXISTS customers CASCADE`);

    await db.exec(`
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE inventory (
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
        CREATE TABLE customers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT NOT NULL,
            address TEXT,
            totalPurchases INTEGER DEFAULT 0,
            lifetimeValue DECIMAL(10, 2) DEFAULT 0,
            lastPurchase TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE sales (
            id SERIAL PRIMARY KEY,
            invoiceNumber TEXT UNIQUE NOT NULL,
            date TEXT NOT NULL,
            customerId INTEGER NOT NULL,
            customerName TEXT NOT NULL,
            sellerId INTEGER NOT NULL,
            sellerName TEXT NOT NULL,
            items TEXT NOT NULL,
            total DECIMAL(10, 2) NOT NULL,
            paymentMethod TEXT NOT NULL,
            status TEXT NOT NULL
        )
    `);

    // Create test users
    const adminHash = await bcrypt.hash('admin123', 10);
    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['admin', adminHash, 'admin', 'Admin User']);

    // Create test inventory
    const today = new Date().toISOString().split('T')[0];
    await db.run('INSERT INTO inventory (sku, name, category, quantity, price, reorder_level, supplier, last_restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['SALE001', 'Sale Item 1', 'Electronics', 100, 99.99, 5, 'Test Supplier', today]);

    // Create test customer
    await db.run('INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)',
        ['Test Customer', 'test@customer.com', '+1234567890', '123 Test St']);
});

beforeEach(() => {
    jest.resetModules();
    app = require('../server');
    adminAgent = request.agent(app);
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
});

describe('Sales API', () => {
    describe('GET /api/sales', () => {
        test('should get all sales when authenticated', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/sales');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/sales');

            expect(response.status).toBe(401);
        });

        test('should support pagination', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent
                .get('/api/sales?page=1&limit=10');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('POST /api/sales', () => {
        test('should create a new sale', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const newSale = {
                customerId: 1,
                customerName: 'Test Customer',
                items: [
                    {
                        id: 1,
                        sku: 'SALE001',
                        name: 'Sale Item 1',
                        quantity: 2,
                        price: 99.99
                    }
                ],
                paymentMethod: 'credit_card',
                total: 199.98
            };

            const response = await adminAgent
                .post('/api/sales')
                .send(newSale);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('invoiceNumber');
            expect(response.body.invoiceNumber).toMatch(/^INV-\d+$/);
        });

        test('should update inventory quantities after sale', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Get initial inventory
            const initialInventory = await adminAgent.get('/api/inventory/1');
            const initialQty = initialInventory.body.quantity;

            const newSale = {
                customerId: 1,
                customerName: 'Test Customer',
                items: [
                    {
                        id: 1,
                        sku: 'SALE001',
                        name: 'Sale Item 1',
                        quantity: 3,
                        price: 99.99
                    }
                ],
                paymentMethod: 'cash',
                total: 299.97
            };

            await adminAgent
                .post('/api/sales')
                .send(newSale);

            // Check updated inventory
            const updatedInventory = await adminAgent.get('/api/inventory/1');
            expect(updatedInventory.body.quantity).toBe(initialQty - 3);
        });

        test('should reject sale with insufficient inventory', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const invalidSale = {
                customerId: 1,
                customerName: 'Test Customer',
                items: [
                    {
                        id: 1,
                        sku: 'SALE001',
                        name: 'Sale Item 1',
                        quantity: 10000, // More than available
                        price: 99.99
                    }
                ],
                paymentMethod: 'cash',
                total: 999900.00
            };

            const response = await adminAgent
                .post('/api/sales')
                .send(invalidSale);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should validate required fields', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const invalidSale = {
                customerId: 1
                // Missing required fields
            };

            const response = await adminAgent
                .post('/api/sales')
                .send(invalidSale);

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/sales/:id', () => {
        test('should get specific sale', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Create a sale first
            const newSale = {
                customerId: 1,
                customerName: 'Test Customer',
                items: [
                    {
                        id: 1,
                        sku: 'SALE001',
                        name: 'Sale Item 1',
                        quantity: 1,
                        price: 99.99
                    }
                ],
                paymentMethod: 'cash',
                total: 99.99
            };

            const created = await adminAgent
                .post('/api/sales')
                .send(newSale);

            // Get the sale
            const sales = await adminAgent.get('/api/sales');
            const saleId = sales.body[0].id;

            const response = await adminAgent.get(`/api/sales/${saleId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', saleId);
            expect(response.body).toHaveProperty('invoiceNumber');
        });

        test('should return null for non-existent sale', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/sales/99999');

            expect(response.status).toBe(200);
            expect(response.body).toBeNull();
        });
    });

    describe('GET /api/sales/stats', () => {
        test('should get sales statistics', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/sales/stats');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalSales');
            expect(response.body).toHaveProperty('totalRevenue');
            expect(response.body).toHaveProperty('averageOrderValue');
        });
    });

    describe('GET /api/sales/seller/:sellerId', () => {
        test('should get sales by seller', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Admin user has id 1
            const response = await adminAgent.get('/api/sales/seller/1');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('PUT /api/sales/:id/status', () => {
        test('admin should be able to update sale status', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Create a sale
            const newSale = {
                customerId: 1,
                customerName: 'Test Customer',
                items: [
                    {
                        id: 1,
                        sku: 'SALE001',
                        name: 'Sale Item 1',
                        quantity: 1,
                        price: 99.99
                    }
                ],
                paymentMethod: 'cash',
                total: 99.99
            };

            await adminAgent.post('/api/sales').send(newSale);

            const sales = await adminAgent.get('/api/sales');
            const saleId = sales.body[0].id;

            const response = await adminAgent
                .put(`/api/sales/${saleId}/status`)
                .send({ status: 'cancelled' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });
});
