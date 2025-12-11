require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');

async function checkSaleItems() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        const sales = await db.all('SELECT * FROM sales');

        sales.forEach((sale, index) => {
            console.log(`\nSale ${index + 1}: ${sale.invoicenumber}`);
            console.log(`Total: ${sale.total}`);
            console.log(`Total Cost: ${sale.totalcost}`);
            console.log(`Profit: ${sale.profit}`);

            const items = JSON.parse(sale.items);
            console.log('\nItems:');
            items.forEach(item => {
                console.log(`  - ${item.name}`);
                console.log(`    Quantity: ${item.quantity}`);
                console.log(`    Price: ${item.price}`);
                console.log(`    Actual Price: ${item.actualPrice}`);
                console.log(`    Cost Price: ${item.costPrice}`);
                console.log(`    Item Profit: ${(item.actualPrice || item.price) - (item.costPrice || 0)} each`);
            });
        });

        await db.close();

    } catch (error) {
        console.error('Error:', error);
        await db.close();
        process.exit(1);
    }
}

checkSaleItems();
