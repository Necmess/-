import { useEffect, useRef } from 'react';
import type { Place } from '../types/triage';
import type { LatLng } from '../hooks/useUserLocation';

declare global {
  interface Window {
    L?: any;
  }
}

let leafletLoadPromise: Promise<void> | null = null;

function ensureLeafletLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const cssId = 'leaflet-css-cdn';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const scriptId = 'leaflet-js-cdn';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Leaflet script load failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Leaflet script load failed'));
    document.body.appendChild(script);
  });

  return leafletLoadPromise;
}

interface LeafletMapProps {
  center: LatLng | null;
  places: Place[];
  onPlaceClick: (place: Place, rank: number, source: 'map') => void;
}

export default function LeafletMap({ center, places, onPlaceClick }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    void ensureLeafletLoaded()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const L = window.L;
        mapRef.current = L.map(containerRef.current, { zoomControl: true }).setView(
          [center?.lat ?? 37.5665, center?.lng ?? 126.9780],
          14,
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapRef.current);
      })
      .catch((err) => console.error('[map]', err));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const map = mapRef.current;
    const L = window.L;

    for (const layer of layersRef.current) map.removeLayer(layer);
    layersRef.current = [];

    if (center) {
      map.setView([center.lat, center.lng], Math.max(map.getZoom?.() ?? 14, 14));
      const me = L.circleMarker([center.lat, center.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#1976D2',
        fillOpacity: 1,
      }).addTo(map);
      me.bindTooltip('내 위치', { direction: 'top', offset: [0, -8] });
      layersRef.current.push(me);
    }

    places.forEach((place, i) => {
      const color =
        place.open_status === 'OPEN'
          ? '#16A34A'
          : place.open_status === 'CLOSED'
          ? '#DC2626'
          : '#F59E0B';

      const marker = L.circleMarker([place.lat, place.lng], {
        radius: i === 0 ? 10 : 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.92,
      }).addTo(map);

      marker.bindPopup(
        `<strong>${i + 1}. ${place.name}</strong><br/>${place.distance_km.toFixed(2)} km<br/>${place.address}`,
      );
      marker.on('click', () => onPlaceClick(place, i + 1, 'map'));
      layersRef.current.push(marker);
    });
  }, [center, places, onPlaceClick]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
