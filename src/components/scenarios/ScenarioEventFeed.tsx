import React from 'react';
import ReengagementPage from '../pages/ReengagementPage';

export default function ScenarioEventFeed() {
  return (
    <div>
      {/* Sidebar feed code stays the same */}

      {/* Main area now shows the Reengagement map */}
      <main style={{ flex: 1, position: 'relative' }}>
        <ReengagementPage />
      </main>
    </div>
  );
}
