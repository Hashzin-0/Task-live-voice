"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2, Settings, X, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
	let binary = "";
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
	onUpdateTodo,
}: {
	todos: { id: string; text: string; completed: boolean; dueDate?: string }[];
	onAddTodo: (text: string, dueDate?: string) => void;
	onToggleTodo: (id: string) => void;
	onDeleteTodo: (id: string) => void;
	onUpdateTodo: (id: string, text: string, dueDate?: string) => void;
}) {
	const [isActive, setIsActive] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [showSettings, setShowSettings] = useState(false);

	// Settings State
	const [voiceName, setVoiceName] = useState("Puck");
	const [personality, setPersonality] = useState(
		"Friendly, cheerful, and encouraging",
	);
	const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
	const [customWakeWords, setCustomWakeWords] = useState<string[]>([]);
	const [isTrainingWakeWord, setIsTrainingWakeWord] = useState(false);

	const [userName, setUserName] = useState("");
	const [assistantName, setAssistantName] = useState("Alex");
	const [verbosity, setVerbosity] = useState("concise");
	const [speechSpeed, setSpeechSpeed] = useState("normal");
	const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
	const [onlineSearchEnabled, setOnlineSearchEnabled] = useState(false);
	const [locationEnabled, setLocationEnabled] = useState(false);
	const [cameraEnabled, setCameraEnabled] = useState(false);

	const wsRef = useRef<WebSocket | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const nextStartTimeRef = useRef(0);
	const streamRef = useRef<MediaStream | null>(null);
	const processorRef = useRef<ScriptProcessorNode | null>(null);
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const videoIntervalRef = useRef<any>(null);

	const todosRef = useRef(todos);
	useEffect(() => {
		todosRef.current = todos;
	}, [todos]);

	// Load/Save settings
	useEffect(() => {
		const savedVoice = localStorage.getItem("voiceName");
		const savedPersonality = localStorage.getItem("personality");
		const savedWakeWord = localStorage.getItem("wakeWord");
		const savedUserName = localStorage.getItem("userName");
		const savedAssistantName = localStorage.getItem("assistantName");
		const savedVerbosity = localStorage.getItem("verbosity");
		const savedSpeechSpeed = localStorage.getItem("speechSpeed");
		const savedSoundEffects = localStorage.getItem("soundEffects");
		const savedOnlineSearch = localStorage.getItem("onlineSearch");
		const savedLocation = localStorage.getItem("location");
		const savedCamera = localStorage.getItem("cameraEnabled");

		if (savedVoice) setVoiceName(savedVoice);
		if (savedPersonality) setPersonality(savedPersonality);
		if (savedWakeWord) setWakeWordEnabled(savedWakeWord === "true");
		if (savedUserName) setUserName(savedUserName);
		if (savedAssistantName) setAssistantName(savedAssistantName);
		if (savedVerbosity) setVerbosity(savedVerbosity);
		if (savedSpeechSpeed) setSpeechSpeed(savedSpeechSpeed);
		if (savedSoundEffects !== null)
			setSoundEffectsEnabled(savedSoundEffects === "true");
		if (savedOnlineSearch !== null)
			setOnlineSearchEnabled(savedOnlineSearch === "true");
		if (savedLocation !== null) setLocationEnabled(savedLocation === "true");
		if (savedCamera !== null) setCameraEnabled(savedCamera === "true");
	}, []);

	useEffect(() => {
		localStorage.setItem("voiceName", voiceName);
		localStorage.setItem("personality", personality);
		localStorage.setItem("wakeWord", wakeWordEnabled.toString());
		localStorage.setItem("userName", userName);
		localStorage.setItem("assistantName", assistantName);
		localStorage.setItem("verbosity", verbosity);
		localStorage.setItem("speechSpeed", speechSpeed);
		localStorage.setItem("soundEffects", soundEffectsEnabled.toString());
		localStorage.setItem("onlineSearch", onlineSearchEnabled.toString());
		localStorage.setItem("location", locationEnabled.toString());
		localStorage.setItem("cameraEnabled", cameraEnabled.toString());
	}, [
		voiceName,
		personality,
		wakeWordEnabled,
		userName,
		assistantName,
		verbosity,
		speechSpeed,
		soundEffectsEnabled,
		onlineSearchEnabled,
		locationEnabled,
		cameraEnabled,
	]);

	// Load/Save custom wake words
	useEffect(() => {
		const saved = localStorage.getItem("customWakeWords");
		if (saved) {
			try {
				setCustomWakeWords(JSON.parse(saved));
			} catch (e) {}
		}
	}, []);

	useEffect(() => {
		localStorage.setItem("customWakeWords", JSON.stringify(customWakeWords));
	}, [customWakeWords]);

	useEffect(() => {
		if (wakeWordEnabled && typeof window !== "undefined") {
			navigator.mediaDevices
				.getUserMedia({ audio: true })
				.then((stream) => stream.getTracks().forEach((t) => t.stop()))
				.catch(() =>
					console.error("Microphone permission denied or not supported"),
				);
		}
	}, [wakeWordEnabled]);

	const trainWakeWord = () => {
		if (customWakeWords.length >= 5) {
			alert(
				"Você atingiu o limite de 5 formas de chamá-lo. Limpe para adicionar novas.",
			);
			return;
		}
		setIsTrainingWakeWord(true);
		const SpeechRecognition =
			(window as any).SpeechRecognition ||
			(window as any).webkitSpeechRecognition;
		if (SpeechRecognition) {
			const rec = new SpeechRecognition();
			rec.lang = "pt-BR";
			rec.onresult = (e: any) => {
				const resultStr = e.results[0][0].transcript.toLowerCase().trim();
				// If it's brief, we assume it's their pronunciation of Alex
				if (resultStr.split(" ").length <= 3) {
					setCustomWakeWords((prev) =>
						Array.from(new Set([...prev, resultStr])),
					);
				}
				setIsTrainingWakeWord(false);
			};
			rec.onerror = () => setIsTrainingWakeWord(false);
			rec.onend = () => setIsTrainingWakeWord(false);
			try {
				rec.start();
			} catch (err) {
				setIsTrainingWakeWord(false);
			}
		} else {
			setIsTrainingWakeWord(false);
			alert("Seu navegador não suporta reconhecimento de voz.");
		}
	};

	const playSoundEffect = (freq = 880, duration = 0.1) => {
		if (!soundEffectsEnabled) return;
		try {
			const ctx = new (
				window.AudioContext || (window as any).webkitAudioContext
			)();
			const osc = ctx.createOscillator();
			osc.frequency.value = freq;
			osc.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + duration);
		} catch (e) {}
	};

	// Wake Word listener implementation
	useEffect(() => {
		let recognition: any;
		if (
			wakeWordEnabled &&
			!isActive &&
			!isTrainingWakeWord &&
			typeof window !== "undefined"
		) {
			const SpeechRecognition =
				(window as any).SpeechRecognition ||
				(window as any).webkitSpeechRecognition;
			if (SpeechRecognition) {
				recognition = new SpeechRecognition();
				recognition.continuous = true;
				recognition.interimResults = true;
				recognition.lang = "pt-BR"; // Portuguese

				let wakeWordMatchedInCurrentSentence = false;

				recognition.onresult = (event: any) => {
					for (let i = event.resultIndex; i < event.results.length; ++i) {
						const transcript = event.results[i][0].transcript.toLowerCase();
						const isFinal = event.results[i].isFinal;

						const baseMatches = transcript.match(/alex|áleks|aléks|aleks/);
						const aliasMatch =
							assistantName && transcript.includes(assistantName.toLowerCase())
								? assistantName.toLowerCase()
								: null;
						const customMatch = customWakeWords.find((w) =>
							transcript.includes(w),
						);
						const matchStr = baseMatches
							? baseMatches[0]
							: aliasMatch || customMatch || null;

						if (matchStr) {
							if (!wakeWordMatchedInCurrentSentence) {
								wakeWordMatchedInCurrentSentence = true;
								// Play a small beep sound directly optionally
								try {
									const ctx = new window.AudioContext();
									const osc = ctx.createOscillator();
									osc.frequency.value = 880;
									osc.connect(ctx.destination);
									osc.start();
									osc.stop(ctx.currentTime + 0.1);
								} catch (e) {}
							}

							if (isFinal) {
								recognition.stop();
								wakeWordMatchedInCurrentSentence = false;

								// Extract remaining intent
								const idx = transcript.indexOf(matchStr);
								const remaining = transcript
									.substring(idx + matchStr.length)
									.trim();

								startVoice(remaining);
								break;
							}
						}
					}
				};

				recognition.onerror = (e: any) => {
					console.log("Speech recognition error", e.error);
				};

				try {
					recognition.start();
				} catch (e) {
					console.log("Could not start recognition", e);
				}
			}
		}

		return () => {
			if (recognition) {
				try {
					recognition.stop();
				} catch (e) {}
			}
		};
	}, [wakeWordEnabled, isActive, isTrainingWakeWord, customWakeWords]);

	const toggleVoice = async () => {
		if (isActive) {
			stopVoice();
		} else {
			await startVoice();
		}
	};

	const stopVoice = () => {
		if (videoIntervalRef.current) {
			clearInterval(videoIntervalRef.current);
			videoIntervalRef.current = null;
		}
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
			streamRef.current.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
		}
		playingSourcesRef.current.forEach((source) => {
			try {
				source.stop();
			} catch (e) {}
		});
		playingSourcesRef.current.clear();
		if (audioCtxRef.current) {
			audioCtxRef.current.close();
			audioCtxRef.current = null;
		}
		setIsActive(false);
		setIsConnecting(false);
	};

	const startVoice = async (initialPrompt?: string) => {
		try {
			setIsConnecting(true);
			const host = window.location.host;
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const ws = new WebSocket(`${protocol}//${host}/live`);
			wsRef.current = ws;

			ws.onopen = async () => {
				let latLng = null;
				if (locationEnabled && "geolocation" in navigator) {
					try {
						const getLoc = () =>
							new Promise<GeolocationPosition>((resolve, reject) => {
								navigator.geolocation.getCurrentPosition(resolve, reject, {
									timeout: 3000,
								});
							});
						const pos = await getLoc();
						latLng = {
							latitude: pos.coords.latitude,
							longitude: pos.coords.longitude,
						};
					} catch (e) {
						console.warn("Could not retrieve location.");
					}
				}

				// Send init message for system instruction and voice
				ws.send(
					JSON.stringify({
						type: "init",
						config: {
							voiceName,
							personality,
							initialPrompt,
							userName,
							assistantName,
							verbosity,
							speechSpeed,
							onlineSearchEnabled,
							latLng,
						},
					}),
				);

				const audioCtx = new AudioContext({ sampleRate: 16000 });
				audioCtxRef.current = audioCtx;
				nextStartTimeRef.current = 0;

				const stream = await navigator.mediaDevices.getUserMedia({
					audio: true,
					video: cameraEnabled,
				});
				streamRef.current = stream;

				if (cameraEnabled && videoRef.current) {
					videoRef.current.srcObject = stream;
					videoRef.current.play();

					videoIntervalRef.current = setInterval(() => {
						if (ws.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
							const video = videoRef.current;
							const canvas = canvasRef.current;
							if (video.videoWidth > 0 && video.videoHeight > 0) {
								canvas.width = video.videoWidth;
								canvas.height = video.videoHeight;
								const ctx = canvas.getContext('2d');
								if (ctx) {
									ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
									const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
									ws.send(JSON.stringify({ image: base64 }));
								}
							}
						}
					}, 1000); // 1 frame per second
				}

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
			};

			ws.onmessage = (event) => {
				const msg = JSON.parse(event.data);

				if (msg.type === "ready") {
					setIsConnecting(false);
					setIsActive(true);
				}

				if (msg.audio && audioCtxRef.current) {
					const audioCtx = audioCtxRef.current;
					const binaryArray = Uint8Array.from(atob(msg.audio), (c) =>
						c.charCodeAt(0),
					);
					const i16Array = new Int16Array(binaryArray.buffer);
					const f32Array = new Float32Array(i16Array.length);
					for (let i = 0; i < i16Array.length; i++) {
						f32Array[i] = i16Array[i] / 32768.0;
					}

					let bufSampleRate = 24000;
					const audioBuffer = audioCtx.createBuffer(
						1,
						f32Array.length,
						bufSampleRate,
					);
					audioBuffer.getChannelData(0).set(f32Array);

					const source = audioCtx.createBufferSource();
					source.buffer = audioBuffer;
					source.connect(audioCtx.destination);

					source.onended = () => {
						playingSourcesRef.current.delete(source);
					};
					playingSourcesRef.current.add(source);

					const t = audioCtx.currentTime;
					if (nextStartTimeRef.current < t) nextStartTimeRef.current = t;
					source.start(nextStartTimeRef.current);
					nextStartTimeRef.current += audioBuffer.duration;
				}
				if (msg.interrupted) {
					playingSourcesRef.current.forEach((source) => {
						try {
							source.stop();
						} catch (e) {}
					});
					playingSourcesRef.current.clear();
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
		const calls = toolCallMsg.functionCalls || [];
		const responses = [];

		for (const call of calls) {
			const args = call.args || {};
			let result: any;
			try {
				if (call.name === "addTodo") {
					onAddTodo(args.text, args.dueDate);
					result = { success: true, message: `Added task: ${args.text}` };
				} else if (call.name === "toggleTodo") {
					onToggleTodo(args.id);
					result = { success: true };
				} else if (call.name === "deleteTodo") {
					onDeleteTodo(args.id);
					result = { success: true };
				} else if (call.name === "updateTodo") {
					onUpdateTodo(args.id, args.text, args.dueDate);
					result = { success: true, message: `Updated task to: ${args.text}` };
				} else if (call.name === "getTodos") {
					result = { todos: todosRef.current };
				} else {
					result = { error: "Unknown function" };
				}
			} catch (err: any) {
				result = { error: err.message };
			}

			responses.push({
				name: call.name,
				id: call.id,
				response: result,
			});
		}

		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ toolResponse: responses }));
		}
	};

	return (
		<>
			<video ref={videoRef} autoPlay playsInline className="hidden" muted />
			<canvas ref={canvasRef} className="hidden" />
			<div className="fixed bottom-8 right-8 z-50 flex flex-col items-center gap-4">
				{isActive && (
					<motion.div
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md border border-slate-100 flex items-center gap-2"
					>
						<Activity className="h-4 w-4 text-indigo-500 animate-pulse" />
						<span className="text-sm font-medium text-slate-700 animate-pulse">
							Ouvindo...
						</span>
					</motion.div>
				)}
				<div className="flex items-center gap-3">
					<button
						onClick={() => setShowSettings(true)}
						className="p-3 bg-white rounded-full shadow-md text-slate-500 hover:text-indigo-600 transition-colors border border-slate-100 disabled:opacity-50"
						disabled={isActive || isConnecting}
					>
						<Settings className="h-5 w-5" />
					</button>
					<motion.button
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						onClick={toggleVoice}
						disabled={isConnecting}
						className={`relative flex items-center justify-center p-4 rounded-full shadow-lg text-white transition-colors duration-300 ${
							isActive
								? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
								: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30"
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
			</div>

			<AnimatePresence>
				{showSettings && (
					<div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm">
						<motion.div
							initial={{ opacity: 0, y: 20, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 20, scale: 0.95 }}
							className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
						>
							<div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
								<h3 className="font-semibold text-slate-800 flex items-center gap-2">
									<Settings className="h-5 w-5 text-indigo-500" />
									Configurações do Alex
								</h3>
								<button
									onClick={() => setShowSettings(false)}
									className="text-slate-400 hover:text-slate-600 transition-colors bg-white p-1 rounded-full border border-slate-100"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="p-4 overflow-y-auto space-y-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{/* Basic Voice Settings */}
									<div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-3">
										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Voz do Alex
											</label>
											<select
												value={voiceName}
												onChange={(e) => setVoiceName(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											>
												<option value="Aoede">Feminina Calma (Aoede)</option>
												<option value="Kore">Feminina Enérgica (Kore)</option>
												<option value="Puck">Masculina Jovem (Puck)</option>
												<option value="Charon">Masculina Grave (Charon)</option>
												<option value="Fenrir">Andrógina (Fenrir)</option>
											</select>
										</div>

										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Personalidade
											</label>
											<select
												value={personality}
												onChange={(e) => setPersonality(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											>
												<option value="Friendly, cheerful, and encouraging">
													Simpático e Amigável
												</option>
												<option value="Strict, direct taskmaster">
													Treinador Direto
												</option>
												<option value="Humorous and playful">
													Brincalhão (Humor)
												</option>
												<option value="Calm, relaxing, and mindful">
													Minimalista
												</option>
											</select>
										</div>
									</div>

									{/* How Assistant Interacts */}
									<div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-3">
										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Seu Nome
											</label>
											<input
												type="text"
												placeholder="Como devo te chamar?"
												value={userName}
												onChange={(e) => setUserName(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											/>
										</div>

										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Nome do Assistente
											</label>
											<input
												type="text"
												placeholder="Ex: Alex, Micael, Geovana"
												value={assistantName}
												onChange={(e) => setAssistantName(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											/>
										</div>

										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Estilo de Resposta
											</label>
											<select
												value={verbosity}
												onChange={(e) => setVerbosity(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											>
												<option value="concise">Curtas e Diretas</option>
												<option value="detailed">Longas e Detalhadas</option>
											</select>
										</div>
									</div>

									<div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-3">
										<div>
											<label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
												Velocidade
											</label>
											<select
												value={speechSpeed}
												onChange={(e) => setSpeechSpeed(e.target.value)}
												className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
											>
												<option value="slow">Devagar</option>
												<option value="normal">Normal</option>
												<option value="fast">Rápida</option>
											</select>
										</div>
									</div>

									<div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-3">
										<div className="flex items-center justify-between">
											<div>
												<label className="block text-sm font-semibold text-slate-700 mb-0.5">
													Efeitos Sonoros
												</label>
												<p className="text-[10px] text-slate-500">
													Notificações e beeps
												</p>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													className="sr-only peer"
													checked={soundEffectsEnabled}
													onChange={(e) =>
														setSoundEffectsEnabled(e.target.checked)
													}
												/>
												<div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
											</label>
										</div>

										<div className="flex items-center justify-between border-t border-slate-50 pt-3">
											<div>
												<label className="block text-sm font-semibold text-slate-700 mb-0.5">
													Pesquisa na Web
												</label>
												<p className="text-[10px] text-slate-500">
													Permitir buscar informações online
												</p>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													className="sr-only peer"
													checked={onlineSearchEnabled}
													onChange={(e) =>
														setOnlineSearchEnabled(e.target.checked)
													}
												/>
												<div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
											</label>
										</div>

										<div className="flex items-center justify-between border-t border-slate-50 pt-3">
											<div>
												<label className="block text-sm font-semibold text-slate-700 mb-0.5">
													Acesso à Localização
												</label>
												<p className="text-[10px] text-slate-500">
													Permitir usar sua geolocalização
												</p>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													className="sr-only peer"
													checked={locationEnabled}
													onChange={(e) => {
														setLocationEnabled(e.target.checked);
														if (
															e.target.checked &&
															"geolocation" in navigator
														) {
															navigator.geolocation.getCurrentPosition(
																() => {},
																() => {
																	alert(
																		"Permissão de localização negada ou indisponível.",
																	);
																	setLocationEnabled(false);
																},
															);
														}
													}}
												/>
												<div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
											</label>
										</div>

										<div className="flex items-center justify-between border-t border-slate-50 pt-3">
											<div>
												<label className="block text-sm font-semibold text-slate-700 mb-0.5">
													Acesso à Câmera e Sensores
												</label>
												<p className="text-[10px] text-slate-500">
													Permitir que o assistente enxergue
												</p>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													className="sr-only peer"
													checked={cameraEnabled}
													onChange={async (e) => {
														const checked = e.target.checked;
														setCameraEnabled(checked);
														if (checked && navigator.mediaDevices) {
															try {
																// Request camera permission
																const stream = await navigator.mediaDevices.getUserMedia({ video: true });
																// Stop immediately since we just want permission right now
																stream.getTracks().forEach(t => t.stop());
															} catch (err) {
																alert("Permissão de câmera negada ou indisponível.");
																setCameraEnabled(false);
															}
														}
													}}
												/>
												<div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
											</label>
										</div>
									</div>
								</div>

								{/* Wake Word Block */}
								<div className="p-4 border border-slate-100 rounded-2xl bg-indigo-50/50 shadow-sm">
									<div className="flex items-center justify-between mb-4">
										<div className="pr-4">
											<label className="block text-sm font-semibold text-slate-800">
												Palavra de Ativação "{assistantName || "Alex"}"
											</label>
											<p className="text-xs text-slate-500 mt-1">
												Ligar a escuta automaticamente dizendo "
												{assistantName || "Alex"}".
											</p>
										</div>
										<label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
											<input
												type="checkbox"
												className="sr-only peer"
												checked={wakeWordEnabled}
												onChange={(e) => setWakeWordEnabled(e.target.checked)}
											/>
											<div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
										</label>
									</div>

									<div className="pt-4 border-t border-indigo-100">
										<label className="block text-sm font-medium text-slate-700">
											Treinamento (Seu Timbre)
										</label>
										<p className="text-[11px] text-slate-500 mb-3 mt-1">
											Grave até 5 formas que você fala o nome "Alex" para que
											ele não se perca no seu sotaque.
										</p>

										{isTrainingWakeWord ? (
											<button
												onClick={() => setIsTrainingWakeWord(false)}
												className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-100 text-red-600 rounded-xl text-sm font-medium border border-red-200 transition-colors"
											>
												<Activity className="h-4 w-4 animate-pulse" />{" "}
												Ouvindo... Diga "{assistantName || "Alex"}"
											</button>
										) : (
											<button
												onClick={trainWakeWord}
												disabled={customWakeWords.length >= 5}
												className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-indigo-700 hover:bg-indigo-50 rounded-xl text-sm font-medium border border-indigo-200 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											>
												<Mic className="h-4 w-4" /> Gravar nova pronúncia (
												{customWakeWords.length}/5)
											</button>
										)}

										{customWakeWords.length > 0 && (
											<div className="mt-3 flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border border-slate-100">
												<span className="text-[10px] text-slate-400 font-medium">
													Aprendeu:
												</span>
												{customWakeWords.map((ww, i) => (
													<span
														key={i}
														className="text-[10px] uppercase tracking-wider font-semibold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md"
													>
														{ww}
													</span>
												))}
												<button
													onClick={() => setCustomWakeWords([])}
													className="text-xs text-red-500 hover:text-red-700 ml-auto font-medium px-2"
												>
													Resetar
												</button>
											</div>
										)}
									</div>
								</div>
							</div>

							<div className="p-4 border-t border-slate-100 bg-white flex justify-end flex-shrink-0">
								<button
									onClick={() => setShowSettings(false)}
									className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors shadow-md"
								>
									Concluído
								</button>
							</div>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</>
	);
}
