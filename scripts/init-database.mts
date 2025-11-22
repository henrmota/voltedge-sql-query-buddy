#!/usr/bin/env tsx
import { seedDatabase } from "@/server/faker";
import { createSchema, createDatabaseSchemaRags } from "@/server/lib/mysql";
import "dotenv/config";

const DB_DATABASE = process.env.DB_DATABASE || 'mydatabase';

async function initializeDatabase() {
  console.log('🚀 Starting database initialization...\n');

  try {
    // Step 1: Create schema
    console.log('📋 Step 1/3: Creating database schema...');
    const created = await createSchema(DB_DATABASE);

    if (!created) {
      console.log('✅ Schema already exists, skipping creation');
    } else {
      console.log('✅ Schema created successfully');
    }

    // Step 2: Seed database
    console.log('\n🌱 Step 2/3: Seeding database with sample data...');
    await seedDatabase({
      productCount: 1000,
      userCount: 2000,
      couponCount: 5,
      anomalyCouponCount: 2,
      funnelViewRate: 0.6,
      funnelAddToCartRate: 0.3,
      funnelCheckoutRate: 0.6,
    });
    console.log('✅ Database seeded successfully');

    // Step 3: Create RAG documents
    console.log('\n📚 Step 3/3: Creating RAG documents for database schema...');
    await createDatabaseSchemaRags();
    console.log('✅ RAG documents created successfully');

    console.log('\n🎉 Database initialization complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const force = args.includes('--rag');

if (force) {
  createDatabaseSchemaRags().catch(console.error).finally(() => {
    console.log('RAG documents created successfully');
  });
} else {
  initializeDatabase().catch(console.error).finally(() => {
    console.log('Database initialization complete!');
  });
}
