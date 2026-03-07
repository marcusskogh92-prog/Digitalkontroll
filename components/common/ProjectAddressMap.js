/**
 * ProjectAddressMap – Google Maps webbkarta för att placera projektets plats (knappnål).
 * Endast för web (Platform.OS === 'web'). Kräver EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.
 * Vid klick/drag på markören: reverse geocoding och onAddressFromMap(adress, kommun, region, lat, lng).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

const DEFAULT_CENTER = { lat: 62.0, lng: 15.0 }; // Sverige
const DEFAULT_ZOOM = 5;

function loadGoogleMapsScript(apiKey) {
  if (typeof window === 'undefined' || !apiKey) return Promise.reject(new Error('No API key or window'));
  if (window.google?.maps) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      if (window.google?.maps) return resolve(window.google);
      existing.addEventListener('load', () => resolve(window.google));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
}

function reverseGeocode(geocoder, latLng) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: latLng }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        resolve(null);
        return;
      }
      const addr = results[0].address_components || [];
      let street = '';
      let postalCode = '';
      let locality = '';
      let adminArea1 = '';
      let adminArea2 = '';

      addr.forEach((c) => {
        if (c.types.includes('street_number')) street = (street + ' ' + c.long_name).trim();
        if (c.types.includes('route')) street = (c.long_name + ' ' + street).trim();
        if (c.types.includes('postal_code')) postalCode = c.long_name;
        if (c.types.includes('locality')) locality = c.long_name;
        if (c.types.includes('administrative_area_level_1')) adminArea1 = c.long_name;
        if (c.types.includes('administrative_area_level_2')) adminArea2 = c.long_name;
      });
      const formatted = results[0].formatted_address || '';
      if (!street && formatted) street = formatted.split(',')[0]?.trim() || '';

      resolve({
        adress: street || formatted,
        kommun: locality || adminArea2 || adminArea1,
        region: adminArea1 || adminArea2 || '',
      });
    });
  });
}

export default function ProjectAddressMap({
  latitude,
  longitude,
  onAddressFromMap,
  onMapReady,
  height = 320,
  placeholder = 'Sök adress eller plats...',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [geocodePending, setGeocodePending] = useState(false);

  const apiKey = typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    : (typeof process !== 'undefined' && process.env && process.env.REACT_APP_GOOGLE_MAPS_API_KEY)
      ? process.env.REACT_APP_GOOGLE_MAPS_API_KEY
      : '';

  const initialPosition = (latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude))
    ? { lat: Number(latitude), lng: Number(longitude) }
    : null;

  const updateMarkerAndGeocode = useCallback((latLng, geocoder) => {
    if (!latLng || !onAddressFromMap) return;
    const lat = latLng.lat();
    const lng = latLng.lng();
    if (geocoder) {
      setGeocodePending(true);
      reverseGeocode(geocoder, latLng).then((addr) => {
        setGeocodePending(false);
        onAddressFromMap({
          latitude: lat,
          longitude: lng,
          adress: addr?.adress ?? '',
          kommun: addr?.kommun ?? '',
          region: addr?.region ?? '',
        });
      }).catch(() => {
        setGeocodePending(false);
        onAddressFromMap({ latitude: lat, longitude: lng, adress: '', kommun: '', region: '' });
      });
    } else {
      onAddressFromMap({ latitude: lat, longitude: lng, adress: '', kommun: '', region: '' });
    }
  }, [onAddressFromMap]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || !apiKey) {
      if (!apiKey && Platform.OS === 'web') setLoadError('Google Maps API-nyckel saknas (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)');
      return;
    }

    let cancelled = false;
    setLoadError(null);

    loadGoogleMapsScript(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current || !google?.maps) return;
        const { Map, Marker } = google.maps;
        const geocoder = new google.maps.Geocoder();

        const center = initialPosition || DEFAULT_CENTER;
        const map = new Map(containerRef.current, {
          center,
          zoom: initialPosition ? 15 : DEFAULT_ZOOM,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });

        const marker = new Marker({
          position: center,
          map,
          draggable: true,
          title: 'Projektets plats',
        });

        mapRef.current = map;
        markerRef.current = marker;

        marker.addListener('dragend', () => {
          updateMarkerAndGeocode(marker.getPosition(), geocoder);
        });

        map.addListener('click', (e) => {
          marker.setPosition(e.latLng);
          updateMarkerAndGeocode(e.latLng, geocoder);
        });

        if (initialPosition) {
          map.setCenter(initialPosition);
          map.setZoom(15);
        }

        if (onMapReady) onMapReady(map);
        setMapLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Kunde inte ladda Google Maps');
      });

    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [apiKey, initialPosition?.lat, initialPosition?.lng, onMapReady, updateMarkerAndGeocode]);

  // Sync marker position when latitude/longitude change from parent (e.g. after save)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !initialPosition) return;
    markerRef.current.setPosition(initialPosition);
    mapRef.current.setCenter(initialPosition);
    mapRef.current.setZoom(15);
  }, [initialPosition?.lat, initialPosition?.lng]);

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim() || !mapRef.current || !markerRef.current || !window.google?.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: searchQuery.trim() }, (results, status) => {
      if (status !== 'OK' || !results?.[0]?.geometry?.location) return;
      const loc = results[0].geometry.location;
      markerRef.current.setPosition(loc);
      mapRef.current.setCenter(loc);
      mapRef.current.setZoom(15);
      const g = new window.google.maps.Geocoder();
      reverseGeocode(g, loc).then((addr) => {
        if (onAddressFromMap) {
          onAddressFromMap({
            latitude: loc.lat(),
            longitude: loc.lng(),
            adress: addr?.adress ?? '',
            kommun: addr?.kommun ?? '',
            region: addr?.region ?? '',
          });
        }
      }).catch(() => {
        if (onAddressFromMap) onAddressFromMap({ latitude: loc.lat(), longitude: loc.lng(), adress: '', kommun: '', region: '' });
      });
    });
  }, [searchQuery, onAddressFromMap]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Kartvy finns endast på webb.</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>{loadError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
        />
        {geocodePending && <Text style={styles.pendingText}>Hämtar adress…</Text>}
      </View>
      <div
        ref={containerRef}
        style={{ width: '100%', height, minHeight: 200, borderRadius: 8, overflow: 'hidden' }}
      />
      {mapLoaded && (
        <Text style={styles.hint}>Klicka på kartan eller flytta pin för att sätta projektets plats. Adress fylls i automatiskt.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111',
  },
  pendingText: { fontSize: 12, color: '#64748B' },
  hint: { fontSize: 11, color: '#64748B', marginTop: 6 },
  placeholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8 },
  placeholderText: { fontSize: 13, color: '#64748B' },
});
