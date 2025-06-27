#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const dbPath = path.join(process.cwd(), 'launches.db');

try {
  const db = new Database(dbPath);
  
  console.log('🚀 Launch Cache Inspector');
  console.log('========================\n');
  
  // Check cache metadata
  const cacheStmt = db.prepare('SELECT * FROM cache_meta');
  const cacheData = cacheStmt.all();
  
  console.log('📊 Cache Metadata:');
  if (cacheData.length === 0) {
    console.log('  No cache metadata found');
  } else {
    cacheData.forEach(cache => {
      const lastUpdated = new Date(cache.last_updated);
      const expiresAt = new Date(cache.expires_at);
      const isValid = Date.now() < cache.expires_at;
      
      console.log(`  Key: ${cache.key}`);
      console.log(`  Last Updated: ${lastUpdated.toLocaleString()}`);
      console.log(`  Expires At: ${expiresAt.toLocaleString()}`);
      console.log(`  Valid: ${isValid ? '✅' : '❌'}`);
      console.log('');
    });
  }
  
  // Check launches count
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM launches');
  const { count } = countStmt.get();
  
  console.log(`📡 Cached Launches: ${count}`);
  
  if (count > 0) {
    // Show recent launches
    const launchesStmt = db.prepare(`
      SELECT name, net, status_name, lsp_name, created_at 
      FROM launches 
      ORDER BY net ASC 
      LIMIT 5
    `);
    const launches = launchesStmt.all();
    
    console.log('\n🎯 Next 5 Upcoming Launches:');
    launches.forEach((launch, index) => {
      const launchDate = new Date(launch.net);
      const cachedDate = new Date(launch.created_at);
      
      console.log(`  ${index + 1}. ${launch.name}`);
      console.log(`     Launch: ${launchDate.toLocaleString()}`);
      console.log(`     Status: ${launch.status_name}`);
      console.log(`     Provider: ${launch.lsp_name}`);
      console.log(`     Cached: ${cachedDate.toLocaleString()}`);
      console.log('');
    });
  }
  
  // Database stats
  const tablesStmt = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `);
  const tables = tablesStmt.all();
  
  console.log(`💾 Database Info:`);
  console.log(`  Tables: ${tables.map(t => t.name).join(', ')}`);
  console.log(`  File: ${dbPath}`);
  
  db.close();
  
} catch (error) {
  if (error.code === 'SQLITE_CANTOPEN') {
    console.log('📂 No cache database found yet. Start the app to create it!');
  } else {
    console.error('❌ Error accessing database:', error.message);
  }
}

// Add command line arguments support
const args = process.argv.slice(2);

if (args.includes('--clear-cache')) {
  try {
    const db = new Database(dbPath);
    db.exec('DELETE FROM cache_meta');
    console.log('\n🧹 Cache metadata cleared!');
    db.close();
  } catch (error) {
    console.error('❌ Error clearing cache:', error.message);
  }
}

if (args.includes('--clear-all')) {
  try {
    const db = new Database(dbPath);
    db.exec('DELETE FROM launches');
    db.exec('DELETE FROM cache_meta');
    console.log('\n🧹 All cache data cleared!');
    db.close();
  } catch (error) {
    console.error('❌ Error clearing all data:', error.message);
  }
}

if (args.includes('--help')) {
  console.log('\n📚 Usage:');
  console.log('  node scripts/cache-inspector.js                 # Show cache status');
  console.log('  node scripts/cache-inspector.js --clear-cache   # Clear cache metadata');
  console.log('  node scripts/cache-inspector.js --clear-all     # Clear all cache data');
  console.log('  node scripts/cache-inspector.js --help          # Show this help');
} 