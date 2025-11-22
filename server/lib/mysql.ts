import mysql from 'mysql2/promise';
import { config } from '../config';
import { SystemMessage, HumanMessage, Document } from 'langchain';
import { models } from './model';
import { VectorStore } from '../embeddings';
import { RAG_BUILDING_SYSTEM_MESSAGE } from '../config/system-messages';
import { DocumentInterface } from '@langchain/core/documents';
import { sanitizeForStorage } from './sanitize';

let connectionPool: mysql.Pool | null = null;

export function getMysqlConnectionPool(): mysql.Pool {
  if (!connectionPool) {
    console.log('Creating new MySQL connection pool (singleton)');
    connectionPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: parseInt(process.env.DB_PORT || '3306'),
      connectionLimit: config.database.connectionLimit,
      waitForConnections: config.database.waitForConnections,
      queueLimit: config.database.queueLimit
    });
  }
  return connectionPool;
}

export async function getTableNames(pool?: mysql.Pool) {
  if (!pool) {
    pool = await getMysqlConnectionPool();
  }

  const [tables] = await pool.execute<never[]>("SHOW TABLES");
  const tableNames = tables.map(row => Object.values(row)[0]) as string[];
  return tableNames;
}

/**
 * Executes multiple SQL queries and returns their results.
 * 
 * @param queries - Array of SQL query strings to execute
 * @param pool - Optional MySQL pool (uses singleton if not provided)
 * @param options - Optional configuration
 * @param options.continueOnError - If true, continues executing remaining queries even if one fails (default: false)
 * @returns Array of query results, one per query. If continueOnError is true, failed queries will have an error object.
 * 
 * @example
 * ```typescript
 * const queries = [
 *   "SELECT * FROM customers LIMIT 10",
 *   "SELECT COUNT(*) FROM orders"
 * ];
 * const results = await executeQueries(queries);
 * // results[0] = rows from customers query
 * // results[1] = rows from orders count query
 * ```
 */
