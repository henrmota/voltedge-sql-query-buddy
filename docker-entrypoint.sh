#!/bin/sh
set -e

echo "🚀 Starting application initialization..."

# Wait for MySQL and Redis to be ready using Node.js script
cd /app
pnpm tsx scripts/wait-for-services.mts

# Run database initialization if INIT_DB is set to true (default: true)
if [ "${INIT_DB:-true}" = "true" ]; then
  echo "📋 Initializing database..."
  pnpm tsx scripts/init-database.mts || {
    echo "⚠️  Database initialization failed or already initialized, continuing..."
  }
else
  echo "⏭️  Skipping database initialization (INIT_DB=false)"
fi

echo "🎉 Starting Next.js application..."
exec "$@"

