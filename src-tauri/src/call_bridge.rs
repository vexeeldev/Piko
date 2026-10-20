use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const BRIDGE_PORT: u16 = 14425;
const MAX_PAYLOAD_SIZE: usize = 65536; // 64 KB limit
const ACTION_EXPIRATION_SECS: u64 = 15;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityStatus {
    Verified,
    Unverified,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallCapabilities {
    pub accept: CapabilityStatus,
    pub decline: CapabilityStatus,
    pub end: CapabilityStatus,
    pub mute: CapabilityStatus,
    pub speaker: CapabilityStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallInfoPayload {
    pub id: String,
    pub provider: String,
    pub direction: String,
    pub state: String,
    #[serde(default, alias = "contact_name", skip_serializing_if = "Option::is_none")]
    pub contact_name: Option<String>,
    #[serde(default, alias = "avatar_url", skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default, alias = "started_at", skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, alias = "is_muted", skip_serializing_if = "Option::is_none")]
    pub is_muted: Option<bool>,
    pub capabilities: CallCapabilities,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingAction {
    pub action_id: String,
    pub call_id: String,
    pub action: String,
    pub created_at: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionAck {
    pub action_id: String,
    pub call_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub struct BridgeState {
    pub token: String,
    pub active_call: Option<CallInfoPayload>,
    pub pending_actions: VecDeque<PendingAction>,
    pub last_event_id: Option<String>,
    pub last_event_state: Option<String>,
    pub last_heartbeat: Instant,
}

impl BridgeState {
    pub fn new(token: String) -> Self {
        Self {
            token,
            active_call: None,
            pending_actions: VecDeque::new(),
            last_event_id: None,
            last_event_state: None,
            last_heartbeat: Instant::now(),
        }
    }

    pub fn queue_action(&mut self, call_id: String, action: String) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let action_id = format!("act-{}-{}", now, self.pending_actions.len() + 1);
        let pending = PendingAction {
            action_id: action_id.clone(),
            call_id,
            action,
            created_at: now,
            expires_at: now + ACTION_EXPIRATION_SECS,
        };
        // Clean expired actions
        self.pending_actions.retain(|a| a.expires_at > now);
        self.pending_actions.push_back(pending);
        action_id
    }

    pub fn pop_pending_action(&mut self) -> Option<PendingAction> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Remove expired
        while let Some(front) = self.pending_actions.front() {
            if front.expires_at <= now {
                self.pending_actions.pop_front();
            } else {
                break;
            }
        }
        self.pending_actions.pop_front()
    }
}

pub fn generate_secure_token() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();
    format!("{:016x}{:08x}{:08x}", now, pid, 0x5a17_c011_u32)
}

pub fn get_or_create_token() -> String {
    if let Some(home) = std::env::var_os("HOME") {
        let token_file = std::path::PathBuf::from(home)
            .join(".config")
            .join("dynamic-island")
            .join("session.token");
        if let Ok(existing) = std::fs::read_to_string(&token_file) {
            let trimmed = existing.trim().to_string();
            if trimmed.len() >= 16 {
                return trimmed;
            }
        }
    }
    generate_secure_token()
}

fn is_origin_allowed(origin: &str) -> bool {
    let o = origin.trim().trim_end_matches('/');
    o == "https://web.whatsapp.com"
        || o.starts_with("chrome-extension://")
        || o.starts_with("moz-extension://")
}

fn write_http_response(
    mut stream: &TcpStream,
    status_code: u16,
    status_text: &str,
    origin: Option<&str>,
    body: &str,
) {
    let allow_origin = match origin {
        Some(o) if is_origin_allowed(o) => o,
        _ => "https://web.whatsapp.com",
    };

    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: {}\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, X-Dynamic-Island-Token, Access-Control-Request-Private-Network\r\n\
         Access-Control-Allow-Private-Network: true\r\n\
         Access-Control-Max-Age: 86400\r\n\
         Connection: close\r\n\r\n{}",
        status_code,
        status_text,
        body.len(),
        allow_origin,
        body
    );
    let _ = stream.write_all(response.as_bytes());
}

fn handle_connection(
    mut stream: TcpStream,
    state: &Arc<Mutex<BridgeState>>,
    app_handle: &Option<AppHandle>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buffer = [0u8; 4096];
    let mut request_bytes = Vec::new();

    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                request_bytes.extend_from_slice(&buffer[..n]);
                if request_bytes.len() > MAX_PAYLOAD_SIZE {
                    write_http_response(
                        &stream,
                        413,
                        "Payload Too Large",
                        None,
                        "{\"error\":\"Payload exceeds size limit\"}",
                    );
                    return;
                }
                // Check if headers are fully read (\r\n\r\n)
                if let Some(pos) = request_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    // Check Content-Length to see if body is complete
                    let header_str = String::from_utf8_lossy(&request_bytes[..pos]);
                    let mut content_length = 0;
                    for line in header_str.lines() {
                        let lower = line.to_ascii_lowercase();
                        if lower.starts_with("content-length:") {
                            if let Some(val) = line.split(':').nth(1) {
                                content_length = val.trim().parse::<usize>().unwrap_or(0);
                            }
                        }
                    }
                    if content_length > MAX_PAYLOAD_SIZE {
                        write_http_response(
                            &stream,
                            413,
                            "Payload Too Large",
                            None,
                            "{\"error\":\"Payload exceeds size limit\"}",
                        );
                        return;
                    }
                    let total_needed = pos + 4 + content_length;
                    if request_bytes.len() >= total_needed {
                        break;
                    }
                }
            }
            Err(_) => break,
        }
    }

    if request_bytes.is_empty() {
        return;
    }

    // Split headers and body
    let (header_part, body_part) = match request_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
        Some(pos) => {
            let h = String::from_utf8_lossy(&request_bytes[..pos]).to_string();
            let b = String::from_utf8_lossy(&request_bytes[pos + 4..]).to_string();
            (h, b)
        }
        None => (String::from_utf8_lossy(&request_bytes).to_string(), String::new()),
    };

    let mut lines = header_part.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        write_http_response(&stream, 400, "Bad Request", None, "{\"error\":\"Malformed request\"}");
        return;
    }

    let method = parts[0];
    let path = parts[1];

    let mut origin: Option<String> = None;
    let mut provided_token: Option<String> = None;

    for line in lines {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("origin:") {
            let rest: Vec<&str> = line.splitn(2, ':').collect();
            if rest.len() == 2 {
                origin = Some(rest[1].trim().to_string());
            }
        } else if lower.starts_with("x-dynamic-island-token:") {
            if let Some(val) = line.split(':').nth(1) {
                provided_token = Some(val.trim().to_string());
            }
        }
    }

    // 1. Handle CORS Preflight (OPTIONS)
    if method == "OPTIONS" {
        if let Some(ref o) = origin {
            if !is_origin_allowed(o) {
                write_http_response(&stream, 403, "Forbidden", None, "{\"error\":\"Origin forbidden\"}");
                return;
            }
        }
        write_http_response(&stream, 204, "No Content", origin.as_deref(), "");
        return;
    }

    // 2. Validate Origin
    if let Some(ref o) = origin {
        if !is_origin_allowed(o) {
            write_http_response(&stream, 403, "Forbidden", None, "{\"error\":\"Origin not permitted\"}");
            return;
        }
    }

    // 3. Validate Authentication Token
    let expected_token = {
        let s = state.lock().unwrap();
        s.token.clone()
    };

    match provided_token {
        Some(ref t) if t == &expected_token => {}
        _ => {
            write_http_response(&stream, 401, "Unauthorized", origin.as_deref(), "{\"error\":\"Invalid or missing token\"}");
            return;
        }
    }

    // 4. Route Handling
    match (method, path) {
        ("GET", "/api/health") => {
            write_http_response(&stream, 200, "OK", origin.as_deref(), "{\"status\":\"healthy\",\"bridge\":\"dynamic-island\"}");
        }
        ("POST", "/api/call/event") => {
            match serde_json::from_str::<CallInfoPayload>(&body_part) {
                Ok(event) => {
                    println!(
                        "[DI-Bridge] Call event received: id={}, provider={}, direction={}, state={}",
                        event.id, event.provider, event.direction, event.state
                    );

                    // Provider validation
                    if event.provider != "whatsapp-web"
                        && event.provider != "whatsapp-desktop"
                        && event.provider != "telegram-web"
                    {
                        eprintln!("[DI-Bridge] Unsupported provider: {}", event.provider);
                        write_http_response(&stream, 400, "Bad Request", origin.as_deref(), "{\"error\":\"Unsupported provider\"}");
                        return;
                    }

                    // Deduplication check
                    let is_duplicate = {
                        let mut s = state.lock().unwrap();
                        let dup = s.last_event_id.as_deref() == Some(&event.id)
                            && s.last_event_state.as_deref() == Some(&event.state);
                        if !dup {
                            s.last_event_id = Some(event.id.clone());
                            s.last_event_state = Some(event.state.clone());
                            s.active_call = if event.state == "ended" { None } else { Some(event.clone()) };
                        }
                        s.last_heartbeat = Instant::now();
                        dup
                    };

                    if is_duplicate {
                        println!(
                            "[DI-Bridge] Duplicate call event ignored: id={}, state={}",
                            event.id, event.state
                        );
                        write_http_response(&stream, 200, "OK", origin.as_deref(), "{\"status\":\"duplicate_ignored\"}");
                        return;
                    }

                    // Forward event to Tauri frontend webview
                    if let Some(ref handle) = app_handle {
                        let _ = handle.emit("call-state-changed", Some(event.clone()));
                        let _ = handle.emit_to("main", "call-state-changed", Some(event.clone()));
                        println!(
                            "[DI-Bridge] Forwarded call event to Tauri frontend: id={}, state={}",
                            event.id, event.state
                        );
                    } else {
                        eprintln!("[DI-Bridge] AppHandle missing: cannot emit event to frontend");
                    }

                    write_http_response(&stream, 200, "OK", origin.as_deref(), "{\"status\":\"event_received\"}");
                }
                Err(e) => {
                    eprintln!("[DI-Bridge] Failed to parse call event JSON payload: {}", e);
                    let err_msg = format!("{{\"error\":\"Invalid payload: {}\"}}", e);
                    write_http_response(&stream, 400, "Bad Request", origin.as_deref(), &err_msg);
                }
            }
        }
        ("GET", "/api/call/action") => {
            // Check for pending user action (accept, decline, end, mute)
            let action_opt = {
                let mut s = state.lock().unwrap();
                s.pop_pending_action()
            };

            match action_opt {
                Some(action) => {
                    let json = serde_json::to_string(&action).unwrap_or_else(|_| "{}".to_string());
                    write_http_response(&stream, 200, "OK", origin.as_deref(), &json);
                }
                None => {
                    write_http_response(&stream, 204, "No Content", origin.as_deref(), "");
                }
            }
        }
        ("POST", "/api/call/ack") => {
            match serde_json::from_str::<ActionAck>(&body_part) {
                Ok(_ack) => {
                    write_http_response(&stream, 200, "OK", origin.as_deref(), "{\"status\":\"ack_recorded\"}");
                }
                Err(_) => {
                    write_http_response(&stream, 400, "Bad Request", origin.as_deref(), "{\"error\":\"Invalid ack payload\"}");
                }
            }
        }
        ("POST", "/api/call/disconnect") => {
            // Tab was closed or disconnected
            {
                let mut s = state.lock().unwrap();
                s.active_call = None;
                s.last_event_id = None;
                s.last_event_state = None;
            }
            if let Some(ref handle) = app_handle {
                let _ = handle.emit("call-state-changed", Option::<CallInfoPayload>::None);
            }
            write_http_response(&stream, 200, "OK", origin.as_deref(), "{\"status\":\"disconnected\"}");
        }
        _ => {
            write_http_response(&stream, 404, "Not Found", origin.as_deref(), "{\"error\":\"Endpoint not found\"}");
        }
    }
}

