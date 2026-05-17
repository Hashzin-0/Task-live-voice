import express from "express";
import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

import { evaluate } from "mathjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
	.prepare()
	.then(() => {
		const expressApp = express();
		const server = createServer(expressApp);

		const wss = new WebSocketServer({ server, path: "/live" });

		// Initialize ai globally or handle inside connection?
		// We'll initialize inside to ensure process.env.GEMINI_API_KEY is read safely at runtime.
		wss.on("connection", (clientWs) => {
			let session: any = null;
			let ai: any = null;

			clientWs.on("message", async (data) => {
				try {
					const msg = JSON.parse(data.toString());

					if (msg.type === "init") {
						const {
							voiceName,
							personality,
							initialPrompt,
							userName,
							assistantName,
							verbosity,
							speechSpeed,
							onlineSearchEnabled,
							latLng,
						} = msg.config || {};
						const aiInstance = new GoogleGenAI({
							apiKey: process.env.GEMINI_API_KEY,
							httpOptions: { headers: { "User-Agent": "aistudio-build" } },
						});
						ai = aiInstance;

						const baseInstruction = `You are '${assistantName || "Alex"}', a helpful, proactive assistant. 
User's preferred name: ${userName || "Usuário"}. Address them by this name.
Your personality is: ${personality || "Friendly, cheerful, and encouraging"}. 
Your response style: ${verbosity || "concise"}.
Your speech speed: ${speechSpeed || "normal"}. 
You adapt to the user's emotion. Current Time: ${new Date().toLocaleString("pt-BR")}.
${latLng ? `User's current coordinates: ${latLng.latitude}, ${latLng.longitude}. Use this to help with location-based queries.` : ""}
Your roles: 
1) Help manage tasks (add, update, delete). 
2) Brainstorming: Ask questions to clarify goals and break them into specific tasks. 
3) Date Management. 
4) Focus Timer: If user requests a focus block (e.g. 1h, alert every 20m), ALWAYS use the startFocusTimer tool.
5) End Conversation: When the user says goodbye or that there's nothing else to do, ALWAYS use the endConversation tool.
6) Speak in Portuguese since the user's wake word is '${assistantName || "Alex"}'.
7) SILENCE AND WAKE WORD BEHAVIOR: 
   - If you just activated and the user is completely silent for 2 seconds, gently ask "Sim?", "E então?" or "O que preciso fazer?". 
   - If the user remains silent for another 5 seconds after you asked, YOU MUST use the endConversation tool to turn off automatically.
   - If the user gave a command right after your name (e.g., "Alex apagar as tarefas"), execute it immediately.`;

						const customTools = {
							functionDeclarations: [
								{
									name: "addTodo",
									description: "Add a new task to the todo list",
									parameters: {
										type: Type.OBJECT,
										properties: {
											text: {
												type: Type.STRING,
												description: "The text of the task",
											},
											dueDate: {
												type: Type.STRING,
												description:
													"Optional due date for the task in YYYY-MM-DD format (e.g., 2026-05-18). If none specified, omit.",
											},
										},
										required: ["text"],
									},
								},
								{
									name: "toggleTodo",
									description:
										"Toggle the completion status of a task by its ID",
									parameters: {
										type: Type.OBJECT,
										properties: {
											id: {
												type: Type.STRING,
												description: "The unique ID of the task to toggle",
											},
										},
										required: ["id"],
									},
								},
								{
									name: "deleteTodo",
									description: "Delete a task from the todo list by its ID",
									parameters: {
										type: Type.OBJECT,
										properties: {
											id: {
												type: Type.STRING,
												description: "The unique ID of the task to delete",
											},
										},
										required: ["id"],
									},
								},
								{
									name: "updateTodo",
									description:
										"Update the text and/or due date of an existing task by its ID",
									parameters: {
										type: Type.OBJECT,
										properties: {
											id: {
												type: Type.STRING,
												description: "The unique ID of the task to update",
											},
											text: {
												type: Type.STRING,
												description: "The new text for the task",
											},
											dueDate: {
												type: Type.STRING,
												description:
													"Optional new due date in YYYY-MM-DD format",
											},
										},
										required: ["id", "text"],
									},
								},
								{
									name: "getTodos",
									description:
										"Retrieve the current list of tasks to check what exists",
									parameters: {
										type: Type.OBJECT,
										properties: {}, // No parameters needed
									},
								},
								{
									name: "startFocusTimer",
									description:
										"Start a focus or pomodoro session timer. Accepts duration and interval in minutes.",
									parameters: {
										type: Type.OBJECT,
										properties: {
											durationMinutes: {
												type: Type.NUMBER,
												description:
													"Total focus duration in minutes (e.g., 60)",
											},
											intervalMinutes: {
												type: Type.NUMBER,
												description:
													"Interval to remind the user, in minutes (e.g., 20)",
											},
										},
										required: ["durationMinutes", "intervalMinutes"],
									},
								},
								{
									name: "endConversation",
									description:
										"Ends the voice session. Use this ONLY when the user says goodbye or implies they have finished all tasks and want to stop talking.",
									parameters: {
										type: Type.OBJECT,
										properties: {},
									},
								},
								{
									name: "calculate",
									description:
										"Calculate math expressions using math.js. Use it for any mathematical problem.",
									parameters: {
										type: Type.OBJECT,
										properties: {
											expression: {
												type: Type.STRING,
												description: "The mathematical expression to evaluate",
											},
										},
										required: ["expression"],
									},
								},
							],
						};

						const activeTools: any[] = [customTools];
						if (onlineSearchEnabled) {
							activeTools.push({ googleSearch: {} });
						}

						session = await aiInstance.live.connect({
							model: "gemini-3.1-flash-live-preview",
							callbacks: {
								onmessage: (message: LiveServerMessage) => {
									const parts = message.serverContent?.modelTurn?.parts;
									if (parts) {
										for (const part of parts) {
											if (part.text) {
												if (clientWs.readyState === clientWs.OPEN) {
													clientWs.send(JSON.stringify({ textResponse: part.text }));
												}
											}
											if (part.inlineData?.data) {
												if (clientWs.readyState === clientWs.OPEN) {
													clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
												}
											}
										}
									}
									if (message.serverContent?.interrupted) {
										if (clientWs.readyState === clientWs.OPEN) {
											clientWs.send(JSON.stringify({ interrupted: true }));
										}
									}
									if (message.toolCall) {
										const clientTools: any = { functionCalls: [] };
										const serverResponses: any = { functionResponses: [] };
										
										for (const call of message.toolCall.functionCalls || []) {
											if (call.name === "calculate") {
												try {
													const result = evaluate((call.args as any).expression);
													serverResponses.functionResponses.push({
														name: "calculate",
														id: call.id,
														response: { result },
													});
												} catch (err: any) {
													serverResponses.functionResponses.push({
														name: "calculate",
														id: call.id,
														response: { error: err.message },
													});
												}
											} else {
												clientTools.functionCalls.push(call);
											}
										}
										
										if (serverResponses.functionResponses.length > 0) {
											session?.sendToolResponse(serverResponses);
										}
										if (clientTools.functionCalls.length > 0) {
											if (clientWs.readyState === clientWs.OPEN) {
												clientWs.send(
													JSON.stringify({ toolCall: clientTools }),
												);
											}
										}
									}
								},
							},
							config: {
								responseModalities: [Modality.AUDIO, "TEXT" as any],
								speechConfig: {
									voiceConfig: {
										prebuiltVoiceConfig: { voiceName: voiceName || "Aoede" },
									},
								},
								systemInstruction: baseInstruction,
								tools: activeTools,
								// @ts-ignore
								toolConfig: onlineSearchEnabled
									? { includeServerSideToolInvocations: true }
									: undefined,
							},
						});
						clientWs.send(JSON.stringify({ type: "ready" }));

						if (initialPrompt && initialPrompt.length > 0) {
							session.sendClientContent({
								turns: [{ role: "user", parts: [{ text: `Comando inicial detectado junto com a palavra de ativação: "${initialPrompt}". Por favor, execute isso agora as instruções relacionadas e responda.` }] }],
								turnComplete: true,
							});
						} else {
							session.sendClientContent({
								turns: [{ role: "user", parts: [{ text: "Ativação detectada. Estou em silêncio por enquanto. Se eu não falar nada em 2 segundos, diga 'Sim?' ou algo similar. E se após mais 5 segundos não houver resposta, execute a tool endConversation." }] }],
								turnComplete: true,
							});
						}
					}

					if (msg.audio && session) {
						session.sendRealtimeInput({
							audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
						});
					}
					if (msg.image && session) {
						session.sendRealtimeInput({
							video: { data: msg.image, mimeType: "image/jpeg" },
						});
					}
					if (msg.toolResponse && session) {
						session.sendToolResponse({
							functionResponses: msg.toolResponse,
						});
					}
				} catch (e) {
					console.error("Error processing message", e);
				}
			});

			clientWs.on("close", () => {
				try {
					if (session && typeof session.close === "function") {
						session.close();
					}
				} catch (e) {
					/* ignore */
				}
			});
		});

		expressApp.all(/.*/, (req, res) => {
			const parsedUrl = parse(req.url!, true);
			handle(req, res, parsedUrl);
		});

		server.listen(port, () => {
			console.log(`> Ready on http://${hostname}:${port}`);
		});
	})
	.catch((err) => {
		console.error("Error starting server:", err);
		process.exit(1);
	});
