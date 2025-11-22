import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameMode, GameState, Difficulty } from '../types';
import { calculateAngle, normalize } from '../utils/math';

// Declare globals for MediaPipe loaded via CDN
declare global {
  interface Window {
    Pose: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    POSE_CONNECTIONS: any;
  }
}

interface GameCanvasProps {
  mode: GameMode;
  onExit: () => void;
}

// Particle Interface for Sparkles
interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  type: 'circle' | 'star'; // Added shape type
}

// Enhanced Obstacle Interface
interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'block' | 'floating';
  color: string;
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export const GameCanvas: React.FC<GameCanvasProps> = ({ mode, onExit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [gameState, setGameState] = useState<GameState>(GameState.TUTORIAL);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [feedback, setFeedback] = useState("Loading Vision Models...");
  const [isSimulation, setIsSimulation] = useState(false);
  const [simIntensity, setSimIntensity] = useState(0); // 0-1 slider for debugging
  const [showCamera, setShowCamera] = useState(true);

  // Game Physics State (Refs for performance)
  const playerY = useRef(CANVAS_HEIGHT / 2);
  const playerVelocity = useRef(0);
  const intensityRef = useRef(0); // 0 to 1 (1 = full extension/squat)
  const wasJumpingRef = useRef(false); // To track rising edge of movement for SFX
  const obstacles = useRef<Obstacle[]>([]);
  const gameSpeed = useRef(6);
  const frameRef = useRef(0);
  
  // Visual Effects State
  const sparklesRef = useRef<Sparkle[]>([]);
  
  // Animation Frame Ref to prevent zombie loops
  const requestRef = useRef<number>(0);

  // Audio Context Ref (Persistent)
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Helper to load scripts
  const loadScript = (url: string) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  // --- Sparkle Effect Generator ---
  const createSparkles = useCallback(() => {
    const colors = ['#FFD700', '#FF4500', '#00BFFF', '#FFFFFF', '#F72585', '#4CC9F0'];
    for (let i = 0; i < 40; i++) {
      sparklesRef.current.push({
        x: CANVAS_WIDTH / 2,
        y: 120, // Centered near the score
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        size: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        decay: Math.random() * 0.02 + 0.01,
        type: 'star'
      });
    }
  }, []);

  // --- Sound Effects System (Kenney Digital Audio Style) ---
  const playSound = useCallback((type: 'score' | 'gameover' | 'start' | 'jump') => {
    try {
      // Lazy initialization of AudioContext
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
           audioCtxRef.current = new AudioContext();
        }
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      // Ensure context is running (browsers sometimes suspend it until user interaction)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      switch (type) {
        case 'score':
          // Retro "Coin" Sound: Two fast tones (B5 -> E6)
          // Matches Kenney 'digital_powerup' style
          osc.type = 'square';
          osc.frequency.setValueAtTime(987.77, t); // B5
          osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6
          
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.setValueAtTime(0.1, t + 0.08);
          gain.gain.linearRampToValueAtTime(0, t + 0.16);
          
          osc.start(t);
          osc.stop(t + 0.16);
          break;

        case 'gameover':
          // Retro "Crash": Descending Sawtooth
          // Matches Kenney 'digital_fall' or 'digital_lose'
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, t);
          osc.frequency.exponentialRampToValueAtTime(10, t + 0.4);
          
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          
          osc.start(t);
          osc.stop(t + 0.4);
          break;

        case 'start':
          // Retro "Ready": Rising Triad Arpeggio
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t); // A4
          osc.frequency.setValueAtTime(554.37, t + 0.1); // C#5
          osc.frequency.setValueAtTime(659.25, t + 0.2); // E5
          
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.4);
          
          osc.start(t);
          osc.stop(t + 0.4);
          break;

        case 'jump':
          // Retro "Jump": Square wave pitch slide up
          // Matches Kenney 'digital_jump'
          osc.type = 'square';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.linearRampToValueAtTime(350, t + 0.1);
          
          gain.gain.setValueAtTime(0.05, t); // Low volume to not be annoying
          gain.gain.linearRampToValueAtTime(0, t + 0.1);
          
          osc.start(t);
          osc.stop(t + 0.1);
          break;
      }
    } catch (e) {
      console.error("Audio play failed", e);
    }
  }, []);

  // --- MediaPipe Initialization ---
  useEffect(() => {
    let camera: any = null;
    let pose: any = null;

    const initMediaPipe = async () => {
      try {
        await Promise.all([
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js")
        ]);

        setFeedback("Initializing AI...");

        pose = new window.Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(onPoseResults);

        if (videoRef.current) {
          camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && !isSimulation) {
                await pose.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          
          try {
            await camera.start();
            setFeedback("Stand back & fit in frame");
            setTimeout(() => {
               setFeedback(prev => prev === "Stand back & fit in frame" ? "Ready? Start Moving!" : prev);
            }, 2000);
          } catch (e) {
            console.error("Camera failed, using simulation", e);
            setIsSimulation(true);
            setFeedback("Camera unavailable. Using Simulation Mode.");
          }
        }
      } catch (error) {
        console.error("Failed to load MediaPipe", error);
        setIsSimulation(true);
      }
    };

    if (!isSimulation) {
        initMediaPipe();
    } else {
        const interval = setInterval(() => {
           onPoseResults({ poseLandmarks: null, image: null });
        }, 50);
        return () => clearInterval(interval);
    }

    return () => {
       if (camera) camera.stop();
       if (pose) pose.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulation]);


  // --- Pose Analysis Logic ---
  const onPoseResults = (results: any) => {
    let currentIntensity = 0;

    if (isSimulation) {
        currentIntensity = simIntensity;
    } else if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        
        if (mode === GameMode.SQUAT) {
            const angle = calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
            currentIntensity = normalize(angle, 160, 70, true); 
        } else if (mode === GameMode.ARM_RAISE) {
            const nose = landmarks[0];
            const leftWrist = landmarks[15];
            const rightWrist = landmarks[16];
            
            const leftHigh = leftWrist.y < nose.y;
            const rightHigh = rightWrist.y < nose.y;
            
            if (leftHigh && rightHigh) currentIntensity = 1.0;
            else if (leftHigh || rightHigh) currentIntensity = 0.5;
            else currentIntensity = 0.0;
        } else if (mode === GameMode.LUNGE) {
            const lKneeAngle = calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
            const rKneeAngle = calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
            
            const lIntensity = normalize(lKneeAngle, 160, 90, true);
            const rIntensity = normalize(rKneeAngle, 160, 90, true);
            currentIntensity = Math.max(lIntensity, rIntensity);
        }
    }

    // Smooth the intensity
    intensityRef.current = intensityRef.current * 0.8 + currentIntensity * 0.2;

    // Sound Trigger for Exertion (JUMP)
    if (intensityRef.current > 0.6 && !wasJumpingRef.current) {
        playSound('jump');
        wasJumpingRef.current = true;
    } else if (intensityRef.current < 0.4) {
        wasJumpingRef.current = false;
    }

    if (intensityRef.current > 0.8) setFeedback("EXCELLENT FORM! 🔥");
    else if (intensityRef.current > 0.4) setFeedback("Keep Going...");
    else if (gameState === GameState.PLAYING) setFeedback("Move to Fly!");
  };

  // --- Game Loop ---
  const updateGame = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#4CC9F0');
    gradient.addColorStop(1, '#4361EE');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(200, 150, 60, 0, Math.PI * 2);
    ctx.arc(280, 150, 80, 0, Math.PI * 2);
    ctx.arc(360, 150, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(900, 100, 40, 0, Math.PI * 2);
    ctx.arc(960, 100, 60, 0, Math.PI * 2);
    ctx.fill();


    if (gameState === GameState.PLAYING) {
        // Physics Parameters
        let gravity = 0.5;
        let liftMultiplier = 1.8;
        let spawnRate = 100;
        let speedIncrement = 0.05;

        switch (difficulty) {
            case Difficulty.EASY:
                gravity = 0.12;        // Very floaty
                liftMultiplier = 4.0;  // Super responsive
                spawnRate = 300;       // Very sparse obstacles
                speedIncrement = 0.002;// Game barely speeds up
                break;
            case Difficulty.MEDIUM:
                gravity = 0.5;
                liftMultiplier = 1.8;
                spawnRate = 100;
                speedIncrement = 0.05;
                break;
            case Difficulty.HARD:
                gravity = 1.1;         // Heavy gravity
                liftMultiplier = 1.1;  // Weak legs required strong effort
                spawnRate = 40;        // Bullet hell
                speedIncrement = 0.15; // Rapid acceleration
                break;
        }

        // Player Physics
        const lift = intensityRef.current * liftMultiplier; 
        playerVelocity.current -= lift;
        playerVelocity.current += gravity;
        playerVelocity.current = Math.max(-15, Math.min(15, playerVelocity.current));
        playerY.current += playerVelocity.current;

        // Boundaries
        if (playerY.current > CANVAS_HEIGHT - 60) {
            playerY.current = CANVAS_HEIGHT - 60;
            playerVelocity.current = 0;
        }
        if (playerY.current < 0) {
            playerY.current = 0;
            playerVelocity.current = 0;
        }

        // --- Dynamic Spawn Logic ---
        if (frameRef.current % spawnRate === 0) {
             const isAdvancedLevel = score >= 10;
             const rand = Math.random();

             if (isAdvancedLevel && rand > 0.6) {
                // TYPE A: The Gate (Top and Bottom Pillars with gap)
                const gapSize = difficulty === Difficulty.EASY ? 300 : (difficulty === Difficulty.MEDIUM ? 180 : 150);
                const gapY = Math.random() * (CANVAS_HEIGHT - gapSize - 100) + 50;
                
                // Top part
                obstacles.current.push({
                    x: CANVAS_WIDTH,
                    y: 0,
                    w: 60,
                    h: gapY,
                    type: 'block',
                    color: '#7209B7' // Purple for Gates
                });
                // Bottom part
                obstacles.current.push({
                    x: CANVAS_WIDTH,
                    y: gapY + gapSize,
                    w: 60,
                    h: CANVAS_HEIGHT - (gapY + gapSize),
                    type: 'block',
                    color: '#7209B7'
                });

             } else if (isAdvancedLevel && rand > 0.4) {
                // TYPE B: Floating Crate (Middle of screen)
                const size = 80;
                obstacles.current.push({
                    x: CANVAS_WIDTH,
                    y: Math.random() * (CANVAS_HEIGHT - 200) + 100,
                    w: size,
                    h: size,
                    type: 'floating',
                    color: '#FF9F1C' // Orange for floating hazards
                });
             } else {
                 // TYPE C: Classic Pillar (Top or Bottom)
                 const isTop = Math.random() > 0.5;
                 const height = Math.random() * 200 + 100;
                 obstacles.current.push({
                     x: CANVAS_WIDTH,
                     y: isTop ? 0 : CANVAS_HEIGHT - height,
                     w: 60,
                     h: height,
                     type: 'block',
                     color: '#F72585' // Pink for standard
                 });
             }
             
             gameSpeed.current += speedIncrement;
        }

        // Update Obstacles
        for (let i = obstacles.current.length - 1; i >= 0; i--) {
            const obs = obstacles.current[i];
            obs.x -= gameSpeed.current;

            // Collision Check
            if (
                200 + 30 > obs.x && 
                200 - 30 < obs.x + obs.w &&
                playerY.current + 30 > obs.y &&
                playerY.current - 30 < obs.y + obs.h
            ) {
                playSound('gameover');
                setGameState(GameState.GAME_OVER);
                if (score > highScore) setHighScore(score);
            }

            if (obs.x + obs.w < 0) {
                obstacles.current.splice(i, 1);
                setScore(prev => {
                    const newScore = prev + 1;
                    if (newScore > 0 && newScore % 10 === 0) {
                        playSound('score');
                        createSparkles(); 
                    }
                    return newScore;
                });
            }
        }
    }

    // Draw Sparkles
    for (let i = sparklesRef.current.length - 1; i >= 0; i--) {
      const s = sparklesRef.current[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.2; // Gravity
      s.alpha -= s.decay;

      if (s.alpha <= 0) {
        sparklesRef.current.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        
        // Glowing Effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = s.color;

        ctx.beginPath();
        if (s.type === 'star') {
           // Draw Star
           ctx.moveTo(s.x, s.y - s.size);
           ctx.lineTo(s.x + s.size * 0.3, s.y - s.size * 0.3);
           ctx.lineTo(s.x + s.size, s.y);
           ctx.lineTo(s.x + s.size * 0.3, s.y + s.size * 0.3);
           ctx.lineTo(s.x, s.y + s.size);
           ctx.lineTo(s.x - s.size * 0.3, s.y + s.size * 0.3);
           ctx.lineTo(s.x - s.size, s.y);
           ctx.lineTo(s.x - s.size * 0.3, s.y - s.size * 0.3);
        } else {
           // Draw Circle
           ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow
        ctx.restore();
      }
    }

    // Draw Obstacles
    obstacles.current.forEach(obs => {
        ctx.fillStyle = obs.color;
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
        ctx.fill();
        ctx.stroke();
        
        // Add detail based on type
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        if (obs.type === 'floating') {
            // X mark for crates
            ctx.beginPath();
            ctx.moveTo(obs.x + 10, obs.y + 10);
            ctx.lineTo(obs.x + obs.w - 10, obs.y + obs.h - 10);
            ctx.moveTo(obs.x + obs.w - 10, obs.y + 10);
            ctx.lineTo(obs.x + 10, obs.y + obs.h - 10);
            ctx.stroke();
        } else {
            // Standard bevel
            ctx.fillRect(obs.x + 10, obs.y + 10, obs.w - 20, obs.h - 20);
        }
    });

    // Draw Player
    const pX = 200;
    const pY = playerY.current;
    
    ctx.save();
    ctx.translate(pX, pY);
    ctx.rotate(playerVelocity.current * 0.05);

    // Body
    ctx.fillStyle = '#FFD93D'; 
    ctx.beginPath();
    ctx.roundRect(-30, -30, 60, 60, 15);
    ctx.fill();
    
    // Face
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.arc(10, -5, 8, 0, Math.PI * 2);
    ctx.arc(-10, -5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(12, -7, 3, 0, Math.PI * 2);
    ctx.arc(-8, -7, 3, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    if (intensityRef.current > 0.5) {
         ctx.ellipse(0, 15, 8, 10, 0, 0, Math.PI * 2);
    } else {
         ctx.ellipse(0, 15, 8, 3, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.restore();

    // Tutorial UI
    if (gameState === GameState.TUTORIAL) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0,0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.font = "bold 48px Fredoka";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText("GET READY!", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 100);
        
        ctx.font = "30px Fredoka";
        const instructions = 
            mode === GameMode.SQUAT ? "Squat deep to fly UP!" : 
            mode === GameMode.ARM_RAISE ? "Raise hands to fly UP!" :
            "Lunge deep to fly UP!";
        ctx.fillText(instructions, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 40);
        ctx.fillText("Stand still to fall.", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
    }

    frameRef.current++;
    requestRef.current = requestAnimationFrame(updateGame);

  }, [gameState, mode, difficulty, playSound, createSparkles, score, highScore]); 


  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateGame);
    return () => cancelAnimationFrame(requestRef.current);
  }, [updateGame]);


  // --- Game Control Handlers ---
  const startGame = () => {
      setScore(0);
      playerY.current = CANVAS_HEIGHT / 2;
      obstacles.current = [];
      sparklesRef.current = []; 
      playerVelocity.current = 0;
      
      // Initialize speeds based on selected difficulty
      if (difficulty === Difficulty.EASY) gameSpeed.current = 3;
      else if (difficulty === Difficulty.MEDIUM) gameSpeed.current = 6;
      else gameSpeed.current = 10;
      
      playSound('start');
      setGameState(GameState.PLAYING);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Top HUD */}
      <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-slate-900/90 to-transparent z-20 flex justify-between items-start pt-4 px-8 pointer-events-none">
        {/* Left: Back & Mode */}
        <div className="flex items-center gap-4 pointer-events-auto">
           <button onClick={onExit} className="bg-white/20 hover:bg-white/40 text-white p-3 rounded-full backdrop-blur-sm transition shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>
           <div className="flex flex-col">
               <div className="text-white font-bold text-lg tracking-wide bg-blue-600/90 px-4 py-1 rounded-lg shadow-md border border-blue-400/30">
                  {mode.replace('_', ' ')}
               </div>
               <span className="text-[10px] text-blue-200 font-mono uppercase mt-1 ml-1 tracking-wider">{difficulty} MODE</span>
           </div>
        </div>

        {/* Center: Score Board */}
        <div className="flex flex-col items-center transform -translate-y-2">
            <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-500 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] font-sans">
              {score}
            </div>
            <div className="text-xs font-bold text-white/60 tracking-widest uppercase">Current Score</div>
        </div>

        {/* Right: Camera & High Score */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
            <div className="text-right pr-2">
                 <div className="text-2xl font-bold text-white drop-shadow-md">{highScore}</div>
                 <div className="text-[10px] text-white/50 uppercase tracking-wider">Best</div>
            </div>
            <button 
                onClick={() => setShowCamera(!showCamera)}
                className={`p-3 rounded-full transition-all shadow-lg backdrop-blur-sm ${showCamera ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-red-500/80 text-white hover:bg-red-600'}`}
                title={showCamera ? "Hide Camera" : "Show Camera"}
            >
               {showCamera ? (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                   <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                   <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
                 </svg>
               ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                   <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                   <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                   <path d="M6.75 12c0-.619.107-1.215.304-1.772L5.23 8.408A11.956 11.956 0 002.198 12c.12.362.12.752 0 1.113 1.487 4.471 5.705 7.697 10.677 7.697 1.473 0 2.892-.285 4.203-.81l-1.82-1.82A8.252 8.252 0 016.75 12z" />
                 </svg>
               )}
             </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        
        {/* Camera Preview PIP - Always mounted if not sim, toggled by state */}
        {!isSimulation && (
           <div className={`absolute bottom-6 right-6 w-64 h-48 rounded-2xl overflow-hidden border-4 border-white/20 shadow-2xl z-40 transition-all duration-500 bg-black ${showCamera ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
             <video 
                ref={videoRef} 
                className="w-full h-full object-cover transform -scale-x-100" 
                width="640" 
                height="480" 
                playsInline 
                muted 
             />
             <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-black/80 to-transparent" />
             <div className="absolute bottom-2 left-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_red]" />
                <span className="text-white/90 text-[10px] font-bold tracking-wider uppercase font-sans">Live Feed</span>
             </div>
           </div>
        )}
        
        {/* Game Canvas */}
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            className="w-full h-full object-contain bg-slate-900 block"
        />

        {/* UI Overlays */}
        {gameState === GameState.TUTORIAL && (
            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center w-full">
                
                {/* Difficulty Selector */}
                <div className="bg-black/60 backdrop-blur-xl p-2 rounded-2xl flex gap-2 mb-6 border border-white/10 shadow-2xl">
                  {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-8 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                        difficulty === d 
                          ? (d === Difficulty.EASY ? 'bg-green-500 text-white shadow-green-500/50' : d === Difficulty.MEDIUM ? 'bg-yellow-500 text-white shadow-yellow-500/50' : 'bg-red-600 text-white shadow-red-600/50')
                          : 'text-gray-400 hover:text-white hover:bg-white/10'
                      } shadow-lg`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                
                <div className="bg-black/50 px-6 py-2 rounded-lg backdrop-blur-sm border-l-4 border-game-blue mb-6 max-w-md text-center">
                    {difficulty === Difficulty.EASY && <p className="text-green-300 text-sm font-mono">Relaxed gravity. High jump power. Perfect for warmups.</p>}
                    {difficulty === Difficulty.MEDIUM && <p className="text-yellow-300 text-sm font-mono">Balanced challenge. Standard gravity.</p>}
                    {difficulty === Difficulty.HARD && <p className="text-red-300 text-sm font-mono">Heavy gravity. Fast obstacles. For athletes!</p>}
                </div>

                <button 
                  onClick={startGame}
                  className="bg-game-pink hover:bg-pink-600 text-white text-3xl font-black italic py-4 px-20 rounded-full shadow-[0_0_30px_rgba(247,37,133,0.4)] transform hover:scale-105 transition-all animate-pulse"
                >
                  START
                </button>
            </div>
        )}

        {gameState === GameState.GAME_OVER && (
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-30 animate-fade-in">
                <h2 className="text-7xl font-black text-white mb-4 tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]">GAME OVER</h2>
                
                <div className="flex flex-col items-center bg-white/10 p-8 rounded-3xl border border-white/10 backdrop-blur-lg mb-10">
                    <div className="text-gray-300 text-sm uppercase tracking-widest mb-2">Final Score</div>
                    <div className="text-6xl text-game-yellow font-bold mb-2 drop-shadow-lg">{score}</div>
                    {score >= highScore && score > 0 && (
                        <div className="px-3 py-1 bg-yellow-500 text-black text-xs font-bold rounded uppercase animate-bounce mt-2">
                            New High Score!
                        </div>
                    )}
                </div>

                <div className="flex gap-6">
                    <button 
                        onClick={onExit}
                        className="px-8 py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl transition shadow-lg hover:shadow-xl"
                    >
                        Main Menu
                    </button>
                    <button 
                        onClick={startGame}
                        className="px-10 py-4 rounded-2xl bg-game-blue hover:bg-cyan-400 text-black font-bold text-xl transition shadow-[0_0_20px_rgba(76,201,240,0.4)] hover:scale-105"
                    >
                        Try Again
                    </button>
                </div>
             </div>
        )}

        {/* Feedback Toast */}
        <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 pointer-events-none z-20 w-full flex justify-center">
            <div className={`px-8 py-4 rounded-2xl backdrop-blur-xl font-bold text-2xl transition-all duration-300 shadow-2xl text-center border border-white/20 ${
                feedback.includes('EXCELLENT') || feedback.includes('MAX') 
                    ? 'bg-green-500/90 text-white scale-110 rotate-1' 
                    : feedback.includes('Go') || feedback.includes('Move') 
                        ? 'bg-blue-600/80 text-white'
                        : 'bg-black/60 text-white'
            }`}>
                {feedback}
            </div>
        </div>
      </div>

      {/* Simulation Controls (Dev Tools) */}
      {isSimulation && (
          <div className="absolute bottom-4 right-4 bg-black/80 p-4 rounded-lg z-40 w-64 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2 font-mono uppercase">Simulation Mode</p>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={simIntensity}
                onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSimIntensity(val);
                    intensityRef.current = val;
                }}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-game-blue"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Rest</span>
                  <span>Active</span>
              </div>
          </div>
      )}
    </div>
  );
};