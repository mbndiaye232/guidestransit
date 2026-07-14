import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Mic, MicOff, Volume2, VolumeX, Image as ImageIcon, ZoomIn, Loader2, Sparkles, Volume1 } from 'lucide-react';
import './AssistantPopup.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001'; // Adresse du backend (configurable via VITE_API_BASE_URL)

export default function AssistantPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      type: 'assistant',
      text: "Bonjour ! Je suis votre assistant Soft Transit. Posez-moi vos questions par écrit ou en cliquant sur le micro. Je peux également vous montrer des captures d'écran du manuel d'utilisation.",
      screenshots: []
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [isAutoPlay, setIsAutoPlay] = useState(true); // Activer la réponse vocale automatique par défaut
  const [activeLightbox, setActiveLightbox] = useState(null); // URL de l'image agrandie

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Faire défiler vers le bas lors de l'ajout de messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Initialisation de la reconnaissance vocale du navigateur (Web Speech API - Gratuite)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'fr-FR';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsRecording(true);
      };

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handleSendMessage(transcript);
        }
      };

      rec.onerror = (event) => {
        console.error("Erreur de reconnaissance vocale du navigateur:", event.error);
        setIsRecording(false);
        if (event.error === 'not-allowed') {
          alert("L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres du navigateur.");
        }
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    } else {
      console.warn("La reconnaissance vocale native n'est pas supportée sur ce navigateur.");
    }

    // Charger les voix pour la synthèse vocale en avance
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }

    // Nettoyer la synthèse vocale en quittant
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Arrêter la lecture vocale si le popup se ferme
  useEffect(() => {
    if (!isOpen && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setPlayingAudioId(null);
    }
  }, [isOpen]);

  // Fonction pour faire parler le navigateur (TTS)
  const handleTogglePlayTTS = (text, messageId) => {
    if (!window.speechSynthesis) {
      console.warn("La synthèse vocale n'est pas supportée sur ce navigateur.");
      return;
    }

    // Débloquer la synthèse vocale si elle s'est mise en pause (bug Chrome courant)
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Si le message en cours est déjà en train de lire, on l'arrête
    if (playingAudioId === messageId) {
      window.speechSynthesis.cancel();
      setPlayingAudioId(null);
      return;
    }

    // Arrêter toute lecture vocale en cours
    window.speechSynthesis.cancel();

    // Sécurité si le texte est manquant
    const safeText = text ? String(text) : "";
    // Remplacer tous les symboles d'astérisque (*) pour éviter qu'ils soient lus oralement
    const cleanText = safeText.replace(/\*/g, '');
    
    if (!cleanText.trim()) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';

    // Sélectionner la meilleure voix française disponible
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice = voices.find(voice => voice.lang.startsWith('fr') || voice.lang.startsWith('FR'));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onend = () => {
      setPlayingAudioId(null);
    };

    utterance.onerror = (e) => {
      console.error("Erreur de synthèse vocale native:", e);
      // Ne pas réinitialiser si l'erreur est juste une interruption normale (ex: clic pour stopper)
      if (e.error !== 'interrupted') {
        setPlayingAudioId(null);
      }
    };

    setPlayingAudioId(messageId);
    
    // Léger délai pour s'assurer que le canal de synthèse vocale s'est bien libéré après cancel()
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  // Fonction pour envoyer un message texte
  const handleSendMessage = async (textToSend = inputText) => {
    const text = textToSend.trim();
    if (!text) return;

    // Ajouter le message de l'utilisateur à l'historique
    const userMessageId = Date.now().toString();
    setMessages(prev => [
      ...prev,
      { id: userMessageId, type: 'user', text: text }
    ]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) throw new Error("Erreur de communication avec le serveur.");

      const data = await response.json();
      const assistantMessageId = (Date.now() + 1).toString();
      
      // Ajouter la réponse de l'assistant à l'historique
      setMessages(prev => [
        ...prev,
        {
          id: assistantMessageId,
          type: 'assistant',
          text: data.text,
          screenshots: data.screenshots || []
        }
      ]);

      // Si la lecture automatique est activée, on lit la réponse à haute voix immédiatement
      if (isAutoPlay) {
        // Un court délai permet au navigateur de s'assurer de l'interaction utilisateur
        setTimeout(() => {
          handleTogglePlayTTS(data.text, assistantMessageId);
        }, 100);
      }
    } catch (error) {
      console.error("Erreur de requête RAG:", error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          text: "Désolé, je rencontre des difficultés de connexion avec le serveur RAG. Veuillez vérifier que votre backend Node.js est démarré.",
          screenshots: []
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Gérer le clic sur le micro (Démarrer/Arrêter la reconnaissance vocale gratuite)
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Votre navigateur ne supporte pas la reconnaissance vocale gratuite. Veuillez utiliser Google Chrome ou Microsoft Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      // Arrêter la lecture en cours avant d'écouter
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        setPlayingAudioId(null);
      }
      recognitionRef.current.start();
    }
  };

  return (
    <>
      {/* Bouton Flottant (Bulle de discussion) */}
      <button 
        className={`assistant-trigger-btn ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="Assistant Guide d'Utilisation"
        aria-label="Ouvrir l'assistant"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
        {!isOpen && <span className="pulse-dot"></span>}
      </button>

      {/* Fenêtre de Chat de l'Assistant */}
      {isOpen && (
        <div className="assistant-chat-window">
          {/* Header */}
          <div className="assistant-chat-header">
            <div className="header-info">
              <div className="header-icon-container">
                <Sparkles size={18} className="sparkle-icon" />
              </div>
              <div>
                <h3>Assistant Soft Transit</h3>
                <span className="online-badge">RAG - Mode Test Gratuit</span>
              </div>
            </div>
            <div className="header-controls">
              {/* Bouton de contrôle de lecture automatique */}
              <button 
                className={`header-control-btn ${isAutoPlay ? 'active' : ''}`}
                onClick={() => {
                  const nextVal = !isAutoPlay;
                  setIsAutoPlay(nextVal);
                  if (!nextVal && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    setPlayingAudioId(null);
                  }
                }}
                title={isAutoPlay ? "Désactiver la lecture vocale automatique" : "Activer la lecture vocale automatique"}
              >
                {isAutoPlay ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button className="close-btn" onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Corps de Chat (Messages) */}
          <div className="assistant-chat-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.type}`}>
                <div className="message-bubble">
                  <p>{msg.text}</p>
                  
                  {/* Option Synthèse Vocale pour l'Assistant */}
                  {msg.type === 'assistant' && (
                    <button 
                      className={`tts-btn ${playingAudioId === msg.id ? 'playing' : ''}`}
                      onClick={() => handleTogglePlayTTS(msg.text, msg.id)}
                      title="Lire à haute voix (Gratuit)"
                    >
                      {playingAudioId === msg.id ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                  )}
                </div>

                {/* Captures d'écran associées */}
                {msg.screenshots && msg.screenshots.length > 0 && (
                  <div className="message-screenshots">
                    <span className="screenshots-label">
                      <ImageIcon size={14} /> Captures d'écran associées :
                    </span>
                    <div className="screenshots-grid">
                      {msg.screenshots.map((shot, idx) => (
                        <div 
                          key={idx} 
                          className="screenshot-thumb-wrapper"
                          onClick={() => setActiveLightbox(`${API_BASE_URL}${shot.url}`)}
                        >
                          <img 
                            src={`${API_BASE_URL}${shot.url}`} 
                            alt={shot.title || `Page ${shot.pageNumber}`} 
                            className="screenshot-thumb"
                          />
                          <div className="thumb-overlay">
                            <ZoomIn size={18} />
                          </div>
                          <span className="screenshot-title">Page {shot.pageNumber}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Indicateur de chargement */}
            {isLoading && (
              <div className="chat-message assistant">
                <div className="message-bubble loading-bubble">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Recherche dans le guide...</span>
                </div>
              </div>
            )}
            
            {/* Scroll Anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Formulaire d'envoi et Micro */}
          <div className="assistant-chat-footer">
            <div className={`input-container ${isRecording ? 'recording-active' : ''}`}>
              {isRecording ? (
                <div className="recording-wave-container">
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <span className="recording-text">Parlez maintenant...</span>
                </div>
              ) : (
                <input 
                  type="text" 
                  placeholder="Posez une question sur Soft Transit..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isLoading}
                />
              )}

              {/* Bouton Micro */}
              <button 
                className={`footer-icon-btn mic-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={isLoading}
                title={isRecording ? "Arrêter l'enregistrement" : "Parler (Gratuit)"}
              >
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Bouton Envoyer */}
              {!isRecording && (
                <button 
                  className="footer-icon-btn send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputText.trim()}
                  title="Envoyer le message"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox pour zoomer sur la capture d'écran */}
      {activeLightbox && (
        <div className="lightbox-overlay" onClick={() => setActiveLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setActiveLightbox(null)}>
              <X size={24} />
            </button>
            <img src={activeLightbox} alt="Capture d'écran agrandie" className="lightbox-image" />
          </div>
        </div>
      )}
    </>
  );
}
