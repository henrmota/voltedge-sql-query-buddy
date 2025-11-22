import { faker } from "@faker-js/faker";
import type mysql from 'mysql2/promise';
import { getMysqlConnectionPool } from "../lib/mysql";

faker.seed(12345)

// ------------------------
// Helper: Generate random date in last 2 years
// ------------------------
function getRandomDateInLast2Years(): string {
  const now = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(now.getFullYear() - 2);
  
  const randomTime = twoYearsAgo.getTime() + Math.random() * (now.getTime() - twoYearsAgo.getTime());
  return new Date(randomTime).toISOString().split("T")[0];
}

// ------------------------
// Helper: Generate date within a specific range
// ------------------------
function getRandomDateBetween(start: Date, end: Date): string {
  const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(randomTime).toISOString().split("T")[0];
}

// ------------------------
// Type definitions
// ------------------------
type ProductRow = {
  product_id: number;
  price: number;
};

type CustomerRow = {
  customer_id: number;
  signup_date: string;
};

type ProductView = {
  customer_id: number;
  product_id: number;
};

type CartItem = {
  product_id: number;
  quantity: number;
  price: number;
};

type CartData = {
  customer_id: number;
  status: string;
  signup_date: Date;
  items: CartItem[];
};

type CouponRow = {
  coupon_id: number;
  discount: number;
};

type OrderRow = {
  order_id: number;
  total_amount: number;
};

type InsertRow = Record<string, unknown>;

