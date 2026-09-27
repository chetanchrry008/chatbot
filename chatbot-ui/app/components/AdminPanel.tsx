"use client";

import { useState, useEffect, useRef } from "react";
import { X, Database, Plus, Trash2, FileText, Upload, RefreshCw, AlertCircle, CheckCircle2, Loader2, BarChart2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface Dataset {
  id: string;
  title: string;
  source_type: "text" | "file";
  file_name?: string;
  chunk_ids: string[];
  char_count: number;
  chunk_count: number;
  created_at: string;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const { token, user } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeTab, setActiveTab] = useState<"manage" | "upload_file" | "add_text">("manage");
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text upload states
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isTextUploading, setIsTextUploading] = useState(false);

  // General states
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && token) {
      fetchDatasets();
    }
  }, [isOpen, token]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const fetchDatasets = async () => {
    setIsLoadingDatasets(true);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/datasets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load datasets. Please verify your admin credentials.");
      }

      const data = await response.json();
      setDatasets(data);
    } catch (error: any) {
      console.error("Error fetching datasets:", error);
      showNotification("error", error.message || "Failed to load datasets.");
    } finally {
      setIsLoadingDatasets(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validExtensions = [".pdf", ".txt", ".md"];
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      
      if (!hasValidExtension) {
        showNotification("error", "Invalid file type. Only PDF, TXT, and MD files are supported.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsFileUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${BACKEND_URL}/admin/upload-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "File upload failed.");
      }

      const data = await response.json();
      showNotification("success", `Successfully uploaded "${selectedFile.name}"! Created ${data.chunks_count} chunks.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDatasets();
      setActiveTab("manage");
    } catch (error: any) {
      console.error("File upload error:", error);
      showNotification("error", error.message || "Failed to upload file.");
    } finally {
      setIsFileUploading(false);
    }
  };

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textTitle.trim() || !textContent.trim()) return;

    setIsTextUploading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/upload-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: textTitle,
          content: textContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Text document upload failed.");
      }

      const data = await response.json();
      showNotification("success", `Successfully added dataset "${textTitle}"! Created ${data.chunks_count} chunks.`);
      setTextTitle("");
      setTextContent("");
      fetchDatasets();
      setActiveTab("manage");
    } catch (error: any) {
      console.error("Text upload error:", error);
      showNotification("error", error.message || "Failed to upload text.");
    } finally {
      setIsTextUploading(false);
    }
  };

  const handleDeleteDataset = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete dataset "${title}"? This will remove all associated vectors from Pinecone.`)) {
      return;
    }

    setIsDeletingId(id);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/datasets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete dataset.");
      }

      showNotification("success", `Dataset "${title}" deleted successfully.`);
      fetchDatasets();
    } catch (error: any) {
      console.error("Delete error:", error);
      showNotification("error", error.message || "Failed to delete dataset.");
    } finally {
      setIsDeletingId(null);
    }
  };

  if (!isOpen) return null;

  // Calculate quick stats
  const totalDatasets = datasets.length;
  const totalChunks = datasets.reduce((sum, d) => sum + d.chunk_count, 0);
  const totalChars = datasets.reduce((sum, d) => sum + d.char_count, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-card w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl border flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="relative p-6 border-b flex items-center justify-between bg-accent/20">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Knowledge Base Manager</h2>
              <p className="text-xs text-muted-foreground">Admin panel to upload, update, and manage your vector database datasets.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-full transition-colors"
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner Notifications */}
        {notification && (
          <div className={`p-4 text-sm flex items-center gap-3 transition-all duration-300 ${
            notification.type === "success" 
              ? "bg-green-500/10 border-b border-green-500/20 text-green-500" 
              : "bg-red-500/10 border-b border-red-500/20 text-red-500"
          }`}>
            {notification.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="font-medium">{notification.message}</span>
          </div>
        )}

        {/* Panel Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Sidebar Navigation & Quick Stats */}
          <div className="w-full md:w-64 border-r p-6 flex flex-col gap-6 bg-accent/5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Navigation</span>
              <button
                onClick={() => setActiveTab("manage")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                  activeTab === "manage"
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <Database className="w-4 h-4" /> Manage Datasets
              </button>
              <button
                onClick={() => setActiveTab("upload_file")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                  activeTab === "upload_file"
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <Upload className="w-4 h-4" /> Upload Document
              </button>
              <button
                onClick={() => setActiveTab("add_text")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                  activeTab === "add_text"
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <Plus className="w-4 h-4" /> Add Raw Text
              </button>
            </div>

            {/* Quick Stats */}
            <div className="mt-auto flex flex-col gap-3 p-4 bg-accent/20 rounded-2xl border">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <BarChart2 className="w-3.5 h-3.5 text-primary" /> Stats Summary
              </div>
              <div className="space-y-2.5 mt-1">
                <div>
                  <div className="text-2xl font-extrabold leading-none">{totalDatasets}</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Datasets</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold leading-none">{totalChunks}</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Chunks Split</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold leading-none">{(totalChars / 1000).toFixed(1)}k</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Characters</div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-card">
            
            {/* TAB 1: MANAGE DATASETS */}
            {activeTab === "manage" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">Active Datasets</h3>
                    <p className="text-sm text-muted-foreground">List of current document sources parsed and loaded into Pinecone index.</p>
                  </div>
                  <button 
                    onClick={fetchDatasets}
                    disabled={isLoadingDatasets}
                    className="p-2.5 bg-accent/50 hover:bg-accent border rounded-xl hover:scale-105 active:scale-95 transition-all text-muted-foreground"
                    title="Refresh List"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingDatasets ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {isLoadingDatasets ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Loading dataset inventory...</span>
                  </div>
                ) : datasets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-3xl p-8 text-center bg-accent/5">
                    <Database className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                    <h4 className="text-lg font-bold">No Datasets Found</h4>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1">Get started by uploading document files or copying text content directly into the chatbot database.</p>
                    <div className="flex gap-3 mt-6">
                      <button 
                        onClick={() => setActiveTab("upload_file")}
                        className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-full shadow-md hover:opacity-90 transition-all flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" /> Upload File
                      </button>
                      <button 
                        onClick={() => setActiveTab("add_text")}
                        className="px-4 py-2 text-sm font-semibold border hover:bg-accent rounded-full transition-all flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Add Text
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-2xl overflow-hidden shadow-sm bg-accent/5">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="bg-accent/30 border-b">
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Dataset / Title</th>
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Source</th>
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Chunks</th>
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Size (Chars)</th>
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Created At</th>
                            <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datasets.map((dataset) => (
                            <tr key={dataset.id} className="border-b last:border-b-0 hover:bg-accent/20 transition-colors">
                              <td className="p-4 font-bold flex items-center gap-2 max-w-xs truncate">
                                <FileText className="w-4 h-4 text-primary shrink-0" />
                                <span className="truncate" title={dataset.title}>{dataset.title}</span>
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  dataset.source_type === "file" 
                                    ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" 
                                    : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                }`}>
                                  {dataset.source_type}
                                </span>
                              </td>
                              <td className="p-4 text-center font-semibold text-muted-foreground">{dataset.chunk_count}</td>
                              <td className="p-4 text-center font-semibold text-muted-foreground">{dataset.char_count.toLocaleString()}</td>
                              <td className="p-4 text-xs text-muted-foreground font-medium">
                                {new Date(dataset.created_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleDeleteDataset(dataset.id, dataset.title)}
                                  disabled={isDeletingId === dataset.id}
                                  className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-xl transition-all disabled:opacity-50"
                                  title="Delete Dataset"
                                >
                                  {isDeletingId === dataset.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: UPLOAD DOCUMENT */}
            {activeTab === "upload_file" && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Upload Document File</h3>
                  <p className="text-sm text-muted-foreground">Upload a PDF, TXT, or MD document. The document will be automatically chunked, embedded, and stored in your vector space.</p>
                </div>

                <form onSubmit={handleFileUpload} className="space-y-6">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all hover:bg-accent/10 hover:border-primary/50 ${
                      selectedFile ? "border-primary bg-primary/5" : "border-muted-foreground/30"
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".pdf,.txt,.md"
                      className="hidden"
                    />
                    
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="bg-primary/10 p-4 rounded-full text-primary">
                        <Upload className="w-8 h-8" />
                      </div>
                      {selectedFile ? (
                        <div className="space-y-1">
                          <p className="text-base font-bold text-foreground">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB | Ready to upload</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-base font-bold">Drag and drop file here, or click to browse</p>
                          <p className="text-xs text-muted-foreground">Supports PDF, TXT, or MD up to 10MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    {selectedFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="px-6 py-3 border hover:bg-accent rounded-2xl font-bold transition-all"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!selectedFile || isFileUploading}
                      className="px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isFileUploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing Document...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload & Process
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: ADD RAW TEXT */}
            {activeTab === "add_text" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Add Raw Text Dataset</h3>
                  <p className="text-sm text-muted-foreground">Directly paste text content or documents. Ideal for adding custom FAQ answers, short manuals, or extra facts manually.</p>
                </div>

                <form onSubmit={handleTextUpload} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold ml-1">Dataset Title</label>
                    <input 
                      type="text"
                      required
                      value={textTitle}
                      onChange={(e) => setTextTitle(e.target.value)}
                      placeholder="e.g. Pump troubleshooting checklist"
                      className="w-full px-4 py-3 bg-accent/30 border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold ml-1">Document Content</label>
                    <textarea 
                      required
                      rows={10}
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Paste your custom dataset contents or documentation here..."
                      className="w-full px-4 py-3 bg-accent/30 border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm resize-none"
                    />
                    <div className="text-right text-xs text-muted-foreground pr-1">
                      {textContent.length.toLocaleString()} characters
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={!textTitle.trim() || !textContent.trim() || isTextUploading}
                      className="px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isTextUploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing Dataset...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Add Dataset
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
