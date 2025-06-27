'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface LaunchStatus {
  id: number;
  name: string;
  abbrev: string;
  description: string;
}

interface LaunchServiceProvider {
  id: number;
  name: string;
  abbrev: string;
  type: string;
}

interface RocketConfiguration {
  id: number;
  name: string;
  full_name: string;
  variant: string;
}

interface Rocket {
  id: number;
  configuration: RocketConfiguration;
}

interface Mission {
  id: number;
  name: string;
  description: string;
  type: string;
}

interface LaunchImage {
  id: number;
  name: string;
  image_url: string;
  thumbnail_url: string;
  credit: string;
}

interface Launch {
  id: string;
  name: string;
  net: string;
  window_start: string;
  window_end: string;
  status: LaunchStatus;
  launch_service_provider: LaunchServiceProvider;
  rocket: Rocket;
  mission: Mission;
  image: LaunchImage;
}

interface CacheInfo {
  source: 'cache' | 'api' | 'stale_cache' | 'manual_refresh';
  fetched_at: string;
  ttl_minutes: number;
  warning?: string;
}

interface ApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Launch[];
  cached?: boolean;
  cache_info?: CacheInfo;
  error?: string;
  message?: string;
}

interface HistogramBucket {
  startDate: string; // ISO string from API
  endDate: string;
  count: number;
  launchIds: string[]; // Just IDs for navigation
  label: string;
}

interface HistogramResponse {
  buckets: HistogramBucket[];
  cache_info: CacheInfo;
  total_launches: number;
  error?: string;
  message?: string;
}