export async function executeQueries(
  queries: string[],
  pool?: mysql.Pool,
  options?: { continueOnError?: boolean }
): Promise<Array<mysql.RowDataPacket[] | { error: string }>> {
  if (!pool) {
    pool = getMysqlConnectionPool();
  }

  const continueOnError = options?.continueOnError ?? false;

  // Execute all queries in parallel
  const queryPromises = queries.map(async (query, index) => {
    try {
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(query);
      console.log(`Query ${index + 1}/${queries.length} executed successfully`);
      return { success: true, index, data: rows } as const;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Query ${index + 1}/${queries.length} failed:`, errorMessage);
      return { success: false, index, error: errorMessage } as const;
    }
  });

  if (continueOnError) {
    // Use allSettled to continue even if some queries fail
    const settledResults = await Promise.allSettled(queryPromises);
    return settledResults.map((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          return result.value.data;
        } else {
          return { error: result.value.error };
        }
      } else {
        return { error: result.reason instanceof Error ? result.reason.message : 'Unknown error' };
      }
    });
  } else {
    // Use all to fail fast on first error
    const results = await Promise.all(queryPromises);
    return results.map((result) => {
      if (result.success) {
        return result.data;
      } else {
        throw new Error(`Query ${result.index + 1} failed: ${result.error}`);
      }
    });
  }
}

/**
 * Executes EXPLAIN on multiple SQL queries and returns their execution plans.
 * This is useful for validating queries without actually executing them.
 * 
 * @param queries - Array of SQL query strings to explain
 * @param pool - Optional MySQL pool (uses singleton if not provided)
 * @param options - Optional configuration
 * @param options.continueOnError - If true, continues explaining remaining queries even if one fails (default: false)
 * @returns Array of EXPLAIN results, one per query. If continueOnError is true, failed queries will have an error object.
 * 
 * @example
 * ```typescript
 * const queries = [
 *   "SELECT * FROM customers LIMIT 10",
 *   "SELECT COUNT(*) FROM orders"
 * ];
 * const explainResults = await explainQueries(queries);
 * // explainResults[0] = execution plan for customers query
 * // explainResults[1] = execution plan for orders query
 * ```
 */
export async function explainQueries(
  queries: string[],
  pool?: mysql.Pool,
  options?: { continueOnError?: boolean }
): Promise<Array<mysql.RowDataPacket[] | { error: string }>> {
  if (!pool) {
    pool = getMysqlConnectionPool();
  }

  const continueOnError = options?.continueOnError ?? false;

  // Execute EXPLAIN on all queries in parallel
  const explainPromises = queries.map(async (query, index) => {
    try {
      // Wrap query with EXPLAIN
      const explainQuery = `EXPLAIN ${query}`;
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(explainQuery);
      console.log(`EXPLAIN ${index + 1}/${queries.length} executed successfully`);
      return { success: true, index, data: rows } as const;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`EXPLAIN ${index + 1}/${queries.length} failed:`, errorMessage);
      return { success: false, index, error: errorMessage } as const;
    }
  });

  if (continueOnError) {
    // Use allSettled to continue even if some EXPLAIN queries fail
    const settledResults = await Promise.allSettled(explainPromises);
    return settledResults.map((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          return result.value.data;
        } else {
          return { error: result.value.error };
        }
      } else {
        return { error: result.reason instanceof Error ? result.reason.message : 'Unknown error' };
      }
    });
  } else {
    // Use all to fail fast on first error
    const results = await Promise.all(explainPromises);
    return results.map((result) => {
      if (result.success) {
        return result.data;
      } else {
        throw new Error(`EXPLAIN ${result.index + 1} failed: ${result.error}`);
      }
    });
  }
}

interface FKInfo {
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export async function getSchema(): Promise<
  Record<string, { columns: string[]; foreignKeys: FKInfo[] }>
> {
  const pool = await getMysqlConnectionPool();
  const tableNames = await getTableNames();

  const schema: Record<string, { columns: string[]; foreignKeys: FKInfo[] }> = {};

  for (const tableName of tableNames) {
    // --- Get columns ---
    const [columns] = await pool.execute<mysql.RowDataPacket[]>(
      `SHOW COLUMNS FROM \`${tableName}\``
    );

    // --- Get foreign key relationships ---
    const [fks] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT
        kcu.COLUMN_NAME AS column_name,
        kcu.REFERENCED_TABLE_NAME AS ref_table,
        kcu.REFERENCED_COLUMN_NAME AS ref_column
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE
        kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      `,
      [tableName]
    );

    schema[tableName] = {
      columns: columns.map((col) => col.Field),
      foreignKeys: fks.map((fk) => ({
        column: fk.column_name,
        referencedTable: fk.ref_table,
        referencedColumn: fk.ref_column,
      })),
    };
  }

  return schema;
}

export async function getUndirectedRecursiveConnections() {
  const schema = await getSchema();

  type Hop = {
    fromTable: string;
    fromKey: string;
    toTable: string;
    toKey: string;
  };

  // Build directed edges (FK forward)
  const forwardEdges: Hop[] = [];
  for (const [table, info] of Object.entries(schema)) {
    for (const fk of info.foreignKeys) {
      forwardEdges.push({
        fromTable: table,
        fromKey: fk.column,
        toTable: fk.referencedTable,
        toKey: fk.referencedColumn
      });
    }
  }

  // Build reverse edges (FK backward)
  const reverseEdges: Hop[] = forwardEdges.map(e => ({
    fromTable: e.toTable,
    fromKey: e.toKey,
    toTable: e.fromTable,
    toKey: e.fromKey
  }));

  // Combine into undirected adjacency list
  const allEdges = [...forwardEdges, ...reverseEdges];

  const graph: Record<string, Hop[]> = {};
  for (const edge of allEdges) {
    if (!graph[edge.fromTable]) graph[edge.fromTable] = [];
    graph[edge.fromTable].push(edge);
  }

  // DFS exploring UNDIRECTED edges but keeping FK hop direction
  function dfs(
    origin: string,
    current: string,
    visited: Set<string>,
    path: Hop[],
    out: Hop[][]
  ) {
    visited.add(current);

    const edges = graph[current] || [];
    if (edges.length === 0) {
      if (path.length > 0) out.push([...path]);
      return;
    }

    for (const hop of edges) {
      if (visited.has(hop.toTable)) {
        out.push([...path, hop]); // cycle endpoint
        continue;
      }

      path.push(hop);
      dfs(origin, hop.toTable, new Set(visited), path, out);
      path.pop();
    }
  }

  // Convert hop lists into LLM-friendly strings
  function formatChain(origin: string, chain: Hop[]) {
    return chain
      .map((hop, idx) => {
        // Always show the actual FK direction the hop represents
        return `connection(${hop.fromTable}, ${hop.fromKey}, ${hop.toTable}, ${hop.toKey})`;
      })
      .join(" -> ");
  }

  // Build result for each table
  const result: Record<string, string[]> = {};

  for (const table of Object.keys(schema)) {
    const chains: Hop[][] = [];
    dfs(table, table, new Set(), [], chains);
    result[table] = chains.map(chain => formatChain(table, chain));
  }

  return result;
}

export async function createDatabaseSchemaRags(options?: { openAIApiKey?: string, model?: string }) {
  const pool = await getMysqlConnectionPool();
  const openAIApiKey = options?.openAIApiKey || process.env.OPENAI_API_KEY;
  const userModel = options?.model;

  const connectionStrings = await getUndirectedRecursiveConnections();

  if (!openAIApiKey || openAIApiKey.trim() === '') {
    console.warn('Skipping RAG creation: No OpenAI API key provided.');
    return;
  }
  console.log(`Creating database schema RAGs with model: ${userModel || 'default'} and OpenAI key: ${openAIApiKey ? '***' : 'MISSING'}`);

  console.log('Creating database schema RAGs...');
  const startTime = Date.now();

  // Get all tables
  const [tables] = await pool.execute<mysql.RowDataPacket[]>("SHOW TABLES");
  const tableNames = tables.map(row => Object.values(row)[0]) as string[];

  console.log(`Found ${tableNames.length} tables to process`);

  // Get CREATE TABLE schema for each table in parallel
  const schemaPromises = tableNames.map(async (table) => {
    const [result] = await pool.execute<mysql.RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
    const createTableRow = result[0] as { 'Create Table': string };
    return { table, schema: createTableRow['Create Table'] };
  });

  const schemaResults = await Promise.all(schemaPromises);
  // Pool is singleton - don't close it

  const vectorStore = new VectorStore();

  // Process all tables in parallel with LLM
  const docPromises = schemaResults.map(async ({ table, schema }) => {
    try {
      const result = await models.standard(userModel, openAIApiKey).invoke([
        new SystemMessage(RAG_BUILDING_SYSTEM_MESSAGE),
        new HumanMessage(`Analyze this table schema:\n\n${schema} \n\nThe following tables are reachable from this table: ${connectionStrings[table].join(', ')}`)
      ]);

      const rawContent = result.content.toString();
      console.log(rawContent);
      const content = JSON.parse(rawContent) as { name: string; synonyms: string[]; description: string; };
      const sanitizedContent = sanitizeForStorage(`${content.name}\n\n${content.synonyms.join(', ')}\n\n${content.description}`);

      if (!sanitizedContent || sanitizedContent.trim().length === 0) {
        throw new Error('Sanitized content is empty');
      }

      return new Document({
        pageContent: sanitizedContent,
        id: `${table}-schema`,
        metadata: {
          table,
          type: 'schema',
          hasAnomalyChecks: true,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Error processing table ${table}:`, error);
      // Return null on error so we can filter it out
      return null;
    }
  });

  const docs = await Promise.all(docPromises);
  const successfulDocs = docs.filter((doc): doc is DocumentInterface<{ table: string; type: string; hasAnomalyChecks: boolean; generatedAt: string; }> => doc !== null && doc !== undefined);

  console.log(`Successfully processed ${successfulDocs.length}/${docs.length} tables`);

  if (successfulDocs.length === 0) {
    console.warn('No documents to add to vector store. Skipping vector store update.');
    return;
  }

  await vectorStore.addDocuments(successfulDocs);

  const endTime = Date.now();
  console.log(`Schema RAGs created in ${(endTime - startTime) / 1000}s`);
}

