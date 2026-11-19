use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    extract::{MatchedPath, Request, State},
    http::{HeaderName, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use litellm_callbacks::Abort;
use litellm_callbacks_parallel_request_limiter::{
    AuthFacts, Descriptor, Engine, LimiterState, ParallelRequestLimiter, PostCallFailureFacts,
    PostCallSuccessFacts, PreCallFacts, RATE_LIMITED, RateLimitedModel, Settings as EngineSettings,
    SuccessFacts, TargetFacts, TokenRateLimitType, UsageObject, aggregate_only, auth_descriptors,
    charged_tokens, header_map,
};
use litellm_config::Environment;
use litellm_gateway_auth::{AuthenticatedRequest, AuthenticationMethod, keys::KeyLimits};
use litellm_gateway_inference::{RateLimited, ServedUsage, UsageSink};
use litellm_redis_client::RedisClient;
use litellm_redis_store::{Remote, rate_limits::RateLimits};
use parking_lot::Mutex;
use serde_json::{Map, Value, json};

/// `RedisCache.default_ttl` when `default_redis_ttl` is unset.
pub(crate) const REDIS_DEFAULT_TTL: Duration = Duration::from_secs(60);
/// The `default_in_memory_ttl` of the proxy's `internal_usage_cache`, the limiter's memory tier.
const MEMORY_TTL: Duration = Duration::from_secs(1);
/// The api key and the user Python names a master key caller by, `LITELLM_PROXY_MASTER_KEY_ALIAS`
/// and `LITELLM_PROXY_ADMIN_NAME`.
const MASTER_KEY_ALIAS: &str = "litellm_proxy_master_key";
const PROXY_ADMIN_NAME: &str = "default_user_id";
const KEY_RPM_LIMIT: HeaderName = HeaderName::from_static("x-litellm-key-rpm-limit");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settings {
    window_size: i64,
    tpm_reservation_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            window_size: 60,
            tpm_reservation_enabled: true,
        }
    }
}

impl Settings {
    pub fn from_environment(environment: &Environment) -> Self {
        let defaults = Self::default();
        Self {
            window_size: environment
                .litellm_rate_limit_window_size
                .unwrap_or(defaults.window_size),
            tpm_reservation_enabled: environment
                .litellm_tpm_token_reservation_enabled
                .map_or(defaults.tpm_reservation_enabled, |flag| flag.0),
        }
    }
}

/// The proxy's `parallel_request_limiter_v3`, over the coordination Redis when there is one and
/// over this process's memory otherwise, as the proxy's `internal_usage_cache` is.
pub struct RateLimit {
    limiter: ParallelRequestLimiter,
}

fn unix_now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |elapsed| elapsed.as_secs_f64())
}

/// Who Python says the caller is: its `api_key` and its `user_id`.
struct Caller {
    api_key: String,
    user_id: Option<&'static str>,
    limits: KeyLimits,
}

impl Caller {
    fn of(identity: &AuthenticatedRequest) -> Self {
        let authentication = identity.caller().authentication();
        match authentication.method {
            AuthenticationMethod::MasterKey => Self {
                api_key: MASTER_KEY_ALIAS.to_owned(),
                user_id: Some(PROXY_ADMIN_NAME),
                limits: authentication.limits,
            },
            AuthenticationMethod::VirtualKey | AuthenticationMethod::External(_) => Self {
                api_key: authentication.credential_id.clone(),
                user_id: None,
                limits: authentication.limits,
            },
        }
    }

    fn targets(&self) -> TargetFacts {
        TargetFacts {
            user_api_key_hash: Some(self.api_key.clone()),
            user_api_key_user_id: self.user_id.map(str::to_owned),
            ..TargetFacts::default()
        }
    }
}

/// The tokens Python charges a served call: its total, less the prompt tokens read from cache.
fn charged(served: &ServedUsage) -> i64 {
    let usage = &served.usage;
    let count = |tokens: u64| Value::from(i64::try_from(tokens).unwrap_or(i64::MAX));
    let usage = UsageObject::Chat {
        members: Map::from_iter([
            ("prompt_tokens".to_owned(), count(usage.prompt_tokens)),
            (
                "completion_tokens".to_owned(),
                count(usage.completion_tokens),
            ),
            ("total_tokens".to_owned(), count(usage.total_tokens)),
            (
                "cached_tokens".to_owned(),
                count(usage.prompt_tokens_details.cached_tokens),
            ),
        ]),
    };
    match charged_tokens(Some(&usage), TokenRateLimitType::Total) {
        0 => aggregate_only(Some(&usage)),
        charged => charged,
    }
}

