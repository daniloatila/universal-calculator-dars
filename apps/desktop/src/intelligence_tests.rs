use super::*;

#[test]
fn local_inventory_refuses_cloud_alias_and_missing_weights_before_disclosing_content() {
    let q = query(Provider::Ollama, 11434);
    let inspect = |row: Value| local_model(&q, json!({"models":[row]}).to_string().as_bytes());
    assert!(
        inspect(json!({"name":"test-model:latest","size":123,"details":{"format":"gguf"}})).is_ok()
    );
    assert_eq!(
        inspect(
            json!({"name":"test-model:latest","remote_host":"https://invalid.example","size":123,"details":{"format":"gguf"}})
        ),
        Err("destination_denied")
    );
    assert_eq!(
        inspect(json!({"name":"test-model:latest","size":0})),
        Err("destination_denied")
    );
    let q = query(Provider::LmStudio, 1234);
    assert!(
        local_model(
            &q,
            br#"{"models":[{"key":"test-model","size_bytes":90,"type":"llm","format":"gguf"}]}"#
        )
        .is_ok()
    );
    assert_eq!(
        local_model(&q, br#"{"models":[]}"#),
        Err("model_unavailable")
    );
}
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, mpsc};

fn query(provider: Provider, port: u16) -> Query {
    Query {
        provider,
        model: "test-model".into(),
        host: Loopback::V4,
        authenticate: false,
        port,
        purpose: Purpose::Propose,
        content: "Synthetic example".into(),
        context_tokens: 4096,
        max_tokens: 256,
        timeout_seconds: 3,
    }
}
fn state() -> State {
    State {
        mode: Mode::Local,
        generation: 1,
        ..State::default()
    }
}
#[test]
fn six_protocols_fixed_destinations_and_response_shapes() {
    let text = r#"{"schema":1,"kind":"question","text":"Which amount?"}"#;
    for (p, target, body_key, reply) in [
        (
            Provider::Ollama,
            "http://127.0.0.1:11434/api/chat",
            "messages",
            json!({"message":{"content":text}}),
        ),
        (
            Provider::LmStudio,
            "http://127.0.0.1:11434/v1/chat/completions",
            "messages",
            json!({"choices":[{"message":{"content":text}}]}),
        ),
        (
            Provider::Compatible,
            "http://127.0.0.1:11434/v1/chat/completions",
            "messages",
            json!({"choices":[{"message":{"content":text}}]}),
        ),
        (
            Provider::Openai,
            "https://api.openai.com/v1/responses",
            "instructions",
            json!({"output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":text}]}]}),
        ),
        (
            Provider::Anthropic,
            "https://api.anthropic.com/v1/messages",
            "system",
            json!({"content":[{"type":"thinking"},{"type":"text","text":text}]}),
        ),
        (
            Provider::Gemini,
            "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
            "systemInstruction",
            json!({"candidates":[{"content":{"parts":[{"thought":true,"text":"internal"},{"text":text}]}}]}),
        ),
    ] {
        let q = query(p, if p.local() { 11434 } else { 0 });
        assert_eq!(destination(&q).unwrap().as_str(), target);
        let body: Value = serde_json::from_str(&wire(&q).unwrap()).unwrap();
        assert!(body.get(body_key).is_some());
        assert!(body.get("tools").is_none());
        assert_eq!(extract(p, reply.to_string().as_bytes()).unwrap(), text);
        assert_eq!(extract(p, b"{}"), Err("invalid_response"));
    }
}