export default function LaunchList() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(10); // Items per page
  const [histogramData, setHistogramData] = useState<HistogramBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [navigatingFromHistogram, setNavigatingFromHistogram] = useState(false);
  const [totalHistogramLaunches, setTotalHistogramLaunches] = useState(0);
  const [isHistogramCollapsed, setIsHistogramCollapsed] = useState(false);

  const fetchHistogramData = async () => {
    try {
      // Fetch pre-aggregated histogram data from dedicated endpoint
      const response = await fetch('/api/launches/histogram');
      if (!response.ok) {
        throw new Error(`Histogram API error! status: ${response.status}`);
      }
      const data: HistogramResponse = await response.json();
      if (data.error) {
        throw new Error(data.message || data.error);
      }
              setHistogramData(data.buckets);
        setTotalHistogramLaunches(data.total_launches);
    } catch (err) {
      console.error('Failed to fetch histogram data:', err);
    }
  };

  const fetchLaunches = async (forceRefresh = false, page = 1) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const offset = (page - 1) * pageSize;
      const url = `/api/launches?limit=${pageSize}&offset=${offset}`;
      const method = forceRefresh ? 'POST' : 'GET';
      
      const response = await fetch(url, { method });
      
      if (!response.ok) {
        throw new Error(`API error! status: ${response.status}`);
      }
      
      const data: ApiResponse = await response.json();
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }
      
      setLaunches(data.results);
      setTotalCount(data.count);
      setCurrentPage(page);
      setCacheInfo(data.cache_info || null);
      setError(null);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch launches');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchLaunches(true, currentPage);
    // Also refresh the histogram data
    fetchHistogramData();
  };

  const handlePageChange = (newPage: number) => {
    // Clear selected bucket if navigating manually (not from histogram)
    if (!navigatingFromHistogram) {
      setSelectedBucket(null);
    }
    fetchLaunches(false, newPage);
  };

  const handleHistogramClick = (bucketIndex: number) => {
    const bucket = histogramData[bucketIndex];
    if (!bucket || bucket.launchIds.length === 0) return;

    setSelectedBucket(bucketIndex);
    setNavigatingFromHistogram(true);
    
    // For now, just navigate to the first page since we don't have the full dataset
    // This is a simplified navigation - we could enhance this later to find the exact page
    // by fetching launch data or using launch dates
    handlePageChange(1);
    
    // Scroll to the launch list after a short delay to ensure page has loaded
    setTimeout(() => {
      const launchListElement = document.querySelector('.space-y-6');
      if (launchListElement) {
        launchListElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
      setNavigatingFromHistogram(false);
    }, 300);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    fetchLaunches();
    fetchHistogramData();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'go':
      case 'success':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'tbd':
      case 'to be determined':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'hold':
      case 'failure':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getCacheStatusColor = (source: string) => {
    switch (source) {
      case 'cache':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'api':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'stale_cache':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'manual_refresh':
        return 'bg-purple-50 border-purple-200 text-purple-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  if (loading && !refreshing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rocket launches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => fetchLaunches()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Upcoming Rocket Launches
          </h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2"
          >
            {refreshing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Refreshing...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>

        {/* Launch Frequency Histogram */}
        {histogramData.length > 0 && (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Launch Frequency Over Time</h2>
              <button
                onClick={() => setIsHistogramCollapsed(!isHistogramCollapsed)}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <span className="text-sm font-medium">
                  {isHistogramCollapsed ? 'Show' : 'Hide'}
                </span>
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${isHistogramCollapsed ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {!isHistogramCollapsed && (
              <div className="p-6">
                <div className="relative">
              {/* Histogram bars */}
              <div className="flex items-end space-x-1 h-32 mb-2">
                {histogramData.map((bucket, index) => {
                  const maxCount = Math.max(...histogramData.map(b => b.count));
                  const height = maxCount > 0 ? Math.max((bucket.count / maxCount) * 120, bucket.count > 0 ? 8 : 2) : 2;
                  const isSelected = selectedBucket === index;
                  
                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center cursor-pointer group relative"
                      onClick={() => handleHistogramClick(index)}
                    >
                      <div
                        className={`w-full transition-all duration-200 rounded-t ${
                          bucket.count > 0
                            ? isSelected
                              ? 'bg-blue-600 hover:bg-blue-700'
                              : 'bg-blue-400 hover:bg-blue-500'
                            : 'bg-gray-200'
                        }`}
                        style={{ height: `${height}px` }}
                        title={`${bucket.label}: ${bucket.count} launches`}
                      />
                      {/* Count label on hover */}
                      {bucket.count > 0 && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg pointer-events-none whitespace-nowrap z-10">
                          <div className="text-center">
                            <div className="font-semibold">{bucket.count} launches</div>
                            <div className="text-gray-300 mt-1">
                              {new Date(bucket.startDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              })} - {new Date(bucket.endDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* X-axis labels */}
              <div className="flex justify-between text-xs text-gray-600 mt-2">
                {histogramData.map((bucket, index) => {
                  // Show every 3rd label to avoid crowding
                  if (index % 3 === 0 || index === histogramData.length - 1) {
                    return (
                      <span key={index} className="text-center">
                        {bucket.label}
                      </span>
                    );
                  }
                  return <span key={index} className="text-center"></span>;
                })}
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-600 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span>Click on a bar to jump to that time period</span>
                {selectedBucket !== null && (
                  <span className="text-blue-600 font-medium">
                    📍 Viewing: {histogramData[selectedBucket]?.label} 
                    ({histogramData[selectedBucket]?.count} launches)
                  </span>
                )}
              </div>
              <span>Total: {totalHistogramLaunches} launches</span>
            </div>
              </div>
            )}
          </div>
        )}

        {/* Cache Status Info */}
        {cacheInfo && (
          <div className={`mb-6 p-3 rounded-lg text-sm border ${getCacheStatusColor(cacheInfo.source)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-medium">
                  Data Source: {cacheInfo.source === 'cache' ? 'Cached' : 
                               cacheInfo.source === 'api' ? 'Fresh API' :
                               cacheInfo.source === 'stale_cache' ? 'Stale Cache' : 'Manual Refresh'}
                </span>
                <span>•</span>
                <span>Fetched: {new Date(cacheInfo.fetched_at).toLocaleTimeString()}</span>
                <span>•</span>
                <span>TTL: {cacheInfo.ttl_minutes}min</span>
                {(cacheInfo as any).total_cached && (
                  <>
                    <span>•</span>
                    <span>Total Cached: {(cacheInfo as any).total_cached}</span>
                  </>
                )}
              </div>
            </div>
            {cacheInfo.warning && (
              <div className="mt-1 text-xs opacity-90">
                ⚠️ {cacheInfo.warning}
              </div>
            )}
          </div>
        )}
        
        <div className="space-y-6">
          {launches.map((launch) => {
            // Check if this launch is in the selected histogram bucket
            const isInSelectedBucket = selectedBucket !== null && 
              histogramData[selectedBucket]?.launchIds.includes(launch.id);
            
            return (
              <div 
                key={launch.id} 
                className={`bg-white border rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
                  isInSelectedBucket 
                    ? 'border-blue-500 ring-2 ring-blue-200' 
                    : 'border-gray-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row gap-6">
                    {/* Launch Image */}
                    <div className="flex-shrink-0">
                      <div className="w-full sm:w-32 h-48 sm:h-32 relative bg-gray-100 rounded-lg overflow-hidden">
                        {launch.image ? (
                          <Image
                            src={launch.image.thumbnail_url || launch.image.image_url}
                            alt={launch.image.name || `${launch.name} mission`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 100vw, 128px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Launch Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
                            {launch.name}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(launch.status.name)}`}>
                              {launch.status.name}
                            </span>
                            <span className="text-sm text-gray-500">
                              {launch.launch_service_provider.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Launch Time</p>
                          <p className="text-sm text-gray-600">{formatDate(launch.net)}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-gray-700">Rocket</p>
                          <p className="text-sm text-gray-600">{launch.rocket.configuration.full_name}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-gray-700">Mission</p>
                          <p className="text-sm text-gray-600 mb-2">{launch.mission.name}</p>
                          {launch.mission.description && (
                            <p className="text-xs text-gray-500 line-clamp-2">
                              {launch.mission.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            <div className="flex space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                if (pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Data provided by{' '}
            <a 
              href="https://thespacedevs.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              The Space Devs
            </a>
            {' • '}
            <span>Cached locally to reduce API calls</span>
            {totalCount > 0 && (
              <>
                {' • '}
                <span>
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount} launches
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
} 