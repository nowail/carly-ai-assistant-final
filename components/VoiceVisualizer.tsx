import React from 'react';
import type { AgentStatus } from '../App';
import { LoadingIcon, MicIcon, ThinkingIcon, WaveformIcon } from './icons';

interface VoiceVisualizerProps {
  status: AgentStatus;
  volume?: number;
}

const StatusDisplay: React.FC<{ icon: React.ReactNode; text: string; }> = ({ icon, text }) => (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 flex items-center justify-center">
            {icon}
        </div>
        <p className="text-lg text-gray-600 font-medium">{text}</p>
    </div>
);

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ status, volume }) => {
  switch (status) {
    case 'connecting':
      return <StatusDisplay icon={<LoadingIcon />} text="Connecting..." />;
    case 'listening': {
      // Create a dynamic style based on microphone volume for real-time feedback
      const scale = Math.max(1, Math.min(1.4, 1 + (volume || 0) * 5));
      const listeningStyle = {
        transform: `scale(${scale})`,
        transition: 'transform 75ms linear',
      };
      return (
        <StatusDisplay
          icon={
            <div style={listeningStyle}>
              <MicIcon className="w-12 h-12 text-blue-500" />
            </div>
          }
          text="Listening..."
        />
      );
    }
    case 'thinking':
      return <StatusDisplay icon={<div className="w-14 h-14"><ThinkingIcon /></div>} text="Carly is thinking..." />;
    case 'speaking':
      return <StatusDisplay icon={<WaveformIcon className="w-16 h-16 text-red-500" />} text="Carly is speaking..." />;
    default:
      return null;
  }
};
