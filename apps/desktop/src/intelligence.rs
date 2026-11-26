//! Trusted provider destinations, one-use requests and bounded transport.
use crate::credentials::{self, CredentialId};
use reqwest::{Client, Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;
use zeroize::Zeroizing;

type GatewayResult<T> = Result<T, &'static str>;
const MAX_CONTENT: usize = 8192;
const MAX_REPLY: usize = 64 * 1024;
const WINDOW: Duration = Duration::from_secs(60);
const GUIDE: &str = include_str!("intelligence-contract.txt");

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Disabled,
    Local,
    External,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Ollama,
    LmStudio,
    Compatible,
    Openai,
    Anthropic,
    Gemini,
}

impl Provider {
    fn local(self) -> bool {
        matches!(self, Self::Ollama | Self::LmStudio | Self::Compatible)
    }
    fn secret(self) -> GatewayResult<CredentialId> {
        let id = match self {
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::LmStudio => "lmstudio-loopback",
            Self::Ollama => "ollama-loopback",
            Self::Compatible => "compatible-loopback",
        };
        CredentialId::new(id).map_err(|_| "credential_error")
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum Loopback {
    #[default]
    #[serde(rename = "127.0.0.1")]
    V4,
    #[serde(rename = "::1")]
    V6,
}
impl Loopback {
    fn authority(self) -> &'static str {
        match self {
            Self::V4 => "127.0.0.1",
            Self::V6 => "[::1]",
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Query {
    provider: Provider,
    model: String,
    port: u16,
    #[serde(default)]
    host: Loopback,
    #[serde(default)]
    authenticate: bool,
    content: String,
    purpose: Purpose,
    max_tokens: u32,
    context_tokens: u32,
    timeout_seconds: u64,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Purpose {
    Propose,
    Explain,
    Inventory,
}

struct Prepared {
    id: u64,
    created: Instant,
    query: Query,
    url: Url,
    body: String,
}
struct InFlight {
    id: u64,
    cancel: oneshot::Sender<()>,
}
#[derive(Default)]
struct State {
    mode: Mode,
    offline: bool,
    generation: u64,
    next: u64,
    pending: Option<Prepared>,
    active: Option<InFlight>,
    calls: VecDeque<Instant>,
    keys: BTreeMap<(Provider, Loopback, u16), Zeroizing<String>>,
}
#[derive(Default)]
pub struct Gateway(Mutex<State>);

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Configure {
        mode: Mode,
        offline: bool,
        generation: u64,
    },
    Prepare {
        query: Query,
        generation: u64,
    },
    Send {
        ticket: u64,
        generation: u64,
    },
    Cancel {
        generation: u64,
    },
    Credential {
        provider: Provider,
        #[serde(default)]
        host: Loopback,
        port: u16,
        secret: String,
        persist: bool,
        generation: u64,
    },
    Forget {
        provider: Provider,
        #[serde(default)]
        host: Loopback,
        port: u16,
        generation: u64,
    },
}

fn destination(q: &Query) -> GatewayResult<Url> {
    if q.purpose == Purpose::Inventory {
        if !q.provider.local() || !q.content.is_empty() || !q.model.is_empty() {
            return Err("invalid_input");
        }
    } else if !valid_model(&q.model) || (!q.provider.local() && q.model.contains('/')) {
        return Err("invalid_input");
    }
    if (!q.provider.local() && (q.port != 0 || q.host != Loopback::V4))
        || (q.provider.local() && cloud_alias(&q.model))
    {
        return Err("destination_denied");
    }
    let address = match q.provider {
        Provider::Ollama | Provider::LmStudio | Provider::Compatible => {
            if q.port < 1024 {
                return Err("destination_denied");
            }
            let path = if q.purpose == Purpose::Inventory {
                inventory_path(q.provider).ok_or("destination_denied")?
            } else if q.provider == Provider::Ollama {
                "/api/chat"
            } else {
                "/v1/chat/completions"
            };
            format!("http://{}:{}{path}", q.host.authority(), q.port)
        }
        Provider::Openai => "https://api.openai.com/v1/responses".into(),
        Provider::Anthropic => "https://api.anthropic.com/v1/messages".into(),
        Provider::Gemini => format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            q.model
        ),
    };
    Url::parse(&address).map_err(|_| "destination_denied")
}

fn valid_model(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.:/".contains(&c))
        && !name.contains("..")
        && !name.contains("//")
}
fn cloud_alias(name: &str) -> bool {
    name.ends_with(":cloud") || name.ends_with("-cloud")
}
fn inventory_path(provider: Provider) -> Option<&'static str> {
    match provider {
        Provider::Ollama => Some("/api/tags"),
        Provider::LmStudio => Some("/api/v1/models"),
        Provider::Compatible => Some("/v1/models"),
        _ => None,
    }
}
fn authorized(mode: Mode, offline: bool, provider: Provider) -> GatewayResult<()> {
    match mode {
        Mode::Local if provider.local() => Ok(()),
        Mode::External if !provider.local() && !offline => Ok(()),
        _ => Err("permission_denied"),
    }
}

fn wire(q: &Query) -> GatewayResult<String> {
    if q.content.trim().is_empty()
        || q.content.len() > MAX_CONTENT
        || !(128..=4096).contains(&q.context_tokens)
        || !(32..=1024).contains(&q.max_tokens)
        || !(1..=30).contains(&q.timeout_seconds)
    {
        return Err("limit");
    }
    let content = serde_json::to_string(&json!({"purpose":q.purpose,"user_data":q.content}))
        .map_err(|_| "invalid_input")?;
    // Worst-case byte-token bound for the supplied text plus protocol framing reserve.
    if GUIDE.len() + content.len() + q.max_tokens as usize + 128 > q.context_tokens as usize {
        return Err("limit");
    }
    let messages = json!([{"role":"system","content":GUIDE},{"role":"user","content":content}]);
    let body = match q.provider {
        Provider::Ollama => {
            json!({"model":q.model,"messages":messages,"stream":false,"format":"json","options":{"num_predict":q.max_tokens,"num_ctx":q.context_tokens}})
        }
        Provider::LmStudio | Provider::Compatible => {
            json!({"model":q.model,"messages":messages,"max_tokens":q.max_tokens,"stream":false})
        }
        Provider::Openai => {
            json!({"model":q.model,"instructions":GUIDE,"input":content,"max_output_tokens":q.max_tokens,"store":false})
        }
        Provider::Anthropic => {
            json!({"model":q.model,"system":GUIDE,"messages":[{"role":"user","content":content}],"max_tokens":q.max_tokens})
        }
        Provider::Gemini => {
            json!({"systemInstruction":{"parts":[{"text":GUIDE}]},"contents":[{"role":"user","parts":[{"text":content}]}],
            "generationConfig":{"maxOutputTokens":q.max_tokens,"responseMimeType":"application/json"}})
        }
    };
    serde_json::to_string(&body).map_err(|_| "invalid_input")
}

impl State {
    fn revoke(&mut self) {
        self.pending = None;
        if let Some(active) = self.active.take() {
            let _ = active.cancel.send(());
        }
    }
    fn check(&self, generation: u64) -> GatewayResult<()> {
        if self.generation == generation && self.mode != Mode::Disabled {
            Ok(())
        } else {
            Err("permission_denied")
        }
    }
    fn prepare(&mut self, query: Query) -> GatewayResult<Value> {
        authorized(self.mode, self.offline, query.provider)?;
        if self.active.is_some() {
            return Err("busy");
        }
        self.pending = None;
        let url = destination(&query)?;
        if !(1..=30).contains(&query.timeout_seconds) {
            return Err("limit");
        }
        let inventory = query.purpose == Purpose::Inventory;
        let body = if inventory {
            String::new()
        } else {
            wire(&query)?
        };
        self.next = self.next.checked_add(1).ok_or("limit")?;
        let view = json!({"ticket": self.next,"provider":query.provider,"model":query.model,"destination":url.as_str(),
            "purpose":query.purpose,"preflight":if inventory {None} else {manifest_url(query.provider,&url).map(|u|u.to_string())},"body":body,"bytes":body.len(),"maxTokens":query.max_tokens,"contextTokens":query.context_tokens});
        self.pending = Some(Prepared {
            id: self.next,
            created: Instant::now(),
            query,
            url,
            body,
        });
        Ok(view)
    }
    fn take(
        &mut self,
        id: u64,
    ) -> GatewayResult<(Prepared, oneshot::Receiver<()>, Option<Zeroizing<String>>)> {
        if self.active.is_some() {
            return Err("busy");
        }
        let plan = self
            .pending
            .take()
            .filter(|p| p.id == id && p.created.elapsed() < Duration::from_secs(120))
            .ok_or("consent_expired")?;
        authorized(self.mode, self.offline, plan.query.provider)?;
        self.calls.retain(|v| v.elapsed() < WINDOW);
        if self.calls.len() >= 6 {
            return Err("rate_limited");
        }
        let provider = plan.query.provider;
        let key = if plan.query.purpose == Purpose::Inventory && !plan.query.authenticate {
            None
        } else if let Some(k) = self.keys.get(&(provider, plan.query.host, plan.query.port)) {
            Some(k.clone())
        } else if !provider.local() {
            match credentials::read(&provider.secret()?) {
                Ok(Some(bytes)) => Some(Zeroizing::new(
                    String::from_utf8(bytes).map_err(|_| "credential_error")?,
                )),
                Ok(None) | Err(credentials::CredentialError::Unavailable) => None,
                Err(_) => return Err("credential_error"),
            }
        } else {
            None
        };
        if !provider.local() && key.is_none() {
            return Err("missing_credential");
        }
        self.calls.push_back(Instant::now());
        let (cancel, receiver) = oneshot::channel();
        self.active = Some(InFlight { id, cancel });
        Ok((plan, receiver, key))
    }
}

fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && (b == 168 || b == 0 || (b == 2 && c == 0) || b == 88 && c == 99))
        || (a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
        || (a == 203 && b == 0 && c == 113))
}