// ------------------------
// Helper: bulk insert with null handling and chunking
// ------------------------
async function bulkInsert(pool: mysql.Pool, table: string, columns: string[], rows: InsertRow[]) {
  if (rows.length === 0) return;

  // MySQL has a limit on placeholders (~65535)
  // Calculate safe chunk size based on number of columns
  const maxPlaceholders = 50000; // Safe limit below MySQL's 65535
  const chunkSize = Math.floor(maxPlaceholders / columns.length);

  let firstInsertId: number | undefined;
  const totalChunks = Math.ceil(rows.length / chunkSize);

  // Insert in chunks
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    const flat = chunk.flatMap(row => columns.map(col => row[col] !== undefined ? row[col] : null));

    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`;
    const [result] = await pool.execute(sql, flat) as [mysql.ResultSetHeader, mysql.FieldPacket[]];

    // Log progress for large inserts
    if (totalChunks > 1) {
      console.log(`  ${table}: Inserted chunk ${chunkNumber}/${totalChunks} (${chunk.length} rows)`);
    }

    // Capture first insertId
    if (i === 0 && result.insertId) {
      firstInsertId = result.insertId;
    }
  }

  // Only return insertId if exactly one row inserted
  if (rows.length === 1) return firstInsertId;
}

// ------------------------
// Seeder
// ------------------------
export async function seedDatabase(options: {
  userCount: number;
  productCount: number;
  couponCount: number;
  funnelViewRate: number;
  funnelAddToCartRate: number;
  funnelCheckoutRate: number;
  anomalyCouponCount: number;
}) {
  const pool = getMysqlConnectionPool();

  console.log('\n========================================');
  console.log('Starting Database Seeding');
  console.log('========================================');
  console.log('Configuration:');
  console.log(`  - Users: ${options.userCount}`);
  console.log(`  - Products: ${options.productCount}`);
  console.log(`  - Coupons: ${options.couponCount}`);
  console.log(`  - Anomaly Coupons: ${options.anomalyCouponCount}`);
  console.log(`  - View Rate: ${(options.funnelViewRate * 100).toFixed(1)}%`);
  console.log(`  - Add to Cart Rate: ${(options.funnelAddToCartRate * 100).toFixed(1)}%`);
  console.log(`  - Checkout Rate: ${(options.funnelCheckoutRate * 100).toFixed(1)}%`);
  console.log(`  - Date Range: Last 2 years\n`);

  const startTime = Date.now();

  // ------------------------
  // 1. Products
  // ------------------------
  console.log('Creating products...');
  const categories = ["Audio", "Peripherals", "Computing", "Photography", "Mobile", "Gaming"];
  const products = Array.from({ length: options.productCount }, () => ({
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    category: faker.helpers.arrayElement(categories),
    price: parseFloat(faker.commerce.price({ min: 10, max: 500 })),
  }));
  await bulkInsert(pool, "products", ["name", "description", "category", "price"], products);

  const [productList] = await pool.query(
    `SELECT product_id, price FROM products ORDER BY product_id DESC LIMIT ?`,
    [options?.productCount ?? -1]
  ) as [ProductRow[], mysql.FieldPacket[]];

  // ------------------------
  // 2. Customers
  // ------------------------
  console.log('Creating customers...');
  const customers = Array.from({ length: options.userCount }, (_, i) => ({
    name: faker.person.fullName(),
    email: `user${i}_${Date.now()}@example.com`,
    region: faker.location.state(),
    signup_date: getRandomDateInLast2Years(),
  }));
  await bulkInsert(pool, "customers", ["name", "email", "region", "signup_date"], customers);

  const [customerList] = await pool.query(
    "SELECT customer_id, signup_date FROM customers ORDER BY customer_id DESC LIMIT ?",
    [options.userCount]
  ) as [CustomerRow[], mysql.FieldPacket[]];

  // ------------------------
  // 3. Funnel: views, carts, orders (Process in batches to avoid memory issues)
  // ------------------------
  console.log('Processing customer funnel (views, carts, orders)...');
  
  const CUSTOMER_BATCH_SIZE = 1000; // Process 1000 customers at a time
  let totalOrdersCreated = 0;
  let totalViewsCreated = 0;
  let totalCartsCreated = 0;
  
  const totalBatches = Math.ceil(customerList.length / CUSTOMER_BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < customerList.length; batchIndex += CUSTOMER_BATCH_SIZE) {
    const currentBatch = Math.floor(batchIndex / CUSTOMER_BATCH_SIZE) + 1;
    const customerBatch = customerList.slice(batchIndex, batchIndex + CUSTOMER_BATCH_SIZE);
    
    console.log(`  Processing customer batch ${currentBatch}/${totalBatches} (${customerBatch.length} customers)...`);
    
    // Batch-level arrays (cleared after each batch)
    const productViews: ProductView[] = [];
    const cartsToInsert: CartData[] = [];
    
    // Prepare funnel data for this batch of customers
    for (const customer of customerBatch) {
      const customerId = customer.customer_id;
      const signupDate = new Date(customer.signup_date);

      // views
      const viewedProducts = productList.filter(() => Math.random() < options.funnelViewRate);
      viewedProducts.forEach((p) => productViews.push({ customer_id: customerId, product_id: p.product_id }));

      // carts
      const toCart = viewedProducts.filter(() => Math.random() < options.funnelAddToCartRate);
      if (toCart.length > 0) {
        cartsToInsert.push({ 
          customer_id: customerId, 
          status: "active", 
          signup_date: signupDate,
          items: toCart.map((p) => ({ product_id: p.product_id, quantity: 1, price: p.price }))
        });
      }
    }

    // Insert product views for this batch
    if (productViews.length > 0) {
      await bulkInsert(pool, "product_views", ["customer_id", "product_id"], productViews);
      totalViewsCreated += productViews.length;
    }
    
    // Insert carts and orders for this batch
    for (const cartData of cartsToInsert) {
      const cartId = await bulkInsert(pool, "carts", ["customer_id", "status"], [{ customer_id: cartData.customer_id, status: cartData.status }]);

      // Insert cart items
      const cartItemsToInsert = cartData.items.map((i) => ({ cart_id: cartId, product_id: i.product_id, quantity: i.quantity }));
      await bulkInsert(pool, "cart_items", ["cart_id", "product_id", "quantity"], cartItemsToInsert);
      totalCartsCreated++;

      // Decide if checkout
      if (Math.random() < options.funnelCheckoutRate && cartData.items.length > 0) {
        const totalAmount = cartData.items.reduce((sum: number, i) => sum + parseFloat(String(i.price)), 0);
        
        // Generate order date after customer signup
        const orderDate = getRandomDateBetween(cartData.signup_date, new Date());
        
        // We'll update with coupon_id later if needed
        const orderId = await bulkInsert(pool, "orders", ["customer_id", "order_date", "total_amount", "coupon_id"], [{
          customer_id: cartData.customer_id,
          order_date: orderDate,
          total_amount: totalAmount, // Will adjust if coupon applied
          coupon_id: null,
        }]);

        const orderItemsToInsert = cartData.items.map((i) => ({
          order_id: orderId,
          product_id: i.product_id,
          quantity: i.quantity,
          subtotal: i.price,
        }));
        await bulkInsert(pool, "order_items", ["order_id", "product_id", "quantity", "subtotal"], orderItemsToInsert);
        
        totalOrdersCreated++;
      }
    }
    
    // Clear batch arrays to free memory
    productViews.length = 0;
    cartsToInsert.length = 0;
    
    // Hint to garbage collector (helps with large datasets)
    if (global.gc) {
      global.gc();
    }
  }
  
  console.log(`  Total created: ${totalViewsCreated} views, ${totalCartsCreated} carts, ${totalOrdersCreated} orders`);

  // ------------------------
  // 4. Apply coupons to some existing orders (post-process)
  // ------------------------
  console.log('Creating and applying normal coupons to orders...');
  const coupons: InsertRow[] = Array.from({ length: options.couponCount }, () => ({
    code: faker.string.alphanumeric({ length: 8 }).toUpperCase() + faker.string.numeric(4),
    discount: parseFloat(faker.number.float({ min: 5, max: 25, fractionDigits: 2 }).toFixed(2)),
    expiration_date: faker.date.future({ years: 1 }).toISOString().split("T")[0],
    is_active: true,
    customer_id: null,
  }));
  await bulkInsert(pool, "coupons", ["code", "discount", "expiration_date", "is_active", "customer_id"], coupons);

  // Get created coupon IDs
  const [normalCouponsList] = await pool.query(
    "SELECT coupon_id, discount FROM coupons WHERE discount > 0 ORDER BY coupon_id DESC LIMIT ?",
    [options.couponCount]
  ) as [CouponRow[], mysql.FieldPacket[]];
  
  // Apply coupons to 30% of orders (batch update for performance)
  if (totalOrdersCreated > 0 && normalCouponsList.length > 0) {
    const ordersToUpdate = Math.floor(totalOrdersCreated * 0.3);
    console.log(`  Applying coupons to ${ordersToUpdate} orders...`);
    
    const [recentOrders] = await pool.query(
      "SELECT order_id, customer_id, total_amount, order_date FROM orders WHERE coupon_id IS NULL ORDER BY order_id DESC LIMIT ?",
      [ordersToUpdate]
    ) as [(OrderRow & { customer_id: number; order_date: string })[], mysql.FieldPacket[]];
    
    // Batch update in chunks for better performance
    const UPDATE_BATCH_SIZE = 100;
    const redemptionRecords: InsertRow[] = [];
    
    for (let i = 0; i < recentOrders.length; i += UPDATE_BATCH_SIZE) {
      const batch = recentOrders.slice(i, i + UPDATE_BATCH_SIZE);
      
      await Promise.all(batch.map(async (order, index: number) => {
        const coupon = normalCouponsList[(i + index) % normalCouponsList.length];
        const newTotal = Math.max(0, order.total_amount - coupon.discount);
        
        // Record redemption
        redemptionRecords.push({
          coupon_id: coupon.coupon_id,
          customer_id: order.customer_id,
          redeemed_at: order.order_date,
        });
        
        return pool.execute(
          "UPDATE orders SET coupon_id = ?, total_amount = ? WHERE order_id = ?",
          [coupon.coupon_id, newTotal, order.order_id]
        );
      }));
    }
    
    // Insert coupon redemptions in bulk
    if (redemptionRecords.length > 0) {
      await bulkInsert(pool, "coupon_redemptions", ["coupon_id", "customer_id", "redeemed_at"], redemptionRecords);
    }
  }

  // ------------------------
  // 5. Anomaly coupons (negative discount) with applied orders
  // ------------------------
  console.log(`Creating ${options.anomalyCouponCount} anomaly orders with negative coupons...`);
  
  for (let i = 0; i < options.anomalyCouponCount; i++) {
    // Customer with signup date in last 2 years
    const signupDate = getRandomDateInLast2Years();
    const anomalyCustomer = {
      name: faker.person.fullName(),
      email: `anomaly${i}_${Date.now()}@example.com`,
      region: faker.location.state(),
      signup_date: signupDate,
    };
    const customerId = await bulkInsert(pool, "customers", ["name", "email", "region", "signup_date"], [anomalyCustomer]);

    // Product
    const anomalyProduct = {
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      category: "Exploit",
      price: 100,
    };
    const productId = await bulkInsert(pool, "products", ["name", "description", "category", "price"], [anomalyProduct]);

    // Negative Coupon
    const anomalyCoupon = {
      code: `NEG${faker.string.numeric(5)}`,
      discount: -50, // Negative discount (adds to total instead of subtracting)
      expiration_date: faker.date.future({ years: 1 }).toISOString().split("T")[0],
      is_active: true,
      customer_id: customerId,
    };
    const negativeCouponId = await bulkInsert(pool, "coupons", ["code", "discount", "expiration_date", "is_active", "customer_id"], [anomalyCoupon]);

    // Cart & Items
    const cartId = await bulkInsert(pool, "carts", ["customer_id", "status"], [{ customer_id: customerId, status: "active" }]);
    await bulkInsert(pool, "cart_items", ["cart_id", "product_id", "quantity"], [{ cart_id: cartId, product_id: productId, quantity: 1 }]);

    // Order with APPLIED negative coupon - total should be suspicious
    const baseTotal = 100;
    const suspiciousTotal = baseTotal + 50; // Because discount is -50, it adds instead of subtracts
    const orderDate = getRandomDateBetween(new Date(signupDate), new Date());
    
    const orderId = await bulkInsert(pool, "orders", ["customer_id", "order_date", "total_amount", "coupon_id"], [{
      customer_id: customerId,
      order_date: orderDate,
      total_amount: suspiciousTotal, // 150 instead of normal 100
      coupon_id: negativeCouponId, // APPLIED negative coupon
    }]);
    
    await bulkInsert(pool, "order_items", ["order_id", "product_id", "quantity", "subtotal"], [
      { order_id: orderId, product_id: productId, quantity: 1, subtotal: 100 }
    ]);
    
    // Record coupon redemption for the anomaly coupon
    await bulkInsert(pool, "coupon_redemptions", ["coupon_id", "customer_id", "redeemed_at"], [{
      coupon_id: negativeCouponId,
      customer_id: customerId,
      redeemed_at: orderDate,
    }]);
    
    if ((i + 1) % 10 === 0 || i === options.anomalyCouponCount - 1) {
      console.log(`  Created ${i + 1}/${options.anomalyCouponCount} anomaly orders with applied coupons`);
    }
  }

  // Pool manages connections automatically, no need to close
  // Connections will be reused for future operations
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n========================================');
  console.log('Database Seeding Complete!');
  console.log('========================================');
  console.log('Summary:');
  console.log(`  ✓ Products: ${options.productCount}`);
  console.log(`  ✓ Customers: ${options.userCount}`);
  console.log(`  ✓ Product Views: ${totalViewsCreated}`);
  console.log(`  ✓ Carts: ${totalCartsCreated}`);
  console.log(`  ✓ Orders: ${totalOrdersCreated} (normal) + ${options.anomalyCouponCount} (anomaly)`);
  console.log(`  ✓ Normal Coupons: ${options.couponCount} (applied to ~${Math.floor(totalOrdersCreated * 0.3)} orders)`);
  console.log(`  ✓ Anomaly Coupons: ${options.anomalyCouponCount}`);
  console.log(`  ⏱  Time: ${duration}s`);
  console.log('========================================\n');
}
