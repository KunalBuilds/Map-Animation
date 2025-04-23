import React from 'react';
import MapComponent from './MapComponent';

function App() {
  return (
    <main style={{
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f5f5f7',
      minHeight: '100vh',
      margin: 0,
      overflow: 'hidden'
    }}>
      <header style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1001,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '10px 20px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
        fontSize: '20px',
        fontWeight: '600',
        color: '#333'
      }}>
        🗺️ Travel Explorer
      </header>
      <MapComponent />
    </main>
  );
}

export default App;
