require('dotenv').config();
const DatabaseWrapper = require('./database');

async function checkSale() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Checking sale ID 1...\n');

        const sale = await db.get('SELECT * FROM sales WHERE id = ?', [1]);

        if (sale) {
            console.log('Sale found:');
            console.log(JSON.stringify(sale, null, 2));
        } else {
            console.log('Sale not found!');
        }

        await db.close();
    } catch (error) {
        console.error('Error:', error);
        await db.close();
        process.exit(1);
    }
}

checkSale();
