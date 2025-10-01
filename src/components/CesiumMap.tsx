import React, { useRef, useEffect, useState } from 'react';
import { Viewer, Entity } from 'resium';
import {
  Viewer as CesiumViewer,
  Cartesian3,
  Ion,
  VerticalOrigin, // ✅
} from 'cesium';
import DroneIcon from '../assets/images/icons/drone.svg';

Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YTc0ZjA5Yi01N2E2LTQzYjItOWQ5MS0wM2E1MjMwOWNmNWIiLCJpZCI6MzI3NzI0LCJpYXQiOjE3NTQwMzczMzh9.pB0Sk5cuyEAWvTH21CWr3PJLlvWgyXBXTTafSVtG-0I';
(window as any).CESIUM_BASE_URL = '/Cesium';

const CesiumMap: React.FC = () => {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [markerPosition, setMarkerPosition] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    const lng = 11.5104;
    const lat = 48.7071;
    const height = 120;

    const position = Cartesian3.fromDegrees(lng, lat, height);
    setMarkerPosition(position);

    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({ destination: position });
    }
  }, []);

  return (
    <Viewer
      full
      ref={(element) => {
        viewerRef.current = element?.cesiumElement ?? null;
      }}
      baseLayerPicker={false}
    >
      {markerPosition && (
        <Entity
          name="Drone Marker"
          position={markerPosition}
          billboard={{
            image: DroneIcon,
            scale: 0.3,
            verticalOrigin: VerticalOrigin.BOTTOM,
          }}
        />
      )}
    </Viewer>
  );
};

export default CesiumMap;
