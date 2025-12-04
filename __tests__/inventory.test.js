const request = require('supertest');
const bcrypt = require('bcrypt');
require('./setup');

let app;
let db;
let adminAgent;
let userAgent;

beforeAll(async () => {
    const DatabaseWrapper = require('../database');
    db = new DatabaseWrapper({ type: 'postgres' });

    // Initialize test database
    await db.exec(`DROP TABLE IF EXISTS users CASCADE`);
    await db.exec(`DROP TABLE IF EXISTS inventory CASCADE`);

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

    // Create test users
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);

    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['admin', adminHash, 'admin', 'Admin User']);
    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['testuser', userHash, 'user', 'Test User']);

    // Create test inventory items
    const today = new Date().toISOString().split('T')[0];
    await db.run('INSERT INTO inventory (sku, name, category, quantity, price, reorder_level, supplier, last_restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['TEST001', 'Test Item 1', 'Electronics', 10, 99.99, 5, 'Test Supplier', today]);
    await db.run('INSERT INTO inventory (sku, name, category, quantity, price, reorder_level, supplier, last_restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['TEST002', 'Test Item 2', 'Accessories', 3, 29.99, 10, 'Test Supplier', today]);
});

beforeEach(() => {
    jest.resetModules();
    app = require('../server');

    // Create authenticated agents
    adminAgent = request.agent(app);
    userAgent = request.agent(app);
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
});

describe('Inventory API', () => {
    describe('GET /api/inventory', () => {
        test('should get all inventory items when authenticated', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/inventory');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('sku');
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('quantity');
        });

        test('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/inventory');

            expect(response.status).toBe(401);
        });

        test('should support pagination', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent
                .get('/api/inventory?page=1&limit=1');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeLessThanOrEqual(1);
        });
    });

    describe('GET /api/inventory/:id', () => {
        test('should get specific inventory item', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Get first item id
            const items = await adminAgent.get('/api/inventory');
            const itemId = items.body[0].id;

            const response = await adminAgent.get(`/api/inventory/${itemId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', itemId);
        });

        test('should return null for non-existent item', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/inventory/99999');

            expect(response.status).toBe(200);
            expect(response.body).toBeNull();
        });
    });

    describe('POST /api/inventory', () => {
        test('admin should be able to add inventory item', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const newItem = {
                sku: 'NEWTEST001',
                name: 'New Test Item',
                category: 'Electronics',
                quantity: 15,
                price: 149.99,
                reorderLevel: 5,
                supplier: 'Test Supplier'
            };

            const response = await adminAgent
                .post('/api/inventory')
                .send(newItem);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('id');
        });

        test('should reject duplicate SKU', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const duplicateItem = {
                sku: 'TEST001', // Already exists
                name: 'Duplicate Item',
                category: 'Electronics',
                quantity: 10,
                price: 99.99,
                reorderLevel: 5,
                supplier: 'Test Supplier'
            };

            const response = await adminAgent
                .post('/api/inventory')
                .send(duplicateItem);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });

        test('regular user should not be able to add inventory', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const newItem = {
                sku: 'USERTEST001',
                name: 'User Test Item',
                category: 'Electronics',
                quantity: 10,
                price: 99.99,
                reorderLevel: 5,
                supplier: 'Test Supplier'
            };

            const response = await userAgent
                .post('/api/inventory')
                .send(newItem);

            expect(response.status).toBe(403);
        });

        test('should validate required fields', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const invalidItem = {
                sku: 'INVALID001'
                // Missing required fields
            };

            const response = await adminAgent
                .post('/api/inventory')
                .send(invalidItem);

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/inventory/:id', () => {
        test('admin should be able to update inventory item', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const items = await adminAgent.get('/api/inventory');
            const itemId = items.body[0].id;

            const updates = {
                quantity: 25,
                price: 109.99
            };

            const response = await adminAgent
                .put(`/api/inventory/${itemId}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);

            // Verify update
            const updated = await adminAgent.get(`/api/inventory/${itemId}`);
            expect(updated.body.quantity).toBe(25);
        });

        test('regular user should not be able to update inventory', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const items = await adminAgent.get('/api/inventory');
            const itemId = items.body[0].id;

            const response = await userAgent
                .put(`/api/inventory/${itemId}`)
                .send({ quantity: 100 });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/inventory/:id', () => {
        test('admin should be able to delete inventory item', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Create item to delete
            const newItem = await adminAgent
                .post('/api/inventory')
                .send({
                    sku: 'DELETEME001',
                    name: 'Delete Me',
                    category: 'Test',
                    quantity: 1,
                    price: 1.00,
                    reorderLevel: 1,
                    supplier: 'Test'
                });

            const itemId = newItem.body.id;

            const response = await adminAgent
                .delete(`/api/inventory/${itemId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);

            // Verify deletion
            const check = await adminAgent.get(`/api/inventory/${itemId}`);
            expect(check.body).toBeNull();
        });

        test('regular user should not be able to delete inventory', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const response = await userAgent
                .delete('/api/inventory/1');

            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/inventory/low-stock', () => {
        test('should return items below reorder level', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/inventory/low-stock');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);

            // TEST002 has quantity 3 and reorderLevel 10, so it should be in low stock
            const lowStockItem = response.body.find(item => item.sku === 'TEST002');
            expect(lowStockItem).toBeDefined();
        });
    });
});