impl RateLimit {
    pub fn new(settings: Settings, redis: Option<RedisClient>) -> Self {
        let remote = redis.map(|client| Remote {
            client,
            default_ttl: REDIS_DEFAULT_TTL,
        });
        let engine = Engine::new(
            Arc::new(RateLimits::new(remote, Some(MEMORY_TTL))),
            EngineSettings {
                window_size: settings.window_size,
                tpm_reservation_enabled: settings.tpm_reservation_enabled,
            },
            Arc::new(unix_now),
        );
        Self {
            limiter: ParallelRequestLimiter::new(engine),
        }
    }

    /// The limits the caller's key holds, as the proxy describes them for its `api_key`.
    fn descriptors(&self, caller: &Caller) -> Vec<Descriptor> {
        let KeyLimits {
            rpm,
            max_parallel_requests,
        } = caller.limits;
        let facts = AuthFacts {
            api_key: json!(caller.api_key),
            rpm_limit: json!(rpm),
            max_parallel_requests: json!(max_parallel_requests),
            window_size: json!(self.limiter.engine().settings().window_size),
            ..AuthFacts::default()
        };
        auth_descriptors(&facts)
            .map(|found| found.leading)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|descriptor| serde_json::from_value(descriptor).ok())
            .collect()
    }

    /// `async_log_success_event`: gives back what the call still holds and charges the tokens it
    /// used to the caller's counters, which a TPM limit reads.
    async fn settle(&self, state: &LimiterState, targets: TargetFacts, served: ServedUsage) {
        let facts = SuccessFacts {
            total_tokens: charged(&served),
            targets,
            served_model: Some(RateLimitedModel {
                requested: served.model,
                group: served.model_group,
            }),
            ..SuccessFacts::default()
        };
        self.limiter.settle_success(state, facts, None).await;
    }
}

/// One admitted call: its limiter state, who it is charged to, and what the route says it used.
struct Admitted {
    rate_limit: Arc<RateLimit>,
    state: LimiterState,
    targets: TargetFacts,
    served: Arc<Mutex<Option<ServedUsage>>>,
}

impl Admitted {
    /// Settles off the request, as the proxy's success log runs after the answer: a call the route
    /// told the usage of is charged, and any other only gives its slot back.
    fn settle_later(self) {
        tokio::spawn(async move {
            let Self {
                rate_limit,
                state,
                targets,
                served,
            } = self;
            let served = served.lock().take();
            match served {
                Some(served) => rate_limit.settle(&state, targets, served).await,
                None => rate_limit.limiter.release_on_disconnect(&state).await,
            }
        });
    }
}

/// Settles a streamed call once its body is done or dropped.
struct SettledWhenDropped(Option<Admitted>);

impl Drop for SettledWhenDropped {
    fn drop(&mut self) {
        if let Some(admitted) = self.0.take() {
            admitted.settle_later();
        }
    }
}

fn streamed(response: &Response) -> bool {
    response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/event-stream"))
}

/// What a refusal says, with its headers in the order the proxy sends them.
fn refused(abort: Abort, path: &str) -> Response {
    let Some(error) = abort.error.filter(|error| error.kind == RATE_LIMITED) else {
        let status = StatusCode::from_u16(abort.status).unwrap_or(StatusCode::SERVICE_UNAVAILABLE);
        return (status, abort.message).into_response();
    };
    let headers = error
        .fields
        .get("headers")
        .and_then(|headers| serde_json::from_value::<Vec<(String, String)>>(headers.clone()).ok())
        .unwrap_or_else(|| abort.headers.into_iter().collect());
    RateLimited {
        message: abort.message,
        headers,
    }
    .response(path)
}

