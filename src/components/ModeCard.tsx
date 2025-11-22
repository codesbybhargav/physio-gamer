import React from 'react';
import { GameMode } from '../types';

interface ModeCardProps {
  mode: GameMode;
  title: string;
  description: string;
  icon: string;
  color: string;
  onClick: () => void;
}

export const ModeCard: React.FC<ModeCardProps> = ({ title, description, icon, color, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className={`group relative flex flex-col items-start justify-between p-6 h-64 rounded-3xl overflow-hidden transition-all duration-300 transform hover:scale-105 hover:shadow-2xl w-full text-left ${color}`}
    >
      <div className="absolute -right-8 -bottom-8 text-9xl opacity-20 group-hover:opacity-40 transition-opacity duration-300 select-none">
        {icon}
      </div>
      
      <div className="z-10">
        <h3 className="text-3xl font-bold text-white mb-2">{title}</h3>
        <p className="text-white/90 font-medium text-lg leading-snug">{description}</p>
      </div>

      <div className="z-10 mt-auto bg-white/20 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 transition-colors group-hover:bg-white group-hover:text-black">
        <span className="font-bold">Start Game</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </button>
  );
};