async fn transfer(plan: &Prepared, key: Option<Zeroizing<String>>) -> GatewayResult<String> {
    let q = &plan.query;
    let mut builder = Client::builder()
        .retry(reqwest::retry::never())
        .redirect(Policy::none())
        .timeout(Duration::from_secs(q.timeout_seconds));
    if q.provider.local() {
        // Only an exact numeric loopback target may skip application proxies.
        builder = builder.no_proxy();
    } else {
        let host = plan.url.host_str().ok_or("destination_denied")?;
        // Bind TLS with its original host name to approved public IPv4 resolutions.
        // IPv6-only deployments are explicitly unsupported by this version.
        let resolved: Vec<SocketAddr> = tokio::net::lookup_host((host, 443))
            .await
            .map_err(|_| "network_error")?
            .filter(|s| matches!(s.ip(),IpAddr::V4(v) if public_v4(v)))
            .take(16)
            .collect();
        if resolved.is_empty() {
            return Err("destination_denied");
        }
        builder = builder.https_only(true).resolve_to_addrs(host, &resolved);
    }
    let client = builder.build().map_err(|_| "network_error")?;
    if q.purpose == Purpose::Inventory {
        let mut inspect = client.get(plan.url.clone());
        if let Some(token) = key.as_ref() {
            inspect = inspect.bearer_auth(token.as_str());
        }
        let models = list_models(q.provider, &bounded_reply(inspect).await?)?;
        return serde_json::to_string(&models).map_err(|_| "invalid_response");
    }
    if let Some(endpoint) = manifest_url(q.provider, &plan.url) {
        let mut inspect = client.get(endpoint);
        if let Some(token) = key.as_ref() {
            inspect = inspect.bearer_auth(token.as_str());
        }
        let bytes = bounded_reply(inspect).await?;
        local_model(q, &bytes)?;
    }
    let mut req = client
        .post(plan.url.clone())
        .header("content-type", "application/json")
        .body(plan.body.clone());
    if let Some(key) = key {
        req = match q.provider {
            Provider::Anthropic => req
                .header("x-api-key", key.as_str())
                .header("anthropic-version", "2023-06-01"),
            Provider::Gemini => req.header("x-goog-api-key", key.as_str()),
            _ => req.bearer_auth(key.as_str()),
        };
    }
    extract(q.provider, &bounded_reply(req).await?)
}

