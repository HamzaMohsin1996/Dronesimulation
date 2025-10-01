import { BsFire, BsPeopleFill, BsDropletFill, BsCamera } from 'react-icons/bs';
import ReactDOM from 'react-dom/client';

// Helper to build a DOM element for MapLibre
export function createEventMarker(label: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-marker';           // base class for CSS highlight
  const root = ReactDOM.createRoot(container);

  let Icon;
  switch (label) {
    case 'fire':
      Icon = BsFire;
      break;
    case 'person':
      Icon = BsPeopleFill;
      break;
    case 'chemical':
      Icon = BsDropletFill;
      break;
    case 'snapshot':
      Icon = BsCamera;
      break;
    default:
      Icon = BsCamera;
  }

  root.render(
    <div
      style={{
        background: '#fff',                     // default background
        borderRadius: '50%',
        border: '2px solid #0ea5e9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        // default icon color; can be overridden by .map-marker.active
        color:
          label === 'fire'
            ? '#ef4444'
            : label === 'chemical'
            ? '#eab308'
            : '#0ea5e9',
      }}
    >
      {/* use currentColor so CSS color changes affect the icon */}
      <Icon size={18} color="currentColor" />
    </div>
  );

  return container;
}
