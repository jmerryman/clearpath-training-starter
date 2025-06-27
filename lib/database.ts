import Database from 'better-sqlite3';
import path from 'path';

// Create database file in the project root
const dbPath = path.join(process.cwd(), 'launches.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
const createTables = () => {
  const createLaunchesTable = `
    CREATE TABLE IF NOT EXISTS launches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      net TEXT NOT NULL,
      window_start TEXT,
      window_end TEXT,
      status_id INTEGER,
      status_name TEXT,
      status_abbrev TEXT,
      status_description TEXT,
      lsp_id INTEGER,
      lsp_name TEXT,
      lsp_abbrev TEXT,
      lsp_type TEXT,
      rocket_id INTEGER,
      rocket_config_id INTEGER,
      rocket_config_name TEXT,
      rocket_config_full_name TEXT,
      rocket_config_variant TEXT,
      mission_id INTEGER,
      mission_name TEXT,
      mission_description TEXT,
      mission_type TEXT,
      image_id INTEGER,
      image_name TEXT,
      image_url TEXT,
      image_thumbnail_url TEXT,
      image_credit TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `;

  const createCacheMetaTable = `
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      last_updated INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `;

  db.exec(createLaunchesTable);
  db.exec(createCacheMetaTable);
};

// Initialize database
createTables();

export interface LaunchRecord {
  id: string;
  name: string;
  net: string;
  window_start?: string;
  window_end?: string;
  status_id: number;
  status_name: string;
  status_abbrev: string;
  status_description: string;
  lsp_id: number;
  lsp_name: string;
  lsp_abbrev: string;
  lsp_type: string;
  rocket_id: number;
  rocket_config_id: number;
  rocket_config_name: string;
  rocket_config_full_name: string;
  rocket_config_variant: string;
  mission_id: number;
  mission_name: string;
  mission_description?: string;
  mission_type: string;
  image_id?: number;
  image_name?: string;
  image_url?: string;
  image_thumbnail_url?: string;
  image_credit?: string;
}

export interface ApiLaunch {
  id: string;
  name: string;
  net: string;
  window_start?: string;
  window_end?: string;
  status?: {
    id: number;
    name: string;
    abbrev: string;
    description: string;
  };
  launch_service_provider?: {
    id: number;
    name: string;
    abbrev: string;
    type: string | { id: number; name: string };
  };
  rocket?: {
    id: number;
    configuration?: {
      id: number;
      name: string;
      full_name: string;
      variant: string;
    };
  };
  mission?: {
    id: number;
    name: string;
    description?: string;
    type: string | { id: number; name: string };
  };
  image?: {
    id: number;
    name: string;
    image_url: string;
    thumbnail_url: string;
    credit: string;
  };
}

// Database operations
export const dbOperations = {
  // Insert or update launches
  upsertLaunches: (launches: ApiLaunch[]) => {
    const now = Date.now();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO launches (
        id, name, net, window_start, window_end,
        status_id, status_name, status_abbrev, status_description,
        lsp_id, lsp_name, lsp_abbrev, lsp_type,
        rocket_id, rocket_config_id, rocket_config_name, rocket_config_full_name, rocket_config_variant,
        mission_id, mission_name, mission_description, mission_type,
        image_id, image_name, image_url, image_thumbnail_url, image_credit,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

    const transaction = db.transaction((launches: ApiLaunch[]) => {
      for (const launch of launches) {
        try {
          stmt.run(
            launch.id,
            launch.name,
            launch.net,
            launch.window_start || launch.net,
            launch.window_end || launch.net,
            launch.status?.id || 0,
            launch.status?.name || 'Unknown',
            launch.status?.abbrev || 'UNK',
            launch.status?.description || 'Unknown',
            launch.launch_service_provider?.id || 0,
            launch.launch_service_provider?.name || 'Unknown',
            launch.launch_service_provider?.abbrev || 'UNK',
            // Handle the type field which can be a string or object
            typeof launch.launch_service_provider?.type === 'string' 
              ? launch.launch_service_provider.type 
              : launch.launch_service_provider?.type?.name || 'Unknown',
            launch.rocket?.id || 0,
            launch.rocket?.configuration?.id || 0,
            launch.rocket?.configuration?.name || 'Unknown',
            launch.rocket?.configuration?.full_name || 'Unknown',
            launch.rocket?.configuration?.variant || '',
            launch.mission?.id || 0,
            launch.mission?.name || 'Unknown',
            launch.mission?.description || null,
            // Handle mission type which can be a string or object
            typeof launch.mission?.type === 'string' 
              ? launch.mission.type 
              : launch.mission?.type?.name || 'Unknown',
            launch.image?.id || null,
            launch.image?.name || null,
            launch.image?.image_url || null,
            launch.image?.thumbnail_url || null,
            launch.image?.credit || null,
            now,
            now
          );
        } catch (error) {
          console.error('Error inserting launch:', launch.id, error);
          // Log the problematic launch data for debugging
          console.error('Launch data:', JSON.stringify(launch, null, 2));
          throw error;
        }
      }
    });

    transaction(launches);
  },

  // Get cached launches
  getCachedLaunches: (limit: number = 100): LaunchRecord[] => {
    const stmt = db.prepare(`
      SELECT * FROM launches 
      ORDER BY net ASC 
      LIMIT ?
    `);
    return stmt.all(limit) as LaunchRecord[];
  },

  // Check if cache is valid
  isCacheValid: (cacheKey: string, ttlMinutes: number = 30): boolean => {
    const stmt = db.prepare('SELECT expires_at FROM cache_meta WHERE key = ?');
    const result = stmt.get(cacheKey) as { expires_at: number } | undefined;
    
    if (!result) return false;
    
    return Date.now() < result.expires_at;
  },

  // Update cache metadata
  updateCacheMetadata: (cacheKey: string, ttlMinutes: number = 30) => {
    const now = Date.now();
    const expiresAt = now + (ttlMinutes * 60 * 1000);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cache_meta (key, last_updated, expires_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(cacheKey, now, expiresAt);
  },

  // Convert database record to API format
  convertToApiFormat: (records: LaunchRecord[]): ApiLaunch[] => {
    return records.map(record => ({
      id: record.id,
      name: record.name,
      net: record.net,
      window_start: record.window_start || record.net,
      window_end: record.window_end || record.net,
      status: {
        id: record.status_id,
        name: record.status_name,
        abbrev: record.status_abbrev,
        description: record.status_description,
      },
      launch_service_provider: {
        id: record.lsp_id,
        name: record.lsp_name,
        abbrev: record.lsp_abbrev,
        type: record.lsp_type,
      },
      rocket: {
        id: record.rocket_id,
        configuration: {
          id: record.rocket_config_id,
          name: record.rocket_config_name,
          full_name: record.rocket_config_full_name,
          variant: record.rocket_config_variant,
        },
      },
      mission: {
        id: record.mission_id,
        name: record.mission_name,
        description: record.mission_description || undefined,
        type: record.mission_type,
      },
      image: record.image_id ? {
        id: record.image_id,
        name: record.image_name || '',
        image_url: record.image_url || '',
        thumbnail_url: record.image_thumbnail_url || '',
        credit: record.image_credit || '',
      } : undefined,
    }));
  },

  // Clean up old launches (optional maintenance)
  cleanupOldLaunches: (daysOld: number = 7) => {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const stmt = db.prepare('DELETE FROM launches WHERE created_at < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  },
};

export default db; 