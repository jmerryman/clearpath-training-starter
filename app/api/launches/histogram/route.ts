import { NextResponse } from 'next/server';
import { dbOperations } from '@/lib/database';

interface HistogramBucket {
  startDate: string; // ISO string for JSON serialization
  endDate: string;
  count: number;
  label: string;
  launchIds: string[]; // Just IDs for navigation, not full launch objects
}

export async function GET() {
  try {
    // Get all cached launches for histogram calculation
    const launchRecords = dbOperations.getCachedLaunches(100); // Get all available launches
    const launches = dbOperations.convertToApiFormat(launchRecords);
    
    // Create basic cache info (we'll enhance this if needed)
    const cacheInfo = {
      source: 'cache' as const,
      fetched_at: new Date().toISOString(),
      ttl_minutes: 30
    };
    
    if (launches.length === 0) {
      return NextResponse.json({
        buckets: [],
        cache_info: cacheInfo,
        total_launches: 0
      });
    }

    // Sort launches by date
    const sortedLaunches = [...launches].sort((a, b) => 
      new Date(a.net).getTime() - new Date(b.net).getTime()
    );

    const firstDate = new Date(sortedLaunches[0].net);
    const lastDate = new Date(sortedLaunches[sortedLaunches.length - 1].net);
    
    // Create time buckets (weekly intervals)
    const buckets: HistogramBucket[] = [];
    const currentDate = new Date(firstDate);

    while (currentDate <= lastDate) {
      const bucketStart = new Date(currentDate);
      const bucketEnd = new Date(currentDate);
      bucketEnd.setDate(bucketEnd.getDate() + 7); // 7-day buckets

      const launchesInBucket = sortedLaunches.filter(launch => {
        const launchDate = new Date(launch.net);
        return launchDate >= bucketStart && launchDate < bucketEnd;
      });

      buckets.push({
        startDate: bucketStart.toISOString(),
        endDate: bucketEnd.toISOString(),
        count: launchesInBucket.length,
        launchIds: launchesInBucket.map(launch => launch.id),
        label: bucketStart.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        })
      });

      currentDate.setDate(currentDate.getDate() + 7);
    }

    return NextResponse.json({
      buckets,
      cache_info: cacheInfo,
      total_launches: launches.length
    });

  } catch (error) {
    console.error('Histogram API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate histogram data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Support POST for cache refresh
export async function POST() {
  // For histogram, we don't need to refresh cache separately
  // Just return the current histogram data
  return GET();
} 