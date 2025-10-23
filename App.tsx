
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  LiveServerMessage,
  Modality,
} from '@google/genai';

import { Header } from './components/Header';
import { WelcomeScreen } from './components/WelcomeScreen';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { CarlyIcon, PhoneHangupIcon, UserIcon } from './components/icons';
import {
  ai,
  functionDeclarations,
  SYSTEM_INSTRUCTION,
} from './services/geminiService';
import { executeTool } from './services/mockApi';
import { createBlob, decode, decodeAudioData } from './utils/audio';

// Fix: Define and export AgentStatus type to be used by VoiceVisualizer and App components
export type AgentStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

type TranscriptionEntry = {
    speaker: 'user' | 'agent';
    text: string;
};

// --- MessageBubble Component (Inlined for simplicity) ---
const MessageBubble: React.FC<{ speaker: 'user' | 'agent'; text: string; }> = ({ speaker, text }) => {
    const isUser = speaker === 'user';
    return (
        <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
        {!isUser && (
            <div className="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden bg-red-500">
            <CarlyIcon />
            </div>
        )}
        <div
            className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow ${
            isUser
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-gray-200 text-gray-800 rounded-bl-none'
            }`}
        >
            <p className="text-sm">{text}</p>
        </div>
        {isUser && (
            <div className="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden">
            <UserIcon />
            </div>
        )}
        </div>
    );
};


const App: React.FC = () => {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [displayVolume, setDisplayVolume] = useState(0);
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);
  const [finalTranscription, setFinalTranscription] = useState<TranscriptionEntry[] | null>(null);
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const sessionPromiseRef = useRef<ReturnType<typeof ai.live.connect> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const nextStartTimeRef = useRef(0);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const toolCallInProgressRef = useRef(false);
  const listeningVolumeRef = useRef(0);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const connectionHealthRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const maxRetries = 3;
  
  // Create a ref to hold the latest transcription state to avoid stale closures in callbacks.
  const transcriptionRef = useRef<TranscriptionEntry[]>([]);
  useEffect(() => {
    transcriptionRef.current = transcription;
  }, [transcription]);


  // Connection health monitoring
  const startConnectionHealthMonitoring = useCallback(() => {
    if (connectionHealthRef.current) {
      clearInterval(connectionHealthRef.current);
    }
    
    connectionHealthRef.current = setInterval(() => {
      const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
      const isHealthy = timeSinceLastMessage < 30000; // 30 seconds timeout
      
      if (!isHealthy && agentStatus === 'listening') {
        console.warn('⚠️ Connection health check failed - no messages for 30 seconds');
        handleConnectionRecovery();
      }
    }, 10000); // Check every 10 seconds
  }, [agentStatus]);

  const stopConnectionHealthMonitoring = useCallback(() => {
    if (connectionHealthRef.current) {
      clearInterval(connectionHealthRef.current);
      connectionHealthRef.current = null;
    }
  }, []);

  // Connection recovery mechanism
  const handleConnectionRecovery = useCallback(async () => {
    if (isReconnecting || connectionRetries >= maxRetries) {
      console.log('❌ Max retries reached or already reconnecting, ending call');
      handleEndCall();
      return;
    }

    console.log(`🔄 Attempting connection recovery (attempt ${connectionRetries + 1}/${maxRetries})`);
    setIsReconnecting(true);
    setConnectionRetries(prev => prev + 1);
    
    // Clean up current session
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        await session.close();
      } catch (e) {
        console.warn('Error closing session during recovery:', e);
      }
      sessionPromiseRef.current = null;
    }

    // Wait a bit before retrying
    setTimeout(() => {
      handleStartCall();
      setIsReconnecting(false);
    }, 2000);
  }, [isReconnecting, connectionRetries, maxRetries]);

  const handleEndCall = useCallback(() => {
    // Guard against multiple executions from button clicks and onclose events.
    if (!sessionPromiseRef.current) {
        return;
    }

    // Stop health monitoring
    stopConnectionHealthMonitoring();

    // Immediately nullify the ref after capturing it to make the guard effective.
    const sessionPromise = sessionPromiseRef.current;
    sessionPromiseRef.current = null;
    
    // Set the final transcription using the ref, which holds the most up-to-date state.
    setFinalTranscription(transcriptionRef.current);

    setAgentStatus('idle');
    setTranscription([]);
    setConnectionRetries(0);
    setIsReconnecting(false);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    sessionPromise.then(session => session.close()).catch(e => {
      console.warn('Error closing session:', e);
    });

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    }

    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }

    try {
      if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
          inputAudioContextRef.current.close();
      }
    } catch (e) {
      console.error("Error closing input audio context:", e);
    }
    inputAudioContextRef.current = null;

    try {
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
          outputAudioContextRef.current.close();
      }
    } catch(e) {
      console.error("Error closing output audio context:", e);
    }
    outputAudioContextRef.current = null;
    
    outputSourcesRef.current.forEach(source => source.stop());
    outputSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    toolCallInProgressRef.current = false;

  }, [stopConnectionHealthMonitoring]);


  const handleStartCall = async () => {
    setFinalTranscription(null);
    setTranscription([]);
      setAgentStatus('connecting');
      setError(null);
      setConnectionRetries(0);
      setIsReconnecting(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations }],
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, // The languageCodes property was causing an invalid argument error. Removing it allows the session to connect. The detailed system prompt is used to guide language recognition.
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
        },
        callbacks: {
          onopen: () => {
            console.log('Session opened.');
            setAgentStatus('listening');
            startConnectionHealthMonitoring();

            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                    const silentFrame = new Float32Array(4096);
                    const silentBlob = createBlob(silentFrame);
                    session.sendRealtimeInput({ media: silentBlob });

                    const source = inputAudioContextRef.current!.createMediaStreamSource(localStreamRef.current!);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        let sum = 0.0;
                        for (const sample of inputData) {
                            sum += sample * sample;
                        }
                        const rms = Math.sqrt(sum / inputData.length);
                        listeningVolumeRef.current = rms;
                        
                        const pcmBlob = createBlob(inputData);

                        sessionPromiseRef.current?.then((activeSession) => {
                            activeSession.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(
                        inputAudioContextRef.current!.destination
                    );
                });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log('📨 AI MESSAGE RECEIVED:', JSON.stringify(message, null, 2));
            
            // Update last message time for health monitoring
            lastMessageTimeRef.current = Date.now();
            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64EncodedAudioString) {
              toolCallInProgressRef.current = false;
              setAgentStatus('speaking');
              const audioContext = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContext.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64EncodedAudioString),
                audioContext,
                24000,
                1
              );
              
              const source = audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              
              source.addEventListener('ended', () => {
                  outputSourcesRef.current.delete(source);
                  if (outputSourcesRef.current.size === 0) {
                      if (!toolCallInProgressRef.current) {
                          setAgentStatus('listening');
                      }
                  }
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              outputSourcesRef.current.add(source);
            }

            if (message.toolCall?.functionCalls) {
              console.log('🔧 TOOL CALL DETECTED:', message.toolCall.functionCalls);
              toolCallInProgressRef.current = true;
              setAgentStatus('thinking');
              const functionResponses = [];
              
              try {
                for (const fc of message.toolCall.functionCalls) {
                  console.log(`🔧 Executing tool: ${fc.name} with args:`, fc.args);
                  
                  try {
                    const result = await executeTool(fc.name, fc.args);
                    console.log(`🔧 Tool result:`, result);
                    
                    functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { result },
                    });
                  } catch (toolError) {
                    console.error(`❌ Tool execution error for ${fc.name}:`, toolError);
                    
                    // Send error response instead of crashing
                    functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { 
                          error: `Tool execution failed: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
                          result: JSON.stringify({ error: "Tool execution failed", cars: [] })
                        },
                    });
                  }
                }

                if (sessionPromiseRef.current && functionResponses.length > 0) {
                    sessionPromiseRef.current.then(session => {
                        session.sendToolResponse({ functionResponses });
                    }).catch(sessionError => {
                      console.error('❌ Error sending tool response:', sessionError);
                      handleConnectionRecovery();
                    });
                }
              } catch (error) {
                console.error('❌ Critical error in tool execution:', error);
                handleConnectionRecovery();
              }
            }
            
            // --- Live Transcription Logic ---
            if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscriptionRef.current += text;
                const currentText = currentInputTranscriptionRef.current;
                setTranscription(prev => {
                    const newHistory = [...prev];
                    const lastEntry = newHistory[newHistory.length - 1];
                    if (lastEntry?.speaker === 'user') {
                        lastEntry.text = currentText;
                    } else {
                        newHistory.push({ speaker: 'user', text: currentText });
                    }
                    return newHistory;
                });
            }

            if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentOutputTranscriptionRef.current += text;
                const currentText = currentOutputTranscriptionRef.current;
                setTranscription(prev => {
                    const newHistory = [...prev];
                    const lastEntry = newHistory[newHistory.length - 1];
                    if (lastEntry?.speaker === 'agent') {
                        lastEntry.text = currentText;
                    } else {
                        newHistory.push({ speaker: 'agent', text: currentText });
                    }
                    return newHistory;
                });
            }

            if (message.serverContent?.turnComplete) {
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }

            if (message.serverContent?.interrupted) {
                outputSourcesRef.current.forEach(source => source.stop());
                outputSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            
            // Don't immediately end call for recoverable errors
            if (connectionRetries < maxRetries && !isReconnecting) {
              console.log('🔄 Attempting to recover from session error...');
              handleConnectionRecovery();
            } else {
              setError(`Connection error: ${e.message}. Please try again.`);
              setAgentStatus('error');
              handleEndCall();
            }
          },
          onclose: (event) => {
            console.log('Session closed:', event);
            
            // Only end call if it wasn't a planned closure
            if (agentStatus !== 'idle' && !isReconnecting) {
              console.log('🔄 Unexpected session close, attempting recovery...');
              if (connectionRetries < maxRetries) {
                handleConnectionRecovery();
              } else {
                setError('Connection lost. Please try again.');
                setAgentStatus('error');
                handleEndCall();
              }
            }
          },
        },
      });
    } catch (e) {
      console.error('Failed to start call:', e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Could not start the call. Please check microphone permissions. Error: ${errorMessage}`);
      setAgentStatus('error');
      handleEndCall();
    }
  };
  
  const handleDownloadTranscript = () => {
    if (!finalTranscription) return;

    const formattedTranscript = finalTranscription
        .map(entry => `${entry.speaker === 'user' ? 'You' : 'Carly'}: ${entry.text}`)
        .join('\n\n');
    
    const blob = new Blob([formattedTranscript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carly-call-transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
        setDisplayVolume(currentVolume => {
            const newVolume = listeningVolumeRef.current;
            const smoothedVolume = currentVolume * 0.7 + newVolume * 0.3;
            return smoothedVolume;
        });
        animationFrameId = requestAnimationFrame(loop);
    };

    if (agentStatus === 'listening') {
        animationFrameId = requestAnimationFrame(loop);
    } else {
        listeningVolumeRef.current = 0;
        setDisplayVolume(0);
    }

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [agentStatus]);


  useEffect(() => {
    if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [transcription]);

  useEffect(() => {
    return () => {
      stopConnectionHealthMonitoring();
      handleEndCall();
    };
  }, [handleEndCall, stopConnectionHealthMonitoring]);


  return (
    <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl h-[70vh] min-h-[600px] bg-white rounded-2xl shadow-lg flex flex-col overflow-hidden">
          {agentStatus === 'idle' || agentStatus === 'error' ? (
            <WelcomeScreen 
              onStart={handleStartCall} 
              error={error} 
              finalTranscription={finalTranscription}
              onDownload={handleDownloadTranscript}
            />
          ) : (
            <div className="flex flex-col h-full items-center justify-between">
                <div className="p-4 w-full border-b">
                  <VoiceVisualizer status={agentStatus} volume={displayVolume} />
                  {isReconnecting && (
                    <div className="mt-2 text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        Reconnecting... ({connectionRetries + 1}/{maxRetries})
                      </div>
                    </div>
                  )}
                </div>
                
                <div ref={chatScrollRef} className="flex-grow w-full overflow-y-auto px-6 py-4 space-y-4 bg-gray-50">
                    {transcription.map((entry, index) => (
                        <MessageBubble key={index} speaker={entry.speaker} text={entry.text} />
                    ))}
                </div>

                <div className="p-6 border-t w-full flex justify-center bg-white">
                    <button
                        onClick={handleEndCall}
                        className="flex items-center justify-center gap-3 px-8 py-3 bg-red-500 text-white font-semibold rounded-full shadow-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-transform transform hover:scale-105"
                    >
                        <PhoneHangupIcon />
                        <span>End Call</span>
                    </button>
                </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
