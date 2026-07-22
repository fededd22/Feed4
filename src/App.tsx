import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Server,
  Activity,
  Terminal,
  Settings,
  QrCode,
  Copy,
  Check,
  RotateCw,
  Play,
  Square,
  Cpu,
  Layers,
  Languages,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Send,
  ExternalLink,
  ShieldAlert,
  User,
  Lock,
  Plus,
  Trash2,
  Edit3,
  Clock,
  LogOut,
  HardDrive,
  UserPlus,
  Search,
  CheckSquare,
  XSquare,
  Sparkles,
  ChevronRight,
  Info,
  Calendar,
  X
} from "lucide-react";
import QRCode from "qrcode";

interface Client {
  id: string;
  name: string;
  uuid: string;
  path: string;
  limitGB: number;
  consumedUpload: number;
  consumedDownload: number;
  duration: "minutes" | "hours" | "days" | "months" | "years" | "unlimited";
  durationValue: number;
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
  activeConnections?: number;
  protocol?: "vless" | "vmess" | "trojan";
}

interface SystemStats {
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  disk?: {
    total: number;
    used: number;
    free: number;
  };
  platform: string;
  arch: string;
  nodeVersion: string;
}

interface ServerStatus {
  running: boolean;
  pid: number | null;
  isStarting: boolean;
  system: SystemStats;
}

