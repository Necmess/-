import { useState, useEffect } from 'react';

export interface LatLng {
  lat: number;
  lng: number;
}

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unavailable' | 'error';

export interface UserLocationState {
  latLng:    LatLng | null;
  status:    GeoStatus;
  errorMsg:  string | null;
}

export function useUserLocation(): UserLocationState {
  const [latLng,   setLatLng]   = useState<LatLng | null>(null);
  const [status,   setStatus]   = useState<GeoStatus>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setErrorMsg('이 브라우저는 위치 서비스를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatLng({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setStatus('granted');
        setErrorMsg(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setErrorMsg('위치 권한이 거부되었습니다. 브라우저 설정에서 위치를 허용해 주세요.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
          setErrorMsg('현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
        } else {
          setStatus('error');
          setErrorMsg('위치 정보를 가져오는 중 오류가 발생했습니다.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout:            8000,
        maximumAge:         60_000,
      },
    );
  }, []);

  return { latLng, status, errorMsg };
}
