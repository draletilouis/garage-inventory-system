require('dotenv').config();
const { Client } = require('pg');

async function createTestDatabase() {
    // Connect to default 'postgres' database to create test database
    const client = new Client({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: 'postgres', // Connect to default database
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL...');

        // Check if test database exists
        const result = await client.query(
            "SELECT 1 FROM pg_database WHERE datname = 'inventory_test'"
        );

        if (result.rows.length === 0) {
            console.log('Creating test database...');
            await client.query('CREATE DATABASE inventory_test');
            console.log('✓ Test database created successfully!');
        } else {
            console.log('Test database already exists.');
        }

        await client.end();
    } catch (error) {
        console.error('Error:', error.message);
        await client.end();
        process.exit(1);
    }
}

createTestDatabase();