fn manifest_url(provider: Provider, url: &Url) -> Option<Url> {
    let path = match provider {
        Provider::Ollama => "/api/tags",
        Provider::LmStudio => "/api/v1/models",
        _ => return None,
    };
    Some(url.join(path).expect("fixed local manifest path"))
}

fn local_model(q: &Query, bytes: &[u8]) -> GatewayResult<()> {
    let data: Value = serde_json::from_slice(bytes).map_err(|_| "invalid_response")?;
    let items = data["models"].as_array().ok_or("invalid_response")?;
    let item = items
        .iter()
        .find(|v| match q.provider {
            Provider::Ollama => {
                v["name"] == q.model
                    || (v["name"].as_str().and_then(|n| n.strip_suffix(":latest"))
                        == Some(q.model.as_str()))
            }
            Provider::LmStudio => {
                v["key"] == q.model
                    || v["loaded_instances"]
                        .as_array()
                        .is_some_and(|a| a.iter().any(|i| i["id"] == q.model))
            }
            _ => false,
        })
        .ok_or("model_unavailable")?;
    if !installed_locally(q.provider, item) {
        return Err("destination_denied");
    }
    Ok(())
}

fn installed_locally(provider: Provider, item: &Value) -> bool {
    let remote = ["remote_model", "remote_host"]
        .iter()
        .any(|k| item.get(k).is_some_and(|v| !v.is_null() && v != ""));
    let installed = match provider {
        Provider::Ollama => {
            item["size"].as_u64().is_some_and(|v| v > 0)
                && item
                    .pointer("/details/format")
                    .and_then(Value::as_str)
                    .is_some_and(|v| !v.is_empty())
        }
        Provider::LmStudio => {
            item["type"] == "llm"
                && item["size_bytes"].as_u64().is_some_and(|v| v > 0)
                && matches!(item["format"].as_str(), Some("gguf" | "mlx"))
        }
        _ => false,
    };
    !remote && installed
}
fn list_models(provider: Provider, bytes: &[u8]) -> GatewayResult<Vec<String>> {
    let data: Value = serde_json::from_slice(bytes).map_err(|_| "invalid_response")?;
    let field = if provider == Provider::Compatible {
        "data"
    } else {
        "models"
    };
    let items = data[field].as_array().ok_or("invalid_response")?;
    if items.len() > 256 {
        return Err("limit");
    }
    let mut models = Vec::new();
    for item in items {
        let raw = match provider {
            Provider::Ollama => item["name"].as_str(),
            Provider::LmStudio => item["key"].as_str(),
            Provider::Compatible => item["id"].as_str(),
            _ => return Err("destination_denied"),
        }
        .ok_or("invalid_response")?;
        if !valid_model(raw) || cloud_alias(raw) {
            continue;
        }
        if provider == Provider::Compatible || installed_locally(provider, item) {
            models.push(raw.to_owned());
        }
    }
    models.sort();
    models.dedup();
    Ok(models)
}
fn network_error(error: reqwest::Error) -> &'static str {
    if error.is_timeout() {
        return "timeout";
    }
    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(&error);
    while let Some(cause) = source {
        if let Some(io) = cause.downcast_ref::<std::io::Error>() {
            use std::io::ErrorKind;
            match io.kind() {
                ErrorKind::ConnectionRefused => return "connection_refused",
                ErrorKind::PermissionDenied => return "access_denied",
                ErrorKind::TimedOut => return "timeout",
                _ => (),
            }
        }
        source = cause.source();
    }
    "network_error"
}
async fn bounded_reply(req: reqwest::RequestBuilder) -> GatewayResult<Vec<u8>> {
    let mut response = req.send().await.map_err(network_error)?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            300..=399 => "redirect_denied",
            401 | 403 => "credential_denied",
            402 => "cost_limit",
            429 => "rate_limited",
            _ => "provider_error",
        });
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_REPLY as u64)
    {
        return Err("limit");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "network_error")? {
        if bytes.len() + chunk.len() > MAX_REPLY {
            return Err("limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn extract(provider: Provider, bytes: &[u8]) -> GatewayResult<String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "invalid_response")?;
    let text = match provider {
        Provider::Ollama => value.pointer("/message/content").and_then(Value::as_str),
        Provider::LmStudio | Provider::Compatible => value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str),
        Provider::Openai => value
            .get("output")
            .and_then(Value::as_array)
            .and_then(|out| out.iter().find(|item| item["type"] == "message"))
            .and_then(|item| item["content"].as_array())
            .and_then(|parts| parts.iter().find(|p| p["type"] == "output_text"))
            .and_then(|p| p["text"].as_str()),
        Provider::Anthropic => value["content"]
            .as_array()
            .and_then(|items| items.iter().find(|p| p["type"] == "text"))
            .and_then(|p| p["text"].as_str()),
        Provider::Gemini => value
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .find(|p| p["thought"] != true && p["text"].is_string())
            })
            .and_then(|p| p["text"].as_str()),
    }
    .ok_or("invalid_response")?;
    if text.is_empty() || text.len() > MAX_CONTENT {
        return Err("invalid_response");
    }
    Ok(text.to_owned())
}