fn with_statuses(response: Response, state: &LimiterState) -> Response {
    let statuses = state
        .stash()
        .rate_limit_response
        .as_ref()
        .map(|response| header_map(&response.statuses))
        .unwrap_or_default();
    let (mut parts, body) = response.into_parts();
    for (name, value) in statuses {
        let value = match value {
            Value::String(text) => text,
            other => other.to_string(),
        };
        if let (Ok(name), Ok(value)) = (HeaderName::try_from(name), HeaderValue::try_from(value)) {
            parts.headers.insert(name, value);
        }
    }
    Response::from_parts(parts, body)
}

/// `x-litellm-key-rpm-limit`, which the proxy's custom headers carry on every answer to a call
/// its pre-call hook admitted, a failed one included.
fn with_key_rpm_limit(mut response: Response, caller: &Caller) -> Response {
    if let Some(rpm) = caller.limits.rpm {
        response
            .headers_mut()
            .insert(KEY_RPM_LIMIT, HeaderValue::from(rpm));
    }
    response
}

/// `parallel_request_limiter_v3` for a key's own `rpm_limit` and `max_parallel_requests`: the
/// pre-call hook counts the request and takes a parallel slot, or refuses it with the proxy's
/// `ProxyRateLimitError` in the route's envelope. A complete answer gives the slot back before it
/// goes out and carries the `x-ratelimit-*` headers on success, and a streamed one gives it back
/// when its body is done or dropped. After either, the tokens the route says the call used are
/// charged to the caller's counters off the request, as the proxy's success log does, for every
/// caller, the master key included.
///
/// The refusal takes the route's envelope, as Python's route maps `ProxyRateLimitError`, not the
/// OpenAI body the other middleware answers with. A key holding any other limit never gets here,
/// because the key lookup does not report it active. Accepted difference: a route that tells no
/// usage, every one but `/v1/messages`, charges no tokens.
pub(super) async fn limit(
    State(rate_limit): State<Arc<RateLimit>>,
    identity: AuthenticatedRequest,
    path: MatchedPath,
    request: Request,
    next: Next,
) -> Response {
    let caller = Caller::of(&identity);
    let state = LimiterState::default();
    let facts = PreCallFacts {
        descriptors: rate_limit.descriptors(&caller),
        ..PreCallFacts::default()
    };
    if let Some(abort) = rate_limit.limiter.pre_call(&state, facts, None).await {
        return refused(abort, path.as_str());
    }
    let served = Arc::new(Mutex::new(None));
    let heard = served.clone();
    let (mut parts, body) = request.into_parts();
    parts
        .extensions
        .insert(UsageSink::new(move |usage| *heard.lock() = Some(usage)));
    let response = with_key_rpm_limit(next.run(Request::from_parts(parts, body)).await, &caller);
    let admitted = Admitted {
        rate_limit: rate_limit.clone(),
        state,
        targets: caller.targets(),
        served,
    };
    if streamed(&response) {
        let held = SettledWhenDropped(Some(admitted));
        let (parts, body) = response.into_parts();
        let body = body.into_data_stream().map(move |chunk| {
            let _ = &held;
            chunk
        });
        return Response::from_parts(parts, Body::from_stream(body));
    }
    if !response.status().is_success() {
        rate_limit
            .limiter
            .post_call_failure(&admitted.state, PostCallFailureFacts::default())
            .await;
        return response;
    }
    rate_limit
        .limiter
        .post_call_success(&admitted.state, PostCallSuccessFacts::default())
        .await;
    let response = with_statuses(response, &admitted.state);
    admitted.settle_later();
    response
}

#[cfg(test)]
mod tests {
    use axum::{
        Extension, Json, Router,
        body::{Bytes, to_bytes},
        middleware::from_fn_with_state,
        routing::post,
    };
    use futures_util::stream;
    use litellm_core_utils::core_helpers::usage_from_parts;
    use litellm_gateway_auth::{
        Auth, KeyAuthenticator, KeyHolder, NoAdditionalPolicy, SystemClock, authenticate,
        hash_token,
        keys::{KeyHash, KeyLookup, KeyStatus, LookupFuture},
    };
    use litellm_redis_store::{
        Number,
        rate_limits::{Entry, Local, Scope},
    };
    use litellm_secret_value::SecretValue;
    use rstest::rstest;
    use tower::ServiceExt;

    use super::*;

    const MASTER_KEY: &str = "sk-master";
    const KEY: &str = "sk-limited";

