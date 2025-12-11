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
    await db.exec(`DROP TABLE IF EXISTS customers CASCADE`);
    await db.exec(`DROP TABLE IF EXISTS suppliers CASCADE`);

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
        CREATE TABLE suppliers (
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

    // Create test users
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);

    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['admin', adminHash, 'admin', 'Admin User']);
    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['testuser', userHash, 'user', 'Test User']);

    // Create test customers
    await db.run('INSERT INTO customers (name, email, phone, address, totalPurchases, lifetimeValue) VALUES (?, ?, ?, ?, ?, ?)',
        ['Customer 1', 'customer1@test.com', '+1111111111', '111 Test St', 5, 500.00]);
    await db.run('INSERT INTO customers (name, email, phone, address, totalPurchases, lifetimeValue) VALUES (?, ?, ?, ?, ?, ?)',
        ['Customer 2', 'customer2@test.com', '+2222222222', '222 Test Ave', 3, 300.00]);

    // Create test suppliers
    await db.run('INSERT INTO suppliers (company, contact, email, phone, terms, categories, products) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['Supplier 1', 'John Doe', 'john@supplier1.com', '+3333333333', 'Net 30', 'Electronics', 'Electronics']);
    await db.run('INSERT INTO suppliers (company, contact, email, phone, terms, categories, products) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['Supplier 2', 'Jane Smith', 'jane@supplier2.com', '+4444444444', 'Net 60', 'Accessories', 'Accessories']);
});

beforeEach(() => {
    jest.resetModules();
    app = require('../server');
    adminAgent = request.agent(app);
    userAgent = request.agent(app);
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
});

describe('Customers API', () => {
    describe('GET /api/customers', () => {
        test('should get all customers when authenticated', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/customers');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('email');
        });

        test('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/customers');

            expect(response.status).toBe(401);
        });

        test('should support pagination', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent
                .get('/api/customers?page=1&limit=1');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeLessThanOrEqual(1);
        });
    });

    describe('GET /api/customers/:id', () => {
        test('should get specific customer', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const customers = await adminAgent.get('/api/customers');
            const customerId = customers.body[0].id;

            const response = await adminAgent.get(`/api/customers/${customerId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', customerId);
        });
    });

    describe('POST /api/customers', () => {
        test('admin should be able to add customer', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const newCustomer = {
                name: 'New Customer',
                email: 'newcustomer@test.com',
                phone: '+5555555555',
                address: '555 New St'
            };

            const response = await adminAgent
                .post('/api/customers')
                .send(newCustomer);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('id');
        });

        test('should reject duplicate email', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const duplicateCustomer = {
                name: 'Duplicate',
                email: 'customer1@test.com', // Already exists
                phone: '+6666666666',
                address: '666 Test St'
            };

            const response = await adminAgent
                .post('/api/customers')
                .send(duplicateCustomer);

            expect(response.status).toBe(400);
        });

        test('regular user should not be able to add customer', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const newCustomer = {
                name: 'User Customer',
                email: 'usercustomer@test.com',
                phone: '+7777777777',
                address: '777 Test St'
            };

            const response = await userAgent
                .post('/api/customers')
                .send(newCustomer);

            expect(response.status).toBe(403);
        });
    });

    describe('PUT /api/customers/:id', () => {
        test('admin should be able to update customer', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const customers = await adminAgent.get('/api/customers');
            const customerId = customers.body[0].id;

            const updates = {
                phone: '+9999999999'
            };

            const response = await adminAgent
                .put(`/api/customers/${customerId}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });

        test('regular user should not be able to update customer', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const response = await userAgent
                .put('/api/customers/1')
                .send({ phone: '+8888888888' });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/customers/:id', () => {
        test('admin should be able to delete customer', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Create customer to delete
            const newCustomer = await adminAgent
                .post('/api/customers')
                .send({
                    name: 'Delete Me',
                    email: 'deleteme@test.com',
                    phone: '+0000000000',
                    address: '000 Delete St'
                });

            const customerId = newCustomer.body.id;

            const response = await adminAgent
                .delete(`/api/customers/${customerId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });

        test('regular user should not be able to delete customer', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const response = await userAgent
                .delete('/api/customers/1');

            expect(response.status).toBe(403);
        });
    });
});

describe('Suppliers API', () => {
    describe('GET /api/suppliers', () => {
        test('should get all suppliers when authenticated', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const response = await adminAgent.get('/api/suppliers');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('company');
            expect(response.body[0]).toHaveProperty('contact');
        });

        test('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/suppliers');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/suppliers', () => {
        test('admin should be able to add supplier', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const newSupplier = {
                company: 'New Supplier Inc',
                contact: 'Bob Johnson',
                email: 'bob@newsupplier.com',
                phone: '+1111122222',
                terms: 'Net 30',
                categories: 'Hardware',
                products: 'Hardware Products'
            };

            const response = await adminAgent
                .post('/api/suppliers')
                .send(newSupplier);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('id');
        });

        test('regular user should not be able to add supplier', async () => {
            await userAgent
                .post('/api/login')
                .send({ username: 'testuser', password: 'user123' });

            const newSupplier = {
                company: 'User Supplier',
                contact: 'User Contact',
                email: 'user@supplier.com',
                phone: '+2222233333',
                terms: 'Net 60',
                categories: 'Test',
                products: 'Test Products'
            };

            const response = await userAgent
                .post('/api/suppliers')
                .send(newSupplier);

            expect(response.status).toBe(403);
        });
    });

    describe('PUT /api/suppliers/:id', () => {
        test('admin should be able to update supplier', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            const suppliers = await adminAgent.get('/api/suppliers');
            const supplierId = suppliers.body[0].id;

            const updates = {
                terms: 'Net 45'
            };

            const response = await adminAgent
                .put(`/api/suppliers/${supplierId}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });

    describe('DELETE /api/suppliers/:id', () => {
        test('admin should be able to delete supplier', async () => {
            await adminAgent
                .post('/api/login')
                .send({ username: 'admin', password: 'admin123' });

            // Create supplier to delete
            const newSupplier = await adminAgent
                .post('/api/suppliers')
                .send({
                    company: 'Delete Supplier',
                    contact: 'Delete Contact',
                    email: 'delete@supplier.com',
                    phone: '+3333344444',
                    terms: 'Net 30',
                    categories: 'Test',
                    products: 'Test'
                });

            const supplierId = newSupplier.body.id;

            const response = await adminAgent
                .delete(`/api/suppliers/${supplierId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });
});
