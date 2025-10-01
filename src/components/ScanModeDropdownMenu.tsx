import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

type ScanMode = 'CLICK' | 'STREET_SEGMENT' | 'AOI' | 'POI';

export default function ScanModeDropdownMenu({
  onSelectMode,
}: {
  onSelectMode: (mode: ScanMode) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 9999,
            pointerEvents: 'auto',
            backgroundColor: '#0a84ff',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          ☰ Scan Mode
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        sideOffset={5}
        style={{
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: 6,
          padding: 4,
          minWidth: 160,
          zIndex: 3000,
        }}
      >
        <DropdownMenu.Item onSelect={() => onSelectMode('CLICK')} style={itemStyle}>
          📍 Click Point
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onSelectMode('STREET_SEGMENT')} style={itemStyle}>
          🛣️ Street Segment
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onSelectMode('AOI')} style={itemStyle}>
          🔲 Area of Interest
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onSelectMode('POI')} style={itemStyle}>
          🔍 Search POI
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

const itemStyle: React.CSSProperties = {
  padding: '6px 10px',
  cursor: 'pointer',
  userSelect: 'none',
};
