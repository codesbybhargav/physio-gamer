import { useState } from 'react';
import { ModeCard } from './components/ModeCard';
import { GameCanvas } from './components/GameCanvas';
import { GameMode } from './types';

function App() {
  // We explicitly state that the mode can be GameMode OR null
  const [activeMode, setActiveMode] = useState<GameMode | null>(GameMode.SQUAT);

  if (activeMode) {
    return <GameCanvas mode={activeMode} onExit={() => setActiveMode(null)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-slate-900 p-6 md:p-12 flex flex-col items-center justify-center">
      
      <header className="text-center mb-16 animate-fade-in-down">
        <h1 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-game-blue via-game-purple to-game-pink mb-4 tracking-tight">
          Physio-Jumper
        </h1>
        <p className="text-gray-400 text-xl md:text-2xl font-light max-w-2xl mx-auto">
          Turn your workout into an arcade game. Use your body to fly!
        </p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full px-4">
        
        <ModeCard 
          mode={GameMode.SQUAT}
          title="Super Squats"
          description="Perform deep squats to propel your character upwards. Great for legs and glutes."
          icon="🏋️"
          color="bg-gradient-to-br from-pink-500 to-rose-600"
          onClick={() => setActiveMode(GameMode.SQUAT)}
        />

        <ModeCard 
          mode={GameMode.ARM_RAISE}
          title="Sky Reach"
          description="Raise your arms high to fly. Lower them to descend. Perfect for shoulder mobility."
          icon="🙆"
          color="bg-gradient-to-br from-cyan-500 to-blue-600"
          onClick={() => setActiveMode(GameMode.ARM_RAISE)}
        />

        <ModeCard 
          mode={GameMode.LUNGE}
          title="Lunge Leaps"
          description="Perform deep lunges to jump over obstacles. Build balance and core strength."
          icon="🏃"
          color="bg-gradient-to-br from-yellow-400 to-orange-500"
          onClick={() => setActiveMode(GameMode.LUNGE)}
        />

      </main>

      <footer className="mt-20 text-gray-500 text-sm">
        <p>Powered by MediaPipe • Requires Camera Access</p>
      </footer>
    </div>
  );
}

export default App;