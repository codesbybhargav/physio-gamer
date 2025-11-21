import React, { useRef, useEffect, useState } from 'react';

// --- 1. UTILITY: Load MediaPipe from Google's CDN ---
const useScript = (url) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [url]);
  return loaded;
};

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Game State
  const [gameStatus, setGameStatus] = useState('WAITING'); // WAITING, PLAYING, GAME_OVER
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("Initializing AI...");
  const [useSimulation, setUseSimulation] = useState(false);
  const [simSquat, setSimSquat] = useState(0);

  // Load AI Libraries
  const poseScriptLoaded = useScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
  const cameraScriptLoaded = useScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
  const drawingScriptLoaded = useScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");

  // Physics Refs (Variables that change constantly without re-rendering)
  const playerY = useRef(300);
  const playerVelocity = useRef(0);
  const obstacles = useRef([]);
  const gameSpeed = useRef(5);
  const squatDepth = useRef(0); // 0 = Stand, 1 = Deep Squat

  // --- 2. MATH: Calculate Angle ---
  const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  };

  // --- 3. VISION PIPELINE ---
  useEffect(() => {
    if (!poseScriptLoaded || !cameraScriptLoaded || !drawingScriptLoaded) return;

    const Pose = window.Pose;
    const Camera = window.Camera;
    const drawConnectors = window.drawConnectors;
    const drawLandmarks = window.drawLandmarks;
    const POSE_CONNECTIONS = window.POSE_CONNECTIONS;

    const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
    
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults((results) => {
      if (!canvasRef.current) return;

      // Update Squat Depth from Simulation Slider if enabled
      if (useSimulation) squatDepth.current = simSquat;

      const ctx = canvasRef.current.getContext('2d');
      const { width, height } = canvasRef.current;

      // Clear Canvas
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Draw Background (Video or Solid Color)
      if (!useSimulation) {
        ctx.globalAlpha = 0.6; 
        ctx.drawImage(results.image, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.font = "30px Arial";
        ctx.fillText("SIMULATION MODE", 180, 240);
      }

      // Draw Skeleton & Calculate Squat
      if (results.poseLandmarks && !useSimulation) {
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(ctx, results.poseLandmarks, {color: '#FF0000', lineWidth: 2});

        // Extract Landmarks: 23(Hip), 25(Knee), 27(Ankle)
        const leftHip = results.poseLandmarks[23];
        const leftKnee = results.poseLandmarks[25];
        const leftAnkle = results.poseLandmarks[27];

        if (leftHip.visibility > 0.5 && leftKnee.visibility > 0.5 && leftAnkle.visibility > 0.5) {
          const angle = calculateAngle(leftHip, leftKnee, leftAnkle);
          
          // Map Angle to Squat Depth (170° = 0, 90° = 1)
          let normalized = 0;
          if (angle < 100) normalized = 1;
          else if (angle > 170) normalized = 0;
          else normalized = (170 - angle) / 70;
          
          squatDepth.current = normalized;
        }
      }

      // Feedback Logic
      const d = squatDepth.current;
      if (d > 0.8) setFeedback("MAX POWER! 🚀");
      else if (d > 0.3) setFeedback("GO LOWER! 📉");
      else setFeedback("SQUAT TO FLY 🦅");

      ctx.restore();
    });

    // Initialize Camera
    if (!useSimulation && videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => { await pose.send({image: videoRef.current}); },
        width: 640,
        height: 480
      });
      
      camera.start()
        .then(() => setFeedback("Camera Active! Step Back."))
        .catch(err => {
          console.error("Camera failed", err);
          setUseSimulation(true);
          setFeedback("Camera Denied. Switching to Sim.");
        });
    } else if (useSimulation) {
      // Keep the loop alive for Simulation Mode
      const loop = setInterval(() => pose.onResults({image: null, poseLandmarks: null}), 100);
      return () => clearInterval(loop);
    }

  }, [poseScriptLoaded, cameraScriptLoaded, drawingScriptLoaded, useSimulation]);

  // --- 4. GAME LOOP (60 FPS) ---
  useEffect(() => {
    const loop = () => {
      if (gameStatus === 'PLAYING') {
        // Physics Engine
        const lift = squatDepth.current * 1.5; // Upward force based on squat
        const gravity = 0.5; // Downward force
        
        playerVelocity.current -= lift;
        playerVelocity.current += gravity;
        playerY.current += playerVelocity.current;

        // Floor & Ceiling Collision
        if (playerY.current > 440) { playerY.current = 440; playerVelocity.current = 0; }
        if (playerY.current < 0) { playerY.current = 0; playerVelocity.current = 0; }

        // Spawn Obstacles randomly
        if (Math.random() < 0.015) {
          obstacles.current.push({ x: 640, y: Math.random() * 250 + 100, w: 40, h: 120 });
        }

        // Move Obstacles
        obstacles.current.forEach((obs, i) => {
          obs.x -= gameSpeed.current;
          
          // Collision Detection (Simple Box Overlap)
          if (
            50 < obs.x + obs.w && 
            90 > obs.x && 
            playerY.current < obs.y + obs.h && 
            playerY.current + 40 > obs.y
          ) {
             // Collision Logic (Flash screen, reduce score, etc.)
             // For now, we just log it
             console.log("CRASH!");
          }

          // Remove off-screen obstacles & Add Score
          if (obs.x + obs.w < 0) {
            obstacles.current.splice(i, 1);
            setScore(s => s + 1);
          }
        });
      }

      // Render Game Elements (Player & Obstacles)
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        // Draw Player
        ctx.fillStyle = '#FACC15'; // Yellow-400
        ctx.fillRect(50, playerY.current, 40, 40);
        
        // Draw Obstacles
        ctx.fillStyle = '#EF4444'; // Red-500
        obstacles.current.forEach(obs => ctx.fillRect(obs.x, obs.y, obs.w, obs.h));
      }

      requestAnimationFrame(loop);
    };
    const anim = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(anim);
  }, [gameStatus]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white font-sans select-none">
      <h1 className="text-5xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 drop-shadow-lg">
        PHYSIO-GAMER 🏋️‍♂️
      </h1>
      
      <div className="relative border-4 border-cyan-500 rounded-xl overflow-hidden shadow-2xl bg-black w-[640px] h-[480px]">
        {/* Hidden Video Element for MediaPipe */}
        <video ref={videoRef} className="absolute opacity-0 pointer-events-none" width="640" height="480" playsInline muted />
        
        {/* Main Game Canvas */}
        <canvas ref={canvasRef} width="640" height="480" className="bg-gray-900" />

        {/* HUD Overlays */}
        <div className="absolute top-4 left-4 bg-black/60 px-4 py-2 rounded-lg text-2xl font-mono font-bold text-yellow-400 border border-yellow-400/30">
          SCORE: {score}
        </div>
        
        <div className="absolute bottom-8 w-full text-center pointer-events-none">
          <span className="inline-block bg-blue-600/90 px-8 py-3 rounded-full text-2xl font-bold animate-pulse shadow-[0_0_20px_rgba(37,99,235,0.5)] border-2 border-white/20">
            {feedback}
          </span>
        </div>

        {/* Start Screen Overlay */}
        {gameStatus === 'WAITING' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm">
            <button 
              onClick={() => setGameStatus('PLAYING')}
              className="px-12 py-6 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white text-4xl font-black rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-200 border-4 border-green-400/30"
            >
              START GAME
            </button>
            <p className="mt-6 text-gray-300 text-lg font-medium">Allow Camera • Step Back • Squat to Fly</p>
          </div>
        )}
      </div>

      {/* Simulation Controls (Manual Override) */}
      <div className="mt-8 p-6 bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl w-[640px] flex items-center justify-between shadow-lg">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input 
              type="checkbox" 
              checked={useSimulation} 
              onChange={(e) => setUseSimulation(e.target.checked)} 
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-cyan-500"></div>
          </div>
          <span className="text-cyan-300 font-bold group-hover:text-cyan-200 transition-colors">Manual Sim Mode</span>
        </label>

        {useSimulation && (
          <div className="flex items-center gap-4 w-2/3 animate-fade-in">
            <span className="text-xs font-mono text-gray-400">STAND</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={simSquat} 
              onChange={(e) => { 
                setSimSquat(parseFloat(e.target.value)); 
                squatDepth.current = parseFloat(e.target.value); 
              }}
              className="w-full h-3 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-yellow-400 hover:accent-yellow-300" 
            />
            <span className="text-xs font-mono text-gray-400">SQUAT</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;