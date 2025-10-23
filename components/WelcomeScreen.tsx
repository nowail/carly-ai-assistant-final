import React from 'react';
import { CarlyIcon, PhoneIcon } from './icons';

interface WelcomeScreenProps {
  onStart: () => void;
  error?: string | null;
  finalTranscription?: { speaker: 'user' | 'agent'; text: string }[] | null;
  onDownload?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, error, finalTranscription, onDownload }) => {
  
  if (finalTranscription && finalTranscription.length > 0) {
    return (
      <div className="flex flex-col h-full text-left p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Call Transcript</h2>
        <div className="flex-grow bg-gray-50 rounded-lg p-4 overflow-y-auto mb-4 border">
          {finalTranscription.map((entry, index) => (
            <div key={index} className="mb-3">
              <p className={`font-bold ${entry.speaker === 'user' ? 'text-blue-600' : 'text-red-600'}`}>
                {entry.speaker === 'user' ? 'You' : 'Carly'}:
              </p>
              <p className="text-gray-700 whitespace-pre-wrap">{entry.text}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={onDownload}
            className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-full shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-transform transform hover:scale-105"
          >
            Download Transcript
          </button>
          <button
            onClick={onStart}
            className="flex items-center justify-center gap-3 px-6 py-3 bg-green-500 text-white font-semibold rounded-full shadow-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 transition-transform transform hover:scale-105"
          >
            <PhoneIcon />
            <span>Start New Call</span>
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-24 h-24 mb-6 rounded-xl overflow-hidden">
        <CarlyIcon />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Carly AI Assistant</h2>
      <p className="text-gray-600 mb-8 max-w-md">
        Meet your AI-powered car buying assistant. I can instantly check our inventory, provide detailed vehicle specs, and calculate financing options. Press 'Start Call' to get started.
      </p>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
        </div>
      )}
      <button
        onClick={onStart}
        className="flex items-center justify-center gap-3 px-8 py-4 bg-green-500 text-white font-semibold rounded-full shadow-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 transition-transform transform hover:scale-105"
      >
        <PhoneIcon />
        <span>Start Call</span>
      </button>
    </div>
  );
};
