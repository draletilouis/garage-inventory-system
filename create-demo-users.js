require('dotenv').config();
const DatabaseWrapper = require('./database');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

async function createDemoUsers() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Creating demo users...');

        // Check connection
        const connected = await db.ping();
        if (!connected) {
            throw new Error('Failed to connect to PostgreSQL');
        }

        // Delete existing demo users if they exist
        await db.run('DELETE FROM users WHERE username IN (?, ?)', ['admin', 'user']);
        console.log('Cleared existing demo users');

        // Create demo users
        const adminHash = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
        const userHash = await bcrypt.hash('user123', BCRYPT_ROUNDS);

        await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
            ['admin', adminHash, 'admin', 'Admin User']);
        console.log('Created admin user: admin / admin123');

        await db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
            ['user', userHash, 'user', 'Regular User']);
        console.log('Created regular user: user / user123');

        console.log('Demo users created successfully!');
        await db.close();

    } catch (error) {
        console.error('Error creating demo users:', error);
        await db.close();
        process.exit(1);
    }
}

createDemoUsers();