#[test]
fn factory_off_and_offline_refuse_external_calls_and_cross_mode_routes() {
    let mut s = State::default();
    assert_eq!(
        s.prepare(query(Provider::Ollama, 11434)),
        Err("permission_denied")
    );
    for (m, offline, p) in [
        (Mode::External, true, Provider::Gemini),
        (Mode::Local, false, Provider::Openai),
        (Mode::External, false, Provider::Ollama),
    ] {
        s.mode = m;
        s.offline = offline;
        assert_eq!(
            s.prepare(query(p, if p.local() { 1234 } else { 0 })),
            Err("permission_denied")
        );
    }
    s.mode = Mode::Local;
    s.offline = true;
    assert!(s.prepare(query(Provider::Compatible, 1234)).is_ok());
    assert_eq!(s.check(42), Err("permission_denied"));
}
#[test]
fn model_cannot_set_url_credentials_or_return_verified_data() {
    let mut q = query(Provider::Gemini, 0);
    q.model = "https://invalid.example".into();
    assert!(destination(&q).is_err());
    q = query(Provider::Ollama, 11434);
    q.model = "example:cloud".into();
    assert!(destination(&q).is_err());
    assert!(destination(&query(Provider::Compatible, 80)).is_err());
    assert!(
        serde_json::from_value::<Query>(
            json!({"url":"https://invalid.example","provider":"compatible"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<Action>(json!({"action":"read_key","provider":"openai"})).is_err()
    );
    assert!(
        serde_json::from_value::<Action>(
            json!({"action":"send","ticket":1,"generation":1,"result":"42"})
        )
        .is_err()
    );
    assert!(!public_v4(Ipv4Addr::LOCALHOST));
    assert!(!public_v4(Ipv4Addr::new(169, 254, 1, 1)));
    assert!(!public_v4(Ipv4Addr::new(192, 168, 1, 1)));
    assert!(public_v4(Ipv4Addr::new(1, 1, 1, 1)));
}
#[test]
fn consent_bound_to_body_origin_and_one_use_with_output_and_context_limits() {
    let mut s = state();
    let q = query(Provider::Compatible, 1234);
    s.keys.insert(
        (Provider::Compatible, Loopback::V4, 5678),
        Zeroizing::new("synthetic-only".into()),
    );
    let view = s.prepare(q.clone()).unwrap();
    assert!(!view["body"].as_str().unwrap().contains("synthetic-only"));
    let ticket = view["ticket"].as_u64().unwrap();
    let (plan, _cancel, key) = s.take(ticket).unwrap();
    assert!(key.is_none());
    assert_eq!(view["body"], plan.body);
    assert!(s.take(ticket).is_err());
    s.revoke();
    assert!(s.take(ticket).is_err());
    let before = s.prepare(q.clone()).unwrap();
    let mut q2 = q.clone();
    q2.content = "Different input".into();
    let after = s.prepare(q2).unwrap();
    assert_ne!(before["body"], after["body"]);
    assert!(s.take(before["ticket"].as_u64().unwrap()).is_err());
    let mut narrow = q;
    narrow.context_tokens = 128;
    assert_eq!(s.prepare(narrow), Err("limit"));
}
#[test]
fn window_limits_and_cancellation_do_not_retry() {
    let mut s = state();
    for _ in 0..6 {
        let v = s.prepare(query(Provider::Compatible, 1234)).unwrap();
        let (_, mut cancel, _) = s.take(v["ticket"].as_u64().unwrap()).unwrap();
        s.revoke();
        assert_eq!(cancel.try_recv(), Ok(()));
    }
    let later = s.prepare(query(Provider::Compatible, 1234)).unwrap();
    assert!(matches!(
        s.take(later["ticket"].as_u64().unwrap()),
        Err("rate_limited")
    ));
    s.calls.clear();
    let fresh = s.prepare(query(Provider::Compatible, 1234)).unwrap();
    assert!(s.take(fresh["ticket"].as_u64().unwrap()).is_ok());
}

// A finite, loopback-only fake provider accepting exactly one HTTP request.
// Its thread and port are scoped to the test. Request bytes never leave the host.
fn local_response(
    status: &str,
    headers: &str,
    body: &str,
) -> (u16, mpsc::Receiver<String>, std::thread::JoinHandle<()>) {
    local_response_on("127.0.0.1", status, headers, body)
}
fn local_response_on(
    host: &str,
    status: &str,
    headers: &str,
    body: &str,
) -> (u16, mpsc::Receiver<String>, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind((host, 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let response = format!(
        "HTTP/1.1 {status}\r\nConnection: close\r\n{headers}Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    let (tx, rx) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buf = [0u8; 2048];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            bytes.extend_from_slice(&buf[..n]);
            assert!(bytes.len() < 16 * 1024);
            if let Some(end) = bytes.windows(4).position(|c| c == b"\r\n\r\n") {
                let head = std::str::from_utf8(&bytes[..end])
                    .unwrap()
                    .to_ascii_lowercase();
                let length: usize = head
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length: "))
                    .unwrap_or("0")
                    .trim()
                    .parse()
                    .unwrap();
                if bytes.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let _ = stream.write_all(response.as_bytes());
        tx.send(String::from_utf8(bytes).unwrap()).unwrap();
    });
    (port, rx, thread)
}

#[tokio::test]
async fn real_loopback_http_mock_transmits_only_the_reviewed_payload_after_grant() {
    let proposal = r#"{"schema":1,"kind":"question","text":"Which period?"}"#;
    let body = json!({"choices":[{"message":{"content":proposal}}]}).to_string();
    let (port, requests, handle) =
        local_response("200 OK", "Content-Type: application/json\r\n", &body);
    let g = Gateway(Mutex::new(state()));
    g.perform(Action::Credential {
        provider: Provider::Compatible,
        host: Loopback::V4,
        port,
        secret: "synthetic-only".into(),
        persist: false,
        generation: 1,
    })
    .await
    .unwrap();
    let view = g
        .perform(Action::Prepare {
            query: query(Provider::Compatible, port),
            generation: 1,
        })
        .await
        .unwrap();
    assert!(requests.try_recv().is_err());
    let result = g
        .perform(Action::Send {
            ticket: view["ticket"].as_u64().unwrap(),
            generation: 1,
        })
        .await
        .unwrap();
    assert_eq!(result, proposal);
    handle.join().unwrap();
    let data = requests.recv().unwrap();
    let (headers, content) = data.split_once("\r\n\r\n").unwrap();
    assert_eq!(content, view["body"].as_str().unwrap());
    assert!(
        headers
            .to_ascii_lowercase()
            .contains("authorization: bearer synthetic-only")
    );
    assert!(!content.contains("synthetic-only"));
    g.perform(Action::Forget {
        provider: Provider::Compatible,
        host: Loopback::V4,
        port,
        generation: 1,
    })
    .await
    .unwrap();
    assert!(g.0.lock().unwrap().keys.is_empty());
}
#[tokio::test]
async fn controlled_redirect_http_limit_and_external_failure_return_stable_errors() {
    let g = Arc::new(Gateway(Mutex::new(state())));
    for (status, headers, body, error) in [
        (
            "307 Temporary Redirect",
            "Location: http://127.0.0.1:1/\r\n",
            "".to_owned(),
            "redirect_denied",
        ),
        ("429 Too Many Requests", "", "".to_owned(), "rate_limited"),
        ("401 Unauthorized", "", "".to_owned(), "credential_denied"),
        ("200 OK", "", "x".repeat(MAX_REPLY + 1), "limit"),
        ("200 OK", "", "{}".to_owned(), "invalid_response"),
    ] {
        let (port, seen, handle) = local_response(status, headers, &body);
        let view = g
            .perform(Action::Prepare {
                query: query(Provider::Compatible, port),
                generation: 1,
            })
            .await
            .unwrap();
        assert_eq!(
            g.perform(Action::Send {
                ticket: view["ticket"].as_u64().unwrap(),
                generation: 1
            })
            .await,
            Err(error)
        );
        handle.join().unwrap();
        assert!(seen.recv().is_ok());
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let view = g
        .perform(Action::Prepare {
            query: query(Provider::Compatible, port),
            generation: 1,
        })
        .await
        .unwrap();
    assert_eq!(
        g.perform(Action::Send {
            ticket: view["ticket"].as_u64().unwrap(),
            generation: 1
        })
        .await,
        Err("connection_refused")
    );
    assert!(g.0.lock().unwrap().active.is_none());
}

#[tokio::test]
async fn cancelling_an_inflight_request_drops_transport_and_recovers() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let (received, ready) = oneshot::channel();
    let (finish, stop) = mpsc::channel();
    let server = std::thread::spawn(move || {
        let (_client, _) = listener.accept().unwrap();
        let _ = received.send(());
        let _ = stop.recv_timeout(Duration::from_secs(3));
    });
    let g = Arc::new(Gateway(Mutex::new(state())));
    let view = g
        .perform(Action::Prepare {
            query: query(Provider::Compatible, port),
            generation: 1,
        })
        .await
        .unwrap();
    let ticket = view["ticket"].as_u64().unwrap();
    let running = g.clone();
    let send = tokio::spawn(async move {
        running
            .perform(Action::Send {
                ticket,
                generation: 1,
            })
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), ready)
        .await
        .unwrap()
        .unwrap();
    g.perform(Action::Configure {
        mode: Mode::Disabled,
        offline: true,
        generation: 2,
    })
    .await
    .unwrap();
    assert_eq!(send.await.unwrap(), Err("cancelled"));
    finish.send(()).unwrap();
    server.join().unwrap();
    assert!(
        g.perform(Action::Prepare {
            query: query(Provider::Compatible, port),
            generation: 1
        })
        .await
        .is_err()
    );
    g.perform(Action::Configure {
        mode: Mode::Local,
        offline: true,
        generation: 3,
    })
    .await
    .unwrap();
    assert!(
        g.perform(Action::Prepare {
            query: query(Provider::Compatible, port),
            generation: 3
        })
        .await
        .is_ok()
    );
}

#[tokio::test]
async fn host_selected_ipv4_ipv6_inventory_is_get_only_and_secrets_are_opt_in() {
    for (host, addr) in [(Loopback::V4, "127.0.0.1"), (Loopback::V6, "::1")] {
        for auth in [false, true] {
            let (port, received, handle) =
                local_response_on(addr, "200 OK", "", r#"{"data":[{"id":"demo-model"}]}"#);
            let gateway = Gateway(Mutex::new(state()));
            let mut q = query(Provider::Compatible, port);
            q.host = host;
            q.purpose = Purpose::Inventory;
            q.authenticate = auth;
            q.model.clear();
            q.content.clear();
            gateway
                .perform(Action::Credential {
                    provider: q.provider,
                    host,
                    port,
                    secret: "synthetic-only".into(),
                    generation: 1,
                    persist: false,
                })
                .await
                .unwrap();
            let view = gateway
                .perform(Action::Prepare {
                    query: q,
                    generation: 1,
                })
                .await
                .unwrap();
            assert_eq!(view["body"], "");
            assert!(
                view["destination"]
                    .as_str()
                    .unwrap()
                    .ends_with("/v1/models")
            );
            assert!(received.try_recv().is_err());
            assert_eq!(
                gateway
                    .perform(Action::Send {
                        ticket: view["ticket"].as_u64().unwrap(),
                        generation: 1
                    })
                    .await
                    .unwrap(),
                r#"["demo-model"]"#
            );
            handle.join().unwrap();
            let raw = received.recv().unwrap();
            assert!(raw.starts_with("GET /v1/models "));
            assert!(raw.ends_with("\r\n\r\n"));
            assert_eq!(raw.to_ascii_lowercase().contains("authorization:"), auth);
        }
    }
}
#[test]
fn empty_invalid_and_remote_inventories_are_distinct() {
    assert_eq!(
        list_models(Provider::Ollama, br#"{"models":[]}"#).unwrap(),
        Vec::<String>::new()
    );
    assert_eq!(
        list_models(Provider::Compatible, br#"{"models":[]}"#),
        Err("invalid_response")
    );
    assert!(list_models(Provider::Ollama,br#"{"models":[{"name":"test","remote_host":"https://example.invalid","size":85,"details":{"format":"gguf"}}]}"#).unwrap().is_empty());
    assert!(serde_json::from_str::<Loopback>(r#""localhost""#).is_err());
    assert!(serde_json::from_str::<Loopback>(r#""192.168.0.1""#).is_err());
}
