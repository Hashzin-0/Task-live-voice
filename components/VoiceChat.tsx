'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

const pcmToBase64 = (f32Array: Float32Array) => {
  const i16Array = new Int16Array(f32Array.length);
  for (let i = 0; i < f32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, f32Array[i]));
    i16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buffer = new ArrayBuffer(i16Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < i16Array.length; i++) {
    view.setInt16(i * 2, i16Array[i], true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export default function VoiceChat({
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodo
}: {
  todos: { id: string, text: string, completed: boolean }[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodo: (id: string, text: string) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  const toggleVoice = async () => {
    if (isActive) {
      stopVoice();
    } else {
      await startVoice();
    }
  };

  const stopVoice = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
    }
    setIsActive(false);
    setIsConnecting(false);
  };

  const startVoice = async () => {
    try {
      setIsConnecting(true);
      const host = window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${host}/live`);
      wsRef.current = ws;

      ws.onopen = async () => {
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        nextStartTimeRef.current = 0;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };
        setIsConnecting(false);
        setIsActive(true);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio && audioCtxRef.current) {
          const audioCtx = audioCtxRef.current;
          const binaryArray = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
          // Live API returns 24kHz standard according to doc? Oh wait, docs say "audio/pcm;rate=24000" but wait. 
          // The snippet says "Return this base64 audio to the client for playback (sample rate 24000)" for TTS.
          // For Live it says "audioCtx = new AudioContext({ sampleRate: 16000 })" 
          // Wait, Gemini live api output is usually 24kHz actually. Let's assume audioCtx matches or we reconstruct Float32Array
          // We need to convert 16-bit PCM to Float32.
          const i16Array = new Int16Array(binaryArray.buffer);
          const f32Array = new Float32Array(i16Array.length);
          for (let i = 0; i < i16Array.length; i++) {
              f32Array[i] = i16Array[i] / 32768.0;
          }
          
          let bufSampleRate = 24000;
          const audioBuffer = audioCtx.createBuffer(1, f32Array.length, bufSampleRate);
          audioBuffer.getChannelData(0).set(f32Array);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          
          const t = audioCtx.currentTime;
          if (nextStartTimeRef.current < t) nextStartTimeRef.current = t;
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
        }
        if (msg.interrupted) {
           nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
        }
        if (msg.toolCall) {
           handleToolCall(msg.toolCall);
        }
      };

      ws.onclose = () => {
        stopVoice();
      };
    } catch (e) {
      console.error(e);
      stopVoice();
    }
  };

  const handleToolCall = (toolCallMsg: any) => {
    // Expected toolCall.functionCalls array
    const calls = toolCallMsg.functionCalls || [];
    const responses = [];

    for (const call of calls) {
       const args = call.args || {};
       let result: any;
       try {
           if (call.name === 'addTodo') {
               onAddTodo(args.text);
               result = { success: true, message: `Added task: ${args.text}` };
           } else if (call.name === 'toggleTodo') {
               onToggleTodo(args.id);
               result = { success: true };
           } else if (call.name === 'deleteTodo') {
               onDeleteTodo(args.id);
               result = { success: true };
           } else if (call.name === 'updateTodo') {
               onUpdateTodo(args.id, args.text);
               result = { success: true, message: `Updated task to: ${args.text}` };
           } else if (call.name === 'getTodos') {
               result = { todos: todosRef.current };
           } else {
               result = { error: 'Unknown function' };
           }
       } catch (err: any) {
           result = { error: err.message };
       }
       
       responses.push({
           name: call.name,
           id: call.id,
           response: result
       });
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ toolResponse: responses }));
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleVoice}
        disabled={isConnecting}
        className={`relative flex items-center justify-center p-4 rounded-full shadow-lg text-white transition-colors duration-300 ${
          isActive ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
        }`}
      >
        {isActive && (
            <motion.div
              layoutId="ripple"
              className="absolute inset-0 rounded-full border-2 border-red-400"
              animate={{ scale: [1, 1.5, 2], opacity: [1, 0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
        )}
        {isConnecting ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isActive ? (
          <MicOff className="h-6 w-6 relative z-10" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </motion.button>
    </div>
  );
}
