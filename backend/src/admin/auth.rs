//! Who's signed in, according to the Better Auth service in `auth/`.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use serde::Deserialize;

/// The account behind a session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionUser {
    pub email: String,
    /// Google only reports verified addresses, but check anyway.
    pub email_verified: bool,
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct AuthError(pub String);

#[async_trait]
pub trait AdminAuth: Send + Sync {
    /// The user signed in with these cookies (the request's `Cookie` header), or `None` if they
    /// carry no valid session.
    async fn user(&self, cookie: &str) -> Result<Option<SessionUser>, AuthError>;
}

/// How long a confirmed session is trusted before asking the auth service again.
const CACHE_FOR: Duration = Duration::from_secs(60);
const MAX_CACHED: usize = 32;

/// Asks the Better Auth service: `GET <AUTH_URL>/api/auth/get-session`, with the browser's
/// cookies. Only sessions that were confirmed are cached, so bogus cookies can't fill the cache.
pub struct BetterAuthSessions {
    client: reqwest::Client,
    url: String,
    confirmed: Mutex<HashMap<String, (Instant, SessionUser)>>,
}

impl BetterAuthSessions {
    /// `base_url` is where the auth service is reached, e.g. "http://localhost:3002".
    pub fn new(base_url: &str) -> Result<Self, AuthError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| AuthError(e.to_string()))?;
        Ok(Self {
            client,
            url: format!("{}/api/auth/get-session", base_url.trim_end_matches('/')),
            confirmed: Mutex::default(),
        })
    }

    /// Configured by `AUTH_URL`; `None` when it's unset.
    pub fn from_env() -> Result<Option<Self>, AuthError> {
        std::env::var("AUTH_URL")
            .ok()
            .map(|url| Self::new(&url))
            .transpose()
    }

    fn cached(&self, cookie: &str) -> Option<SessionUser> {
        let confirmed = self
            .confirmed
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        confirmed
            .get(cookie)
            .filter(|(at, _)| at.elapsed() < CACHE_FOR)
            .map(|(_, user)| user.clone())
    }

    fn remember(&self, cookie: &str, user: &SessionUser) {
        let mut confirmed = self
            .confirmed
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        confirmed.retain(|_, (at, _)| at.elapsed() < CACHE_FOR);
        if confirmed.len() < MAX_CACHED {
            confirmed.insert(cookie.to_owned(), (Instant::now(), user.clone()));
        }
    }
}

#[async_trait]
impl AdminAuth for BetterAuthSessions {
    async fn user(&self, cookie: &str) -> Result<Option<SessionUser>, AuthError> {
        if let Some(user) = self.cached(cookie) {
            return Ok(Some(user));
        }
        let response = self
            .client
            .get(&self.url)
            .header(reqwest::header::COOKIE, cookie)
            .send()
            .await
            .map_err(|e| AuthError(format!("asking the auth service failed: {e}")))?;
        let status = response.status();
        if !status.is_success() {
            return Err(AuthError(format!("the auth service answered {status}")));
        }
        let body = response
            .bytes()
            .await
            .map_err(|e| AuthError(format!("reading the auth service's answer failed: {e}")))?;
        let user = parse_session(&body)?;
        if let Some(user) = &user {
            self.remember(cookie, user);
        }
        Ok(user)
    }
}

#[derive(Deserialize)]
struct Session {
    user: SessionJsonUser,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionJsonUser {
    email: String,
    #[serde(default)]
    email_verified: bool,
}

/// Better Auth's get-session body: the session and its user, or `null` when signed out.
fn parse_session(body: &[u8]) -> Result<Option<SessionUser>, AuthError> {
    let session: Option<Session> = serde_json::from_slice(body)
        .map_err(|e| AuthError(format!("unexpected get-session response: {e}")))?;
    Ok(session.map(|session| SessionUser {
        email: session.user.email,
        email_verified: session.user.email_verified,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_session_responses() {
        assert_eq!(parse_session(b"null").unwrap(), None);
        let body = br#"{"session":{"id":"s1","expiresAt":"2026-10-01T00:00:00.000Z"},
            "user":{"id":"u1","name":"Owner","email":"owner@example.com","emailVerified":true}}"#;
        assert_eq!(
            parse_session(body).unwrap(),
            Some(SessionUser {
                email: "owner@example.com".into(),
                email_verified: true,
            })
        );
        let unverified = br#"{"session":{},"user":{"email":"owner@example.com"}}"#;
        assert!(!parse_session(unverified).unwrap().unwrap().email_verified);
        assert!(parse_session(b"<html>").is_err());
    }
}