export default function App() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("admin_username") || "admin");
  
  // Login States
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Core App States
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // UI Panels / Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "clients" | "settings">("dashboard");
  const [qrModalClient, setQrModalClient] = useState<Client | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  // Copy status
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Client Modal States
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  
  // Form States
  const [formName, setFormName] = useState("");
  const [formUUID, setFormUUID] = useState("");
  const [formPath, setFormPath] = useState("");
  const [formLimitGB, setFormLimitGB] = useState<number>(0);
  const [formDuration, setFormDuration] = useState<"minutes" | "hours" | "days" | "months" | "years" | "unlimited">("days");
  const [formDurationValue, setFormDurationValue] = useState<number>(30);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [formProtocol, setFormProtocol] = useState<"vless" | "vmess" | "trojan">("vless");

  // Admin settings Form
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [adminFormSuccess, setAdminFormSuccess] = useState(false);
  const [adminFormError, setAdminFormError] = useState("");
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch headers
  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  });

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_username", data.username);
        setToken(data.token);
        setUsername(data.username);
        setLoginUser("");
        setLoginPass("");
      } else {
        setLoginError(lang === "ar" ? "اسم المستخدم أو كلمة المرور غير صحيحة" : "Invalid username or password");
      }
    } catch (err) {
      setLoginError(lang === "ar" ? "خطأ في الاتصال بالخادم" : "Connection error");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_username");
    setToken(null);
    setUsername(null);
  };

  // Fetch server status
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data: ServerStatus = await res.json();
          setStatus(data);
        } else {
          console.warn("Failed to fetch status: Non-JSON response received");
        }
      } else {
        console.warn(`Failed to fetch status: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("Failed to fetch status:", err);
    }
  };

  // Fetch clients database
  const fetchClients = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/clients", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setClients(data.clients || []);
        } else {
          console.warn("Failed to fetch clients: Non-JSON response received");
        }
      } else if (res.status === 401) {
        handleLogout();
      } else {
        console.warn(`Failed to fetch clients: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("Failed to fetch clients:", err);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/logs", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setLogs(data.logs || []);
        } else {
          console.warn("Failed to fetch logs: Non-JSON response received");
        }
      } else {
        console.warn(`Failed to fetch logs: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("Failed to fetch logs:", err);
    }
  };

  // Start/Stop/Restart daemon
  const handleControl = async (action: "start" | "stop" | "restart") => {
    if (!token) return;
    try {
      const res = await fetch("/api/control", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        fetchStatus();
        fetchLogs();
      } else {
        console.warn(`Failed to execute control action ${action}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`Failed to execute control action ${action}:`, err);
    }
  };

  // Generate random UUID helper
  const generateNewUUID = () => {
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    setFormUUID(uuid);
  };

  // Generate client WebSocket path helper
  const generateClientPath = (nameInput: string) => {
    const cleanName = nameInput
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "_")
      .substring(0, 15);
    setFormPath(`/by_moon/${cleanName || "client"}_${Math.random().toString(36).substring(2, 6)}`);
  };

  // Open Client Modal
  const openAddClientModal = () => {
    setModalMode("add");
    setEditingClientId(null);
    setFormName("");
    const defaultUUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    setFormUUID(defaultUUID);
    setFormPath(`/by_moon/user_${Math.random().toString(36).substring(2, 7)}`);
    setFormLimitGB(10); // Default 10GB
    setFormDuration("days");
    setFormDurationValue(30); // 30 Days default
    setFormEnabled(true);
    setFormProtocol("vless");
    setFormError("");
    setFormSuccess(false);
    setIsClientModalOpen(true);
  };

  const openEditClientModal = (client: Client) => {
    setModalMode("edit");
    setEditingClientId(client.id);
    setFormName(client.name);
    setFormUUID(client.uuid);
    setFormPath(client.path);
    setFormLimitGB(client.limitGB);
    setFormDuration(client.duration);
    setFormDurationValue(client.durationValue);
    setFormEnabled(client.enabled);
    setFormProtocol(client.protocol || "vless");
    setFormError("");
    setFormSuccess(false);
    setIsClientModalOpen(true);
  };

  // Submit Client Modal Form (Add / Edit)
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess(false);
    setIsFormSubmitting(true);

    const clientData = {
      name: formName,
      uuid: formUUID,
      path: formPath,
      limitGB: Number(formLimitGB),
      duration: formDuration,
      durationValue: Number(formDurationValue),
      enabled: formEnabled,
      protocol: formProtocol
    };

    try {
      const url = modalMode === "add" ? "/api/clients" : `/api/clients/${editingClientId}`;
      const method = modalMode === "add" ? "POST" : "PUT";
      
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(clientData)
      });
      const data = await res.json();

      if (res.ok) {
        setFormSuccess(true);
        fetchClients();
        fetchStatus();
        setTimeout(() => {
          setIsClientModalOpen(false);
        }, 1500);
      } else {
        setFormError(data.error || "Failed to process request");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error");
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Delete Client
  const handleDeleteClient = async (id: string) => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من رغبتك في حذف هذا التكوين نهائياً؟" : "Are you sure you want to permanently delete this configuration?")) {
      return;
    }
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchClients();
        fetchStatus();
      }
    } catch (err) {
      console.error("Failed to delete client:", err);
    }
  };

  // Toggle Client Quick Enable/Disable
  const toggleClientEnabled = async (client: Client) => {
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: !client.enabled })
      });
      if (res.ok) {
        fetchClients();
        fetchStatus();
      }
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  // Change Admin Settings
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFormError("");
    setAdminFormSuccess(false);
    setIsAdminSubmitting(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: newAdminUser, password: newAdminPass })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminFormSuccess(true);
        setUsername(newAdminUser);
        localStorage.setItem("admin_username", newAdminUser);
        setNewAdminUser("");
        setNewAdminPass("");
      } else {
        setAdminFormError(data.error || "Failed to update credentials");
      }
    } catch (err) {
      setAdminFormError(lang === "ar" ? "خطأ في الشبكة" : "Network error");
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  // Poll server state
  useEffect(() => {
    fetchStatus();
    if (token) {
      fetchClients();
      fetchLogs();
    }
    const interval = setInterval(() => {
      fetchStatus();
      if (token) {
        fetchClients();
        fetchLogs();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [token]);

  // Real-time server uptime tick (local counter increment)
  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(prev => {
        if (prev && prev.running && prev.system) {
          return {
            ...prev,
            system: {
              ...prev.system,
              uptime: prev.system.uptime + 1
            }
          };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle scrolling of logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Generate configuration URL string for client (VLESS or VMess)
  const getConfigUrl = (client: Client) => {
    const actualHost = typeof window !== "undefined" ? window.location.host : "example.com";
    const hostParts = actualHost.split(":");
    const domain = hostParts[0];
    const hostName = typeof window !== "undefined" ? window.location.hostname : "example.com";
    const pathWithSlash = client.path.startsWith("/") ? client.path : "/" + client.path;
    
    const isVmess = client.protocol === "vmess";
    const isTrojan = client.protocol === "trojan";
    
    if (isVmess) {
      const vmessObj = {
        v: "2",
        ps: `Moon_${client.name}`,
        add: domain,
        port: 443,
        id: client.uuid,
        aid: "0",
        scy: "auto",
        net: "ws",
        type: "none",
        host: hostName,
        path: pathWithSlash,
        tls: "tls",
        sni: hostName
      };
      const jsonStr = JSON.stringify(vmessObj);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      return `vmess://${b64}`;
    } else if (isTrojan) {
      return `trojan://${client.uuid}@${domain}:443?path=${encodeURIComponent(
        pathWithSlash
      )}&security=tls&type=ws&host=${hostName}&sni=${hostName}#Moon_${encodeURIComponent(client.name)}`;
    } else {
      return `vless://${client.uuid}@${domain}:443?path=${encodeURIComponent(
        pathWithSlash
      )}&security=tls&encryption=none&type=ws&host=${hostName}&sni=${hostName}#Moon_${encodeURIComponent(client.name)}`;
    }
  };

  // Open QR modal for client
  const showQrCode = (client: Client) => {
    const configLink = getConfigUrl(client);
    setQrModalClient(client);
    QRCode.toDataURL(configLink, { width: 350, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error(err));
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, id: string | null = null, type: "client" | "general" = "client") => {
    navigator.clipboard.writeText(text);
    if (type === "client" && id) {
      setCopiedClientId(id);
      setTimeout(() => setCopiedClientId(null), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Utility to format bytes beautifully
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Calculate percentage of limit
  const getUsagePercentage = (client: Client) => {
    const totalConsumed = (client.consumedUpload || 0) + (client.consumedDownload || 0);
    const limitBytes = client.limitGB * 1024 * 1024 * 1024;
    if (client.limitGB === 0) return 0;
    return Math.min(100, (totalConsumed / limitBytes) * 100);
  };

  // Check client status
  const getClientStatus = (client: Client) => {
    if (!client.enabled) return "disabled";
    if (client.expiresAt && new Date(client.expiresAt) < new Date()) return "expired";
    const totalConsumed = (client.consumedUpload || 0) + (client.consumedDownload || 0);
    const limitBytes = client.limitGB * 1024 * 1024 * 1024;
    if (client.limitGB > 0 && totalConsumed >= limitBytes) return "limit_exceeded";
    return "active";
  };

  const getStatusBadge = (client: Client) => {
    const status = getClientStatus(client);
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {lang === "ar" ? "نشط" : "Active"}
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            {lang === "ar" ? "منتهي الصلاحية" : "Expired"}
          </span>
        );
      case "limit_exceeded":
        return (
          <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {lang === "ar" ? "تجاوز الحد" : "Limit Exceeded"}
          </span>
        );
      case "disabled":
      default:
        return (
          <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/50">
            {lang === "ar" ? "معطل" : "Disabled"}
          </span>
        );
    }
  };

  // Format Expiration String
  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return lang === "ar" ? "غير محدود" : "Unlimited";
    const date = new Date(expiresAt);
    if (lang === "ar") {
      return date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
    }
    return date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  };

  // Format Server Uptime Beautifully
  const formatUptime = (seconds: number) => {
    if (!seconds || seconds <= 0) return "--";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (lang === "ar") {
      const parts = [];
      if (d > 0) parts.push(`${d} يوم`);
      if (h > 0) parts.push(`${h} ساعة`);
      if (m > 0) parts.push(`${m} دقيقة`);
      if (s > 0 || parts.length === 0) parts.push(`${s} ثانية`);
      return parts.join(" و ");
    } else {
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      if (s > 0 || parts.length === 0) parts.push(`${s}s`);
      return parts.join(" ");
    }
  };

  // Translations dictionary
  const t = {
    ar: {
      title: "لوحة تحكم خادم V2Ray VLESS",
      subtitle: "نظام إدارة وجدار حماية خادم VLESS عالي السرعة عبر WebSocket",
      loginHeader: "تسجيل الدخول للوحة التحكم",
      loginSubtitle: "أدخل بيانات المسؤول للوصول وإدارة التكوينات ومراقبة الاستهلاك والمستخدمين",
      username: "اسم المستخدم",
      password: "كلمة المرور",
      loginBtn: "تسجيل الدخول الآمن",
      logout: "تسجيل الخروج",
      welcome: "أهلاً بك، مسؤول الخادم",
      telegram: "المطور: @moonalgerie",
      status: "حالة الخادم",
      running: "نشط ويعمل",
      stopped: "متوقف",
      starting: "جاري التشغيل...",
      pid: "معرف العملية",
      uptime: "مدة التشغيل",
      systemStats: "إحصائيات النظام",
      memoryUsage: "استهلاك الرام (RAM)",
      diskUsage: "استهلاك مساحة التخزين (Disk)",
      platform: "نظام التشغيل",
      arch: "البنية",
      nodeVersion: "إصدار Node.js",
      controls: "التحكم في الخادم Core",
      start: "تشغيل",
      stop: "إيقاف",
      restart: "إعادة تشغيل",
      vlessConfig: "إعدادات اتصال VLESS",
      copyLink: "نسخ الرابط",
      copyConfig: "نسخ JSON",
      copied: "تم النسخ!",
      configurationSettings: "تعديل الإعداد الرئيسي",
      uuid: "معرف المستخدم UUID",
      wsPath: "مسار الـ WebSocket Path",
      generateUUID: "توليد UUID جديد",
      saveAndApply: "حفظ وتطبيق التغييرات",
      saving: "جاري الحفظ...",
      successMsg: "تم التحديث بنجاح!",
      logsTitle: "سجلات نظام V2Ray Core",
      filterPlaceholder: "تصفية السجلات حسب الكلمة المفتاحية...",
      noLogs: "لا توجد سجلات مطابقة للبحث",
      documentation: "شرح الاستخدام والتشغيل",
      docStep1: "1. قم بنسخ رابط الـ VLESS أو مسح كود الـ QR من التكوينات بالأسفل.",
      docStep2: "2. افتح تطبيق v2ray الخاص بك (مثل v2rayNG, Shadowrocket, Nekobox, v2rayN).",
      docStep3: "3. قم باستيراد الإعداد من الحافظة أو عبر كاميرا الـ QR code.",
      docStep4: "4. تأكد من تفعيل الاتصال واختيار خادم Moon_VLESS لبدء التصفح الآمن والسريع.",
      refreshing: "تحديث تلقائي مفعّل",
      activeConnections: "قناة النقل المباشر",
      v2rayStatus: "حالة برنامج V2Ray Core",
      pathNote: "يجب أن يبدأ بـ / ويطابق المسار المعرف في العميل.",
      uuidNote: "معرّف فريد خاص بالأمان والتحقق من الهوية.",
      tabDashboard: "لوحة التحكم الرئيسية",
      tabClients: "إدارة التكوينات والمشتركين",
      tabSettings: "إعدادات الأمان",
      clientsListTitle: "التكوينات المخصصة والمشتركين",
      addClientBtn: "إنشاء تكوين مستخدم جديد",
      searchPlaceholder: "البحث في التكوينات بـالاسم أو الـ UUID...",
      clientCardUUID: "المعرّف الـ UUID",
      clientCardPath: "مسار الـ WebSocket",
      clientCardUsage: "حجم استهلاك البيانات",
      clientCardLimit: "الحد الأقصى المسموح",
      clientCardExpiry: "تاريخ انتهاء الصلاحية",
      unlimited: "غير محدود",
      totalConsumed: "إجمالي استهلاك البيانات",
      upload: "الرفع",
      download: "التحميل",
      actions: "العمليات والتحكم",
      modalAddTitle: "إنشاء تكوين مستخدم جديد",
      modalEditTitle: "تعديل تكوين مستخدم",
      formClientName: "اسم المستخدم المذيل أو اللقب",
      formClientProtocol: "نوع البروتوكول (Protocol)",
      formClientUUID: "معرف المستخدم UUID الفردي",
      formClientPath: "مسار الـ WebSocket الفردي المخصص",
      formClientLimit: "الحد الأقصى للبيانات المستهلكة (بالجيجابايت GB - ضع 0 لغير المحدود)",
      formClientDuration: "فترة صلاحية التكوين قبل انتهاء الاتصال",
      formClientDurationValue: "قيمة الصلاحية",
      durationMinutes: "دقائق",
      durationHours: "ساعات",
      durationDays: "أيام",
      durationMonths: "أشهر",
      durationYears: "سنوات",
      durationUnlimited: "صلاحية غير محدودة",
      formClientEnabled: "تفعيل هذا التكوين للاتصال فوراً",
      btnCancel: "إلغاء",
      btnSave: "حفظ وتوليد التكوين",
      editSecurityHeader: "تغيير بيانات تسجيل الدخول للوحة التحكم",
      adminUserLabel: "اسم مستخدم المسؤول الجديد",
      adminPassLabel: "كلمة مرور المسؤول الجديدة",
      updateAdminBtn: "حفظ وتأمين الحساب",
      adminSuccessMsg: "تم تحديث بيانات المسؤول بنجاح! سيتم الحفاظ عليها حتى إعادة التشغيل.",
      clientExpiryCountdown: "تنتهي الصلاحية في:",
      totalClients: "إجمالي التكوينات",
      activeClients: "التكوينات النشطة",
      expiredClients: "تكوينات منتهية الصلاحية",
      trafficExceeded: "تجاوزت الحد المسموح",
      quickConfigImport: "استيراد التكوين السريع للعميل",
      qrCodeTitle: "امسح رمز QR لاستيراد التكوين",
      close: "إغلاق",
      allTunnelsActive: "جميع الأجهزة تعبر بنجاح"
    },
    en: {
      title: "V2Ray VLESS Server Dashboard",
      subtitle: "High-performance VLESS WebSocket firewall & user management dashboard",
      loginHeader: "Admin Panel Login",
      loginSubtitle: "Enter administrative credentials to manage configurations, limits, and monitor traffic",
      username: "Admin Username",
      password: "Admin Password",
      loginBtn: "Secure Authorization",
      logout: "Secure Logout",
      welcome: "Welcome, System Administrator",
      telegram: "Developer: @moonalgerie",
      status: "Server Status",
      running: "Active & Running",
      stopped: "Stopped",
      starting: "Starting...",
      pid: "Process ID",
      uptime: "Uptime",
      systemStats: "System Statistics",
      memoryUsage: "Server RAM Usage",
      diskUsage: "Server Disk Usage",
      platform: "OS Platform",
      arch: "Architecture",
      nodeVersion: "Node.js Version",
      controls: "V2Ray Core Controls",
      start: "Start Core",
      stop: "Stop Core",
      restart: "Restart Daemon",
      vlessConfig: "Global VLESS Settings",
      copyLink: "Copy Link",
      copyConfig: "Copy JSON",
      copied: "Copied!",
      configurationSettings: "Edit Primary Config",
      uuid: "Global UUID",
      wsPath: "Global WS Path",
      generateUUID: "Generate UUID",
      saveAndApply: "Save & Restart Core",
      saving: "Saving Changes...",
      successMsg: "Settings saved successfully!",
      logsTitle: "V2Ray Daemon Logs",
      filterPlaceholder: "Filter core output by keywords...",
      noLogs: "No core outputs match the filter",
      documentation: "Client Connection Guide",
      docStep1: "1. Copy the VLESS configuration link or scan the QR Code from the user list below.",
      docStep2: "2. Open your preferred V2Ray client (e.g., v2rayNG, Shadowrocket, Nekobox, v2rayN).",
      docStep3: "3. Import the config from your clipboard or scan the QR Code.",
      docStep4: "4. Activate the tunnel connection to experience secure, high-speed proxying.",
      refreshing: "Auto-refresh active",
      activeConnections: "Live Pipelines",
      v2rayStatus: "V2Ray Core status",
      pathNote: "Must start with / and match the client WebSocket path.",
      uuidNote: "Unique secure identifier for client validation.",
      tabDashboard: "Main Dashboard",
      tabClients: "User Configurations",
      tabSettings: "Panel Security",
      clientsListTitle: "Client Configurations",
      addClientBtn: "Create Client Config",
      searchPlaceholder: "Search clients by name, path or UUID...",
      clientCardUUID: "User UUID",
      clientCardPath: "WS Path",
      clientCardUsage: "Usage Metrics",
      clientCardLimit: "Limit Allowed",
      clientCardExpiry: "Validity Expiration",
      unlimited: "Unlimited",
      totalConsumed: "Total Consumed",
      upload: "Upload",
      download: "Download",
      actions: "Client Actions",
      modalAddTitle: "Create Client Connection",
      modalEditTitle: "Edit Client Connection",
      formClientName: "User Label / Alias",
      formClientProtocol: "Connection Protocol (Type)",
      formClientUUID: "Client VLESS UUID Key",
      formClientPath: "Client WebSocket Path",
      formClientLimit: "Client Data Limit (in Gigabytes GB - use 0 for unlimited)",
      formClientDuration: "Client Validity Duration Length",
      formClientDurationValue: "Validity Value",
      durationMinutes: "Minutes",
      durationHours: "Hours",
      durationDays: "Days",
      durationMonths: "Months",
      durationYears: "Years",
      durationUnlimited: "Unlimited Lifetime",
      formClientEnabled: "Enable this client connection immediately",
      btnCancel: "Cancel",
      btnSave: "Save Client Config",
      editSecurityHeader: "Change Admin Access Credentials",
      adminUserLabel: "New Admin Username",
      adminPassLabel: "New Admin Password",
      updateAdminBtn: "Save Security Credentials",
      adminSuccessMsg: "Admin credentials updated successfully! New values will persist.",
      clientExpiryCountdown: "Expires At:",
      totalClients: "Total Clients",
      activeClients: "Active Clients",
      expiredClients: "Expired Accounts",
      trafficExceeded: "Over-limit Accounts",
      quickConfigImport: "Client Fast Import Panel",
      qrCodeTitle: "Scan QR Code to Import Config",
      close: "Close",
      allTunnelsActive: "All tunnels online"
    }
  };

  const currentT = t[lang];

  // Helper calculation for total bandwidth
  const statsTotalClients = clients.length;
  const statsActiveClients = clients.filter(c => getClientStatus(c) === "active").length;
  const statsExpiredClients = clients.filter(c => getClientStatus(c) === "expired").length;
  const statsOverLimitClients = clients.filter(c => getClientStatus(c) === "limit_exceeded").length;
  const statsTotalConnections = clients.reduce((sum, c) => sum + (c.activeConnections || 0), 0);
  const statsActiveClientsCount = clients.filter(c => (c.activeConnections || 0) > 0).length;

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.uuid.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // If NOT authenticated, show a gorgeous lock login gate
  if (!token) {
    return (
      <div 
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans p-4 relative overflow-hidden"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        {/* Decorative background gradients */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-950/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-950/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10">
          
          {/* Header & Language selector */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>Moon Tunnel Manager</span>
            </div>
            
            <button 
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition bg-slate-950 border border-slate-800 py-1 px-3 rounded-full cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === "ar" ? "English" : "العربية"}</span>
            </button>
          </div>

          <div className="text-center mb-8">
            <div className="inline-flex p-4 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-2xl shadow-lg shadow-indigo-600/20 mb-4">
              <Server className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              {currentT.loginHeader}
            </h1>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              {currentT.loginSubtitle}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username Input */}
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.username}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input 
                  type="text" 
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition text-slate-200"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.password}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password" 
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition text-slate-200"
                />
              </div>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 disabled:bg-indigo-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? <RotateCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>{currentT.loginBtn}</span>
            </button>
          </form>

          {/* Quick Notice */}
          <div className="mt-8 text-center border-t border-slate-800/60 pt-4">
            <span className="text-[10px] text-slate-500 block">
              Default credentials on initial boot: admin / admin
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard authenticated view
  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Decorative ambient background lights */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-900/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 right-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 w-full flex-grow flex flex-col gap-6 relative z-10">
        
        {/* Header Block */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-850">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-2xl shadow-lg shadow-indigo-500/20">
              <Server className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  {currentT.title}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  v5.14.1
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-1">{currentT.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Telegram Link */}
            <a 
              href="https://t.me/moonalgerie" 
              target="_blank" 
              rel="noreferrer" 
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-indigo-500/10 text-indigo-400 hover:text-indigo-300 rounded-xl text-xs font-medium transition hover:border-indigo-500/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{currentT.telegram}</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>

            {/* Language Switcher */}
            <button 
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <Languages className="w-4 h-4 text-indigo-400" />
              <span>{lang === "ar" ? "English" : "العربية"}</span>
            </button>

            {/* Logout button */}
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-950/30 text-red-400 hover:bg-red-900/20 border border-red-500/10 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{currentT.logout}</span>
            </button>
          </div>
        </header>

        {/* Global Navigation Tabs */}
        <nav className="flex items-center gap-2 border-b border-slate-900 pb-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>{currentT.tabDashboard}</span>
          </button>

          <button
            onClick={() => setActiveTab("clients")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "clients"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>{currentT.tabClients}</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "settings"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>{currentT.tabSettings}</span>
          </button>
        </nav>

        {/* Dynamic Panel Rendering */}
        <div className="flex-grow flex flex-col gap-6">

          {/* TAB 1: MAIN DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT SECTION (5 cols): Core Control & Stats */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                
                {/* Status Indicator Bar */}
                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-850 rounded-2xl p-4 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <span className={`flex h-3.5 w-3.5 rounded-full ${status?.running ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className={`absolute inline-flex h-3.5 w-3.5 rounded-full ${status?.running ? "bg-emerald-400 pulse-glow-green animate-ping" : "bg-red-400 pulse-glow-red animate-ping"} opacity-75 top-0 left-0`} />
                    </div>
                    <div className="text-xs font-bold text-slate-200">
                      {currentT.v2rayStatus}: {" "}
                      <span className={status?.running ? "text-emerald-400" : "text-red-400"}>
                        {status?.running ? currentT.running : (status?.isStarting ? currentT.starting : currentT.stopped)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                    <span>{currentT.refreshing}</span>
                  </div>
                </div>

                {/* V2Ray Daemon Controls */}
                <div className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden">
                  <h2 className="text-sm font-extrabold text-slate-300 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    {currentT.controls}
                  </h2>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      disabled={status?.running || status?.isStarting}
                      onClick={() => handleControl("start")}
                      className={`flex flex-col items-center justify-center gap-2 py-3 px-1 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        status?.running 
                          ? "bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed" 
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40"
                      }`}
                    >
                      <Play className="w-4 h-4" />
                      <span>{currentT.start}</span>
                    </button>

                    <button
                      disabled={!status?.running}
                      onClick={() => handleControl("stop")}
                      className={`flex flex-col items-center justify-center gap-2 py-3 px-1 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        !status?.running 
                          ? "bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed" 
                          : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40"
                      }`}
                    >
                      <Square className="w-4 h-4" />
                      <span>{currentT.stop}</span>
                    </button>

                    <button
                      disabled={!status?.running && !status?.isStarting}
                      onClick={() => handleControl("restart")}
                      className={`flex flex-col items-center justify-center gap-2 py-3 px-1 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        !status?.running && !status?.isStarting
                          ? "bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed" 
                          : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40"
                      }`}
                    >
                      <RotateCw className="w-4 h-4 text-indigo-400" />
                      <span>{currentT.restart}</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-800/50 pt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                      <span className="text-[10px] text-slate-500 block mb-0.5">{currentT.pid}</span>
                      <span className="font-mono text-xs font-semibold text-slate-300">
                        {status?.pid || "--"}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                      <span className="text-[10px] text-slate-500 block mb-0.5">{currentT.uptime}</span>
                      <span className="font-mono text-[11px] font-semibold text-indigo-400">
                        {status?.system?.uptime ? formatUptime(status.system.uptime) : "--"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* System Specs Stats */}
                <div className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 flex flex-col gap-4">
                  <h2 className="text-sm font-extrabold text-slate-300 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    {currentT.systemStats}
                  </h2>

                  <div className="space-y-3.5">
                    {/* Memory usage bar */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          {currentT.memoryUsage}
                        </span>
                        <span className="font-mono text-indigo-400 font-bold">
                          {status?.system?.memory ? formatBytes(status.system.memory.heapUsed) : "0 MB"} / {status?.system?.memory ? formatBytes(status.system.memory.heapTotal) : "0 MB"}
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: status?.system?.memory 
                              ? `${Math.min(100, (status.system.memory.heapUsed / status.system.memory.heapTotal) * 100)}%` 
                              : "0%" 
                          }}
                        />
                      </div>
                    </div>

                    {/* Disk / Storage usage bar */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                          {currentT.diskUsage}
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {status?.system?.disk ? formatBytes(status.system.disk.used) : "0 MB"} / {status?.system?.disk ? formatBytes(status.system.disk.total) : "0 MB"}
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: status?.system?.disk 
                              ? `${Math.min(100, (status.system.disk.used / status.system.disk.total) * 100)}%` 
                              : "0%" 
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                      <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-500 block mb-0.5">{currentT.platform}</span>
                        <span className="text-xs font-bold text-slate-300 capitalize">
                          {status?.system?.platform || "--"}
                        </span>
                      </div>
                      <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-500 block mb-0.5">{currentT.arch}</span>
                        <span className="text-xs font-bold text-slate-300 uppercase">
                          {status?.system?.arch || "--"}
                        </span>
                      </div>
                      <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850 col-span-2">
                        <span className="text-[10px] text-slate-500 block mb-0.5">{currentT.nodeVersion}</span>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          {status?.system?.nodeVersion || "--"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dashboard Usage Overview Counter */}
                <div className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 grid grid-cols-2 gap-4">
                  <div className="col-span-2 text-xs font-bold text-slate-400 mb-1 border-b border-slate-800/40 pb-2 flex items-center justify-between">
                    <span>{currentT.clientsListTitle}</span>
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 block mb-1">{currentT.totalClients}</span>
                    <span className="text-xl font-black text-indigo-400">{statsTotalClients}</span>
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 block mb-1">{currentT.activeClients}</span>
                    <span className="text-xl font-black text-emerald-400">{statsActiveClients}</span>
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 block mb-1">{currentT.expiredClients}</span>
                    <span className="text-xl font-black text-red-400">{statsExpiredClients}</span>
                  </div>
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                    <span className="text-[10px] text-slate-500 block mb-1">{currentT.trafficExceeded}</span>
                    <span className="text-xl font-black text-amber-500">{statsOverLimitClients}</span>
                  </div>
                </div>

              </div>

              {/* RIGHT SECTION (7 cols): Logs Terminal Console */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                
                {/* Live Logs Terminal */}
                <section className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 flex flex-col gap-4 h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-850">
                    <h2 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      {currentT.logsTitle}
                    </h2>

                    {/* Filter logs input */}
                    <div className="relative max-w-xs w-full">
                      <input 
                        type="text" 
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                        placeholder={currentT.filterPlaceholder}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-1.5 text-xs text-slate-300 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Terminal output frame */}
                  <div className="bg-slate-950/90 border border-slate-900 rounded-2xl p-4 font-mono text-[11px] text-slate-400 h-100 lg:h-[450px] overflow-y-auto flex flex-col gap-1.5 shadow-inner">
                    {logs.filter(log => log.toLowerCase().includes(logFilter.toLowerCase())).length > 0 ? (
                      logs.filter(log => log.toLowerCase().includes(logFilter.toLowerCase())).map((log, index) => {
                        let colorClass = "text-slate-400";
                        if (log.includes("ERROR") || log.includes("Error") || log.includes("STDERR") || log.includes("fail") || log.includes("Denied")) {
                          colorClass = "text-red-400 font-semibold";
                        } else if (log.includes("STDOUT") || log.includes("successfully") || log.includes("listening") || log.includes("Upgrading") || log.includes("Upgraded")) {
                          colorClass = "text-emerald-400";
                        } else if (log.includes("V2Ray") || log.includes("daemon")) {
                          colorClass = "text-indigo-300";
                        }

                        return (
                          <div key={index} className={`break-all leading-relaxed ${colorClass}`}>
                            {log}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-600 text-center py-24 italic">
                        {currentT.noLogs}
                      </div>
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </section>

              </div>

            </div>
          )}

          {/* TAB 2: CLIENT MANAGEMENT */}
          {activeTab === "clients" && (
            <div className="flex flex-col gap-6">
              
              {/* Clients Controller Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-5 rounded-2xl border border-slate-850">
                <div className="flex-grow max-w-md w-full relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={currentT.searchPlaceholder}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2 text-xs outline-none transition text-slate-200"
                  />
                </div>

                <button
                  onClick={openAddClientModal}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/10 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{currentT.addClientBtn}</span>
                </button>
              </div>

              {/* Clients Bento List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filteredClients.map((client) => {
                    const totalConsumed = (client.consumedUpload || 0) + (client.consumedDownload || 0);
                    const usagePercent = getUsagePercentage(client);
                    const clientStatus = getClientStatus(client);
                    const configLink = getConfigUrl(client);

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={client.id}
                        className={`bg-slate-900/30 border rounded-3xl p-6 flex flex-col gap-4.5 relative overflow-hidden transition hover:border-slate-800 ${
                          clientStatus === "expired" ? "border-red-500/10" : 
                          clientStatus === "limit_exceeded" ? "border-amber-500/10" : 
                          !client.enabled ? "border-slate-800/40 opacity-70" : "border-slate-850"
                        }`}
                      >
                        {/* Header Client Card */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl border ${
                              clientStatus === "active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                              clientStatus === "expired" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                              clientStatus === "limit_exceeded" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                              "bg-slate-800 border-slate-700 text-slate-400"
                            }`}>
                              <User className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <h3 className="font-bold text-sm text-slate-200 line-clamp-1">{client.name}</h3>
                              <span className="text-[10px] text-slate-500 block">
                                {client.id === "default" ? "Default Primary" : (client.protocol === "vmess" ? "VMess Tunnel" : (client.protocol === "trojan" ? "Trojan Tunnel" : "VLESS Tunnel"))}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {getStatusBadge(client)}
                          </div>
                        </div>

                        {/* Connection specifications */}
                        <div className="space-y-2 border-t border-b border-slate-850 py-3.5 text-[11px] font-mono">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">{currentT.clientCardUUID}</span>
                            <span className="text-slate-300 font-semibold truncate select-all max-w-[180px] text-left">
                              {client.uuid}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">{currentT.clientCardPath}</span>
                            <span className="text-indigo-400 font-semibold truncate select-all max-w-[180px] text-left">
                              {client.path}
                            </span>
                          </div>
                        </div>

                        {/* Bandwidth / Consumption monitoring stats */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-500">{currentT.clientCardUsage}</span>
                            <span className="text-slate-300 font-semibold">
                              {formatBytes(totalConsumed)} / {client.limitGB > 0 ? `${client.limitGB} GB` : currentT.unlimited}
                            </span>
                          </div>

                          {/* Consumption progress bar */}
                          {client.limitGB > 0 && (
                            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-950/40 p-2 rounded-xl">
                            <div>
                              <span className="text-slate-600 block text-[9px] uppercase">{currentT.upload}</span>
                              <span className="text-emerald-400 font-semibold">{formatBytes(client.consumedUpload || 0)}</span>
                            </div>
                            <div>
                              <span className="text-slate-600 block text-[9px] uppercase">{currentT.download}</span>
                              <span className="text-indigo-400 font-semibold">{formatBytes(client.consumedDownload || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Validity & Expiry section */}
                        <div className="flex items-center justify-between text-[11px] bg-slate-950/20 px-3 py-1.5 rounded-xl border border-slate-850/60">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{currentT.clientExpiryCountdown}</span>
                          </div>
                          <span className="font-semibold text-slate-300 font-mono">
                            {formatExpiration(client.expiresAt)}
                          </span>
                        </div>

                        {/* Connection configuration buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-850/60 mt-1">
                          <button
                            onClick={() => copyToClipboard(configLink, client.id)}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold transition cursor-pointer"
                          >
                            {copiedClientId === client.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedClientId === client.id ? currentT.copied : currentT.copyLink}</span>
                          </button>

                          <button
                            onClick={() => showQrCode(client)}
                            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-[10px] font-bold border border-slate-700 transition cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                            <span>QR Code</span>
                          </button>
                        </div>

                        {/* Client modification controls (Disable / Edit / Delete) */}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-850/60 pt-3 text-[11px]">
                          <div className="flex items-center gap-2">
                            {/* Enable/Disable switch */}
                            <button
                              onClick={() => toggleClientEnabled(client)}
                              className={`px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                                client.enabled 
                                  ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" 
                                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                              }`}
                            >
                              {client.enabled ? "Active" : "Disabled"}
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Edit Button */}
                            <button
                              onClick={() => openEditClientModal(client)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              disabled={client.id === "default"}
                              onClick={() => handleDeleteClient(client.id)}
                              className={`p-1.5 rounded-lg transition ${
                                client.id === "default" 
                                  ? "text-slate-700 cursor-not-allowed" 
                                  : "hover:bg-red-950/40 text-slate-400 hover:text-red-400 cursor-pointer"
                              }`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

            </div>
          )}

          {/* TAB 3: ADMIN SECURITY SETTINGS */}
          {activeTab === "settings" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Admin configuration password */}
              <div className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 flex flex-col gap-4">
                <h2 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                  <ShieldAlert className="w-4.5 h-4.5 text-indigo-400" />
                  {currentT.editSecurityHeader}
                </h2>

                <form onSubmit={handleAdminSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.adminUserLabel}</label>
                    <input
                      type="text"
                      value={newAdminUser}
                      onChange={(e) => setNewAdminUser(e.target.value)}
                      placeholder={username || "admin"}
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs outline-none transition text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.adminPassLabel}</label>
                    <input
                      type="password"
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs outline-none transition text-slate-200"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isAdminSubmitting || !newAdminUser || !newAdminPass}
                      className="w-full py-2 px-4 bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed"
                    >
                      {isAdminSubmitting ? currentT.saving : currentT.updateAdminBtn}
                    </button>
                  </div>

                  <AnimatePresence>
                    {adminFormSuccess && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-400 flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{currentT.adminSuccessMsg}</span>
                      </motion.div>
                    )}

                    {adminFormError && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400 flex items-center gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{adminFormError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </div>

              {/* Server Primary Connection parameters */}
              <div className="bg-slate-900/30 border border-slate-850 rounded-3xl p-6 flex flex-col gap-4">
                <h2 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                  <Settings className="w-4.5 h-4.5 text-indigo-400" />
                  {currentT.documentation}
                </h2>
                <div className="text-xs text-slate-400 space-y-3 leading-relaxed">
                  <p>{currentT.docStep1}</p>
                  <p>{currentT.docStep2}</p>
                  <p>{currentT.docStep3}</p>
                  <p>{currentT.docStep4}</p>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* FOOTER */}
      <footer className="py-6 border-t border-slate-900 text-center text-[11px] text-slate-600 relative z-10">
        <p>© 2026 Moon VLESS Tunnel Manager. All rights reserved. Designed for optimal speed and maximum firewall transparency.</p>
      </footer>

      {/* ADD/EDIT CLIENT DIALOG MODAL */}
      <AnimatePresence>
        {isClientModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsClientModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl z-10 max-h-[90vh] overflow-y-auto"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              {/* Close Button */}
              <button 
                onClick={() => setIsClientModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-lg font-extrabold text-slate-100 flex items-center gap-2 mb-6">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>{modalMode === "add" ? currentT.modalAddTitle : currentT.modalEditTitle}</span>
              </h2>

              <form onSubmit={handleClientSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.formClientName}</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (modalMode === "add") generateClientPath(e.target.value);
                    }}
                    placeholder="e.g., Ali Ahmed"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition text-slate-200"
                  />
                </div>

                {/* Protocol Selection */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.formClientProtocol}</label>
                  <select
                    value={formProtocol}
                    onChange={(e) => setFormProtocol(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs outline-none transition text-slate-200"
                  >
                    <option value="vless">VLESS</option>
                    <option value="vmess">VMess</option>
                    <option value="trojan">Trojan</option>
                  </select>
                </div>

                {/* UUID */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1 flex justify-between items-center">
                    <span>{currentT.formClientUUID}</span>
                    <button
                      type="button"
                      onClick={generateNewUUID}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer hover:underline"
                    >
                      {currentT.generateUUID}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={formUUID}
                    onChange={(e) => setFormUUID(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs font-mono outline-none transition text-slate-200"
                  />
                </div>

                {/* WebSocket Path */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.formClientPath}</label>
                  <input
                    type="text"
                    value={formPath}
                    onChange={(e) => setFormPath(e.target.value)}
                    required
                    placeholder="/by_moon/client_name"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs font-mono outline-none transition text-slate-200"
                  />
                </div>

                {/* Data Limit (GB) */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">
                    {currentT.formClientLimit}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formLimitGB}
                    onChange={(e) => setFormLimitGB(Number(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition text-slate-200"
                  />
                </div>

                {/* Validity Period / Expiration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">{currentT.formClientDuration}</label>
                    <select
                      value={formDuration}
                      onChange={(e) => setFormDuration(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs outline-none transition text-slate-200"
                    >
                      <option value="unlimited">{currentT.durationUnlimited}</option>
                      <option value="minutes">{currentT.durationMinutes}</option>
                      <option value="hours">{currentT.durationHours}</option>
                      <option value="days">{currentT.durationDays}</option>
                      <option value="months">{currentT.durationMonths}</option>
                      <option value="years">{currentT.durationYears}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">
                      {currentT.formClientDurationValue}
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={formDuration === "unlimited"}
                      value={formDurationValue}
                      onChange={(e) => setFormDurationValue(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Enabled switch toggle */}
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="modalEnabledCheckbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-800 bg-slate-950 rounded cursor-pointer"
                  />
                  <label htmlFor="modalEnabledCheckbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                    {currentT.formClientEnabled}
                  </label>
                </div>

                {/* Feedback alerts */}
                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formError}</span>
                    </motion.div>
                  )}

                  {formSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{currentT.successMsg}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit controls */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => setIsClientModalOpen(false)}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    {currentT.btnCancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isFormSubmitting}
                    className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/10"
                  >
                    {isFormSubmitting ? currentT.saving : currentT.btnSave}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR CODE MODAL DISPLAY */}
      <AnimatePresence>
        {qrModalClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrModalClient(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl z-10 text-center"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <button
                onClick={() => setQrModalClient(null)}
                className="absolute top-4 right-4 p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="font-extrabold text-slate-100 text-base mb-2">
                {currentT.qrCodeTitle}
              </h3>
              <p className="text-xs text-slate-400 mb-5">{qrModalClient.name}</p>

              {/* QR Image Box */}
              <div className="bg-white p-4 rounded-2xl inline-block shadow-lg border border-slate-200 mb-5">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="VLESS Link QR Code" className="w-56 h-56 mx-auto object-contain" />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400 animate-pulse">
                    Generating QR...
                  </div>
                )}
              </div>

              {/* Connection copy string */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-850/80 mb-5 relative">
                <span className="text-[9px] text-indigo-400 font-bold block mb-1 text-left uppercase">
                  {qrModalClient.protocol === "vmess" ? "VMess Connection String" : (qrModalClient.protocol === "trojan" ? "Trojan Connection String" : "VLESS Connection String")}
                </span>
                <p className="font-mono text-[10px] text-slate-300 break-all select-all text-left line-clamp-3 leading-normal">
                  {getConfigUrl(qrModalClient)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    copyToClipboard(getConfigUrl(qrModalClient), qrModalClient.id);
                  }}
                  className="flex-grow py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {copiedClientId === qrModalClient.id ? currentT.copied : currentT.copyLink}
                </button>
                <button
                  onClick={() => setQrModalClient(null)}
                  className="py-2 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {currentT.close}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