const dbStatements = [
  `CREATE TABLE IF NOT EXISTS customers (
      customer_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      region VARCHAR(255),
      signup_date DATE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS products (
      product_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(255),
      price DECIMAL(10,2)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS coupons (
      coupon_id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL,
      discount DECIMAL(10,2) NOT NULL,
      expiration_date DATE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      customer_id INT,  -- optional: personalize if needed
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS coupon_redemptions (
      redemption_id INT AUTO_INCREMENT PRIMARY KEY,
      coupon_id INT NOT NULL,
      customer_id INT NOT NULL,
      redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS orders (
      order_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT,
      order_date DATE,
      total_amount DECIMAL(10,2),
      coupon_id INT,  -- optional
      FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS order_items (
      item_id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT,
      product_id INT,
      quantity INT,
      subtotal DECIMAL(10,2),
      FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS carts (
      cart_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      status ENUM('active','abandoned','completed') DEFAULT 'active',
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS cart_items (
      cart_item_id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT DEFAULT 1,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cart_id) REFERENCES carts(cart_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  `CREATE TABLE IF NOT EXISTS product_views (
      view_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT,
      product_id INT NOT NULL,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      session_id VARCHAR(255),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  /* Indexes */
  `CREATE INDEX idx_coupons_code ON coupons(code);`,
  `CREATE INDEX idx_coupon_redemptions_coupon_id ON coupon_redemptions(coupon_id);`,
  `CREATE INDEX idx_coupon_redemptions_customer_id ON coupon_redemptions(customer_id);`,
  `CREATE INDEX idx_product_views_customer_id ON product_views(customer_id);`,
  `CREATE INDEX idx_carts_customer_id ON carts(customer_id);`
];


export async function createSchema(database: string) {
  const pool = getMysqlConnectionPool();
  let connection: mysql.PoolConnection | null = null;

  try {
    // Get a connection from the pool for transaction management
    connection = await pool.getConnection();

    // Create and select database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await connection.query(`USE \`${database}\`;`);

    const [rows] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES;`);
    if (rows.length > 0) {
      console.log('Schema already exists.');
      return false;
    }

    console.log('Creating schema...');

    await connection.beginTransaction();
    for (const statement of dbStatements) {
      await connection.execute(statement);
    }
    await connection.commit();

    return true;

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Error rolling back transaction:', rollbackErr);
      }
    }
    console.error('Error creating schema:', err);
    return false;
  } finally {
    if (connection) {
      connection.release(); // Release connection back to pool
    }
    // Don't close the pool - it's a singleton that should stay open
  }
}
