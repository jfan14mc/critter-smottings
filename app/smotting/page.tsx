'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';
import type { Map, LeafletMouseEvent } from 'leaflet';
import L from 'leaflet';
import { MapContainer,TileLayer,useMapEvents, Marker} from 'react-leaflet';

// Type definitions
interface Location {
  lat: number;
  lng: number;
}

type AnimalCategories = 'rat' | 'raccoon' | 'fox' | 'bunny';

interface WildlifeReport {
  id?: number;
  animalType: AnimalCategories;
  latitude: number;
  longitude: number;
  reportTime: string;
  created_at?: string;
}

// Database type for Supabase
interface DatabaseReport extends WildlifeReport {
  id: number;
  created_at: string;
}

// Animal type options for dropdown
const animalOptions: { value: AnimalCategories; label: string; emoji: string }[] = [
  { value: 'rat', label: 'Rat', emoji: '🐀' },
  { value: 'raccoon', label: 'Raccoon', emoji: '🦝' },
  { value: 'fox', label: 'Fox', emoji: '🦊' },
  { value: 'bunny', label: 'Bunny', emoji: '🐰' },
];

const animalEmojis: Record<AnimalCategories, string> = {
  'rat': '🐀',
  'raccoon': '🦝',
  'fox': '🦊',
  'bunny': '🐰'
};

const selectedLocationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const reportIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Map click handler component
interface MapClickHandlerProps {
  onLocationSelect: (location: Location) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
};

// Main component
const WildlifeReporting: React.FC = () => {
  // State management
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalCategories | ''>('');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [reports, setReports] = useState<DatabaseReport[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const mapRef = useRef<Map | null>(null);

  // Fetch reports from Supabase
  const fetchReports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let { data , error: fetchError } = await supabase
        .from('critterArray')
        .select('*')
        .order('reportTime', { ascending: false })
        .limit(5);

      if (fetchError) throw fetchError;

      setReports(data || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Failed to load reports. Please try refreshing the page.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load reports on component mount
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Set up real-time subscription for new reports
  useEffect(() => {
    const channel = supabase
      .channel('wildlife_reports_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'critterArray'
        },
        (payload) => {
          console.log('Real-time update:', payload);
          
          if (payload.eventType === 'INSERT') {
            setReports(prev => [payload.new as DatabaseReport, ...prev.slice(0, 49)]);
          } else if (payload.eventType === 'DELETE') {
            setReports(prev => prev.filter(report => report.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setReports(prev => prev.map(report => 
              report.id === payload.new.id ? payload.new as DatabaseReport : report
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Update current time every second
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleString());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle location selection from map
  const handleLocationSelect = useCallback((location: Location) => {
    setSelectedLocation(location);
  }, []);

  // Check if form is valid
  const isFormValid = Boolean(selectedAnimal && selectedLocation) && !isSubmitting;

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedAnimal || !selectedLocation) {
      alert('Please select both an animal type and location on the map.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create new report for database
      const newReport: WildlifeReport = {
        animalType: selectedAnimal,
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
        reportTime: new Date().toISOString()
      };

      const { data, error: insertError } = await supabase
        .from('critterArray')
        .insert([newReport])
        .select()
        .single();

      if (insertError) throw insertError;

      // Show success message
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);

      // Reset form
      resetForm();

    } catch (err) {
      console.error('Error submitting report:', err);
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to initial state
  const resetForm = () => {
    setSelectedAnimal('');
    setSelectedLocation(null);
  };

  // Handle animal selection
  const handleAnimalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as AnimalCategories | '';
    setSelectedAnimal(value);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-5">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-700 to-green-600 text-white p-8 text-center">
          <h1 className="text-4xl font-bold mb-2">🦝 Wildlife Reporting Portal</h1>
          <p className="text-lg opacity-90">Help us track local wildlife by reporting your sightings</p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 min-h-[600px]">
          {/* Form Section */}
          <div className="lg:col-span-1 p-10 bg-gray-50">
            <form onSubmit={handleSubmit}>
              {/* Success Message */}
              {showSuccessMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6 text-center font-semibold">
                  Report submitted successfully! 🎉
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 text-center">
                  {error}
                </div>
              )}

              {/* Animal Type Selection */}
              <div className="mb-6">
                <label htmlFor="animal-select" className="block text-sm font-semibold text-gray-700 mb-2">
                  Animal Type *
                </label>
                <select
                  id="animal-select"
                  value={selectedAnimal}
                  onChange={handleAnimalChange}
                  required
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:opacity-50"
                >
                  <option value="">Select an animal...</option>
                  {animalOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.emoji} {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Selection */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Location *
                </label>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 ${
                  selectedLocation 
                    ? 'bg-green-50 border-green-400' 
                    : 'bg-blue-50 border-blue-400'
                }`}>
                  <p className="text-gray-600 mb-1">
                    {selectedLocation 
                      ? '✅ Location selected successfully!' 
                      : '📍 Click on the map to select a location'
                    }
                  </p>
                  {selectedLocation && (
                    <p className="font-mono text-sm text-gray-800 font-semibold">
                      Lat: {selectedLocation.lat.toFixed(6)}, Lng: {selectedLocation.lng.toFixed(6)}
                    </p>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 relative ${
                  isFormValid
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg hover:-translate-y-0.5'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  'Submit Wildlife Report'
                )}
              </button>

              {/* Timestamp Display */}
              <div className="mt-4 text-center text-sm text-gray-600">
                <p>⏰ Report time will be recorded automatically</p>
                <p className="font-semibold">Current time: {currentTime}</p>
              </div>
            </form>
          </div>

          {/* Map Section */}
          <div className="lg:col-span-2 relative">
            <div className="absolute top-5 left-5 right-5 bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-[1000]">
              <p className="text-center font-semibold text-gray-800">
                🗺️ Click anywhere on the map to drop a pin and mark the location
              </p>
            </div>
            <div className="h-[600px] lg:h-full">
              <MapContainer
                center={[42.3601, -71.0589]}
                zoom={11}
                style={{ height: '100%', width: '100%' }}
                ref={mapRef}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapClickHandler onLocationSelect={handleLocationSelect} />
                {selectedLocation && (
                  <Marker 
                    position={[selectedLocation.lat, selectedLocation.lng]}
                    icon={selectedLocationIcon} 
                  />
                )}
                {/* Show existing reports on map */}
                {reports.map(report => (
                  <Marker 
                    key={report.id} 
                    position={[report.latitude, report.longitude]}
                    opacity={0.6}
                    icon={reportIcon} 
                  />
                ))}
              </MapContainer>
            </div>
          </div>
        </div>

        {/* Reports Section */}
        <div className="p-10 bg-white border-t border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Recent Reports</h2>
            <button
              onClick={fetchReports}
              disabled={isLoading}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          
          <div className="space-y-4">
            {isLoading && reports.length === 0 ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading reports...</p>
              </div>
            ) : reports.length === 0 ? (
              <p className="text-gray-500 italic text-center py-8">
                No reports yet. Be the first to report a wildlife sighting!
              </p>
            ) : (
              reports.map(report => (
                <div
                  key={report.id}
                  className="bg-gray-50 border-l-4 border-indigo-500 p-5 rounded-r-lg"
                >
                  <div className="font-semibold text-gray-800 mb-2">
                    {animalEmojis[report.animalType]} {report.animalType.charAt(0).toUpperCase() + report.animalType.slice(1)}
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>📍 Location: {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}</p>
                    <p>⏰ Reported: {formatDate(report.reportTime)}</p>
                    <p className="text-xs text-gray-500">ID: {report.id}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WildlifeReporting;