const request = require('supertest');
require('./setup');

let app;

beforeEach(() => {
    jest.resetModules();
    app = require('../server');
});

describe('Health Check Endpoints', () => {
    describe('GET /health', () => {
        test('should return 200 and health status', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('environment');
        });

        test('should return timestamp in ISO format', async () => {
            const response = await request(app).get('/health');

            expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        test('should return uptime as a number', async () => {
            const response = await request(app).get('/health');

            expect(typeof response.body.uptime).toBe('number');
            expect(response.body.uptime).toBeGreaterThanOrEqual(0);
        });

        test('should not require authentication', async () => {
            const response = await request(app).get('/health');

            // Should succeed without session/auth
            expect(response.status).toBe(200);
        });
    });

    describe('GET /ready', () => {
        test('should check database connectivity', async () => {
            const response = await request(app).get('/ready');

            // Will be 503 if database is not connected, 200 if connected
            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('should return timestamp in ISO format', async () => {
            const response = await request(app).get('/ready');

            expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        test('should indicate database status when ready', async () => {
            const response = await request(app).get('/ready');

            if (response.status === 200) {
                expect(response.body).toHaveProperty('status', 'ready');
                expect(response.body).toHaveProperty('database', 'connected');
                expect(response.body).toHaveProperty('uptime');
            }
        });

        test('should return 503 when database is not available', async () => {
            const response = await request(app).get('/ready');

            if (response.status === 503) {
                expect(response.body.status).toMatch(/not_ready/);
                expect(response.body).toHaveProperty('message');
            }
        });

        test('should not require authentication', async () => {
            const response = await request(app).get('/ready');

            // Should return response without auth (not 401)
            expect(response.status).not.toBe(401);
        });
    });

    describe('Health Check Integration', () => {
        test('both endpoints should be accessible', async () => {
            const healthResponse = await request(app).get('/health');
            const readyResponse = await request(app).get('/ready');

            expect(healthResponse.status).toBe(200);
            expect([200, 503]).toContain(readyResponse.status);
        });

        test('health endpoint should always return 200', async () => {
            // Make multiple requests to ensure consistency
            const responses = await Promise.all([
                request(app).get('/health'),
                request(app).get('/health'),
                request(app).get('/health')
            ]);

            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.status).toBe('healthy');
            });
        });
    });
});
