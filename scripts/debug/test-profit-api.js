require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');

async function testProfitAPI() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        const today = new Date().toISOString().split('T')[0];

        let query = 'SELECT * FROM sales WHERE status = ?';
        let params = ['completed'];

        // Filter by today's date
        query += ' AND date BETWEEN ? AND ?';
        params.push(today, today);

        const sales = await db.all(query, params);

        console.log(`Found ${sales.length} completed sales for ${today}\n`);

        // Calculate totals (mimicking the API endpoint)
        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let totalDiscount = 0;

        sales.forEach(sale => {
            console.log(`Sale ${sale.invoicenumber}:`);
            console.log(`  Revenue: ${sale.total}`);
            console.log(`  Cost: ${sale.totalcost}`);
            console.log(`  Profit: ${sale.profit}`);

            totalRevenue += parseFloat(sale.total || 0);
            totalCost += parseFloat(sale.totalcost || 0);
            totalProfit += parseFloat(sale.profit || 0);
            totalDiscount += parseFloat(sale.totaldiscount || 0);
        });

        console.log(`\nTotals:`);
        console.log(`  Total Revenue: ${totalRevenue}`);
        console.log(`  Total Cost: ${totalCost}`);
        console.log(`  Total Profit: ${totalProfit}`);
        console.log(`  Total Discount: ${totalDiscount}`);

        // Calculate profit margin
        const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;
        console.log(`  Profit Margin: ${profitMargin.toFixed(2)}%`);

        // Get top selling items
        const allItems = [];
        sales.forEach(sale => {
            const items = JSON.parse(sale.items);
            items.forEach(item => {
                const existingItem = allItems.find(i => i.id === item.id || i.id === item.itemId);
                if (existingItem) {
                    existingItem.quantitySold += item.quantity;
                    existingItem.revenue += (item.actualPrice || item.price) * item.quantity;
                    existingItem.profit += ((item.actualPrice || item.price) - (item.costPrice || 0)) * item.quantity;
                } else {
                    allItems.push({
                        id: item.id || item.itemId,
                        name: item.name,
                        sku: item.sku,
                        quantitySold: item.quantity,
                        revenue: (item.actualPrice || item.price) * item.quantity,
                        profit: ((item.actualPrice || item.price) - (item.costPrice || 0)) * item.quantity
                    });
                }
            });
        });

        console.log(`\nTop Selling Items:`);
        allItems.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.name} (${item.sku})`);
            console.log(`     Qty Sold: ${item.quantitySold}`);
            console.log(`     Revenue: ${item.revenue}`);
            console.log(`     Profit: ${item.profit}`);
        });

        await db.close();

    } catch (error) {
        console.error('Error:', error);
        await db.close();
        process.exit(1);
    }
}

testProfitAPI();
