import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execSync, ChildProcess } from "child_process";
import httpProxy from "http-proxy";
import { createServer as createViteServer, ViteDevServer } from "vite";

// Global process exception safety handlers to prevent network EPIPE / ECONNRESET from crashing Node.js
process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception] Error:", err?.message || err);
  if (err && (err as any).stack) {
    console.error((err as any).stack);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] Reason:", reason);
});

const PORT = Number(process.env.PORT) || 3000;
const V2RAY_PORT = 10080;

const app = express();
const server = http.createServer(app);

app.use(express.json());

// Memory store for V2Ray state and logs
let v2rayProcessA: ChildProcess | null = null;
let v2rayProcessB: ChildProcess | null = null;
let activeSlot: "A" | "B" = "A";
let v2rayProcess: ChildProcess | null = null; // kept for backwards compatibility

function getSlotPorts(slot: string) {
  if (slot === "B") {
    return { vless: 10090, vmess: 10091, trojan: 10092 };
  }
  return { vless: 10080, vmess: 10081, trojan: 10082 };
}

const logs: string[] = [];
let isStarting = false;
let activeAdminToken = "admin-session-" + Math.random().toString(36).substring(2);

function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const formattedLog = `[${timestamp}] ${message}`;
  logs.push(formattedLog);
  if (logs.length > 500) {
    logs.shift();
  }
  console.log(formattedLog);
}

// Initialize clients database file if not exists
function initClientsDB() {
  const clientsFilePath = path.join(process.cwd(), "clients.json");
  if (!fs.existsSync(clientsFilePath)) {
    const defaultDB = {
      admin: {
        username: "admin",
        password: "admin"
      },
      clients: [
        {
          id: "default",
          name: "Default Client",
          uuid: "d2cb8181-233c-4d18-9972-8a1b04db0044",
          path: "/by_moon",
          limitGB: 0, // 0 means unlimited
          consumedUpload: 0,
          consumedDownload: 0,
          duration: "unlimited",
          durationValue: 0,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          enabled: true
        }
      ]
    };
    fs.writeFileSync(clientsFilePath, JSON.stringify(defaultDB, null, 2), "utf8");
    addLog("Created initial clients.json database.");
  }
}