    struct Holding(KeyLimits);

    impl KeyLookup for Holding {
        fn lookup<'a>(&'a self, _: &'a KeyHash) -> LookupFuture<'a> {
            Box::pin(async move {
                Ok(Some(KeyStatus::Active {
                    expires_at: None,
                    models: Arc::from([]),
                    limits: self.0,
                }))
            })
        }
    }

    /// 8 input, 13 output, 100 read from cache and 5 written to it, which Python charges as 26.
    fn used() -> ServedUsage {
        ServedUsage {
            model: "claude".into(),
            model_group: "claude-group".into(),
            usage: usage_from_parts(8, 13, 100, 5),
        }
    }

    fn app(limits: KeyLimits) -> Router {
        served_app(limits).0
    }

    fn served_app(limits: KeyLimits) -> (Router, Arc<RateLimit>) {
        let auth = Auth::new(
            Arc::new(KeyAuthenticator::new(
                Some(SecretValue::new(MASTER_KEY)),
                Arc::new(Holding(limits)),
            )),
            Arc::new(KeyHolder),
            Arc::new(NoAdditionalPolicy),
            Arc::new(SystemClock),
        );
        let rate_limit = Arc::new(RateLimit::new(Settings::default(), None));
        let router = Router::new()
            .route(
                "/v1/messages",
                post(|Extension(sink): Extension<UsageSink>| async move {
                    sink.tell(used());
                    Json(json!({"type": "message"}))
                }),
            )
            .route(
                "/v1/messages/stream",
                post(|Extension(sink): Extension<UsageSink>| async move {
                    let events = stream::iter([Ok::<_, std::io::Error>(Bytes::from(
                        "event: message_stop\ndata: {}\n\n",
                    ))])
                    .chain(
                        stream::once(async move { sink.tell(used()) })
                            .filter_map(|()| async { None }),
                    );
                    (
                        [(header::CONTENT_TYPE, "text/event-stream")],
                        Body::from_stream(events),
                    )
                }),
            )
            .route(
                "/v1/chat/completions",
                post(|| async { (StatusCode::BAD_REQUEST, "refused upstream") }),
            )
            .route_layer(from_fn_with_state(rate_limit.clone(), limit))
            .route_layer(from_fn_with_state(auth, authenticate));
        (router, rate_limit)
    }

    fn charged_to(rate_limit: &RateLimit, descriptor: &str, value: &str) -> Option<f64> {
        let entry = Entry::new(
            "tokens",
            Scope {
                descriptor: descriptor.into(),
                value: value.into(),
            },
        )
        .unwrap();
        match rate_limit
            .limiter
            .engine()
            .store()
            .get_local(&entry)
            .unwrap()
        {
            Some(Local::Number(number)) => Some(Number::as_f64(number)),
            _ => None,
        }
    }

    /// What `descriptor`'s token counter holds once it reads `expected`, or what it last held.
    async fn settled(
        rate_limit: &RateLimit,
        descriptor: &str,
        value: &str,
        expected: f64,
    ) -> Option<f64> {
        for _ in 0..100 {
            if charged_to(rate_limit, descriptor, value) == Some(expected) {
                break;
            }
            tokio::task::yield_now().await;
        }
        charged_to(rate_limit, descriptor, value)
    }

