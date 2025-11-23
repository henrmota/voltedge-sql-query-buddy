#!/usr/bin/env tsx
import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import 'dotenv/config';

const DB_HOST = process.env.DB_HOST || 'mysql_db';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || 'rootpassword';
const DB_DATABASE = process.env.DB_DATABASE || 'voltedge';

const REDIS_HOST = process.env.REDIS_HOST || 'redis-stack';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

async function waitForMySQL(maxRetries = 30, delay = 2000): Promise<void> {
  console.log('⏳ Waiting for MySQL to be ready...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        connectTimeout: 2000,
      });
      await connection.ping();
      await connection.end();
      console.log('✅ MySQL is ready!');
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`   MySQL is unavailable - sleeping (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`MySQL failed to become ready after ${maxRetries} attempts: ${error}`);
      }
    }
  }
}

async function waitForRedis(maxRetries = 30, delay = 2000): Promise<void> {
  console.log('⏳ Waiting for Redis to be ready...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = createClient({
        socket: {
          host: REDIS_HOST,
          port: REDIS_PORT,
          connectTimeout: 2000,
        },
      });
      
      await client.connect();
      await client.ping();
      await client.quit();
      console.log('✅ Redis is ready!');
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`   Redis is unavailable - sleeping (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Redis failed to become ready after ${maxRetries} attempts: ${error}`);
      }
    }
  }
}

async function main() {
  try {
    await waitForMySQL();
    await waitForRedis();
    console.log('🎉 All services are ready!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error waiting for services:', error);
    process.exit(1);
  }
}

main();