impl Gateway {
    async fn perform(&self, request: Action) -> GatewayResult<Value> {
        let lock = || self.0.lock().map_err(|_| "unavailable");
        let (plan, cancel, key) = {
            let mut state = lock()?;
            match request {
                Action::Configure {
                    mode,
                    offline,
                    generation,
                } => {
                    if generation < state.generation || generation > 9_007_199_254_740_991 {
                        return Err("cancelled");
                    }
                    state.revoke();
                    state.generation = generation;
                    state.mode = mode;
                    state.offline = offline;
                    if mode == Mode::Disabled {
                        state.keys.clear();
                    }
                    return Ok(Value::Null);
                }
                Action::Cancel { generation } => {
                    if state.generation == generation {
                        state.revoke();
                    }
                    return Ok(Value::Null);
                }
                Action::Prepare { query, generation } => {
                    state.check(generation)?;
                    return state.prepare(query);
                }
                Action::Send { ticket, generation } => {
                    state.check(generation)?;
                    state.take(ticket)?
                }
                Action::Credential {
                    provider,
                    host,
                    port,
                    secret,
                    persist,
                    generation,
                } => {
                    let secret = Zeroizing::new(secret);
                    state.check(generation)?;
                    authorized(state.mode, state.offline, provider)?;
                    if (provider.local() && port < 1024)
                        || (!provider.local() && (port != 0 || host != Loopback::V4))
                        || secret.is_empty()
                        || secret.len() > 1024
                        || !secret.bytes().all(|c| (33..=126).contains(&c))
                    {
                        return Err("invalid_input");
                    }
                    if persist {
                        if provider.local() {
                            return Err("permission_denied");
                        }
                        credentials::save(&provider.secret()?, secret.as_bytes())
                            .map_err(|_| "credential_error")?;
                    }
                    state.revoke();
                    state.keys.insert((provider, host, port), secret);
                    return Ok(Value::Null);
                }
                Action::Forget {
                    provider,
                    host,
                    port,
                    generation,
                } => {
                    state.check(generation)?;
                    state.revoke();
                    state.keys.remove(&(provider, host, port));
                    if !provider.local() {
                        match credentials::delete(&provider.secret()?) {
                            Ok(()) | Err(credentials::CredentialError::Unavailable) => (),
                            Err(_) => return Err("credential_error"),
                        }
                    }
                    return Ok(Value::Null);
                }
            }
        };
        let result = tokio::select! {
            _=cancel => Err("cancelled"),
            r=tokio::time::timeout(Duration::from_secs(plan.query.timeout_seconds),transfer(&plan,key))=>r.unwrap_or(Err("timeout"))
        };
        let mut state = lock()?;
        if state.active.as_ref().is_none_or(|a| a.id != plan.id) {
            return Err("cancelled");
        }
        state.active = None;
        result.map(Value::String)
    }
}

#[tauri::command]
pub async fn dars_intelligence(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Gateway>,
    request: Action,
) -> Result<Value, &'static str> {
    let url = window.url().map_err(|_| "permission_denied")?;
    if window.label() != "main"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(
            (url.scheme(), url.host_str()),
            ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost"))
        )
    {
        return Err("permission_denied");
    }
    state.perform(request).await
}

#[cfg(test)]
#[path = "intelligence_tests.rs"]
mod tests;