    async fn call(app: &Router, path: &str, token: &str) -> Response {
        app.clone()
            .oneshot(
                Request::post(path)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    async fn json_body(response: Response) -> Value {
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
    }

    fn ratelimit_headers(response: &Response) -> Vec<(String, String)> {
        let mut found: Vec<(String, String)> = response
            .headers()
            .iter()
            .filter(|(name, _)| name.as_str().starts_with("x-ratelimit-"))
            .map(|(name, value)| (name.to_string(), value.to_str().unwrap().to_owned()))
            .collect();
        found.sort();
        found
    }

    fn headers(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect()
    }

    #[tokio::test]
    async fn a_keys_rpm_limit_counts_each_call_and_refuses_the_one_past_it() {
        let app = app(KeyLimits {
            rpm: Some(2),
            max_parallel_requests: None,
        });

        let first = call(&app, "/v1/messages", KEY).await;
        let second = call(&app, "/v1/messages", KEY).await;
        let third = call(&app, "/v1/messages", KEY).await;

        assert_eq!(
            ratelimit_headers(&first),
            headers(&[
                ("x-ratelimit-api_key-limit-requests", "2"),
                ("x-ratelimit-api_key-remaining-requests", "1"),
            ])
        );
        assert_eq!(second.status(), StatusCode::OK);
        assert_eq!(
            ratelimit_headers(&second),
            headers(&[
                ("x-ratelimit-api_key-limit-requests", "2"),
                ("x-ratelimit-api_key-remaining-requests", "0"),
            ])
        );
        assert_eq!(third.status(), StatusCode::TOO_MANY_REQUESTS);
        let refusal: Vec<(&str, &str)> = third
            .headers()
            .iter()
            .filter(|(name, _)| *name != header::CONTENT_TYPE && *name != header::CONTENT_LENGTH)
            .map(|(name, value)| (name.as_str(), value.to_str().unwrap()))
            .collect();
        assert_eq!(
            refusal.iter().map(|(name, _)| *name).collect::<Vec<_>>(),
            [
                "retry-after",
                "rate_limit_type",
                "rate_limited_by",
                "reset_at"
            ]
        );
        assert_eq!(
            &refusal[..3],
            [
                ("retry-after", "60"),
                ("rate_limit_type", "requests"),
                ("rate_limited_by", "api_key"),
            ]
        );
        let body = json_body(third).await;
        assert_eq!(body["error"]["type"], "rate_limit_error");
        let message = body["error"]["message"].as_str().unwrap();
        let expected = format!(
            "Rate limit exceeded for api_key: {}. Limit type: requests. Current limit: 2, Remaining: 0. Limit resets at: ",
            hash_token(KEY)
        );
        assert!(message.starts_with(&expected), "{message}");
    }

    #[tokio::test]
    async fn a_complete_answer_gives_its_parallel_slot_back_before_it_goes_out() {
        let app = app(KeyLimits {
            rpm: None,
            max_parallel_requests: Some(1),
        });

        for _ in 0..3 {
            let response = call(&app, "/v1/messages", KEY).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                ratelimit_headers(&response),
                headers(&[
                    ("x-ratelimit-api_key-limit-max_parallel_requests", "1"),
                    ("x-ratelimit-api_key-remaining-max_parallel_requests", "0"),
                ])
            );
        }
        let failed = call(&app, "/v1/chat/completions", KEY).await;
        assert_eq!(failed.status(), StatusCode::BAD_REQUEST);
        assert_eq!(ratelimit_headers(&failed), []);
        assert_eq!(
            call(&app, "/v1/messages", KEY).await.status(),
            StatusCode::OK
        );
    }

    async fn read_to_its_end(response: Response) {
        to_bytes(response.into_body(), usize::MAX).await.unwrap();
    }

    async fn dropped(response: Response) {
        drop(response);
    }

    async fn served_once_released(app: &Router) -> bool {
        for _ in 0..100 {
            if call(app, "/v1/messages", KEY).await.status() == StatusCode::OK {
                return true;
            }
            tokio::task::yield_now().await;
        }
        false
    }

    #[rstest]
    #[case::read(read_to_its_end)]
    #[case::dropped(dropped)]
    #[tokio::test]
    async fn a_streamed_answer_holds_its_parallel_slot_until_its_body_is_done<F>(
        #[case] finish: fn(Response) -> F,
    ) where
        F: Future<Output = ()>,
    {
        let app = app(KeyLimits {
            rpm: None,
            max_parallel_requests: Some(1),
        });

        let streaming = call(&app, "/v1/messages/stream", KEY).await;
        assert_eq!(streaming.status(), StatusCode::OK);
        assert_eq!(ratelimit_headers(&streaming), []);
        let refused = call(&app, "/v1/messages", KEY).await;
        assert_eq!(refused.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            refused.headers()["rate_limit_type"],
            "max_parallel_requests"
        );

        finish(streaming).await;
        assert!(served_once_released(&app).await);
    }

    #[rstest]
    #[case::the_master_key(MASTER_KEY, KeyLimits { rpm: Some(0), max_parallel_requests: Some(0) })]
    #[case::a_key_without_limits(KEY, KeyLimits::default())]
    #[tokio::test]
    async fn a_caller_without_limits_of_its_own_is_never_refused(
        #[case] token: &str,
        #[case] key_limits: KeyLimits,
    ) {
        let app = app(key_limits);

        for _ in 0..3 {
            let response = call(&app, "/v1/messages", token).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(ratelimit_headers(&response), []);
        }
    }

    #[rstest]
    #[case::complete("/v1/messages", read_to_its_end)]
    #[case::streamed_to_its_end("/v1/messages/stream", read_to_its_end)]
    #[tokio::test]
    async fn a_served_call_charges_its_tokens_less_the_cached_reads_to_its_key_and_model<F>(
        #[case] path: &str,
        #[case] finish: fn(Response) -> F,
    ) where
        F: Future<Output = ()>,
    {
        let (app, rate_limit) = served_app(KeyLimits {
            rpm: Some(5),
            max_parallel_requests: None,
        });
        let hash = hash_token(KEY);

        finish(call(&app, path, KEY).await).await;

        assert_eq!(
            settled(&rate_limit, "api_key", &hash, 26.0).await,
            Some(26.0)
        );
        assert_eq!(
            settled(
                &rate_limit,
                "model_per_key",
                &format!("{hash}:claude-group"),
                26.0
            )
            .await,
            Some(26.0)
        );
    }

    #[tokio::test]
    async fn the_master_key_is_charged_as_the_proxy_names_it() {
        let (app, rate_limit) = served_app(KeyLimits::default());

        call(&app, "/v1/messages", MASTER_KEY).await;

        for (descriptor, value) in [
            ("api_key", "litellm_proxy_master_key"),
            ("user", "default_user_id"),
            ("model_per_key", "litellm_proxy_master_key:claude-group"),
        ] {
            assert_eq!(
                settled(&rate_limit, descriptor, value, 26.0).await,
                Some(26.0),
                "{descriptor}"
            );
        }
    }

    #[rstest]
    #[case::a_dropped_stream("/v1/messages/stream")]
    #[case::a_failed_call("/v1/chat/completions")]
    #[tokio::test]
    async fn a_call_that_tells_no_usage_charges_nothing(#[case] path: &str) {
        let (app, rate_limit) = served_app(KeyLimits {
            rpm: Some(5),
            max_parallel_requests: Some(1),
        });

        drop(call(&app, path, KEY).await);

        assert!(served_once_released(&app).await);
        assert_eq!(
            settled(
                &rate_limit,
                "model_per_key",
                &format!("{}:claude-group", hash_token(KEY)),
                26.0
            )
            .await,
            Some(26.0),
            "the call that told no usage was charged too"
        );
    }

    #[rstest]
    #[case::complete("/v1/messages", StatusCode::OK)]
    #[case::streamed("/v1/messages/stream", StatusCode::OK)]
    #[case::failed("/v1/chat/completions", StatusCode::BAD_REQUEST)]
    #[tokio::test]
    async fn every_answer_to_an_admitted_call_names_the_keys_rpm_limit(
        #[case] path: &str,
        #[case] status: StatusCode,
    ) {
        let app = app(KeyLimits {
            rpm: Some(1),
            max_parallel_requests: None,
        });

        let admitted = call(&app, path, KEY).await;
        let refused = call(&app, path, KEY).await;

        assert_eq!(admitted.status(), status);
        assert_eq!(admitted.headers()["x-litellm-key-rpm-limit"], "1");
        assert_eq!(refused.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(!refused.headers().contains_key("x-litellm-key-rpm-limit"));
        let unlimited = call(&self::app(KeyLimits::default()), path, KEY).await;
        assert!(!unlimited.headers().contains_key("x-litellm-key-rpm-limit"));
    }

    #[rstest]
    fn the_window_and_the_reservation_come_from_the_environment() {
        let environment = Environment {
            litellm_rate_limit_window_size: Some(30),
            litellm_tpm_token_reservation_enabled: Some(litellm_config::Flag(false)),
            ..Environment::default()
        };

        assert_eq!(
            Settings::from_environment(&environment),
            Settings {
                window_size: 30,
                tpm_reservation_enabled: false,
            }
        );
        assert_eq!(
            Settings::from_environment(&Environment::default()),
            Settings::default()
        );
    }
}
