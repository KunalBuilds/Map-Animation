import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { gsap } from 'gsap';
import lottie from 'lottie-web';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './MapComponent.css';

// Lottie animations
import carAnimationData from './assets/car-animation.json';
import flightAnimationData from './assets/flight-animation.json';
import busAnimationData from './assets/bus-animation.json';
import footstepAnimationData from './assets/foot-animation.json';

// Set your MapBox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoia3VuYWxtZWVuYSIsImEiOiJjbTltNzAwNDAwMmJvMmtzZTUwaHI2MXMwIn0.cRcfXTUeMKqILouX8jU7EQ';

const MapComponent = () => {
  // Refs
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const textRef = useRef(null);
  const controlsRef = useRef(null);
  const animationRefs = useRef({});
  const waypointMarkerRefs = useRef([]);
  const animationFrameRef = useRef(null);
  // Wave layer refs
  const waveCanvasRef = useRef(null);
  const waveAnimationFrameId = useRef(null);
  const waveTime = useRef(0);

  // State
  const [waypoints, setWaypoints] = useState([
    { id: 'wp-0', place: '', mode: 'driving' },
    { id: 'wp-1', place: '', mode: 'driving' },
  ]);
  const [adminAreas, setAdminAreas] = useState([]);
  const [newAdminArea, setNewAdminArea] = useState({ name: '', type: 'country' });
  const [routeSegments, setRouteSegments] = useState([]);
  const [isGlobeView, setIsGlobeView] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState(
    localStorage.getItem('mapStyle') || 'mapbox://styles/mapbox/satellite-streets-v12'
  );
  const [cameraState, setCameraState] = useState({
    zoom: 3,
    pitch: 0,
    bearing: 0,
    center: [77.209, 28.6139],
  });
  const [mapLoaded, setMapLoaded] = useState(false);

  // Available map styles
  const mapStyles = [
    { name: 'Satellite', value: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { name: 'Dark', value: 'mapbox://styles/mapbox/navigation-night-v1' },
    { name: 'Moon', value: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Outdoors', value: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Cartoon', value: 'mapbox://styles/mapbox/streets-v12' },
  ];

  // Initialize transport animation
  const initAnimation = (container, animationData, options = {}) => {
    if (!container) return null;
    return lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData,
      ...options,
    });
  };

  // Realistic map transitions
  const transitionToGlobeView = () => {
    if (!mapRef.current || !mapLoaded) return;
    gsap.to(cameraState, {
      zoom: 1.5,
      pitch: 45,
      bearing: 30,
      duration: 3,
      ease: 'power3.inOut',
      onUpdate: () => {
        mapRef.current.jumpTo({
          center: cameraState.center,
          zoom: cameraState.zoom,
          pitch: cameraState.pitch,
          bearing: cameraState.bearing,
        });
      },
      onComplete: () => {
        if (mapRef.current.isStyleLoaded()) {
          mapRef.current.setProjection('globe');
          mapRef.current.setFog({
            color: 'rgb(186, 210, 235)',
            'horizon-blend': 0.05,
            'high-color': 'rgb(36, 92, 223)',
            'space-color': 'rgb(11, 11, 25)',
            'star-intensity': 0.8,
          });
          setIsGlobeView(true);
          if (textRef.current) {
            gsap.to(textRef.current, {
              opacity: 1,
              y: -50,
              duration: 2,
              ease: 'power2.out',
            });
          }
        }
      },
    });
  };

  const returnFromGlobeView = () => {
    return new Promise((resolve) => {
      if (!mapRef.current || !mapLoaded) return resolve();
      gsap.to(cameraState, {
        zoom: 3,
        pitch: 0,
        bearing: 0,
        duration: 3,
        ease: 'power3.inOut',
        onUpdate: () => {
          mapRef.current.jumpTo({
            center: cameraState.center,
            zoom: cameraState.zoom,
            pitch: cameraState.pitch,
            bearing: cameraState.bearing,
          });
        },
        onComplete: () => {
          if (mapRef.current.isStyleLoaded()) {
            mapRef.current.setProjection('mercator');
            setIsGlobeView(false);
            if (textRef.current) {
              gsap.to(textRef.current, {
                opacity: 0,
                y: 0,
                duration: 1,
                ease: 'power2.in',
                onComplete: resolve,
              });
            } else {
              resolve();
            }
          }
        },
      });
    });
  };

  // Get coordinates from place name
  const getCoordinates = async (place) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          place
        )}.json?access_token=${mapboxgl.accessToken}`
      );
      const data = await response.json();
      return data.features[0]?.center || null;
    } catch (error) {
      console.error('Error fetching coordinates:', error);
      return null;
    }
  };

  // Get boundary data
  const getBoundaryData = async (query, type) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=${type}&access_token=${mapboxgl.accessToken}`
      );
      const data = await response.json();
      return data.features[0];
    } catch (error) {
      console.error('Error fetching boundary data:', error);
      return null;
    }
  };

  // Add administrative boundary
  const addAdminArea = async () => {
    if (!newAdminArea.name.trim()) return;

    setLoading(true);
    const feature = await getBoundaryData(newAdminArea.name, newAdminArea.type);
    if (feature) {
      setAdminAreas([...adminAreas, {
        id: `admin-${Date.now()}`,
        name: feature.place_name,
        type: newAdminArea.type,
        coordinates: feature.geometry.coordinates,
        bbox: feature.bbox
      }]);
    }
    setLoading(false);
    setNewAdminArea({ name: '', type: 'country' });
  };

  // Remove administrative boundary
  const removeAdminArea = (id) => {
    setAdminAreas(adminAreas.filter(area => area.id !== id));
  };

  // Update boundary layers on map
  const updateBoundaryLayers = () => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing layers and sources
    ['countries', 'states', 'cities'].forEach(layer => {
      if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(layer)) map.removeSource(layer);
    });

    // Add new layers for each type
    adminAreas.forEach((area) => {
      const sourceId = `${area.type}-${area.id}`;
      const layerId = `${area.type}-layer-${area.id}`;
      
      if (map.getSource(sourceId)) return;

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: area.coordinates
          }
        }
      });

      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': area.type === 'country' ? '#4CAF50' : 
                       area.type === 'region' ? '#2196F3' : '#FF9800',
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });
    });
  };

  // Get route between points
  const getRoute = async (startCoord, endCoord, profile = 'driving') => {
    try {
      const validProfile = profile === 'flight' ? 'driving' : profile;
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/${validProfile}/${startCoord.join(
          ','
        )};${endCoord.join(',')}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );
      const data = await res.json();
      if (!data.routes || data.routes.length === 0) {
        console.error('No route found between points.');
        return [];
      }
      return data.routes[0].geometry.coordinates;
    } catch (error) {
      console.error('Error fetching route:', error);
      return [];
    }
  };

  // Create direct path with arc for flight mode
  const createDirectPath = (start, end, numPoints = 100) => {
    if (!start || !end || start.length !== 2 || end.length !== 2) {
      console.error('Invalid start or end coordinates for direct path:', start, end);
      return [];
    }
    const path = [];
    for (let i = 0; i <= numPoints; i++) {
      const fraction = i / numPoints;
      const lng = start[0] + (end[0] - start[0]) * fraction;
      const lat = start[1] + (end[1] - start[1]) * fraction;
      const arcHeight = Math.sin(fraction * Math.PI) * 0.2;
      path.push([lng, lat + arcHeight]);
    }
    return path;
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    gsap.to('body', {
      backgroundColor: newDarkMode ? '#121212' : '#f5f5f7',
      duration: 0.8,
    });
    gsap.to(controlsRef.current, {
      backgroundColor: newDarkMode ? 'rgba(33, 33, 33, 0.9)' : 'rgba(255, 255, 255, 0.9)',
      duration: 0.8,
    });
  };

  // Change map style and reload page
  const changeMapStyle = (style) => {
    localStorage.setItem('mapStyle', style);
    setMapStyle(style);
    window.location.reload();
  };

  // Update waypoint place or mode
  const updateWaypoint = (index, field, value) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index][field] = value;
    setWaypoints(newWaypoints);
  };

  // Add new waypoint
  const addWaypoint = () => {
    setWaypoints([...waypoints, { id: `wp-${waypoints.length}`, place: '', mode: 'driving' }]);
  };

  // Remove waypoint
  const removeWaypoint = (index) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((_, i) => i !== index));
  };

  // Handle drag-and-drop reordering
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newWaypoints = [...waypoints];
    const [reorderedItem] = newWaypoints.splice(result.source.index, 1);
    newWaypoints.splice(result.destination.index, 0, reorderedItem);
    setWaypoints(newWaypoints);
  };

  // Draw route with multiple waypoints and modes
  const drawRoute = async () => {
    const validWaypoints = waypoints.filter((wp) => wp.place.trim() !== '');
    if (validWaypoints.length < 2) {
      gsap.to('.waypoint-input', {
        x: [-5, 5, -5, 5, 0],
        duration: 0.6,
        ease: 'elastic.out(1, 0.5)',
      });
      return;
    }

    setLoading(true);
    gsap.to('.loader', { opacity: 1, duration: 0.3 });

    try {
      const coords = await Promise.all(
        validWaypoints.map(async (wp) => await getCoordinates(wp.place))
      );
      if (coords.some((c) => !c)) {
        alert("Couldn't find one or more locations. Please check place names.");
        return;
      }

      const segments = [];
      let allCoords = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const startCoord = coords[i];
        const endCoord = coords[i + 1];
        const mode = validWaypoints[i].mode;
        let segmentCoords =
          mode === 'flight'
            ? createDirectPath(startCoord, endCoord)
            : await getRoute(startCoord, endCoord, mode);
        if (segmentCoords.length === 0) {
          segmentCoords = createDirectPath(startCoord, endCoord);
        }
        segments.push({ coords: segmentCoords, mode });
        allCoords = [...allCoords, ...segmentCoords];
      }

      setRouteSegments(segments);
      updateRouteLayer(allCoords);

      cleanupMarkers();
      waypointMarkerRefs.current.forEach((marker) => marker?.remove());
      waypointMarkerRefs.current = [];

      coords.forEach((coord, i) => {
        const color = i === 0 ? '#4CAF50' : i === coords.length - 1 ? '#F44336' : '#FFC107';
        const marker = createRealisticMarker(coord, color);
        waypointMarkerRefs.current.push(marker);
      });

      createTransportMarker(coords[0], segments);

      const bounds = coords.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      mapRef.current.fitBounds(bounds, {
        padding: { top: 150, bottom: 150, left: 350, right: 150 },
        duration: 2000,
        essential: true,
      });

      if (isGlobeView) {
        await returnFromGlobeView();
      }
    } catch (error) {
      console.error('Error drawing route:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setLoading(false);
      gsap.to('.loader', { opacity: 0, duration: 0.3 });
    }
  };

  // Create transport marker with animation for multiple segments
  const createTransportMarker = (startCoord, segments) => {
    cleanupMarkers();
    const el = document.createElement('div');
    el.className = 'transport-marker';
    el.style.cssText = `
      width: 60px;
      height: 60px;
      position: relative;
    `;
    const marker = new mapboxgl.Marker({
      element: el,
      rotation: segments[0].mode === 'flight' ? 45 : 0,
    })
      .setLngLat(segments[0].coords[0])
      .addTo(mapRef.current);
    markerRef.current = marker;
    animateMarkerAcrossSegments(marker, segments);
  };

  // Animate marker across multiple segments
  const animateMarkerAcrossSegments = (marker, segments) => {
    if (!segments || segments.length === 0) {
      console.error('Invalid segments for animation:', segments);
      return;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    let segmentIndex = 0;
    let step = 0;
    let currentAnimation = null;
    const animateSegment = () => {
      if (segmentIndex >= segments.length) {
        console.log('Animation completed.');
        return;
      }
      const { coords, mode } = segments[segmentIndex];
      const totalSteps = coords.length;
      const animationSpeed =
        mode === 'flight' ? 2 : mode === 'walking' ? 0.5 : mode === 'cycling' ? 1 : 1.5;
      if (currentAnimation) {
        currentAnimation.destroy();
      }
      const animationData =
        mode === 'driving'
          ? carAnimationData
          : mode === 'walking'
          ? footstepAnimationData
          : mode === 'cycling'
          ? busAnimationData
          : flightAnimationData;
      currentAnimation = initAnimation(marker.getElement(), animationData);
      animationRefs.current.transport = currentAnimation;
      if (mode !== 'flight') {
        marker.setRotation(0);
      } else {
        marker.setRotation(45);
      }
      const animate = () => {
        if (step < totalSteps - 1) {
          marker.setLngLat(coords[step]);
          if (step < totalSteps - 1) {
            const startPoint = coords[step];
            const endPoint = coords[step + 1];
            const angle = getBearing(startPoint, endPoint);
            if (mode !== 'flight') {
              marker.setRotation(angle);
            }
          }
          step += animationSpeed;
          if (step >= totalSteps) {
            step = totalSteps - 1;
          }
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          segmentIndex++;
          step = 0;
          animateSegment();
        }
      };
      animate();
    };
    animateSegment();
  };

  // Calculate bearing between two points
  const getBearing = (start, end) => {
    const startLat = (start[1] * Math.PI) / 180;
    const startLng = (start[0] * Math.PI) / 180;
    const endLat = (end[1] * Math.PI) / 180;
    const endLng = (end[0] * Math.PI) / 180;
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x =
      Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return bearing;
  };

  // Update route layer
  const updateRouteLayer = (coords) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getSource('route')) {
      map.removeLayer('route');
      map.removeSource('route');
    }
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#ff4136',
        'line-width': 5,
        'line-opacity': 0,
      },
    });
    let opacity = { value: 0 };
    gsap.to(opacity, {
      value: 0.9,
      duration: 2,
      onUpdate: () => {
        if (map.getLayer('route')) {
          map.setPaintProperty('route', 'line-opacity', opacity.value);
        }
      },
    });
  };

  // Create realistic marker
  const createRealisticMarker = (coords, color) => {
    if (!coords || coords.length !== 2) {
      console.error('Invalid coordinates for marker:', coords);
      return null;
    }
    const el = document.createElement('div');
    el.className = 'realistic-marker';
    el.style.cssText = `
      width: 24px;
      height: 24px;
      background: ${color};
      border-radius: 50%;
      box-shadow: 0 0 20px ${color}80;
      transform: translateY(0);
      position: relative;
    `;
    gsap.to(el, {
      scale: 1.2,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    });
    return new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(mapRef.current);
  };

  // Clean up all existing markers
  const cleanupMarkers = () => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (animationRefs.current.transport) {
      animationRefs.current.transport.destroy();
      animationRefs.current.transport = null;
    }
  };

  // Initialize map
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: cameraState.center,
      zoom: cameraState.zoom,
      pitch: cameraState.pitch,
      bearing: cameraState.bearing,
      antialias: true,
      interactive: true,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.on('load', () => {
      setMapLoaded(true);
      map.setFog({
        color: 'rgb(186, 210, 235)',
        'horizon-blend': 0.1,
        'high-color': 'rgb(36, 92, 223)',
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.5,
      });
      map.setLight({
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.5,
      });
    });
    let zoomTimeout;
    map.on('zoom', () => {
      clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(() => {
        const currentZoom = map.getZoom();
        if (currentZoom < 1.8 && !isGlobeView) {
          transitionToGlobeView();
        } else if (currentZoom >= 3 && isGlobeView) {
          returnFromGlobeView();
        }
      }, 300);
    });
    const textContainer = document.createElement('div');
    textContainer.className = 'floating-text';
    textContainer.innerHTML = `
      <div class="neon-text">kunalBuilds</div>
      <div class="text-glow"></div>
    `;
    textContainer.style.opacity = '0';
    mapContainer.current.appendChild(textContainer);
    textRef.current = textContainer;
    const nav = new mapboxgl.NavigationControl({
      showCompass: true,
      visualizePitch: true,
    });
    map.addControl(nav, 'top-right');
    mapRef.current = map;
    return () => {
      clearTimeout(zoomTimeout);
      cleanupMarkers();
      waypointMarkerRefs.current.forEach((marker) => marker?.remove());
      Object.values(animationRefs.current).forEach((anim) => {
        if (anim && typeof anim.destroy === 'function') {
          anim.destroy();
        }
      });
      map.remove();
    };
  }, [mapStyle]);

  // Initialize wave layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const initWaveLayer = () => {
      const canvas = (waveCanvasRef.current = document.createElement('canvas'));
      const gl = mapRef.current.getCanvas().getContext('webgl');
      if (!gl) {
        console.error('WebGL context not available');
        return;
      }

      // Vertex buffer for full-screen quad
      const vertices = new Float32Array([
        -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
      ]);
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      // Wave layer configuration
      const waveLayer = {
        id: 'waves',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
          try {
            this.waveTexture = createWaveTexture(canvas);
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.program = createWaveShaderProgram(gl);
            this.vertexBuffer = vertexBuffer;
          } catch (error) {
            console.error('Error initializing wave layer:', error);
          }
        },
        render: function (gl, matrix) {
          try {
            waveTime.current += 0.01;
            updateWaveTexture(canvas, waveTime.current);

            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

            gl.useProgram(this.program.program);
            gl.uniform1f(this.program.uniforms.time, waveTime.current);
            gl.uniformMatrix4fv(this.program.uniforms.matrix, false, matrix);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.enableVertexAttribArray(this.program.attributes.pos);
            gl.vertexAttribPointer(this.program.attributes.pos, 2, gl.FLOAT, false, 0, 0);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            waveAnimationFrameId.current = requestAnimationFrame(() => this.render(gl, matrix));
          } catch (error) {
            console.error('Error rendering wave layer:', error);
          }
        },
        onRemove: function (gl) {
          if (waveAnimationFrameId.current) {
            cancelAnimationFrame(waveAnimationFrameId.current);
          }
          if (this.program) {
            gl.deleteProgram(this.program.program);
          }
          if (this.texture) {
            gl.deleteTexture(this.texture);
          }
          if (this.vertexBuffer) {
            gl.deleteBuffer(this.vertexBuffer);
          }
        },
      };

      try {
        mapRef.current.addLayer(waveLayer, 'water');
      } catch (error) {
        console.error('Error adding wave layer:', error);
      }
    };

    const createWaveTexture = (canvas) => {
      canvas.width = 512;
      canvas.height = 512;
      return canvas.getContext('2d');
    };

    const updateWaveTexture = (canvas, time) => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;

      for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        const y = canvas.height / 2 + Math.sin(time + i * 0.2) * 20;
        ctx.moveTo(0, y + Math.sin(time * 2 + i) * 5);
        for (let x = 0; x < canvas.width; x += 10) {
          const yOffset = Math.sin(x * 0.1 + time * 2 + i) * 5;
          ctx.lineTo(x, y + yOffset);
        }
        ctx.stroke();
      }
    };

    const createWaveShaderProgram = (gl) => {
      const vertexSource = `
        attribute vec2 a_pos;
        uniform mat4 u_matrix;
        varying vec2 v_pos;
        void main() {
          gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
          v_pos = a_pos;
        }
      `;

      const fragmentSource = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform float u_time;
        varying vec2 v_pos;
        void main() {
          vec2 uv = v_pos * 0.5 + 0.5;
          vec4 color = texture2D(u_texture, uv);
          color.a *= 0.5 * (sin(u_time * 2.0) * 0.5 + 0.5);
          gl_FragColor = color;
        }
      `;

      try {
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
          throw new Error('Vertex shader compilation failed: ' + gl.getShaderInfoLog(vertexShader));
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
          throw new Error('Fragment shader compilation failed: ' + gl.getShaderInfoLog(fragmentShader));
        }

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error('Shader program linking failed: ' + gl.getProgramInfoLog(program));
        }

        return {
          program,
          attributes: { pos: gl.getAttribLocation(program, 'a_pos') },
          uniforms: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            time: gl.getUniformLocation(program, 'u_time'),
          },
        };
      } catch (error) {
        console.error('Error creating shader program:', error);
        return null;
      }
    };

    initWaveLayer();

    return () => {
      if (waveAnimationFrameId.current) {
        cancelAnimationFrame(waveAnimationFrameId.current);
      }
      if (mapRef.current && mapRef.current.getLayer('waves')) {
        mapRef.current.removeLayer('waves');
      }
    };
  }, [mapLoaded]);

  // Update boundary layers when adminAreas change
  useEffect(() => {
    if (mapLoaded) {
      updateBoundaryLayers();
    }
  }, [adminAreas, mapLoaded]);

  return (
    <div className={`map-container ${darkMode ? 'dark-mode' : ''}`}>
      <div
        className="loader"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <div className="loader-spinner"></div>
      </div>

      <div
        ref={controlsRef}
        className="controls-panel"
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 10,
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
          width: '400px',
          backdropFilter: 'blur(12px)',
          transition: 'background-color 0.5s',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: darkMode ? '#fff' : '#333' }}>
            Earth Navigator
          </h2>
          <button
            onClick={toggleDarkMode}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              color: darkMode ? '#fff' : '#333',
              transition: 'transform 0.3s',
            }}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="search-container">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="waypoints">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {waypoints.map((wp, index) => (
                    <Draggable key={wp.id} draggableId={wp.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            marginBottom: '12px',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            ...provided.draggableProps.style,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: '#666',
                              fontSize: '20px',
                            }}
                          >
                            {index === 0 ? '🚩' : index === waypoints.length - 1 ? '📍' : '🔵'}
                          </div>
                          <input
                            className="waypoint-input"
                            placeholder={
                              index === 0
                                ? 'Starting point'
                                : index === waypoints.length - 1
                                ? 'Destination'
                                : 'Waypoint'
                            }
                            value={wp.place}
                            onChange={(e) => updateWaypoint(index, 'place', e.target.value)}
                            style={{
                              padding: '14px 12px 14px 40px',
                              width: '60%',
                              borderRadius: '10px',
                              border: '1px solid #ddd',
                              backgroundColor: '#fff',
                              color: '#333',
                              fontSize: '16px',
                              marginRight: '8px',
                            }}
                          />
                          {index < waypoints.length - 1 && (
                            <select
                              value={wp.mode}
                              onChange={(e) => updateWaypoint(index, 'mode', e.target.value)}
                              style={{
                                padding: '14px',
                                width: '30%',
                                borderRadius: '10px',
                                border: '1px solid #ddd',
                                backgroundColor: '#fff',
                                color: '#333',
                                fontSize: '16px',
                              }}
                            >
                              <option value="driving">🚗 Car</option>
                              <option value="walking">🚶 Walk</option>
                              <option value="cycling">🚲 Cycle</option>
                              <option value="flight">✈️ Flight</option>
                            </select>
                          )}
                          {waypoints.length > 2 && (
                            <button
                              onClick={() => removeWaypoint(index)}
                              style={{
                                marginLeft: '8px',
                                padding: '8px',
                                backgroundColor: '#ff4136',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <button
            onClick={addWaypoint}
            style={{
              padding: '10px',
              width: '100%',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#2ecc40',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              marginTop: '10px',
            }}
          >
            + Add Waypoint
          </button>
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{ fontSize: '16px', color: darkMode ? '#fff' : '#333', marginRight: '10px' }}>
            Map Style:
          </label>
          <select
            value={mapStyle}
            onChange={(e) => changeMapStyle(e.target.value)}
            style={{
              padding: '10px',
              width: '100%',
              borderRadius: '10px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              color: '#333',
              fontSize: '16px',
            }}
          >
            {mapStyles.map((style) => (
              <option key={style.value} value={style.value}>
                {style.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={drawRoute}
          style={{
            padding: '14px 20px',
            width: '100%',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#4a90e2',
            color: 'white',
            fontWeight: '600',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            marginTop: '20px',
          }}
        >
          Create Route
        </button>

        <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <h3 style={{ marginBottom: '15px', color: darkMode ? '#fff' : '#333' }}>Administrative Boundaries</h3>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <input
              value={newAdminArea.name}
              onChange={(e) => setNewAdminArea({...newAdminArea, name: e.target.value})}
              placeholder="Search country/state/city"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                backgroundColor: darkMode ? '#333' : '#fff',
                color: darkMode ? '#fff' : '#333'
              }}
            />
            <select
              value={newAdminArea.type}
              onChange={(e) => setNewAdminArea({...newAdminArea, type: e.target.value})}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                backgroundColor: darkMode ? '#333' : '#fff',
                color: darkMode ? '#fff' : '#333'
              }}
            >
              <option value="country">Country</option>
              <option value="region">State/Region</option>
              <option value="place">City</option>
            </select>
            <button
              onClick={addAdminArea}
              style={{
                padding: '10px 15px',
                backgroundColor: '#9C27B0',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Add
            </button>
          </div>

          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {adminAreas.map((area) => (
              <div key={area.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px',
                margin: '5px 0',
                borderRadius: '8px',
                backgroundColor: darkMode ? '#333' : '#f5f5f5'
              }}>
                <div>
                  <span style={{ 
                    color: area.type === 'country' ? '#4CAF50' : 
                           area.type === 'region' ? '#2196F3' : '#FF9800',
                    marginRight: '10px'
                  }}>
                    {area.type === 'country' ? '🌍' : 
                     area.type === 'region' ? '🗺️' : '🏙️'}
                  </span>
                  {area.name}
                </div>
                <button
                  onClick={() => removeAdminArea(area.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ff4136',
                    cursor: 'pointer',
                    padding: '5px'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={mapContainer}
        className="advanced-map"
        style={{
          height: '100vh',
          width: '100vw',
          filter: darkMode ? 'brightness(0.9) contrast(1.1)' : 'none',
          transition: 'filter 0.5s',
        }}
      />
    </div>
  );
};

export default MapComponent;