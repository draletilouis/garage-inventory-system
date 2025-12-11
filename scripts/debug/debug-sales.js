require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');

async function debugSales() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Checking sales data...\n');

        // Get all sales
        const sales = await db.all('SELECT * FROM sales');
        console.log(`Found ${sales.length} sales\n`);

        sales.forEach((sale, index) => {
            console.log(`Sale ${index + 1}:`);
            console.log(`  Invoice: ${sale.invoice_number}`);
            console.log(`  Date: ${sale.date}`);
            console.log(`  Total: ${sale.total}`);
            console.log(`  Total Cost: ${sale.total_cost}`);
            console.log(`  Profit: ${sale.profit}`);
            console.log(`  Discount: ${sale.total_discount}`);
            console.log(`  Status: ${sale.status}`);
            console.log('');
        });

        // Check inventory items
        const inventory = await db.all('SELECT id, name, sku, cost_price, price FROM inventory');
        console.log(`\nInventory items (${inventory.length}):`);
        inventory.forEach(item => {
            console.log(`  ${item.name} (${item.sku})`);
            console.log(`    Cost Price: ${item.cost_price}`);
            console.log(`    Selling Price: ${item.price}`);
            console.log('');
        });

        await db.close();

    } catch (error) {
        console.error('Error:', error);
        await db.close();
        process.exit(1);
    }
}

debugSales();
