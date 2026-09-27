"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Trash2, Moon, Sun, Search, FileText, LogOut, LogIn, UserPlus, Database, History, X, Plus } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import AuthModal from "./components/AuthModal";
import AdminPanel from "./components/AdminPanel";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; question: string; answer: string; timestamp: string; }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { user, logout, token } = useAuth();

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${BACKEND_URL}/chat/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch chat history", error);
    }
  };

  useEffect(() => {
    if (token) {
      fetchHistory();
    } else {
      setHistory([]);
    }
  }, [token]);

  // Handle hydration mismatch and initial theme
  useEffect(() => {
    setIsMounted(true);
    setMessages([
      {
        id: "1",
        role: "ai",
        content: "Hello! I'm your AI Assistant. I can answer questions based on the documentation provided. How can I help you today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: currentTime,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ question: input }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await response.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMessage]);
      fetchHistory();
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "I'm having trouble reaching the knowledge base. Please ensure the backend server is running and CORS is enabled.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "1",
        role: "ai",
        content: "Hello! I'm your AI Assistant. I can answer questions based on the documentation provided. How can I help you today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const startNewChat = () => {
    setMessages([
      {
        id: "1",
        role: "ai",
        content: "Hello! I'm your AI Assistant. I can answer questions based on the documentation provided. How can I help you today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInput("");
    if (window.innerWidth < 768) {
      setIsHistoryOpen(false);
    }
  };

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  if (!isMounted) return <div className="h-screen bg-background" />;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground transition-colors duration-300">
      <div className="gradient-bg" />
      
      {/* Header */}
      <header className="glass sticky top-0 z-10 border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user && (
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="p-2 hover:bg-accent rounded-xl transition-all"
              title="Toggle Chat History"
            >
              <History className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          <div className="bg-primary p-2 rounded-xl">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">RAG Assistant</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Powered by Gemini & Pinecone</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* User Auth Section */}
          <div className="flex items-center gap-2 border-r pr-4 mr-2 hidden sm:flex">
            {user ? (
              <div className="flex items-center gap-3">
                {user.is_admin && (
                  <button 
                    onClick={() => setIsAdminPanelOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full transition-all active:scale-95 mr-1"
                    title="Open Knowledge Panel"
                  >
                    <Database className="w-3.5 h-3.5" /> KB Panel
                  </button>
                )}
                <div className="text-right">
                  <p className="text-sm font-bold leading-none">{user.full_name || 'User'}</p>
                  <p className="text-[10px] text-muted-foreground">{user.email}</p>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-accent rounded-full transition-all"
                >
                  <LogIn className="w-4 h-4" /> Sign In
                </button>
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-primary text-white rounded-full shadow-md hover:opacity-90 active:scale-95 transition-all"
                >
                  <UserPlus className="w-4 h-4" /> Get Started
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={toggleDarkMode}
            className="p-2 hover:bg-accent rounded-full transition-colors"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={clearChat}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-muted-foreground"
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Chat History Sidebar */}
        {user && (
          <aside 
            className={`w-80 border-r bg-card/65 backdrop-blur-md flex flex-col shrink-0 transition-all duration-300 ease-in-out md:relative absolute inset-y-0 left-0 z-20 md:z-0 h-full ${
              isHistoryOpen ? "translate-x-0" : "-translate-x-full md:-ml-80"
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-accent/10">
              <div className="flex items-center gap-2 font-bold text-sm">
                <History className="w-4 h-4 text-primary" />
                <span>Recent Questions</span>
              </div>
              <button 
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 hover:bg-accent rounded-lg transition-colors md:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="p-3 border-b">
              <button
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 group"
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                New Chat
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-xs text-muted-foreground p-4">
                  <Database className="w-8 h-8 opacity-30 mb-2" />
                  <p>No recently asked questions yet.</p>
                  <p className="opacity-60 mt-1">Your questions will appear here once you chat!</p>
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const pastTime = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      setMessages([
                        {
                          id: "1",
                          role: "ai",
                          content: "Hello! I'm your AI Assistant. I can answer questions based on the documentation provided. How can I help you today?",
                          timestamp: pastTime,
                        },
                        {
                          id: `user-${item.id}`,
                          role: "user",
                          content: item.question,
                          timestamp: pastTime,
                        },
                        {
                          id: `ai-${item.id}`,
                          role: "ai",
                          content: item.answer,
                          timestamp: pastTime,
                        }
                      ]);
                      if (window.innerWidth < 768) {
                        setIsHistoryOpen(false);
                      }
                    }}
                    className="w-full text-left p-3 rounded-xl hover:bg-accent/40 border border-transparent hover:border-accent/30 active:scale-[0.98] transition-all group flex flex-col gap-1.5"
                  >
                    <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary pr-2 transition-colors">
                      {item.question}
                    </span>
                    <span className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.answer}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 font-medium ml-auto mt-0.5">
                      {new Date(item.timestamp).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          {/* Main Content */}
          <main className="flex-1 overflow-hidden flex flex-col max-w-5xl mx-auto w-full px-4 sm:px-6">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto py-8 space-y-6 scrollbar-hide">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex items-start gap-3 max-w-[85%]`}>
                {message.role === "ai" && (
                  <div className="mt-1 bg-card border p-1.5 rounded-lg shadow-sm">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`chat-bubble ${
                    message.role === "user" ? "chat-bubble-user" : "chat-bubble-ai border"
                  }`}
                >
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  <span className={`text-[10px] mt-2 block opacity-60 ${message.role === "user" ? "text-right" : ""}`}>
                    {message.timestamp}
                  </span>
                </div>
                {message.role === "user" && (
                  <div className="mt-1 bg-primary p-1.5 rounded-lg shadow-sm">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-card border p-1.5 rounded-lg shadow-sm">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="chat-bubble chat-bubble-ai border flex items-center h-12 px-6">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="py-6 px-2">
          <form
            onSubmit={handleSubmit}
            className="glass relative flex items-center gap-2 p-2 rounded-2xl border shadow-lg focus-within:ring-2 focus-within:ring-primary/20 transition-all"
          >
            <div className="p-2 text-muted-foreground">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={user ? "Ask about borewell pumps..." : "Sign in to ask questions..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`p-3 rounded-xl transition-all ${
                input.trim() && !isLoading
                  ? "bg-primary text-white shadow-md hover:scale-105 active:scale-95"
                  : "bg-accent text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <button 
              onClick={() => setInput("What are the main types of borewell pumps?")}
              className="text-[11px] font-medium bg-card hover:bg-accent border px-3 py-1.5 rounded-full transition-colors text-muted-foreground flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3" /> Types of pumps
            </button>
            <button 
              onClick={() => setInput("How to maintain a submersible pump?")}
              className="text-[11px] font-medium bg-card hover:bg-accent border px-3 py-1.5 rounded-full transition-colors text-muted-foreground flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3" /> Maintenance
            </button>
          </div>
        </div>
          </main>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />

      {/* Admin Panel */}
      <AdminPanel 
        isOpen={isAdminPanelOpen} 
        onClose={() => setIsAdminPanelOpen(false)} 
      />

      {/* Footer Info */}
      <footer className="py-4 text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em] opacity-50">
        AI responses are based on the uploaded knowledge base
      </footer>
    </div>
  );
}
