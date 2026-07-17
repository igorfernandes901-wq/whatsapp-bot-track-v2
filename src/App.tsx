import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  MousePointerClick, 
  Users, 
  CheckCircle, 
  TrendingUp, 
  Coins, 
  Copy, 
  Plus, 
  Trash2, 
  QrCode, 
  Wifi, 
  WifiOff, 
  Send, 
  MessageSquare, 
  Search, 
  Filter, 
  Loader2, 
  HelpCircle, 
  RefreshCw, 
  AlertTriangle,
  X,
  ExternalLink,
  Check,
  AlertCircle,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface Stats {
  clicksCount: number;
  leadsCount: number;
  approvedSalesCount: number;
  approvedSalesRevenue: number;
  conversionRate: number;
}

interface Product {
  id: number;
  name: string;
  pixel_id: string;
  access_token: string;
  postback_token: string;
  created_at: string;
}

interface Lead {
  phone: string;
  first_message?: string;
  click_id?: string;
  utm_campaign?: string;
  created_at: string;
  click_fbclid?: string;
}

interface SalesEvent {
  id: number;
  product_id?: number;
  product_name?: string;
  postback_token?: string;
  order_id?: string;
  status?: string;
  value?: number;
  phone?: string;
  payload?: string;
  lead_phone?: string;
  fbclid?: string;
  meta_status?: string;
  meta_response?: string;
  created_at: string;
  utm_campaign?: string;
}

interface WhatsAppMessage {
  id: number;
  phone: string;
  message: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  created_at: string;
}

interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeBase64: string | null;
  error: string | null;
  me: { id: string; name?: string } | null;
  mePhone: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'leads' | 'connection' | 'diagnostics'>('dashboard');
  
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(localStorage.getItem('igor_track_session_token'));
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Data States
  const [stats, setStats] = useState<Stats>({
    clicksCount: 0,
    leadsCount: 0,
    approvedSalesCount: 0,
    approvedSalesRevenue: 0,
    conversionRate: 0
  });
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>({
    status: 'disconnected',
    qrCodeBase64: null,
    error: null,
    me: null,
    mePhone: null
  });

  // Filtering States
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCampaign, setFilterCampaign] = useState<string>('');

  // Creation/Modal States
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', pixel_id: '', access_token: '' });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // Chat/Interaction States
  const [activeChatLead, setActiveChatLead] = useState<Lead | null>(null);
  const [chatMessages, setChatMessages] = useState<WhatsAppMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resolvedOrigin, setResolvedOrigin] = useState<string>(window.location.origin);

  // Diagnostic Test Center States
  const [testLeadPhone, setTestLeadPhone] = useState('');
  const [testLeadMessage, setTestLeadMessage] = useState('Oi, vim do anúncio e quero mais informações!');
  const [testLeadCampaign, setTestLeadCampaign] = useState('');
  const [testLeadClickId, setTestLeadClickId] = useState('');
  const [isCreatingTestLead, setIsCreatingTestLead] = useState(false);
  const [testLeadSuccessMsg, setTestLeadSuccessMsg] = useState<string | null>(null);

  const [simProductId, setSimProductId] = useState('');
  const [simPhone, setSimPhone] = useState('');
  const [simStatus, setSimStatus] = useState('Pagamento Aprovado');
  const [simValue, setSimValue] = useState('97.00');
  const [simOrderId, setSimOrderId] = useState('');
  const [simEmail, setSimEmail] = useState('');
  const [simName, setSimName] = useState('');
  const [simTestEventCode, setSimTestEventCode] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{
    success: boolean;
    salesEventId?: number;
    matched: boolean;
    lead_phone?: string;
    meta_status?: string;
    meta_response?: any;
    logs: string[];
  } | null>(null);

  // Event Details Modal State
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Server Domain Configuration on Mount
  useEffect(() => {
    const loadDomainConfig = async () => {
      try {
        const res = await fetch('/api/config/domain');
        if (res.ok) {
          const data = await res.json();
          if (data.appUrl) {
            setResolvedOrigin(data.appUrl);
            console.log('[Domain Loader] Loaded production origin:', data.appUrl);
          }
        }
      } catch (e) {
        console.error('Error fetching domain config:', e);
      }
    };
    loadDomainConfig();
  }, []);

  // Custom apiFetch handler to transparently pass sessionToken
  const apiFetch = async (input: RequestInfo, init?: RequestInit) => {
    const token = localStorage.getItem('igor_track_session_token');
    const headers = {
      ...(init?.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const res = await fetch(input, {
      ...init,
      headers
    });

    if (res.status === 401 && !String(input).includes('/api/login') && !String(input).includes('/api/auth/verify')) {
      // Session expired or unauthorized
      localStorage.removeItem('igor_track_session_token');
      setSessionToken(null);
      setIsAuthenticated(false);
    }

    return res;
  };

  // Verify Session Token on Mount
  useEffect(() => {
    const token = localStorage.getItem('igor_track_session_token');
    if (!token) {
      setIsAuthenticated(false);
    } else {
      verifySession(token);
    }
  }, []);

  const verifySession = async (token: string) => {
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          setSessionToken(token);
        } else {
          localStorage.removeItem('igor_track_session_token');
          setSessionToken(null);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const trimmedUsername = usernameInput.trim().toLowerCase();
      const trimmedPassword = passwordInput.trim();

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, password: trimmedPassword })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('igor_track_session_token', data.token);
        setSessionToken(data.token);
        setIsAuthenticated(true);
        setUsernameInput('');
        setPasswordInput('');
      } else {
        const data = await res.json();
        setLoginError(data.error || 'Usuário ou senha incorretos.');
      }
    } catch (err) {
      setLoginError('Não foi possível conectar ao servidor.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error('Error logging out', e);
    }
    localStorage.removeItem('igor_track_session_token');
    setSessionToken(null);
    setIsAuthenticated(false);
  };

  // Poll intervals
  useEffect(() => {
    if (isAuthenticated !== true) return;

    // Initial fetch
    fetchData();

    // Poll WhatsApp connection status and basic stats every 3 seconds
    const interval = setInterval(() => {
      fetchWhatsAppStatus();
      silentFetchStats();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Poll chat messages if a chat is active
  useEffect(() => {
    if (!activeChatLead || isAuthenticated !== true) return;

    fetchChatHistory(activeChatLead.phone);
    const interval = setInterval(() => {
      fetchChatHistory(activeChatLead.phone);
    }, 2000);

    return () => clearInterval(interval);
  }, [activeChatLead, isAuthenticated]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchStats(),
      fetchEvents(),
      fetchLeads(),
      fetchProducts(),
      fetchWhatsAppStatus()
    ]);
    setIsRefreshing(false);
  };

  const silentFetchStats = async () => {
    try {
      const res = await apiFetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching stats silently', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching stats', e);
    }
  };

  const fetchEvents = async () => {
    try {
      let url = '/api/events';
      const params = new URLSearchParams();
      if (filterProduct) params.append('product_id', filterProduct);
      if (filterStatus) params.append('status', filterStatus);
      if (filterCampaign) params.append('utm_campaign', filterCampaign);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (e) {
      console.error('Error fetching events', e);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await apiFetch('/api/leads');
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (e) {
      console.error('Error fetching leads', e);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (e) {
      console.error('Error fetching products', e);
    }
  };

  const fetchWhatsAppStatus = async () => {
    try {
      const res = await apiFetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setWhatsapp(data);
      }
    } catch (e) {
      console.error('Error fetching whatsapp status', e);
    }
  };

  const fetchChatHistory = async (phone: string) => {
    try {
      const res = await apiFetch(`/api/whatsapp/chat/${phone}`);
      if (res.ok) {
        const data = await res.json();
        // reverse messages since backend returns DESC, we want chronological ASC order for chat rendering
        setChatMessages(data.reverse());
      }
    } catch (e) {
      console.error('Error fetching chat history', e);
    }
  };

  // Re-fetch events when filters change
  useEffect(() => {
    if (isAuthenticated === true) {
      fetchEvents();
    }
  }, [filterProduct, filterStatus, filterCampaign, isAuthenticated]);

  // Actions
  const handleConnectWhatsApp = async () => {
    try {
      setWhatsapp(prev => ({ ...prev, status: 'connecting', error: null }));
      const res = await apiFetch('/api/whatsapp/connect', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        setWhatsapp(prev => ({ ...prev, status: 'disconnected', error: err.error }));
      }
    } catch (e: any) {
      setWhatsapp(prev => ({ ...prev, status: 'disconnected', error: e.message }));
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Deseja realmente desconectar e encerrar a sessão do WhatsApp?')) return;
    try {
      await apiFetch('/api/whatsapp/disconnect', { method: 'POST' });
      fetchWhatsAppStatus();
    } catch (e) {
      console.error('Error disconnecting WhatsApp', e);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.pixel_id || !newProduct.access_token) return;

    setIsCreatingProduct(true);
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        setNewProduct({ name: '', pixel_id: '', access_token: '' });
        setShowAddProductModal(false);
        fetchProducts();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error}`);
      }
    } catch (e) {
      console.error('Error creating product', e);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este produto?')) return;
    try {
      const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
      }
    } catch (e) {
      console.error('Error deleting product', e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !activeChatLead) return;

    setIsSendingMessage(true);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activeChatLead.phone,
          message: typedMessage
        })
      });
      if (res.ok) {
        setTypedMessage('');
        // fetchChatHistory will handle getting the logged message
        fetchChatHistory(activeChatLead.phone);
      } else {
        const err = await res.json();
        alert(`Erro ao enviar: ${err.error}`);
      }
    } catch (e) {
      console.error('Error sending message', e);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCreateTestLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testLeadPhone) return;

    setIsCreatingTestLead(true);
    setTestLeadSuccessMsg(null);
    try {
      const res = await apiFetch('/api/test/create-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testLeadPhone,
          first_message: testLeadMessage,
          campaign: testLeadCampaign,
          click_id: testLeadClickId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestLeadPhone('');
        setTestLeadSuccessMsg(data.message || 'Lead de teste registrado com sucesso!');
        fetchLeads();
        fetchStats();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error}`);
      }
    } catch (e) {
      console.error('Error creating test lead', e);
    } finally {
      setIsCreatingTestLead(false);
    }
  };

  const handleSimulatePostback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simProductId || !simPhone) return;

    setIsSimulating(true);
    setSimResult(null);
    try {
      const res = await apiFetch('/api/test/simulate-postback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(simProductId),
          phone: simPhone,
          status: simStatus,
          value: Number(simValue) || 97.0,
          order_id: simOrderId || undefined,
          email: simEmail || undefined,
          name: simName || undefined,
          test_event_code: simTestEventCode || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
        fetchEvents();
        fetchStats();
      } else {
        const err = await res.json();
        alert(`Erro na simulação: ${err.error}`);
      }
    } catch (e) {
      console.error('Error simulating postback', e);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      // Adjust to Brazil format
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Build webhook URL
  const getWebhookUrl = (postbackToken: string) => {
    return `${resolvedOrigin}/webhook/postback/${postbackToken}`;
  };

  const getRedirectLink = (campaignName: string) => {
    return `${resolvedOrigin}/r/${campaignName || 'teste'}`;
  };

  // List of campaigns in clicks & leads
  const campaignsList = Array.from(
    new Set([
      ...events.map(e => e.utm_campaign).filter(Boolean),
      ...leads.map(l => l.utm_campaign).filter(Boolean)
    ])
  ) as string[];

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center font-mono text-xs text-gray-500 uppercase tracking-widest gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF9D]" />
        <span>Verificando Autenticação...</span>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-[#E4E3E0] font-sans flex flex-col items-center justify-center p-4 antialiased terminal-grid">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#141414] border border-[#1F1F1F] rounded-lg max-w-sm w-full overflow-hidden shadow-[0_0_50px_rgba(0,255,157,0.03)]"
          id="login-card"
        >
          <div className="p-6 border-b border-[#1F1F1F] bg-[#0A0A0A] text-center">
            <div className="inline-block bg-[#00FF9D] text-black p-3 rounded-lg font-black shadow-[0_0_15px_rgba(0,255,157,0.3)] mb-4">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <h1 className="text-lg font-black text-white tracking-widest uppercase font-sans">Igor Track Teste</h1>
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest mt-1">Central de Atribuição Server-Side & Disparos</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {loginError && (
              <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-mono p-3 rounded-md flex gap-2 items-center" id="login-error-alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="uppercase text-[10px] tracking-wide leading-relaxed">{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1.5">Usuário</label>
              <input
                type="text"
                required
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                spellCheck={false}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Ex: admin"
                className="w-full bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF9D] font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1.5">Senha</label>
              <input
                type="password"
                required
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect="off"
                spellCheck={false}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF9D] font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] font-mono text-xs uppercase tracking-wider w-full py-3 rounded-md transition-all flex items-center justify-center gap-2 mt-2"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#00FF9D]" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <span>Entrar no Sistema</span>
              )}
            </button>
          </form>

          <div className="bg-[#0A0A0A] border-t border-[#1F1F1F] px-6 py-4 text-center">
            <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Acesso Privado e Criptografado &copy; 2026</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#E4E3E0] font-sans flex flex-col antialiased terminal-grid">
      {/* Header Banner */}
      <header className="bg-[#0A0A0A] border-b border-[#1F1F1F] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#00FF9D] text-black p-2.5 rounded-lg font-black shadow-[0_0_12px_rgba(0,255,157,0.2)]">
              <Activity className="w-6 h-6" id="app-logo-icon" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tighter uppercase font-sans" id="app-title">Igor Track Teste</h1>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Central de Tracking & Disparos Meta Conversions API</p>
            </div>
          </div>

          {/* Global Controls & Status */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* WhatsApp Connection status indicator */}
            <button 
              onClick={() => setActiveTab('connection')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-all border ${
                whatsapp.status === 'connected' 
                  ? 'bg-[#1A3D2F] text-[#00FF9D] border-[#00FF9D]/30 shadow-[0_0_8px_rgba(0,255,157,0.15)]' 
                  : whatsapp.status === 'qr_ready'
                  ? 'bg-amber-950/40 text-amber-400 border-amber-500/30 animate-pulse'
                  : whatsapp.status === 'connecting'
                  ? 'bg-indigo-950/40 text-indigo-400 border-indigo-500/30 animate-pulse'
                  : 'bg-[#141414] text-gray-400 border-[#1F1F1F]'
              }`}
              id="whatsapp-status-badge"
            >
              {whatsapp.status === 'connected' ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Conectado: {whatsapp.mePhone || 'WhatsApp'}</span>
                </>
              ) : whatsapp.status === 'qr_ready' ? (
                <>
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR Code Pronto</span>
                </>
              ) : whatsapp.status === 'connecting' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>WhatsApp Desconectado</span>
                </>
              )}
            </button>

            <button 
              onClick={fetchData}
              disabled={isRefreshing}
              className="p-2 rounded-md bg-[#141414] border border-[#1F1F1F] text-gray-400 hover:text-white hover:border-[#00FF9D] transition"
              title="Atualizar Dados"
              id="refresh-button"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#00FF9D]' : ''}`} />
            </button>

            <button 
              onClick={handleLogout}
              className="p-2 rounded-md bg-[#141414] border border-[#1F1F1F] text-gray-400 hover:text-red-400 hover:border-red-500/50 transition flex items-center justify-center"
              title="Sair / Logout"
              id="logout-button"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <nav className="flex bg-[#0A0A0A] p-1 rounded-lg border border-[#1F1F1F] self-start gap-1 w-full sm:w-auto overflow-x-auto" id="main-navigation">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap border ${
              activeTab === 'dashboard' 
                ? 'bg-[#1F1F1F] text-[#00FF9D] border-[#00FF9D]/30' 
                : 'text-gray-500 hover:text-white border-transparent'
            }`}
            id="tab-dashboard"
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap border ${
              activeTab === 'products' 
                ? 'bg-[#1F1F1F] text-[#00FF9D] border-[#00FF9D]/30' 
                : 'text-gray-500 hover:text-white border-transparent'
            }`}
            id="tab-products"
          >
            Produtos & Webhooks
          </button>
          <button
            onClick={() => setActiveTab('leads')}
            className={`px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap border ${
              activeTab === 'leads' 
                ? 'bg-[#1F1F1F] text-[#00FF9D] border-[#00FF9D]/30' 
                : 'text-gray-500 hover:text-white border-transparent'
            }`}
            id="tab-leads"
          >
            Leads do WhatsApp
          </button>
          <button
            onClick={() => setActiveTab('connection')}
            className={`px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
              activeTab === 'connection' 
                ? 'bg-[#1F1F1F] text-[#00FF9D] border-[#00FF9D]/30' 
                : 'text-gray-500 hover:text-white border-transparent'
            }`}
            id="tab-connection"
          >
            <QrCode className="w-4 h-4" />
            Conexão WhatsApp
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
              activeTab === 'diagnostics' 
                ? 'bg-[#1F1F1F] text-[#00FF9D] border-[#00FF9D]/30' 
                : 'text-gray-500 hover:text-white border-transparent'
            }`}
            id="tab-diagnostics"
          >
            <Activity className="w-4 h-4 text-[#00FF9D]" />
            Diagnóstico & Simulador
          </button>
        </nav>

        {/* Tab Contents */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                {/* Stats Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-container">
                  {/* WhatsApp Leads */}
                  <div className="bg-[#141414] p-5 rounded-lg border border-[#1F1F1F] flex flex-col justify-between transition-all hover:border-gray-800" id="stat-leads">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-mono">Leads no WhatsApp</span>
                      <div className="p-1.5 bg-[#1A3D2F]/30 text-[#00FF9D] border border-[#00FF9D]/20 rounded">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="text-3xl font-mono text-white tracking-tight">{stats.leadsCount}</span>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tight font-mono">Contatos vinculados</p>
                    </div>
                  </div>

                  {/* Sales Count */}
                  <div className="bg-[#141414] p-5 rounded-lg border border-[#1F1F1F] flex flex-col justify-between transition-all hover:border-gray-800" id="stat-sales">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-mono">Vendas Aprovadas</span>
                      <div className="p-1.5 bg-[#1A3D2F]/30 text-[#00FF9D] border border-[#00FF9D]/20 rounded">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="text-3xl font-mono text-white tracking-tight">{stats.approvedSalesCount}</span>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tight font-mono">Transações via webhook</p>
                    </div>
                  </div>

                  {/* Conversion Rate */}
                  <div className="bg-[#141414] p-5 rounded-lg border border-[#1F1F1F] flex flex-col justify-between transition-all hover:border-gray-800" id="stat-conversion">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-mono">Taxa de Conversão</span>
                      <div className="p-1.5 bg-[#1A3D2F]/30 text-[#00FF9D] border border-[#00FF9D]/20 rounded">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="text-3xl font-mono text-white tracking-tight">{stats.conversionRate.toFixed(2)}%</span>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tight font-mono">Conversão por lead</p>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="bg-[#141414] p-5 rounded-lg border border-[#1F1F1F] flex flex-col justify-between transition-all hover:border-gray-800" id="stat-revenue">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-mono">Faturamento Geral</span>
                      <div className="p-1.5 bg-[#00FF9D] text-black rounded font-bold shadow-[0_0_8px_rgba(0,255,157,0.3)]">
                        <Coins className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="text-3xl font-mono text-white tracking-tight">{formatCurrency(stats.approvedSalesRevenue)}</span>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tight font-mono">Total em vendas</p>
                    </div>
                  </div>
                </div>

                {/* Filter section */}
                <div className="bg-[#141414] p-5 rounded-lg border border-[#1F1F1F] space-y-4" id="dashboard-filters">
                  <div className="flex items-center gap-2 text-white font-mono text-xs uppercase tracking-wider">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <span>Filtrar Eventos</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                    {/* Filter Product */}
                    <div>
                      <label className="block text-[10px] uppercase text-gray-500 mb-1">Por Produto</label>
                      <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-[#E4E3E0] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                      >
                        <option value="">Todos os Produtos</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Status */}
                    <div>
                      <label className="block text-[10px] uppercase text-gray-500 mb-1">Por Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-[#E4E3E0] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                      >
                        <option value="">Todos os Status</option>
                        <option value="Pagamento Aprovado">Pagamento Aprovado</option>
                        <option value="Pix Gerado">Pix Gerado</option>
                        <option value="Boleto Gerado">Boleto Gerado</option>
                        <option value="Reembolso">Reembolso</option>
                        <option value="Chargeback">Chargeback</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>

                    {/* Filter Campaign */}
                    <div>
                      <label className="block text-[10px] uppercase text-gray-500 mb-1">Por Campanha (utm_campaign)</label>
                      <select
                        value={filterCampaign}
                        onChange={(e) => setFilterCampaign(e.target.value)}
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] text-[#E4E3E0] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                      >
                        <option value="">Todas as Campanhas</option>
                        {campaignsList.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Sales Events Table */}
                <div className="bg-[#141414] rounded-lg border border-[#1F1F1F] overflow-hidden" id="events-table-card">
                  <div className="p-4 border-b border-[#1F1F1F] flex justify-between items-center bg-[#0A0A0A]">
                    <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider">Últimos Eventos de Vendas (Webhooks)</h3>
                    <span className="text-[10px] font-mono bg-[#1F1F1F] border border-gray-800 text-gray-400 px-2.5 py-1 rounded-full">
                      {events.length} eventos listados
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0D0D0D] text-gray-500 text-[10px] font-mono uppercase tracking-wider border-b border-[#1F1F1F]">
                          <th className="p-4">Data</th>
                          <th className="p-4">Produto</th>
                          <th className="p-4">ID Transação</th>
                          <th className="p-4">Telefone</th>
                          <th className="p-4">Campanha</th>
                          <th className="p-4">Valor</th>
                          <th className="p-4">Status Transação</th>
                          <th className="p-4 text-center">Meta Pixel</th>
                          <th className="p-4 text-center">Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F1F1F] text-xs font-mono text-gray-300">
                        {events.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-gray-500 font-mono">
                              Nenhum evento de venda registrado ainda. Configure um produto e envie postbacks de teste!
                            </td>
                          </tr>
                        ) : (
                          events.map(event => (
                            <tr key={event.id} className="hover:bg-[#1C1C1C]/40 border-b border-[#1F1F1F]/60 transition-colors">
                              <td className="p-4 whitespace-nowrap text-xs text-gray-500">{formatDate(event.created_at)}</td>
                              <td className="p-4 font-semibold text-white">{event.product_name || 'Desconhecido'}</td>
                              <td className="p-4 text-xs text-gray-400">{event.order_id || 'N/D'}</td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="text-[#E4E3E0]">{event.phone || 'N/D'}</span>
                                {event.lead_phone && (
                                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#1A3D2F] text-[#00FF9D] border border-[#00FF9D]/30">
                                    VINCULADO
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-xs text-gray-400">{event.utm_campaign || '-'}</td>
                              <td className="p-4 font-bold text-[#00FF9D]">{formatCurrency(event.value || 0)}</td>
                              <td className="p-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider ${
                                  event.status === 'Pagamento Aprovado'
                                    ? 'bg-[#1A3D2F]/60 text-[#00FF9D] border-[#00FF9D]/30'
                                    : event.status === 'Pix Gerado' || event.status === 'Boleto Gerado'
                                    ? 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                                    : event.status === 'Reembolso' || event.status === 'Chargeback'
                                    ? 'bg-red-950/40 text-red-400 border-red-500/30'
                                    : 'bg-[#141414] text-gray-400 border-[#1F1F1F]'
                                }`}>
                                  {event.status}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center">
                                  {event.meta_status === 'success' ? (
                                    <span className="text-[#00FF9D] text-[10px] border border-[#00FF9D]/40 px-2 py-0.5 rounded uppercase font-mono">SYNCED</span>
                                  ) : event.meta_status === 'failed' ? (
                                    <span className="text-red-400 text-[10px] border border-red-500/40 px-2 py-0.5 rounded uppercase font-mono cursor-help" title={`Falhou: ${event.meta_response}`}>FAILED</span>
                                  ) : event.meta_status === 'skipped' ? (
                                    <span className="text-gray-400 text-[10px] border border-gray-600 px-2 py-0.5 rounded uppercase font-mono">SKIPPED</span>
                                  ) : (
                                    <span className="text-amber-400 text-[10px] border border-amber-500/40 px-2 py-0.5 rounded uppercase font-mono">PENDING</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => setSelectedEvent(event)}
                                  className="text-[10px] font-mono uppercase bg-[#141414] hover:bg-[#00FF9D] text-[#00FF9D] hover:text-black border border-[#1F1F1F] hover:border-[#00FF9D] px-2 py-1 rounded transition-all"
                                >
                                  Ver Logs
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'products' && (
              <motion.div
                key="products"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Header Products */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight uppercase">Configuração de Produtos & Pixels</h2>
                    <p className="text-xs text-gray-500 font-mono uppercase">Cadastre seus produtos, pegue as URLs de webhook e configure o Pixel para a API de Conversões.</p>
                  </div>
                  <button
                    onClick={() => setShowAddProductModal(true)}
                    className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] font-mono text-xs uppercase tracking-wider px-4 py-2.5 rounded-md flex items-center gap-2 transition-all self-stretch sm:self-auto"
                    id="add-product-button"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Novo Produto</span>
                  </button>
                </div>

                {window.location.hostname.includes('ai.studio') && (
                  <div className="bg-[#1A3D2F]/20 border border-[#00FF9D]/30 rounded-lg p-4 flex gap-3 text-[#00FF9D] font-mono text-xs">
                    <CheckCircle className="w-5 h-5 shrink-0 text-[#00FF9D]" />
                    <div>
                      <p className="font-bold uppercase tracking-wider mb-1 text-white">Domínio de Produção Detectado e Corrigido!</p>
                      <p className="text-gray-300">Você está no painel de visualização interna do editor, mas <strong>não se preocupe!</strong> As URLs exibidas abaixo foram corrigidas automaticamente para apontar para o seu domínio publicado real (<code className="bg-[#1A3D2F]/50 px-1.5 py-0.5 rounded text-white font-bold">{resolvedOrigin}</code>).</p>
                      <p className="mt-1.5 text-gray-400">Pode copiar as URLs de postback diretamente daqui e colar na Braip ou Payt. Elas funcionarão perfeitamente!</p>
                    </div>
                  </div>
                )}

                {/* Products Cards List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="products-list-container">
                  {products.length === 0 ? (
                    <div className="bg-[#141414] rounded-lg border border-[#1F1F1F] p-8 text-center col-span-2 text-gray-500 font-mono text-sm">
                      Nenhum produto cadastrado ainda. Cadastre o primeiro para receber postbacks e disparar eventos à Meta!
                    </div>
                  ) : (
                    products.map(p => (
                      <div key={p.id} className="bg-[#141414] rounded-lg border border-[#1F1F1F] p-6 flex flex-col justify-between hover:border-gray-800 transition gap-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <h3 className="font-bold text-white text-lg tracking-tight uppercase">{p.name}</h3>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1.5 rounded-md bg-[#0A0A0A] border border-[#1F1F1F] text-gray-500 hover:text-red-400 hover:border-red-500/30 transition"
                              title="Excluir Produto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-4 bg-[#0A0A0A] p-3 rounded-md border border-[#1F1F1F] text-xs font-mono">
                            <div>
                              <span className="block text-gray-500 uppercase text-[10px]">Pixel ID (Meta)</span>
                              <span className="text-white text-xs mt-0.5 block">{p.pixel_id}</span>
                            </div>
                            <div>
                              <span className="block text-gray-500 uppercase text-[10px]">Token de Acesso</span>
                              <span className="text-white text-xs mt-0.5 block truncate" title={p.access_token}>
                                {p.access_token ? p.access_token.substring(0, 8) + '...' + p.access_token.substring(p.access_token.length - 8) : 'Ausente'}
                              </span>
                            </div>
                          </div>

                          {/* Info Funil Direto via WhatsApp */}
                          <div className="bg-[#1C110C]/20 border border-amber-500/20 rounded-lg p-3.5 space-y-1.5 font-mono">
                            <div className="flex items-center gap-1.5 text-xs text-amber-500 uppercase tracking-wider">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Funil Direto via WhatsApp Ativo</span>
                            </div>
                            <p className="text-[11px] text-gray-400 uppercase tracking-tight leading-relaxed">
                              O tráfego do seu anúncio vai direto para o WhatsApp. Ao conectar o WhatsApp Web na aba ao lado, o sistema capturará cada lead e associará com as compras vindas da Braip e Payt automaticamente pelo número de telefone do cliente! Sem qualquer página de redirecionamento no meio.
                            </p>
                          </div>

                          {/* URL Postback */}
                          <div className="space-y-1.5 font-mono">
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide">URL de Postback (Braip, Payt, Hotmart, Kiwify)</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                readOnly
                                value={getWebhookUrl(p.postback_token)}
                                className="flex-1 bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3 py-2 text-xs font-mono text-gray-300 focus:outline-none"
                              />
                              <button
                                onClick={() => copyToClipboard(getWebhookUrl(p.postback_token), p.postback_token)}
                                className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] px-3.5 py-2 rounded-md text-xs font-mono transition flex items-center gap-1.5 shadow-sm"
                                title="Copiar Webhook"
                              >
                                {copiedToken === p.postback_token ? (
                                  <>
                                    <Check className="w-4 h-4" />
                                    <span>Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <span className="block text-[10px] text-gray-600">Cole essa URL exata na área de Postback da sua plataforma de vendas para este produto.</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'leads' && (
              <motion.div
                key="leads"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Leads layout */}
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight uppercase">Leads no WhatsApp</h2>
                    <p className="text-xs text-gray-500 font-mono uppercase">Contatos capturados automaticamente. Quando o contato envia o código do clique, sua campanha de origem é vinculada.</p>
                  </div>
                </div>

                {/* Table or Split view */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Table Side */}
                  <div className="bg-[#141414] rounded-lg border border-[#1F1F1F] overflow-hidden col-span-1 lg:col-span-2 flex flex-col h-[600px]" id="leads-split-table">
                    <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A] flex justify-between items-center">
                      <span className="font-mono text-xs uppercase text-gray-400 tracking-wider">Lista de Contatos Capturados</span>
                      <span className="text-[10px] font-mono bg-[#1F1F1F] border border-gray-800 text-gray-400 px-2.5 py-1 rounded-full">{leads.length} leads</span>
                    </div>

                    <div className="overflow-y-auto flex-1 divide-y divide-[#1F1F1F]">
                      {leads.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 font-mono text-xs">
                          Nenhum lead de WhatsApp capturado ainda. Conecte seu WhatsApp na aba "Conexão WhatsApp" e comece a receber mensagens para capturar contatos automaticamente!
                        </div>
                      ) : (
                        leads.map(lead => (
                          <div 
                            key={lead.phone} 
                            onClick={() => {
                              setActiveChatLead(lead);
                            }}
                            className={`p-4 flex items-center justify-between hover:bg-[#1C1C1C]/40 border-b border-[#1F1F1F]/60 transition cursor-pointer ${
                              activeChatLead?.phone === lead.phone ? 'bg-[#1C1C1C] border-l-4 border-[#00FF9D]' : ''
                            }`}
                          >
                            <div className="space-y-1 font-mono">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">{lead.phone}</span>
                                {lead.utm_campaign ? (
                                  <span className="bg-[#1A3D2F]/60 text-[#00FF9D] text-[9px] font-mono px-2 py-0.5 rounded border border-[#00FF9D]/30 uppercase tracking-wide">
                                    {lead.utm_campaign}
                                  </span>
                                ) : (
                                  <span className="bg-[#1C1C1C] border border-[#1F1F1F] text-gray-500 text-[9px] px-2 py-0.5 rounded uppercase font-mono">
                                    Sem Campanha
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 line-clamp-1 max-w-[280px] sm:max-w-[450px]">
                                {lead.first_message || <em className="text-gray-600">Sem mensagem inicial</em>}
                              </p>
                              <span className="text-[10px] text-gray-500 block">{formatDate(lead.created_at)}</span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveChatLead(lead);
                              }}
                              className="px-3 py-1.5 rounded bg-[#1F1F1F] border border-[#1F1F1F] hover:border-[#00FF9D] text-[#00FF9D] transition text-xs font-mono uppercase tracking-wider flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Conversar</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Chat Panel */}
                  <div className="bg-[#141414] rounded-lg border border-[#1F1F1F] flex flex-col h-[600px] overflow-hidden" id="leads-split-chat">
                    {activeChatLead ? (
                      <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A] flex items-center justify-between">
                          <div className="font-mono">
                            <span className="block font-bold text-white text-sm">{activeChatLead.phone}</span>
                            <span className="text-[10px] text-[#00FF9D] font-semibold uppercase">
                              {activeChatLead.utm_campaign ? `Campanha: ${activeChatLead.utm_campaign}` : 'Lead Orgânico'}
                            </span>
                          </div>
                          <button
                            onClick={() => setActiveChatLead(null)}
                            className="p-1 rounded bg-[#1F1F1F] border border-[#1F1F1F] hover:border-red-500 text-gray-400 hover:text-red-400 transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Message Log */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0F0F0F]">
                          {chatMessages.length === 0 ? (
                            <div className="text-center text-xs text-gray-500 font-mono py-12">
                              Carregando histórico de mensagens...
                            </div>
                          ) : (
                            chatMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex flex-col max-w-[80%] rounded-lg p-3 text-xs font-mono ${
                                  msg.direction === 'outgoing'
                                    ? 'bg-[#1A3D2F]/80 border border-[#00FF9D]/30 text-[#00FF9D] ml-auto'
                                    : 'bg-[#141414] border border-[#1F1F1F] text-gray-200 mr-auto'
                                }`}
                              >
                                <p className="leading-relaxed break-words">{msg.message}</p>
                                <span className={`text-[9px] block text-right mt-1 ${
                                  msg.direction === 'outgoing' ? 'text-[#00FF9D]/60' : 'text-gray-500'
                                }`}>
                                  {formatDate(msg.timestamp).split(' ')[1] || ''}
                                </span>
                              </div>
                            ))
                          )}
                          <div ref={messagesEndRef} />
                        </div>

                        {/* Message Sender */}
                        <form onSubmit={handleSendMessage} className="p-3 border-t border-[#1F1F1F] bg-[#0A0A0A] flex gap-2">
                          <input
                            type="text"
                            value={typedMessage}
                            onChange={(e) => setTypedMessage(e.target.value)}
                            placeholder={
                              whatsapp.status === 'connected' 
                                ? "Digite a mensagem para disparar..." 
                                : "Conecte o WhatsApp para disparar"
                            }
                            disabled={whatsapp.status !== 'connected' || isSendingMessage}
                            className="flex-1 bg-[#141414] border border-[#1F1F1F] text-white rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#00FF9D] disabled:opacity-60"
                          />
                          <button
                            type="submit"
                            disabled={whatsapp.status !== 'connected' || isSendingMessage || !typedMessage.trim()}
                            className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] p-2.5 rounded-md transition flex items-center justify-center disabled:opacity-50"
                          >
                            {isSendingMessage ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 gap-3 font-mono">
                        <MessageSquare className="w-10 h-10 text-gray-600" />
                        <div>
                          <h4 className="font-bold text-gray-400 text-sm uppercase">Nenhum Chat Selecionado</h4>
                          <p className="text-xs mt-1 leading-relaxed max-w-sm uppercase text-gray-600">Selecione um lead da lista ao lado para ver o histórico de conversas e enviar mensagens de acompanhamento.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'connection' && (
              <motion.div
                key="connection"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="max-w-3xl mx-auto space-y-6"
              >
                {/* Important usage advice */}
                <div className="bg-[#1C110C]/60 border border-amber-500/30 rounded-lg p-5 flex gap-4" id="warning-card">
                  <div className="p-2 bg-amber-950/50 text-amber-500 border border-amber-500/30 rounded self-start">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 font-mono">
                    <h3 className="font-bold text-amber-500 text-xs uppercase tracking-wider">AVISO IMPORTANTE DE SEGURANÇA</h3>
                    <p className="text-xs text-amber-400 leading-relaxed uppercase">
                      Esta ferramenta utiliza uma automação de WhatsApp baseada em WebSockets (não-oficial). <strong>Há risco inerente de bloqueio ou banimento do número</strong> caso haja envios excessivos ou denúncias de spam.
                    </p>
                    <p className="text-xs text-amber-500 font-bold leading-relaxed uppercase">
                      RECOMENDAMOS FORTEMENTE o uso de um número de WhatsApp DEDICADO e secundário. NUNCA utilize seu número pessoal ou principal do trabalho!
                    </p>
                  </div>
                </div>

                {/* Connection Box */}
                <div className="bg-[#141414] rounded-lg border border-[#1F1F1F] overflow-hidden" id="connection-manager-card">
                  <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="font-mono">
                      <h3 className="font-bold text-white text-xs uppercase tracking-wider">Conexão do Dispositivo WhatsApp</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5 uppercase leading-relaxed">Escaneie o QR Code para conectar seu dispositivo WhatsApp Web e salvar a sessão localmente.</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-[10px] font-mono uppercase tracking-wider ${
                      whatsapp.status === 'connected'
                        ? 'bg-[#1A3D2F]/60 text-[#00FF9D] border-[#00FF9D]/30'
                        : 'bg-[#141414] text-gray-400 border-[#1F1F1F]'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${whatsapp.status === 'connected' ? 'bg-[#00FF9D] animate-pulse' : 'bg-gray-500'}`} />
                      <span>{whatsapp.status === 'connected' ? 'Ativo / Conectado' : 'Inativo / Desconectado'}</span>
                    </span>
                  </div>

                  <div className="p-6 flex flex-col items-center justify-center text-center gap-6">
                    {whatsapp.status === 'disconnected' && (
                      <div className="space-y-4 py-8">
                        <div className="bg-[#0A0A0A] border border-[#1F1F1F] p-6 rounded-lg flex flex-col items-center justify-center max-w-sm mx-auto gap-3">
                          <QrCode className="w-12 h-12 text-gray-600" />
                          <h4 className="font-bold text-gray-300 font-mono text-xs uppercase tracking-wider">Inicie a Conexão</h4>
                          <p className="text-xs text-gray-500 font-mono uppercase">Clique abaixo para ativar o receptor de QR Code. A sessão será mantida no servidor para conexões futuras.</p>
                        </div>
                        <button
                          onClick={handleConnectWhatsApp}
                          className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] font-mono text-xs uppercase tracking-wider px-6 py-2.5 rounded-md transition-all"
                        >
                          Gerar QR Code de Conexão
                        </button>
                      </div>
                    )}

                    {whatsapp.status === 'connecting' && (
                      <div className="space-y-4 py-12">
                        <Loader2 className="w-10 h-10 animate-spin text-[#00FF9D] mx-auto" />
                        <div className="font-mono">
                          <h4 className="font-bold text-gray-300 text-xs uppercase">Inicializando WhatsApp Web...</h4>
                          <p className="text-xs text-gray-500 mt-1 uppercase">Carregando as credenciais de autenticação. Por favor, aguarde o carregamento do QR Code.</p>
                        </div>
                      </div>
                    )}

                    {whatsapp.status === 'qr_ready' && (
                      <div className="space-y-4 py-4 max-w-sm font-mono">
                        <h4 className="font-bold text-gray-300 text-xs uppercase">Escaneie o QR Code</h4>
                        <p className="text-xs text-gray-500 leading-relaxed uppercase">
                          Abra o WhatsApp no seu aparelho celular, vá em <strong>Aparelhos Conectados &gt; Conectar um Aparelho</strong> e aponte a câmera para a imagem abaixo:
                        </p>
 
                        <div className="bg-white border border-gray-800 p-4 rounded-lg inline-block shadow-inner">
                          {whatsapp.qrCodeBase64 ? (
                            <img 
                              src={whatsapp.qrCodeBase64} 
                              alt="WhatsApp QR Code" 
                              referrerPolicy="no-referrer"
                              className="w-52 h-52 select-none pointer-events-none"
                            />
                          ) : (
                            <div className="w-52 h-52 flex items-center justify-center">
                              <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] text-gray-500 font-medium uppercase">
                          O QR Code se atualiza automaticamente em caso de expiração.
                        </div>

                        <button
                          onClick={handleDisconnectWhatsApp}
                          className="text-gray-500 hover:text-red-400 text-xs font-semibold uppercase transition"
                        >
                          Limpar Sessão / Cancelar
                        </button>
                      </div>
                    )}

                    {whatsapp.status === 'connected' && (
                      <div className="space-y-4 py-8">
                        <div className="bg-[#1A3D2F]/20 border border-[#00FF9D]/30 p-6 rounded-lg flex flex-col items-center justify-center max-w-sm mx-auto gap-3">
                          <CheckCircle className="w-12 h-12 text-[#00FF9D]" />
                          <h4 className="font-bold text-white font-mono text-xs uppercase">Dispositivo Conectado!</h4>
                          <div className="text-left bg-[#0A0A0A] p-3 rounded border border-[#1F1F1F] w-full text-xs font-mono text-[#00FF9D] space-y-1">
                            <div><strong>Número:</strong> {whatsapp.mePhone}</div>
                            {whatsapp.me?.name && <div><strong>Nome:</strong> {whatsapp.me.name}</div>}
                          </div>
                        </div>

                        <p className="text-xs text-gray-500 font-mono uppercase leading-relaxed max-w-md mx-auto">
                          Seu celular está logado com sucesso nesta central. O servidor capturará de forma contínua as conversas que contêm códigos de clique do redirecionador de campanha.
                        </p>

                        <button
                          onClick={handleDisconnectWhatsApp}
                          className="bg-[#1F1F1F] hover:bg-red-950/20 text-red-400 hover:text-red-300 border border-red-500/30 font-mono text-xs uppercase tracking-wider px-5 py-2.5 rounded-md transition"
                        >
                          Desconectar e Limpar Sessão
                        </button>
                      </div>
                    )}

                    {whatsapp.error && (
                      <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-mono p-4 rounded-lg max-w-sm flex gap-3 items-start text-left mt-2 shadow-sm">
                        <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-bold uppercase tracking-wide">Ocorreu um erro na autenticação</div>
                          <div className="mt-1 text-red-400 font-mono text-[11px] leading-relaxed break-all uppercase">{whatsapp.error}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'diagnostics' && (
              <motion.div
                key="diagnostics"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Introduction Banner */}
                <div className="bg-[#141414] border border-[#1F1F1F] rounded-lg p-6">
                  <h2 className="text-sm font-mono uppercase text-white tracking-wider flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#00FF9D]" />
                    Central de Diagnósticos e Simulador de Eventos
                  </h2>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed uppercase font-mono">
                    Aqui você pode simular e testar todo o fluxo do sistema ponta a ponta sem precisar fazer vendas reais ou gastar dinheiro. Cadastre leads fictícios, dispare postbacks falsos de checkout com variações de telefone e veja em tempo real como o sistema realiza a correspondência de telefone e dispara os eventos para a API de Conversões da Meta (CAPI).
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Controls */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Panel 1: Create Lead */}
                    <div className="bg-[#141414] border border-[#1F1F1F] rounded-lg overflow-hidden">
                      <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A]">
                        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#00FF9D]" />
                          1. Cadastrar Lead de Teste (WhatsApp)
                        </h3>
                      </div>
                      <form onSubmit={handleCreateTestLead} className="p-5 space-y-4 font-mono text-xs">
                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 mb-1">Telefone do Lead *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: 5511999999999"
                            value={testLeadPhone}
                            onChange={(e) => setTestLeadPhone(e.target.value.replace(/\s+/g, ''))}
                            className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                          />
                          <span className="text-[9px] text-gray-600 block mt-1 uppercase">Apenas números. Se for Brasil, use DDI 55.</span>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 mb-1">Mensagem Inicial (Simulada)</label>
                          <textarea
                            value={testLeadMessage}
                            onChange={(e) => setTestLeadMessage(e.target.value)}
                            rows={2}
                            className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Campanha (utm_campaign)</label>
                            <input
                              type="text"
                              placeholder="Ex: campanha-fb"
                              value={testLeadCampaign}
                              onChange={(e) => setTestLeadCampaign(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">ID Clique (click_id)</label>
                            <input
                              type="text"
                              placeholder="Ex: clk_38591"
                              value={testLeadClickId}
                              onChange={(e) => setTestLeadClickId(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                        </div>

                        {testLeadSuccessMsg && (
                          <div className="bg-[#1A3D2F]/40 border border-[#00FF9D]/30 text-[#00FF9D] p-3 rounded text-[11px] uppercase">
                            {testLeadSuccessMsg}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isCreatingTestLead}
                          className="w-full bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] py-2.5 rounded transition uppercase font-semibold"
                        >
                          {isCreatingTestLead ? 'Salvando...' : 'Cadastrar Lead de Teste'}
                        </button>
                      </form>
                    </div>

                    {/* Panel 2: Simulate Webhook */}
                    <div className="bg-[#141414] border border-[#1F1F1F] rounded-lg overflow-hidden">
                      <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A]">
                        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider flex items-center gap-2">
                          <Plus className="w-4 h-4 text-[#00FF9D]" />
                          2. Simular Postback de Checkout
                        </h3>
                      </div>
                      <form onSubmit={handleSimulatePostback} className="p-5 space-y-4 font-mono text-xs">
                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 mb-1">Produto Associado *</label>
                          <select
                            required
                            value={simProductId}
                            onChange={(e) => setSimProductId(e.target.value)}
                            className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                          >
                            <option value="">Selecione um Produto...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} (Pixel: {p.pixel_id})</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Telefone do Comprador *</label>
                            <input
                              type="text"
                              required
                              placeholder="Ex: 11999999999"
                              value={simPhone}
                              onChange={(e) => setSimPhone(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                            <span className="text-[9px] text-gray-600 block mt-1 uppercase">Teste com variações (+55, sem 9, etc.)</span>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Status da Transação *</label>
                            <select
                              required
                              value={simStatus}
                              onChange={(e) => setSimStatus(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            >
                              <option value="Pagamento Aprovado">Pagamento Aprovado (Dispara CAPI)</option>
                              <option value="Pix Gerado">Pix Gerado (Pula CAPI)</option>
                              <option value="Boleto Gerado">Boleto Gerado (Pula CAPI)</option>
                              <option value="Reembolso">Reembolso</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">ID Transação (Opcional)</label>
                            <input
                              type="text"
                              placeholder="Ex: trans_94819"
                              value={simOrderId}
                              onChange={(e) => setSimOrderId(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Valor da Compra (R$)</label>
                            <input
                              type="text"
                              value={simValue}
                              onChange={(e) => setSimValue(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Nome Comprador (Opcional)</label>
                            <input
                              type="text"
                              placeholder="Ex: Igor Fernandes"
                              value={simName}
                              onChange={(e) => setSimName(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase text-gray-500 mb-1">Email (Opcional)</label>
                            <input
                              type="email"
                              placeholder="Ex: comprador@gmail.com"
                              value={simEmail}
                              onChange={(e) => setSimEmail(e.target.value)}
                              className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 mb-1">Código de Teste da Meta (Opcional - Ex: TEST12345)</label>
                          <input
                            type="text"
                            placeholder="Insira para ver no painel 'Testar Eventos' do Pixel"
                            value={simTestEventCode}
                            onChange={(e) => setSimTestEventCode(e.target.value)}
                            className="w-full bg-[#0F0F0F] border border-[#1F1F1F] text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-[#00FF9D]"
                          />
                          <span className="text-[9px] text-gray-600 block mt-1 uppercase">Se preenchido, o Facebook enviará o evento diretamente para o seu console de testes na Meta.</span>
                        </div>

                        <button
                          type="submit"
                          disabled={isSimulating || !simProductId || !simPhone}
                          className="w-full bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] py-2.5 rounded transition uppercase font-semibold flex items-center justify-center gap-2"
                        >
                          {isSimulating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-[#00FF9D]" />
                              <span>Processando Fluxo...</span>
                            </>
                          ) : (
                            <span>Simular Postback Webhook</span>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Console Output */}
                  <div className="lg:col-span-7">
                    <div className="bg-[#141414] border border-[#1F1F1F] rounded-lg overflow-hidden h-full flex flex-col min-h-[500px]">
                      <div className="p-4 border-b border-[#1F1F1F] bg-[#0A0A0A] flex justify-between items-center">
                        <span className="text-xs font-mono uppercase text-gray-400 tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-[#00FF9D]" />
                          Console de Logs & Rastreamento em Tempo Real
                        </span>
                        {simResult && (
                          <button
                            onClick={() => setSimResult(null)}
                            className="text-[9px] font-mono text-gray-500 hover:text-white uppercase"
                          >
                            Limpar Console
                          </button>
                        )}
                      </div>

                      <div className="flex-1 bg-[#0A0A0A] p-5 font-mono text-xs overflow-y-auto space-y-3 min-h-[350px]">
                        {!simResult ? (
                          <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 uppercase py-12">
                            <Activity className="w-8 h-8 text-gray-700 animate-pulse mb-2" />
                            <p className="text-xs">Aguardando disparo de simulação...</p>
                            <p className="text-[10px] text-gray-700 mt-1">Preencha os dados à esquerda e clique em "Simular Postback"</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Summary Badges */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-[#141414] p-3 rounded border border-gray-800 text-center">
                                <span className="text-[9px] text-gray-500 uppercase block mb-1">Vínculo WhatsApp</span>
                                {simResult.matched ? (
                                  <span className="text-[#00FF9D] text-[10px] font-bold uppercase bg-[#1A3D2F] px-2 py-0.5 rounded border border-[#00FF9D]/30">
                                    CORRESPONDIDO
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-[10px] font-bold uppercase bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
                                    NÃO CORRESPONDIDO
                                  </span>
                                )}
                              </div>
                              <div className="bg-[#141414] p-3 rounded border border-gray-800 text-center">
                                <span className="text-[9px] text-gray-500 uppercase block mb-1">Status Meta CAPI</span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                  simResult.meta_status === 'success'
                                    ? 'bg-[#1A3D2F] text-[#00FF9D] border-[#00FF9D]/30'
                                    : simResult.meta_status === 'failed'
                                    ? 'bg-red-950/40 text-red-400 border-red-500/30'
                                    : 'bg-[#141414] text-gray-400 border-[#1F1F1F]'
                                }`}>
                                  {simResult.meta_status}
                                </span>
                              </div>
                              <div className="bg-[#141414] p-3 rounded border border-gray-800 text-center">
                                <span className="text-[9px] text-gray-500 uppercase block mb-1">Event Local ID</span>
                                <span className="text-[#00FF9D] font-bold text-xs">
                                  #{simResult.salesEventId || 'N/A'}
                                </span>
                              </div>
                            </div>

                            {/* CLI Console Logs */}
                            <div className="bg-[#050505] border border-gray-800 rounded p-4 space-y-2 max-h-[300px] overflow-y-auto">
                              {simResult.logs.map((log, i) => {
                                let textColor = 'text-gray-400';
                                if (log.includes('✅') || log.includes('SUCESSO')) textColor = 'text-[#00FF9D]';
                                if (log.includes('❌') || log.includes('FALHA')) textColor = 'text-red-400';
                                if (log.includes('⚠️')) textColor = 'text-amber-400';
                                return (
                                  <div key={i} className={`text-xs leading-relaxed font-mono ${textColor}`}>
                                    {log}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Meta CAPI Response Details */}
                            {simResult.meta_response && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] text-gray-500 uppercase block font-semibold">Resposta Bruta da API do Facebook:</span>
                                <pre className="bg-[#050505] border border-gray-800 rounded p-3 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[150px]">
                                  {typeof simResult.meta_response === 'object'
                                    ? JSON.stringify(simResult.meta_response, null, 2)
                                    : String(simResult.meta_response)
                                  }
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Product Modal Overlay */}
      <AnimatePresence>
        {showAddProductModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#141414] rounded-lg max-w-md w-full border border-[#1F1F1F] overflow-hidden"
              id="add-product-modal"
            >
              <div className="p-4 border-b border-[#1F1F1F] flex items-center justify-between bg-[#0A0A0A]">
                <span className="font-mono text-xs uppercase text-white tracking-wider">Adicionar Novo Produto</span>
                <button
                  onClick={() => setShowAddProductModal(false)}
                  className="p-1 rounded bg-[#1F1F1F] border border-[#1F1F1F] hover:border-red-500 text-gray-400 hover:text-red-400 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="p-6 space-y-4">
                {/* Product name */}
                <div>
                  <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-wide mb-1.5">Nome do Produto</label>
                  <input
                    type="text"
                    required
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    placeholder="Ex: Método Seca Barriga 10kg"
                    className="w-full bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF9D]"
                  />
                </div>

                {/* Pixel ID */}
                <div>
                  <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-wide mb-1.5">Meta Pixel ID</label>
                  <input
                    type="text"
                    required
                    value={newProduct.pixel_id}
                    onChange={(e) => setNewProduct({ ...newProduct, pixel_id: e.target.value.replace(/\s+/g, '') })}
                    placeholder="Ex: 859427382019483"
                    className="w-full bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3.5 py-2.5 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF9D]"
                  />
                </div>

                {/* Access Token */}
                <div>
                  <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-wide mb-1.5">Token de Acesso da API (Meta)</label>
                  <textarea
                    required
                    value={newProduct.access_token}
                    onChange={(e) => setNewProduct({ ...newProduct, access_token: e.target.value.trim() })}
                    placeholder="Ex: EAAGm..."
                    rows={4}
                    className="w-full bg-[#0F0F0F] border border-[#1F1F1F] rounded-md px-3.5 py-2.5 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF9D]"
                  />
                  <span className="block text-[9px] text-gray-600 mt-1 uppercase font-mono tracking-tight leading-relaxed">
                    Gerado no Gerenciador de Eventos da Meta (Configurações do Pixel &gt; API de Conversões &gt; Gerar Token de Acesso).
                  </span>
                </div>

                <div className="pt-3 flex gap-3 justify-end border-t border-[#1F1F1F]">
                  <button
                    type="button"
                    onClick={() => setShowAddProductModal(false)}
                    className="px-4 py-2 rounded bg-[#1F1F1F] border border-[#1F1F1F] text-gray-400 hover:border-red-500 hover:text-red-400 transition text-xs font-mono uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingProduct}
                    className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-[#00FF9D] border border-[#1F1F1F] hover:border-[#00FF9D] font-mono text-xs uppercase tracking-wider px-5 py-2 rounded transition"
                  >
                    {isCreatingProduct ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Criando...</span>
                      </>
                    ) : (
                      <span>Confirmar Produto</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Selected Event Detail Diagnostic Modal Overlay */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#141414] rounded-lg max-w-2xl w-full border border-[#1F1F1F] overflow-hidden font-mono text-xs flex flex-col max-h-[90vh]"
              id="event-detail-modal"
            >
              {/* Header */}
              <div className="p-4 border-b border-[#1F1F1F] flex items-center justify-between bg-[#0A0A0A]">
                <span className="text-xs uppercase text-white tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00FF9D]" />
                  Logs de Diagnóstico do Evento #{selectedEvent.id}
                </span>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 rounded bg-[#1F1F1F] border border-[#1F1F1F] hover:border-red-500 text-gray-400 hover:text-red-400 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Status Alert Banner */}
                <div className={`p-4 border rounded flex items-start gap-3 ${
                  selectedEvent.meta_status === 'success'
                    ? (selectedEvent.lead_phone && selectedEvent.fbclid
                      ? 'bg-[#1A3D2F]/40 border-[#00FF9D]/30 text-[#00FF9D]'
                      : 'bg-amber-950/40 border-amber-500/30 text-amber-400')
                    : selectedEvent.meta_status === 'failed'
                    ? 'bg-red-950/40 border-red-500/30 text-red-400'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400'
                }`}>
                  <div className="mt-0.5">
                    {selectedEvent.meta_status === 'success' && selectedEvent.lead_phone && selectedEvent.fbclid ? (
                      <CheckCircle className="w-5 h-5 text-[#00FF9D]" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold uppercase block text-[11px]">
                      {selectedEvent.meta_status === 'success' && selectedEvent.lead_phone && selectedEvent.fbclid && 'Atribuição Concluída & Enviada para a Meta'}
                      {selectedEvent.meta_status === 'success' && (!selectedEvent.lead_phone || !selectedEvent.fbclid) && 'Venda registrada, mas sem atribuição de clique'}
                      {selectedEvent.meta_status === 'failed' && 'Erro de Comunicação / Envio com a API da Meta'}
                      {selectedEvent.meta_status === 'skipped' && 'Evento Ignorado para Conversão'}
                      {selectedEvent.meta_status === 'pending' && 'Disparo de Conversão Pendente'}
                    </span>
                    <p className="text-[11px] leading-relaxed uppercase">
                      {selectedEvent.meta_status === 'success' && selectedEvent.lead_phone && selectedEvent.fbclid && 'Os dados de rastreamento do clique (FBCLID) foram combinados e entregues ao Pixel com sucesso.'}
                      {selectedEvent.meta_status === 'success' && (!selectedEvent.lead_phone || !selectedEvent.fbclid) && 'O evento de compra foi enviado com sucesso para a Meta, mas sem dados de FBCLID/Click ID para atribuição de clique.'}
                      {selectedEvent.meta_status === 'failed' && `Falha no envio da conversão. Motivo: ${selectedEvent.meta_response || 'Erro desconhecido'}`}
                      {selectedEvent.meta_status === 'skipped' && `Este postback foi recebido e gravado, mas seu status de pagamento (${selectedEvent.status}) não qualifica para evento de conversão Purchase (apenas "Pagamento Aprovado").`}
                      {selectedEvent.meta_status === 'pending' && 'Este evento está aguardando processamento da fila de envio.'}
                    </p>
                  </div>
                </div>

                {/* Grid Info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-[#0A0A0A] p-4 rounded border border-[#1F1F1F]">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Data Postback</span>
                    <span className="text-white font-bold">{formatDate(selectedEvent.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Produto</span>
                    <span className="text-white font-bold">{selectedEvent.product_name || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">ID do Pedido</span>
                    <span className="text-white font-bold text-xs">{selectedEvent.order_id || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Telefone Comprador</span>
                    <span className="text-white font-bold">{selectedEvent.phone || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Status Checkout</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      selectedEvent.status === 'Pagamento Aprovado'
                        ? 'bg-[#1A3D2F] text-[#00FF9D] border-[#00FF9D]/30'
                        : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                    }`}>
                      {selectedEvent.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Valor</span>
                    <span className="text-[#00FF9D] font-bold">{formatCurrency(selectedEvent.value || 0)}</span>
                  </div>
                </div>

                {/* Lead Matching details */}
                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase block font-bold">1. Correspondência & Atribuição de Lead (Banco de Dados):</span>
                  <div className="bg-[#0A0A0A] p-4 rounded border border-[#1F1F1F] space-y-3 leading-relaxed text-[11px]">
                    <div className="flex justify-between border-b border-[#1F1F1F]/60 pb-2">
                      <span className="text-gray-500 uppercase">Match de Lead por Telefone:</span>
                      {selectedEvent.lead_phone ? (
                        <span className="text-[#00FF9D] font-bold uppercase bg-[#1A3D2F]/60 border border-[#00FF9D]/30 px-2 py-0.5 rounded">
                          ✅ VINCULADO COM SUCESSO
                        </span>
                      ) : (
                        <span className="text-gray-400 font-bold uppercase bg-gray-900 border border-gray-800 px-2 py-0.5 rounded">
                          ❌ VENDA ISOLADA (SEM LEAD)
                        </span>
                      )}
                    </div>
                    {selectedEvent.lead_phone && (
                      <div className="space-y-1.5 uppercase text-gray-400">
                        <div><strong>Telefone do Lead no Banco:</strong> <span className="text-white">{selectedEvent.lead_phone}</span></div>
                        <div><strong>Código FBCLID Recuperado:</strong> <span className="text-[#00FF9D] font-bold break-all">{selectedEvent.fbclid || 'Sem FBCLID'}</span></div>
                        <div>
                          <strong>Análise de Match:</strong> O telefone informado no postback baterá com o lead do WhatsApp pelo algoritmo de correspondência (sufixo dos últimos 8 dígitos). Os dados do clique do anúncio foram recuperados automaticamente!
                        </div>
                      </div>
                    )}
                    {!selectedEvent.lead_phone && (
                      <p className="text-gray-500 uppercase leading-relaxed text-[10px]">
                        Nenhum lead com o mesmo telefone (ou correspondência de sufixo de 8 dígitos) foi encontrado no banco de dados. Este evento de venda foi processado e salvo, mas não pode herdar FBCLID / Click ID para enriquecer a CAPI.
                      </p>
                    )}
                  </div>
                </div>

                {/* Meta API Response Payload */}
                {selectedEvent.meta_status === 'success' && selectedEvent.meta_response && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-gray-500 uppercase block font-bold">2. Confirmação do Envio à Meta (CAPI):</span>
                    <pre className="bg-[#050505] border border-gray-800 rounded p-4 text-[10px] text-[#00FF9D] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[160px]">
                      {typeof selectedEvent.meta_response === 'string' && selectedEvent.meta_response.startsWith('{')
                        ? JSON.stringify(JSON.parse(selectedEvent.meta_response), null, 2)
                        : String(selectedEvent.meta_response)
                      }
                    </pre>
                  </div>
                )}

                {/* Raw webhook Payload */}
                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase block font-bold">3. Payload Bruto do Webhook Recebido (Braip/Payt):</span>
                  <pre className="bg-[#050505] border border-gray-800 rounded p-4 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[180px]">
                    {selectedEvent.payload 
                      ? (selectedEvent.payload.startsWith('{') 
                          ? JSON.stringify(JSON.parse(selectedEvent.payload), null, 2) 
                          : selectedEvent.payload)
                      : '// Nenhum payload bruto gravado'
                    }
                  </pre>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-[#0D0D0D] border-t border-[#1F1F1F] flex justify-end">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="bg-[#1F1F1F] hover:bg-[#0A0A0A] text-white border border-[#1F1F1F] hover:border-[#00FF9D] font-mono text-xs uppercase px-5 py-2.5 rounded transition"
                >
                  Fechar Diagnóstico
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-[#141414] border-t border-[#1F1F1F] py-6 mt-12 text-center text-[10px] font-mono text-gray-600 uppercase tracking-widest">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-bold text-gray-400">Igor Track Teste &copy; 2026. Todos os direitos reservados.</p>
          <p className="tracking-wide">Ferramenta independente de tracking e atribuição para WhatsApp e Meta Conversions API.</p>
        </div>
      </footer>
    </div>
  );
}
