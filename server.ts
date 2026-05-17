import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);

  const wss = new WebSocketServer({ server, path: '/live' });

  // Initialize ai globally or handle inside connection?
  // We'll initialize inside to ensure process.env.GEMINI_API_KEY is read safely at runtime.
  wss.on("connection", async (clientWs) => {
    try {
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY, 
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ audio }));
              }
            }
            if (message.serverContent?.interrupted) {
               if (clientWs.readyState === clientWs.OPEN) {
                 clientWs.send(JSON.stringify({ interrupted: true }));
               }
            }
            if (message.toolCall) {
              if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ toolCall: message.toolCall }));
              }
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are a helpful assistant for a Todo List app. Understand user requests to add, edit/update, toggle or delete tasks, and use the provided tools to perform them. Keep your responses concise and conversational. Do not list all tasks unless asked.",
          tools: [{
             functionDeclarations: [
               {
                 name: 'addTodo',
                 description: 'Add a new task to the todo list',
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     text: { type: Type.STRING, description: 'The text of the task' }
                   },
                   required: ['text']
                 }
               },
               {
                 name: 'toggleTodo',
                 description: 'Toggle the completion status of a task by its ID',
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     id: { type: Type.STRING, description: 'The unique ID of the task to toggle' }
                   },
                   required: ['id']
                 }
               },
               {
                 name: 'deleteTodo',
                 description: 'Delete a task from the todo list by its ID',
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     id: { type: Type.STRING, description: 'The unique ID of the task to delete' }
                   },
                   required: ['id']
                 }
               },
               {
                 name: 'updateTodo',
                 description: 'Update the text of an existing task by its ID',
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     id: { type: Type.STRING, description: 'The unique ID of the task to update' },
                     text: { type: Type.STRING, description: 'The new text for the task' }
                   },
                   required: ['id', 'text']
                 }
               },
               {
                 name: 'getTodos',
                 description: 'Retrieve the current list of tasks to check what exists',
                 parameters: {
                   type: Type.OBJECT,
                   properties: {} // No parameters needed
                 }
               }
             ]
          }],
        },
      });

      clientWs.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
          if (msg.toolResponse) {
             session.sendToolResponse({
               functionResponses: msg.toolResponse
             });
          }
        } catch (e) {
          console.error("Error parsing message", e);
        }
      });

      clientWs.on("close", () => {
        // Close session if supported or just discard.
        try {
          (session as any).close && (session as any).close();
        } catch (e) { /* ignore */ }
      });

    } catch (e) {
      console.error("Failed to connect to Live API", e);
      clientWs.close();
    }
  });

  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
