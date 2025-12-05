const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
require('./setup');

// We need to create a test app instance
let app;
let db;
let server;

beforeAll(async () => {
    // Import server components
    const DatabaseWrapper = require('../database');
    db = new DatabaseWrapper({ type: 'postgres' });

    // Initialize test database
    await db.exec(`DROP TABLE IF EXISTS users CASCADE`);
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

    // Create test users
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);

    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['admin', adminHash, 'admin', 'Admin User']);
    await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        ['testuser', userHash, 'user', 'Test User']);
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

describe('Authentication API', () => {
    beforeEach(() => {
        // Import fresh app for each test
        jest.resetModules();
        app = require('../server');
    });

    describe('POST /api/login', () => {
        test('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'admin123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('username', 'admin');
            expect(response.body.user).toHaveProperty('role', 'admin');
            expect(response.body.user).not.toHaveProperty('password');
            expect(response.headers['set-cookie']).toBeDefined();
        });

        test('should reject invalid username', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({
                    username: 'nonexistent',
                    password: 'admin123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        test('should reject invalid password', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        test('should reject missing credentials', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({});

            expect(response.status).toBe(400);
        });

        test('should login regular user', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({
                    username: 'testuser',
                    password: 'user123'
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('role', 'user');
        });
    });

    describe('POST /api/logout', () => {
        test('should logout authenticated user', async () => {
            const agent = request.agent(app);

            // Login first
            await agent
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'admin123'
                });

            // Then logout
            const response = await agent
                .post('/api/logout');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });

        test('should handle logout without session', async () => {
            const response = await request(app)
                .post('/api/logout');

            // Should still succeed even without session
            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/check-auth', () => {
        test('should return user info when authenticated', async () => {
            const agent = request.agent(app);

            // Login first
            await agent
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'admin123'
                });

            // Check auth
            const response = await agent
                .get('/api/check-auth');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('authenticated', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('username', 'admin');
        });

        test('should return unauthenticated when not logged in', async () => {
            const response = await request(app)
                .get('/api/check-auth');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('authenticated', false);
        });
    });

    describe('Authentication Middleware', () => {
        test('should allow authenticated user to access protected route', async () => {
            const agent = request.agent(app);

            // Login first
            await agent
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'admin123'
                });

            // Try to access protected route (e.g., inventory)
            const response = await agent
                .get('/api/inventory');

            expect(response.status).not.toBe(401);
        });

        test('should reject unauthenticated user from protected route', async () => {
            const response = await request(app)
                .get('/api/inventory');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Authentication required');
        });
    });

    describe('Authorization Middleware', () => {
        test('should allow admin to access admin-only route', async () => {
            const agent = request.agent(app);

            // Login as admin
            await agent
                .post('/api/login')
                .send({
                    username: 'admin',
                    password: 'admin123'
                });

            // Try to access admin route (e.g., create user)
            const response = await agent
                .get('/api/users');

            expect(response.status).not.toBe(403);
        });

        test('should reject non-admin from admin-only route', async () => {
            const agent = request.agent(app);

            // Login as regular user
            await agent
                .post('/api/login')
                .send({
                    username: 'testuser',
                    password: 'user123'
                });

            // Try to access admin route
            const response = await agent
                .get('/api/users');

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('message', 'Admin access required');
        });
    });
});
