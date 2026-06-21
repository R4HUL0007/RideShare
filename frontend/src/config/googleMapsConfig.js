// Google Maps API configuration - CONSTANT (never recreate)
export const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry'];
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * Premium dark map theme — matches the RidexShare black-and-white design system
 * (black surfaces, white/gray text, dark roads). Kept as a module-level
 * constant so the reference is stable across renders.
 */
export const DARK_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#0f0f10' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f10' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2b2b2e' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#c9c9cf' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d4d4d8' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1a1a1d' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8b8b91' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#16201a' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b7f6e' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#26262a' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a1d' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a40' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#26262a' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#d4d4d8' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2b2b2e' }] },
    { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0f1a' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5a80' }] },
];
