import React, { useState, useEffect, useRef } from 'react';
import './Assistant.css';
import { AssistantMessage } from './AssistantMessage';

// Keep this configurable
const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';

export const AssistantChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [listening, setListening] = useState(false);
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);

    // Auto-scroll
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Initial welcome
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'init',
                    type: 'ai',
                    content: 'Hallo! Ich bin Ihr Clinicon-Assistent. Wie kann ich helfen?',
                    timestamp: Date.now()
                }
            ]);
        }

        // Init Speech Recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'de-DE';

            recognition.onstart = () => setListening(true);
            recognition.onend = () => setListening(false);

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                // Append unique final result
                if (finalTranscript) {
                    setInput(prev => {
                        const trimmed = prev.trim();
                        return trimmed ? `${trimmed} ${finalTranscript}` : finalTranscript;
                    });
                }
            };

            recognition.onerror = (event) => {
                console.error("Speech error", event.error);
                setListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleOpen = () => setIsOpen(!isOpen);

    const toggleDictation = () => {
        if (!recognitionRef.current) {
            alert("Spracherkennung wird von diesem Browser nicht unterstützt.");
            return;
        }
        if (listening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    const sendMessage = async () => {
        if (!input.trim()) return;
        const userMsg = {
            id: crypto.randomUUID(),
            type: 'user',
            content: input,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const resp = await fetch(`${API_BASE}/assistant/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg.content })
                // Note: Context (dept, year, etc.) should be passed here in future
            });

            if (!resp.ok) throw new Error('Netzwerkfehler');
            const data = await resp.json();

            const aiMsg = {
                id: crypto.randomUUID(),
                type: 'ai',
                timestamp: Date.now(),
                // Check response type
                content: data.message || 'Kein Text',
                isProposal: data.type === 'proposal',
                proposal: data.proposal, // { commit_token, summary, ... }
                parsed: data.parsed
            };

            setMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                type: 'ai',
                content: 'Entschuldigung, es gab einen Fehler bei der Anfrage: ' + err.message
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async (msgId, proposal) => {
        setLoading(true);
        // Mark message as processing?
        try {
            const resp = await fetch(`${API_BASE}/assistant/commit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commit_token: proposal.commit_token })
            });
            const data = await resp.json();

            // Update the message to show it was executed
            setMessages(prev => prev.map(m => {
                if (m.id === msgId) {
                    return { ...m, status: 'executed', content: data.message || 'Ausgeführt.' };
                }
                return m;
            }));

            // Add a follow up message with result
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                type: 'ai',
                content: data.message || 'Die Änderung wurde gespeichert.'
            }]);

        } catch (err) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                type: 'ai',
                content: 'Fehler beim Speichern: ' + err.message
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = (msgId) => {
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                return { ...m, status: 'cancelled' };
            }
            return m;
        }));
    };

    return (
        <>
            <div className="assistant-fab" onClick={toggleOpen}>
                {isOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                )}
            </div>

            {isOpen && (
                <div className="assistant-panel glass">
                    <div className="assistant-header">
                        Clinicon Assistent
                        <div style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>Beta</div>
                    </div>

                    <div className="assistant-messages">
                        {messages.map(msg => (
                            <AssistantMessage
                                key={msg.id}
                                msg={msg}
                                onConfirm={handleCommit}
                                onCancel={handleCancel}
                            />
                        ))}
                        {loading && (
                            <div className="msg msg-ai" style={{ opacity: 0.7 }}>
                                <i>Schreibt...</i>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="assistant-input-area">
                        <button
                            className={`assistant-send ${listening ? 'mic-active' : ''}`}
                            onClick={toggleDictation}
                            style={{ marginRight: 8, background: listening ? '#ef4444' : 'transparent', color: listening ? 'white' : '#64748b', border: '1px solid #e2e8f0' }}
                            title="Sprechen"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </svg>
                        </button>
                        <input
                            className="assistant-input"
                            placeholder={listening ? "Höre zu..." : "Frage oder Befehl..."}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            disabled={loading}
                            autoFocus
                        />
                        <button className="assistant-send" onClick={sendMessage} disabled={loading}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
