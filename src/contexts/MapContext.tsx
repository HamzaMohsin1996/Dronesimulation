import React, { createContext, useContext } from 'react';
import type maplibregl from 'maplibre-gl';

const MapContext = createContext<maplibregl.Map | null>(null);
export const useMap = () => useContext(MapContext);
export const MapProvider = MapContext.Provider;
export default MapContext;