// Helper to get all clients from database
function getPersistedClients() {
  const clientsFilePath = path.join(process.cwd(), "clients.json");
  if (fs.existsSync(clientsFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(clientsFilePath, "utf8"));
      return data.clients || [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Ensure binary exists and download if not
const binDir = path.join(process.cwd(), "bin");
const v2rayPath = path.join(binDir, "v2ray");

function ensureV2RayBinary() {
  if (fs.existsSync(v2rayPath)) {
    addLog("V2Ray binary already exists at " + v2rayPath);
    return;
  }

  addLog("V2Ray binary not found. Preparing to download...");
  try {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const zipPath = path.join(binDir, "v2ray-linux-64.zip");
    addLog("Downloading V2Ray core zip from GitHub releases...");
    
    execSync(`curl -L -o "${zipPath}" "https://github.com/v2fly/v2ray-core/releases/download/v5.14.1/v2ray-linux-64.zip"`, {
      stdio: "inherit"
    });

    addLog("Extracting V2Ray core zip...");
    execSync(`unzip -o "${zipPath}" -d "${binDir}"`, {
      stdio: "inherit"
    });

    addLog("Setting executable permission on v2ray...");
    execSync(`chmod +x "${v2rayPath}"`, {
      stdio: "inherit"
    });

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    addLog("V2Ray binary successfully installed.");
  } catch (error: any) {
    addLog(`ERROR installing V2Ray binary: ${error?.message || error}`);
  }
}

// Load config.json and get parameters
function getV2RayConfig() {
  const configPath = path.join(process.cwd(), "config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (err: any) {
    addLog(`Error reading config.json: ${err.message}`);
  }
  return null;
}

function getV2RayPath(): string {
  const config = getV2RayConfig();
  const pathVal = config?.inbounds?.[0]?.streamSettings?.wsSettings?.path;
  return pathVal || "/by_moon";
}

// Synchronize V2Ray configuration with current active clients
function syncV2RayConfig(slot: "A" | "B" = "A") {
  const clients = getPersistedClients();
  const configPath = path.join(process.cwd(), `config_${slot}.json`);
  
  try {
    let currentConfig = getV2RayConfig();
    if (!currentConfig) {
      addLog("Failed to read config template for sync.");
      return;
    }
    
    // Filter active clients
    const activeClients = clients.filter((c: any) => {
      if (!c.enabled) return false;
      if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
      
      const totalConsumed = (c.consumedUpload || 0) + (c.consumedDownload || 0);
      const limitBytes = (c.limitGB || 0) * 1024 * 1024 * 1024;
      if (c.limitGB > 0 && totalConsumed >= limitBytes) return false;
      
      return true;
    });

    if (currentConfig.inbounds) {
      // Find or construct VLESS, VMESS, and TROJAN inbounds
      let vlessInbound = currentConfig.inbounds.find((i: any) => i.protocol === "vless");
      let vmessInbound = currentConfig.inbounds.find((i: any) => i.protocol === "vmess");
      let trojanInbound = currentConfig.inbounds.find((i: any) => i.protocol === "trojan");
      
      const vlessPath = vlessInbound?.streamSettings?.wsSettings?.path || "/by_moon";
      
      // Filter active clients by protocol
      const activeVlessClients = activeClients.filter((c: any) => !c.protocol || c.protocol === "vless");
      const activeVmessClients = activeClients.filter((c: any) => c.protocol === "vmess");
      const activeTrojanClients = activeClients.filter((c: any) => c.protocol === "trojan");
      
      // Slot-specific port numbers
      const ports = getSlotPorts(slot);

      if (!vlessInbound) {
        vlessInbound = {
          "listen": "0.0.0.0",
          "port": ports.vless,
          "protocol": "vless",
          "settings": {
            "clients": [],
            "decryption": "none"
          },
          "streamSettings": {
            "network": "ws",
            "wsSettings": {
              "path": vlessPath
            },
            "sockopt": {
              "tcpFastOpen": true,
              "tcpKeepAliveInterval": 15
            }
          }
        };
        currentConfig.inbounds.push(vlessInbound);
      } else {
        vlessInbound.port = ports.vless;
      }
      
      if (!vmessInbound) {
        vmessInbound = {
          "listen": "0.0.0.0",
          "port": ports.vmess,
          "protocol": "vmess",
          "settings": {
            "clients": []
          },
          "streamSettings": {
            "network": "ws",
            "wsSettings": {
              "path": vlessPath
            },
            "sockopt": {
              "tcpFastOpen": true,
              "tcpKeepAliveInterval": 15
            }
          }
        };
        currentConfig.inbounds.push(vmessInbound);
      } else {
        vmessInbound.port = ports.vmess;
      }

      if (!trojanInbound) {
        trojanInbound = {
          "listen": "0.0.0.0",
          "port": ports.trojan,
          "protocol": "trojan",
          "settings": {
            "clients": []
          },
          "streamSettings": {
            "network": "ws",
            "wsSettings": {
              "path": vlessPath
            },
            "sockopt": {
              "tcpFastOpen": true,
              "tcpKeepAliveInterval": 15
            }
          }
        };
        currentConfig.inbounds.push(trojanInbound);
      } else {
        trojanInbound.port = ports.trojan;
      }
      
      // Populate clients
      vlessInbound.settings.clients = activeVlessClients.map((c: any) => ({
        id: c.uuid,
        level: 0
      }));
      if (vlessInbound.settings.clients.length === 0) {
        vlessInbound.settings.clients.push({
          id: "d2cb8181-233c-4d18-9972-8a1b04db0044",
          level: 0
        });
      }
      
      vmessInbound.settings.clients = activeVmessClients.map((c: any) => ({
        id: c.uuid,
        level: 0,
        alterId: 0
      }));
      if (vmessInbound.settings.clients.length === 0) {
        vmessInbound.settings.clients.push({
          id: "d2cb8181-233c-4d18-9972-8a1b04db0044",
          level: 0,
          alterId: 0
        });
      }

      trojanInbound.settings.clients = activeTrojanClients.map((c: any) => ({
        password: c.uuid,
        level: 0
      }));
      if (trojanInbound.settings.clients.length === 0) {
        trojanInbound.settings.clients.push({
          password: "d2cb8181-233c-4d18-9972-8a1b04db0044",
          level: 0
        });
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");
    // Also update config.json template for display/fallback compatibility
    const mainConfigPath = path.join(process.cwd(), "config.json");
    fs.writeFileSync(mainConfigPath, JSON.stringify(currentConfig, null, 2), "utf8");
    addLog(`V2Ray config_${slot}.json synchronized with active clients database.`);
  } catch (err: any) {
    addLog(`Error syncing config_${slot}.json: ${err.message}`);
  }
}

let isStartingSlot = { A: false, B: false };

// Start V2Ray process for a specific slot returning a Promise
function startV2RayProcessForSlot(slot: "A" | "B"): Promise<boolean> {
  const currentProc = slot === "A" ? v2rayProcessA : v2rayProcessB;
  if (currentProc) {
    addLog(`V2Ray slot ${slot} is already running.`);
    return Promise.resolve(true);
  }

  if (isStartingSlot[slot]) {
    addLog(`V2Ray slot ${slot} is already in the process of starting.`);
    return Promise.resolve(false);
  }

  isStartingSlot[slot] = true;
  addLog(`Starting V2Ray background daemon for slot ${slot}...`);

  return new Promise<boolean>((resolve) => {
    try {
      ensureV2RayBinary();

      if (!fs.existsSync(v2rayPath)) {
        throw new Error("v2ray binary is missing or was not downloaded correctly.");
      }

      // First sync the configuration for this slot
      syncV2RayConfig(slot);

      const configPath = path.join(process.cwd(), `config_${slot}.json`);
      if (!fs.existsSync(configPath)) {
        throw new Error(`config_${slot}.json is missing from workspace.`);
      }

      const proc = spawn(v2rayPath, ["run", "-config", configPath], {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      if (slot === "A") {
        v2rayProcessA = proc;
      } else {
        v2rayProcessB = proc;
      }

      proc.stdout?.on("data", (data) => {
        const text = data.toString().trim();
        if (text) {
          addLog(`[V2Ray ${slot} STDOUT] ${text}`);
        }
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString().trim();
        if (text) {
          addLog(`[V2Ray ${slot} STDERR] ${text}`);
        }
      });

      proc.on("error", (err) => {
        addLog(`[V2Ray ${slot} Process Error] ${err.message}`);
      });

      proc.on("exit", (code) => {
        addLog(`[V2Ray ${slot} Process Exit] V2Ray daemon exited with code ${code}`);
        if (slot === "A") {
          v2rayProcessA = null;
        } else {
          v2rayProcessB = null;
        }
        isStartingSlot[slot] = false;
      });

      setTimeout(() => {
        isStartingSlot[slot] = false;
        const activeProc = slot === "A" ? v2rayProcessA : v2rayProcessB;
        if (activeProc) {
          const ports = getSlotPorts(slot);
          addLog(`V2Ray daemon slot ${slot} started successfully (PID: ${activeProc.pid}) on ports VLESS:${ports.vless}, VMESS:${ports.vmess}, Trojan:${ports.trojan}`);
          resolve(true);
        } else {
          addLog(`V2Ray daemon slot ${slot} failed to start or crashed on startup.`);
          resolve(false);
        }
      }, 1500);

    } catch (error: any) {
      isStartingSlot[slot] = false;
      addLog(`Failed to start V2Ray process slot ${slot}: ${error?.message || error}`);
      resolve(false);
    }
  });
}

// Start active V2Ray process
function startV2RayProcess() {
  return startV2RayProcessForSlot(activeSlot).then(() => {});
}

// Stop V2Ray process (kills both slots if they exist)
function stopV2RayProcess() {
  addLog("Stopping all V2Ray processes...");
  if (v2rayProcessA) {
    try {
      v2rayProcessA.kill();
      v2rayProcessA = null;
      addLog("V2Ray slot A daemon stopped.");
    } catch (error: any) {
      addLog(`Error stopping V2Ray slot A: ${error?.message || error}`);
    }
  }
  if (v2rayProcessB) {
    try {
      v2rayProcessB.kill();
      v2rayProcessB = null;
      addLog("V2Ray slot B daemon stopped.");
    } catch (error: any) {
      addLog(`Error stopping V2Ray slot B: ${error?.message || error}`);
    }
  }
}

// Safely hot-swap V2Ray to a new configuration without disconnecting existing clients
function safeRestartV2Ray(delayMs = 1000) {
  addLog(`Scheduling zero-downtime V2Ray update in ${delayMs}ms...`);
  setTimeout(async () => {
    try {
      const nextSlot = activeSlot === "A" ? "B" : "A";
      addLog(`Preparing zero-downtime hot-swap from slot ${activeSlot} to slot ${nextSlot}...`);
      
      // 1. Sync config and start the new slot's V2Ray process
      const started = await startV2RayProcessForSlot(nextSlot);
      if (started) {
        // 2. Switch the activeSlot so all NEW incoming WS connections go to the new process
        const oldSlot = activeSlot;
        activeSlot = nextSlot;
        addLog(`Successfully hot-swapped active traffic proxy to slot ${activeSlot}!`);
        
        // 3. Keep the old process running for 25 seconds so current connections can complete gracefully
        addLog(`Scheduling graceful shutdown of old slot ${oldSlot} daemon in 25 seconds...`);
        setTimeout(() => {
          try {
            const oldProc = oldSlot === "A" ? v2rayProcessA : v2rayProcessB;
            if (oldProc) {
              addLog(`Teardown: Gracefully terminating old V2Ray daemon slot ${oldSlot} (PID: ${oldProc.pid}).`);
              oldProc.kill();
              if (oldSlot === "A") v2rayProcessA = null;
              else v2rayProcessB = null;
            }
          } catch (err: any) {
            addLog(`Error during graceful teardown of old slot ${oldSlot}: ${err?.message || err}`);
          }
        }, 25000);
      } else {
        addLog(`Failed to start slot ${nextSlot}. Keeping slot ${activeSlot} active.`);
      }
    } catch (err: any) {
      addLog(`Error during safe zero-downtime V2Ray restart: ${err?.message || err}`);
    }
  }, delayMs);
}

// Setup HTTP WebSocket Proxy
const wsProxy = httpProxy.createProxyServer({
  target: `ws://127.0.0.1:${V2RAY_PORT}`,
  ws: true,
  changeOrigin: true
});

wsProxy.on("error", (err, req, socket) => {
  addLog(`[Proxy Error] ${err.message}`);
  try {
    if (socket && typeof socket.destroy === "function" && !socket.destroyed) {
      socket.destroy();
    }
  } catch (ex: any) {
    addLog(`[Proxy Error Handler Exception] ${ex?.message || ex}`);
  }
});

// Real-time Traffic Buffer
interface TrafficBatch {
  upload: number;
  download: number;
}
const trafficBuffer: Record<string, TrafficBatch> = {};
const activeSockets: Record<string, Set<any>> = {};

// Background periodic cleanup of inactive or stale sockets (runs every 10 seconds)
setInterval(() => {
  const now = Date.now();
  for (const clientId of Object.keys(activeSockets)) {
    const sockets = activeSockets[clientId];
    if (sockets) {
      const socketArray = Array.from(sockets);
      for (const s of socketArray) {
        const inactiveTime = now - (s.lastActive || 0);
        if (s.destroyed || (!s.readable && !s.writable) || inactiveTime > 120000) {
          sockets.delete(s);
          try {
            if (!s.destroyed) {
              s.destroy();
            }
          } catch (err) {}
        }
      }
    }
  }
}, 10000);

function accumulateTraffic(clientId: string, bytes: number, type: "upload" | "download") {
  if (!trafficBuffer[clientId]) {
    trafficBuffer[clientId] = { upload: 0, download: 0 };
  }
  trafficBuffer[clientId][type] += bytes;
}

// Periodically write buffered traffic measurements to disk (every 5 seconds)
setInterval(() => {
  const clientIds = Object.keys(trafficBuffer);
  if (clientIds.length === 0) return;
  
  const clientsFilePath = path.join(process.cwd(), "clients.json");
  if (!fs.existsSync(clientsFilePath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(clientsFilePath, "utf8"));
    let modified = false;
    
    for (const id of clientIds) {
      const buffer = trafficBuffer[id];
      if (buffer.upload === 0 && buffer.download === 0) continue;
      
      const client = data.clients.find((c: any) => c.id === id);
      if (client) {
        client.consumedUpload = (client.consumedUpload || 0) + buffer.upload;
        client.consumedDownload = (client.consumedDownload || 0) + buffer.download;
        modified = true;
      }
      
      // Reset buffer
      trafficBuffer[id] = { upload: 0, download: 0 };
    }
    
    if (modified) {
      fs.writeFileSync(clientsFilePath, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (err: any) {
    console.error("Error writing buffered traffic to clients.json:", err);
  }
}, 5000);

// Background checker every 15 seconds to sync V2Ray and disconnect expired/limit-reached users
setInterval(() => {
  const dbPath = path.join(process.cwd(), "clients.json");
  if (!fs.existsSync(dbPath)) return;
  
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    let stateChanged = false;
    
    for (const client of db.clients) {
      if (!client.enabled) continue;
      
      // Check expiration
      const hasExpired = client.expiresAt && new Date(client.expiresAt) < new Date();
      
      // Check limit
      const totalConsumed = (client.consumedUpload || 0) + (client.consumedDownload || 0);
      const limitBytes = (client.limitGB || 0) * 1024 * 1024 * 1024;
      const hasExceededLimit = client.limitGB > 0 && totalConsumed >= limitBytes;

      if (hasExpired || hasExceededLimit) {
        // Find if this client was active in V2Ray's config.json
        const currentConfig = getV2RayConfig();
        const isInV2Ray = currentConfig?.inbounds?.[0]?.settings?.clients?.some(
          (c: any) => c.id === client.uuid
        );
        if (isInV2Ray) {
          addLog(`[System Monitor] Disabling active user ${client.name} due to expiration/limit.`);
          stateChanged = true;
        }
      }
    }
    
    if (stateChanged) {
      syncV2RayConfig();
      stopV2RayProcess();
      setTimeout(() => {
        startV2RayProcess();
      }, 1000);
    }
  } catch (err: any) {
    console.error("Error in background validity monitor:", err);
  }
}, 15000);

// Helper function to extract and decode VLESS UUID from client-to-server WebSocket binary frame
function parseVlessUUID(chunk: any): string | null {
  try {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (!buf || buf.length < 23) return null;
    
    // Check if it's a binary WebSocket frame (opcode 0x02 or 0x82)
    const opcode = buf[0] & 0x0f;
    if (opcode !== 0x02) {
      return null;
    }
    
    const isMasked = (buf[1] & 0x80) !== 0;
    let payloadLen = buf[1] & 0x7f;
    let maskingKeyOffset = 2;
    let payloadStart = 6;
    
    if (payloadLen === 126) {
      if (buf.length < 25) return null;
      payloadLen = buf.readUInt16BE(2);
      maskingKeyOffset = 4;
      payloadStart = 8;
    } else if (payloadLen === 127) {
      if (buf.length < 31) return null;
      maskingKeyOffset = 10;
      payloadStart = 14;
    }
    
    if (buf.length < payloadStart + 17) {
      return null;
    }
    
    const uuidBytes = Buffer.alloc(16);
    if (isMasked) {
      const maskingKey = buf.slice(maskingKeyOffset, maskingKeyOffset + 4);
      for (let i = 0; i < 16; i++) {
        // UUID starts at payload index 1 (byte 0 is VLESS protocol version, usually 0x00)
        const maskedByte = buf[payloadStart + 1 + i];
        const maskKeyByte = maskingKey[(1 + i) % 4];
        uuidBytes[i] = maskedByte ^ maskKeyByte;
      }
    } else {
      for (let i = 0; i < 16; i++) {
        uuidBytes[i] = buf[payloadStart + 1 + i];
      }
    }
    
    // Format to standard UUID string
    const hex = uuidBytes.toString("hex");
    if (hex.length !== 32) return null;
    
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join("-");
  } catch (err) {
    return null;
  }
}

// Intercept WebSocket upgrades on the HTTP server and route/track individually
server.on("upgrade", (req, socket, head) => {
  try {
    const url = req.url || "";
    const defaultPath = getV2RayPath();
    
    // Find which client matches this request path (if any)
    const clients = getPersistedClients();
    const matchingClient = clients.find((c: any) => {
      try {
        const parsedUrl = new URL(url, `http://${req.headers.host || "localhost"}`);
        const pathname = parsedUrl.pathname;
        return c.enabled && pathname === c.path;
      } catch (e) {
        return c.enabled && url.split("?")[0] === c.path;
      }
    });

    const isDefaultPath = url.startsWith(defaultPath);
    
    if (matchingClient || isDefaultPath) {
      // If we matched a client by path, check their restrictions first
      if (matchingClient) {
        if (matchingClient.expiresAt && new Date(matchingClient.expiresAt) < new Date()) {
          addLog(`[Proxy Denied] Client ${matchingClient.name} has expired (matched by path).`);
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
        
        const totalConsumed = (matchingClient.consumedUpload || 0) + (matchingClient.consumedDownload || 0);
        const limitBytes = (matchingClient.limitGB || 0) * 1024 * 1024 * 1024;
        if (matchingClient.limitGB > 0 && totalConsumed >= limitBytes) {
          addLog(`[Proxy Denied] Client ${matchingClient.name} exceeded traffic limit (${matchingClient.limitGB} GB).`);
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
        
        addLog(`[Proxy] Upgrading WebSocket connection for client ${matchingClient.name} (${matchingClient.path}) -> V2Ray`);
      } else {
        addLog(`[Proxy] Upgrading general/fallback WebSocket connection (${url}) -> V2Ray`);
      }
      
      // Always rewrite path to V2Ray's standard path
      req.url = defaultPath; 
      
      // Track active connection count using a robust Set of active socket references
      let detectedClientId: string | null = matchingClient ? matchingClient.id : null;
      const sockObj = socket as any;
      sockObj.lastActive = Date.now();
      sockObj.vlessUuidParsed = (matchingClient && matchingClient.protocol !== "vless") ? true : false;
      
      if (detectedClientId) {
        if (!activeSockets[detectedClientId]) {
          activeSockets[detectedClientId] = new Set();
        }
        activeSockets[detectedClientId].add(sockObj);
      }
      
      // Set aggressive keep-alive and standard inactivity timeout on casted sockObj
      sockObj.setKeepAlive?.(true, 5000); // 5 seconds OS TCP KeepAlive probe
      sockObj.setTimeout?.(45000); // 45 seconds timeout on complete inactivity
      
      const cleanupSocket = () => {
        if (detectedClientId && activeSockets[detectedClientId]) {
          activeSockets[detectedClientId].delete(sockObj);
        }
      };
      
      socket.on("close", cleanupSocket);
      socket.on("end", cleanupSocket);
      socket.on("error", cleanupSocket);
      socket.on("timeout", () => {
        const clientName = matchingClient ? matchingClient.name : (detectedClientId ? "Detected User" : "Unknown");
        addLog(`[Proxy] Socket timeout of 45s reached for client ${clientName}. Destroying connection.`);
        try {
          socket.destroy();
        } catch (err) {}
      });
      
      // Intercept socket.emit to capture "data" event and parse VLESS UUID, plus capture teardown events
      const originalEmit = socket.emit;
      socket.emit = function (event: string | symbol, ...args: any[]) {
        if (event === "data") {
          sockObj.lastActive = Date.now();
          const chunk = args[0];
          if (chunk && chunk.length) {
            // Attempt to extract VLESS UUID on the first binary payload frame
            if (!sockObj.vlessUuidParsed) {
              const parsedUuid = parseVlessUUID(chunk);
              if (parsedUuid) {
                sockObj.vlessUuidParsed = true;
                const currentClients = getPersistedClients();
                const matchedClient = currentClients.find(
                  (c: any) => c.uuid.toLowerCase() === parsedUuid.toLowerCase()
                );
                if (matchedClient) {
                  // If matched client is expired or over-limit, destroy immediately!
                  if (matchedClient.expiresAt && new Date(matchedClient.expiresAt) < new Date()) {
                    addLog(`[Proxy Denied] Automatically detected client ${matchedClient.name} has expired. Destroying socket.`);
                    try {
                      socket.destroy();
                    } catch (err) {}
                    return false;
                  }
                  const clientConsumed = (matchedClient.consumedUpload || 0) + (matchedClient.consumedDownload || 0);
                  const clientLimitBytes = (matchedClient.limitGB || 0) * 1024 * 1024 * 1024;
                  if (matchedClient.limitGB > 0 && clientConsumed >= clientLimitBytes) {
                    addLog(`[Proxy Denied] Automatically detected client ${matchedClient.name} exceeded traffic limit. Destroying socket.`);
                    try {
                      socket.destroy();
                    } catch (err) {}
                    return false;
                  }
                  
                  // Transfer socket to the correct client if it differs from the path-based match
                  if (detectedClientId && detectedClientId !== matchedClient.id) {
                    if (activeSockets[detectedClientId]) {
                      activeSockets[detectedClientId].delete(sockObj);
                    }
                  }
                  detectedClientId = matchedClient.id;
                  if (!activeSockets[detectedClientId]) {
                    activeSockets[detectedClientId] = new Set();
                  }
                  activeSockets[detectedClientId].add(sockObj);
                  addLog(`[Proxy] Automatically matched UUID ${parsedUuid} to client: ${matchedClient.name}. Active connections updated.`);
                }
              }
            }
            
            if (detectedClientId) {
              accumulateTraffic(detectedClientId, chunk.length, "upload");
            }
          }
        } else if (event === "close" || event === "end" || event === "error") {
          cleanupSocket();
        }
        return originalEmit.apply(this, arguments as any);
      };
      
      // 2. Download data (intercept socket.write)
      const originalWrite = socket.write;
      socket.write = function (chunk: any, encoding?: any, callback?: any) {
        sockObj.lastActive = Date.now();
        if (chunk && detectedClientId) {
          accumulateTraffic(detectedClientId, chunk.length, "download");
        }
        try {
          if (!socket.destroyed && socket.writable) {
            return originalWrite.apply(this, arguments as any);
          }
        } catch (err: any) {
          addLog(`[Proxy socket.write error] ${err?.message || err}`);
        }
        if (typeof callback === "function") {
          callback();
        }
        return false;
      };
   
      const ports = getSlotPorts(activeSlot);
      let targetPort = ports.vless;
      if (matchingClient) {
        if (matchingClient.protocol === "vmess") {
          targetPort = ports.vmess;
        } else if (matchingClient.protocol === "trojan") {
          targetPort = ports.trojan;
        }
      }
      wsProxy.ws(req, socket, head, { target: `ws://127.0.0.1:${targetPort}` });
    } else {
      addLog(`[Proxy Info] Unknown WS connection upgrade request: ${url}`);
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    }
  } catch (err: any) {
    addLog(`[Proxy Upgrade Handler Error] ${err?.message || err}`);
    try {
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
    } catch (e) {}
  }
});

// Authentication middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.substring(7);
  if (token !== activeAdminToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// API Routes

// Public route to check server running state & auth need
app.get("/api/status", (req, res) => {
  let diskStats = { total: 0, used: 0, free: 0 };
  try {
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync("/");
      const total = stats.bsize * stats.blocks;
      const free = stats.bsize * stats.bavail;
      const used = total - free;
      diskStats = { total, used, free };
    } else {
      // Fallback
      const output = execSync("df -B1 /").toString().split("\n");
      if (output.length > 1) {
        const parts = output[1].replace(/\s+/g, " ").split(" ");
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const free = parseInt(parts[3], 10);
          if (!isNaN(total) && !isNaN(used) && !isNaN(free)) {
            diskStats = { total, used, free };
          }
        }
      }
    }
  } catch (e) {
    // If running in restricted environment or fails, use a safe estimate
    diskStats = {
      total: 20 * 1024 * 1024 * 1024,
      used: 6.4 * 1024 * 1024 * 1024,
      free: 13.6 * 1024 * 1024 * 1024
    };
  }

  // Server memory stats (Actual system RAM)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const systemStats = {
    uptime: Math.round(process.uptime()),
    // Override with actual system memory to show maximum server RAM
    memory: {
      rss: totalMem,
      heapTotal: totalMem,
      heapUsed: usedMem,
      external: freeMem
    },
    disk: diskStats,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  };

  const running = v2rayProcessA !== null || v2rayProcessB !== null;
  const activePid = v2rayProcessA?.pid || v2rayProcessB?.pid || null;

  res.json({
    running,
    pid: activePid,
    isStarting: isStartingSlot.A || isStartingSlot.B,
    system: systemStats
  });
});

// Login endpoint
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const clientsFilePath = path.join(process.cwd(), "clients.json");
  try {
    const db = JSON.parse(fs.readFileSync(clientsFilePath, "utf8"));
    if (username === db.admin.username && password === db.admin.password) {
      res.json({ success: true, token: activeAdminToken, username: db.admin.username });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Database read error" });
  }
});

// Change admin credentials
app.post("/api/admin/password", requireAuth, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Both username and password are required" });
  }

  const dbPath = path.join(process.cwd(), "clients.json");
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    db.admin.username = username;
    db.admin.password = password;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
    res.json({ success: true, message: "Credentials updated successfully" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update admin credentials" });
  }
});

// Get all clients
app.get("/api/clients", requireAuth, (req, res) => {
  const clients = getPersistedClients().map((c: any) => {
    const sockets = activeSockets[c.id];
    let count = 0;
    if (sockets) {
      // Dynamic cleanup of closed/destroyed/inactive sockets
      const now = Date.now();
      const socketArray = Array.from(sockets);
      for (const s of socketArray) {
        const inactiveTime = now - (s.lastActive || 0);
        if (s.destroyed || (!s.readable && !s.writable) || inactiveTime > 120000) {
          sockets.delete(s);
          try {
            if (!s.destroyed) {
              s.destroy();
            }
          } catch (err) {}
        }
      }
      count = sockets.size;
    }
    return {
      ...c,
      activeConnections: count
    };
  });
  res.json({ clients });
});

// Create client
app.post("/api/clients", requireAuth, (req, res) => {
  const { name, uuid, path: clientPath, limitGB, duration, durationValue, protocol } = req.body;
  if (!name || !uuid || !clientPath) {
    return res.status(400).json({ error: "Name, UUID, and Path are required" });
  }

  const dbPath = path.join(process.cwd(), "clients.json");
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    
    // Check constraints
    if (db.clients.some((c: any) => c.uuid === uuid)) {
      return res.status(400).json({ error: "UUID already in use" });
    }
    const cleanPath = clientPath.startsWith("/") ? clientPath : "/" + clientPath;
    if (db.clients.some((c: any) => c.path === cleanPath)) {
      return res.status(400).json({ error: "WebSocket Path already in use" });
    }

    // Calculate expiration
    let expiresAt: string | null = null;
    const value = parseInt(durationValue) || 0;
    if (duration !== "unlimited" && value > 0) {
      const expDate = new Date();
      if (duration === "minutes") expDate.setMinutes(expDate.getMinutes() + value);
      else if (duration === "hours") expDate.setHours(expDate.getHours() + value);
      else if (duration === "days") expDate.setDate(expDate.getDate() + value);
      else if (duration === "months") expDate.setMonth(expDate.getMonth() + value);
      else if (duration === "years") expDate.setFullYear(expDate.getFullYear() + value);
      expiresAt = expDate.toISOString();
    }

    const newClient = {
      id: "client_" + Math.random().toString(36).substring(2),
      name,
      uuid,
      path: cleanPath,
      limitGB: parseFloat(limitGB) || 0,
      consumedUpload: 0,
      consumedDownload: 0,
      duration,
      durationValue: value,
      createdAt: new Date().toISOString(),
      expiresAt,
      enabled: true,
      protocol: protocol || "vless"
    };

    db.clients.push(newClient);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
    
    res.json({ success: true, client: newClient });
    safeRestartV2Ray(1000);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create client: " + error.message });
  }
});

// Update client
app.put("/api/clients/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, uuid, path: clientPath, limitGB, duration, durationValue, enabled, protocol } = req.body;
  
  const dbPath = path.join(process.cwd(), "clients.json");
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const idx = db.clients.findIndex((c: any) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Client not found" });
    }

    const client = db.clients[idx];

    // Check constraints
    if (uuid && db.clients.some((c: any) => c.uuid === uuid && c.id !== id)) {
      return res.status(400).json({ error: "UUID already in use" });
    }
    const cleanPath = clientPath ? (clientPath.startsWith("/") ? clientPath : "/" + clientPath) : null;
    if (cleanPath && db.clients.some((c: any) => c.path === cleanPath && c.id !== id)) {
      return res.status(400).json({ error: "WebSocket Path already in use" });
    }

    // Calculate expiration
    let expiresAt = client.expiresAt;
    if (duration !== undefined || durationValue !== undefined) {
      const finalDuration = duration !== undefined ? duration : client.duration;
      const finalVal = durationValue !== undefined ? parseInt(durationValue) : client.durationValue;
      
      if (finalDuration !== "unlimited" && finalVal > 0) {
        const expDate = new Date();
        if (finalDuration === "minutes") expDate.setMinutes(expDate.getMinutes() + finalVal);
        else if (finalDuration === "hours") expDate.setHours(expDate.getHours() + finalVal);
        else if (finalDuration === "days") expDate.setDate(expDate.getDate() + finalVal);
        else if (finalDuration === "months") expDate.setMonth(expDate.getMonth() + finalVal);
        else if (finalDuration === "years") expDate.setFullYear(expDate.getFullYear() + finalVal);
        expiresAt = expDate.toISOString();
      } else {
        expiresAt = null;
      }
    }

    db.clients[idx] = {
      ...client,
      name: name !== undefined ? name : client.name,
      uuid: uuid !== undefined ? uuid : client.uuid,
      path: cleanPath !== null ? cleanPath : client.path,
      limitGB: limitGB !== undefined ? parseFloat(limitGB) : client.limitGB,
      duration: duration !== undefined ? duration : client.duration,
      durationValue: durationValue !== undefined ? parseInt(durationValue) : client.durationValue,
      expiresAt,
      enabled: enabled !== undefined ? enabled : client.enabled,
      protocol: protocol !== undefined ? protocol : (client.protocol || "vless")
    };

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
    
    res.json({ success: true, client: db.clients[idx] });
    safeRestartV2Ray(1000);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update client: " + error.message });
  }
});

// Delete client
app.delete("/api/clients/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const dbPath = path.join(process.cwd(), "clients.json");
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const filtered = db.clients.filter((c: any) => c.id !== id);
    if (filtered.length === db.clients.length) {
      return res.status(404).json({ error: "Client not found" });
    }

    db.clients = filtered;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
    
    res.json({ success: true, message: "Client deleted successfully" });
    safeRestartV2Ray(1000);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete client: " + error.message });
  }
});

app.get("/api/logs", requireAuth, (req, res) => {
  res.json({ logs });
});

app.post("/api/control", requireAuth, (req, res) => {
  const { action } = req.body;
  if (action === "start") {
    res.json({ success: true, message: "Start command issued" });
    setTimeout(() => {
      startV2RayProcess();
    }, 500);
  } else if (action === "stop") {
    res.json({ success: true, message: "Stop command issued" });
    setTimeout(() => {
      stopV2RayProcess();
    }, 500);
  } else if (action === "restart") {
    res.json({ success: true, message: "Restart command issued" });
    safeRestartV2Ray(500);
  } else {
    res.status(400).json({ error: "Invalid action." });
  }
});

// Bootstrapping function
async function startServer() {
  initClientsDB();
  syncV2RayConfig();

  setTimeout(() => {
    startV2RayProcess();
  }, 2000);

  // Vite Integration
  let viteInstance: ViteDevServer | null = null;
  if (process.env.NODE_ENV !== "production") {
    addLog("Starting Vite in middleware mode (Development)...");
    viteInstance = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(viteInstance.middlewares);
  } else {
    addLog("Serving built static files (Production)...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    addLog(`Full-stack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