pub fn start_local_bridge(
    token: String,
    app_handle: AppHandle,
) -> (Arc<Mutex<BridgeState>>, u16) {
    let state = Arc::new(Mutex::new(BridgeState::new(token)));
    let state_for_server = Arc::clone(&state);

    // Save token to secure local config file (~/.config/dynamic-island/session.token) with user-only permissions
    if let Some(home) = std::env::var_os("HOME") {
        let config_dir = std::path::PathBuf::from(home).join(".config").join("dynamic-island");
        if std::fs::create_dir_all(&config_dir).is_ok() {
            let token_file = config_dir.join("session.token");
            let _ = std::fs::write(&token_file, state.lock().unwrap().token.as_bytes());
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&token_file, std::fs::Permissions::from_mode(0o600));
            }
        }
    }

    let bind_addr = format!("127.0.0.1:{}", BRIDGE_PORT);
    let listener = match TcpListener::bind(&bind_addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[Bridge] Failed to bind to {}: {}", bind_addr, e);
            return (state, 0);
        }
    };

    let bound_port = listener.local_addr().map(|a| a.port()).unwrap_or(BRIDGE_PORT);
    println!("[Bridge] Authenticated local bridge listening on 127.0.0.1:{}", bound_port);

    let app_handle_for_server = Some(app_handle);

    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let state_clone = Arc::clone(&state_for_server);
                    let app_clone = app_handle_for_server.clone();
                    thread::spawn(move || {
                        handle_connection(stream, &state_clone, &app_clone);
                    });
                }
                Err(e) => {
                    eprintln!("[Bridge] Incoming connection error: {}", e);
                }
            }
        }
    });

    (state, bound_port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_origin_validation() {
        assert!(is_origin_allowed("https://web.whatsapp.com"));
        assert!(is_origin_allowed("https://web.whatsapp.com/"));
        assert!(is_origin_allowed("chrome-extension://abcdefghijklmnop"));
        assert!(is_origin_allowed("moz-extension://1234-5678-abcd"));

        // Disallowed origins
        assert!(!is_origin_allowed("https://malicious-site.com"));
        assert!(!is_origin_allowed("http://localhost:3000"));
        assert!(!is_origin_allowed("http://127.0.0.1:8080"));
        assert!(!is_origin_allowed(""));
    }

    #[test]
    fn test_token_generation() {
        let t1 = generate_secure_token();
        let t2 = generate_secure_token();
        assert_eq!(t1.len(), 32);
        assert_eq!(t2.len(), 32);
        assert_ne!(t1, t2);
    }

    #[test]
    fn test_action_queue_lifecycle() {
        let mut state = BridgeState::new("secret-token".to_string());
        assert_eq!(state.pending_actions.len(), 0);

        let action_id = state.queue_action("call-1".to_string(), "accept".to_string());
        assert!(action_id.starts_with("act-"));
        assert_eq!(state.pending_actions.len(), 1);

        let popped = state.pop_pending_action();
        assert!(popped.is_some());
        let a = popped.unwrap();
        assert_eq!(a.call_id, "call-1");
        assert_eq!(a.action, "accept");

        // Now queue is empty
        assert!(state.pop_pending_action().is_none());
    }

    #[test]
    fn test_expired_action_purging() {
        let mut state = BridgeState::new("secret-token".to_string());
        // Insert manually expired action
        state.pending_actions.push_back(PendingAction {
            action_id: "expired-1".to_string(),
            call_id: "call-old".to_string(),
            action: "decline".to_string(),
            created_at: 100,
            expires_at: 110, // past
        });

        // Popping should purge expired action and return None
        assert!(state.pop_pending_action().is_none());
        assert_eq!(state.pending_actions.len(), 0);
    }

    #[test]
    fn test_call_info_payload_serialization_and_aliases() {
        // Test parsing snake_case payload from browser extension
        let snake_json = r#"{
            "id": "wa-101",
            "provider": "whatsapp-web",
            "direction": "incoming",
            "state": "incoming",
            "contact_name": "Alice",
            "avatar_url": "https://example.com/avatar.jpg",
            "started_at": 1700000000,
            "is_muted": false,
            "capabilities": {
                "accept": "verified",
                "decline": "verified",
                "end": "verified",
                "mute": "unverified",
                "speaker": "unsupported"
            }
        }"#;

        let parsed: Result<CallInfoPayload, _> = serde_json::from_str(snake_json);
        assert!(parsed.is_ok());
        let payload = parsed.unwrap();
        assert_eq!(payload.contact_name, Some("Alice".to_string()));
        assert_eq!(payload.started_at, Some(1700000000));

        // Test serialization outputs camelCase for Tauri frontend
        let serialized = serde_json::to_string(&payload).unwrap();
        assert!(serialized.contains(r#""contactName":"Alice""#));
        assert!(serialized.contains(r#""startedAt":1700000000"#));
    }
}

