import { NextRequest, NextResponse } from 'next/server';
import { dbOperations, ApiLaunch } from '@/lib/database';

const CACHE_KEY = 'upcoming_launches';
const CACHE_TTL_MINUTES = 30; // Cache for 30 minutes
const API_URL = 'https://lldev.thespacedevs.com/2.3.0/launches/upcoming/';
const MAX_API_LIMIT = 100; // Maximum records to fetch from SpaceDevs API

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    console.log(`API Route: Checking cache validity... (requesting ${limit} records with offset ${offset})`);
    
    // Check if cache is valid
    const isCacheValid = dbOperations.isCacheValid(CACHE_KEY, CACHE_TTL_MINUTES);
    
    if (isCacheValid) {
      console.log('API Route: Cache is valid, returning cached data');
      
      // Return paginated cached data
      const allCachedRecords = dbOperations.getCachedLaunches(MAX_API_LIMIT);
      const totalCount = allCachedRecords.length;
      const paginatedRecords = allCachedRecords.slice(offset, offset + limit);
      const cachedLaunches = dbOperations.convertToApiFormat(paginatedRecords);
      
      // Calculate pagination info
      const hasNext = offset + limit < totalCount;
      const hasPrevious = offset > 0;
      const nextUrl = hasNext ? `/api/launches?limit=${limit}&offset=${offset + limit}` : null;
      const previousUrl = hasPrevious ? `/api/launches?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null;
      
      return NextResponse.json({
        count: totalCount,
        next: nextUrl,
        previous: previousUrl,
        results: cachedLaunches,
        cached: true,
        cache_info: {
          source: 'cache',
          fetched_at: new Date().toISOString(),
          ttl_minutes: CACHE_TTL_MINUTES,
          total_cached: totalCount,
          page_size: limit,
          page_offset: offset
        }
      });
    }
    
    console.log('API Route: Cache is invalid or empty, fetching from external API...');
    
    // Fetch fresh data from external API (always fetch max to populate cache)
    const response = await fetch(`${API_URL}?limit=${MAX_API_LIMIT}`, {
      headers: {
        'User-Agent': 'ClearPathTrainingStarter/1.0 (Educational Project)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`SpaceDevs API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`API Route: Fetched ${data.results?.length} launches from external API`);
    
    // Validate the data structure
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid API response structure');
    }
    
    // Cache the fresh data
    if (data.results.length > 0) {
      console.log('API Route: Caching fresh data...');
      dbOperations.upsertLaunches(data.results as ApiLaunch[]);
      dbOperations.updateCacheMetadata(CACHE_KEY, CACHE_TTL_MINUTES);
      console.log('API Route: Data cached successfully');
    }
    
    // Return paginated fresh data
    const totalCount = data.results.length;
    const paginatedResults = data.results.slice(offset, offset + limit);
    
    // Calculate pagination info
    const hasNext = offset + limit < totalCount;
    const hasPrevious = offset > 0;
    const nextUrl = hasNext ? `/api/launches?limit=${limit}&offset=${offset + limit}` : null;
    const previousUrl = hasPrevious ? `/api/launches?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null;
    
    return NextResponse.json({
      count: totalCount,
      next: nextUrl,
      previous: previousUrl,
      results: paginatedResults,
      cached: false,
      cache_info: {
        source: 'api',
        fetched_at: new Date().toISOString(),
        ttl_minutes: CACHE_TTL_MINUTES,
        total_fetched: totalCount,
        page_size: limit,
        page_offset: offset
      }
    });
    
  } catch (error) {
    console.error('API Route Error:', error);
    
    // If external API fails, try to return cached data even if expired
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      
      console.log('API Route: External API failed, trying to return stale cache...');
      const allCachedRecords = dbOperations.getCachedLaunches(MAX_API_LIMIT);
      
      if (allCachedRecords.length > 0) {
        const totalCount = allCachedRecords.length;
        const paginatedRecords = allCachedRecords.slice(offset, offset + limit);
        const cachedLaunches = dbOperations.convertToApiFormat(paginatedRecords);
        console.log(`API Route: Returning ${cachedLaunches.length} stale cached launches (${totalCount} total)`);
        
        // Calculate pagination info
        const hasNext = offset + limit < totalCount;
        const hasPrevious = offset > 0;
        const nextUrl = hasNext ? `/api/launches?limit=${limit}&offset=${offset + limit}` : null;
        const previousUrl = hasPrevious ? `/api/launches?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null;
        
        return NextResponse.json({
          count: totalCount,
          next: nextUrl,
          previous: previousUrl,
          results: cachedLaunches,
          cached: true,
          cache_info: {
            source: 'stale_cache',
            fetched_at: new Date().toISOString(),
            ttl_minutes: CACHE_TTL_MINUTES,
            warning: 'External API unavailable, returning stale cache data',
            total_cached: totalCount,
            page_size: limit,
            page_offset: offset
          }
        });
      }
    } catch (cacheError) {
      console.error('Cache fallback also failed:', cacheError);
    }
    
    // If all else fails, return error
    return NextResponse.json(
      {
        error: 'Failed to fetch launch data',
        message: error instanceof Error ? error.message : 'Unknown error',
        cached: false
      },
      { status: 500 }
    );
  }
}

// Optional: Add a manual cache refresh endpoint
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    console.log('API Route: Manual cache refresh requested...');
    
    // Force fetch from external API (always fetch max to refresh cache)
    const response = await fetch(`${API_URL}?limit=${MAX_API_LIMIT}`, {
      headers: {
        'User-Agent': 'ClearPathTrainingStarter/1.0 (Educational Project)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`SpaceDevs API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the fresh data
    if (data.results && data.results.length > 0) {
      dbOperations.upsertLaunches(data.results as ApiLaunch[]);
      dbOperations.updateCacheMetadata(CACHE_KEY, CACHE_TTL_MINUTES);
      console.log('API Route: Manual cache refresh completed');
    }
    
    // Return paginated fresh data
    const totalCount = data.results?.length || 0;
    const paginatedResults = data.results?.slice(offset, offset + limit) || [];
    
    // Calculate pagination info
    const hasNext = offset + limit < totalCount;
    const hasPrevious = offset > 0;
    const nextUrl = hasNext ? `/api/launches?limit=${limit}&offset=${offset + limit}` : null;
    const previousUrl = hasPrevious ? `/api/launches?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null;
    
    return NextResponse.json({
      count: totalCount,
      next: nextUrl,
      previous: previousUrl,
      results: paginatedResults,
      cached: false,
      cache_info: {
        source: 'manual_refresh',
        fetched_at: new Date().toISOString(),
        ttl_minutes: CACHE_TTL_MINUTES,
        total_refreshed: totalCount,
        page_size: limit,
        page_offset: offset
      }
    });
    
  } catch (error) {
    console.error('Manual refresh error:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 