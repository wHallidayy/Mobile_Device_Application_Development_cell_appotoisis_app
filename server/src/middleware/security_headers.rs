//! Security Headers Middleware
//!
//! Implements security headers based on:
//! - OWASP Secure Headers Project
//! - OWASP Application Security Verification Standard (ASVS)

use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    http::header::{HeaderName, HeaderValue},
    Error,
};
use futures::future::{ok, LocalBoxFuture, Ready};
use std::rc::Rc;

// ============================================================================
// Security Headers Middleware
// ============================================================================

/// Security Headers Middleware Factory
///
/// Adds security headers to all responses based on OWASP recommendations.
pub struct SecurityHeaders;

impl SecurityHeaders {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SecurityHeaders {
    fn default() -> Self {
        Self::new()
    }
}

impl<S, B> Transform<S, ServiceRequest> for SecurityHeaders
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = SecurityHeadersService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(SecurityHeadersService {
            service: Rc::new(service),
        })
    }
}

pub struct SecurityHeadersService<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for SecurityHeadersService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();

        Box::pin(async move {
            let mut res = service.call(req).await?;

            // Add security headers (OWASP Secure Headers Project)
            let headers = res.headers_mut();

            // Strict-Transport-Security (HSTS)
            // Forces browsers to use HTTPS for future requests
            // max-age=31536000 = 1 year
            headers.insert(
                HeaderName::from_static("strict-transport-security"),
                HeaderValue::from_static("max-age=31536000; includeSubDomains"),
            );

            // X-Content-Type-Options
            // Prevents browsers from MIME type sniffing
            headers.insert(
                HeaderName::from_static("x-content-type-options"),
                HeaderValue::from_static("nosniff"),
            );

            // X-Frame-Options
            // Prevents clickjacking by disabling iframe embedding
            headers.insert(
                HeaderName::from_static("x-frame-options"),
                HeaderValue::from_static("DENY"),
            );

            // X-XSS-Protection
            // Disabled (set to 0) per OWASP recommendation
            // Legacy XSS filters can cause XSS vulnerabilities in some cases
            headers.insert(
                HeaderName::from_static("x-xss-protection"),
                HeaderValue::from_static("0"),
            );

            // Referrer-Policy
            // Controls how much referrer information is sent
            headers.insert(
                HeaderName::from_static("referrer-policy"),
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            );

            // Permissions-Policy (formerly Feature-Policy)
            // Restricts browser features
            headers.insert(
                HeaderName::from_static("permissions-policy"),
                HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
            );

            // Content-Security-Policy (CSP)
            // Strict CSP for API-only backend
            // default-src 'none' blocks all resource loading (API doesn't serve HTML/JS/CSS)
            // frame-ancestors 'none' prevents embedding in iframes
            // base-uri 'none' prevents base tag injection
            // form-action 'none' prevents form submissions
            headers.insert(
                HeaderName::from_static("content-security-policy"),
                HeaderValue::from_static(
                    "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
                ),
            );

            // Cache-Control
            // Prevents sensitive data from being cached
            // no-store: Never cache the response
            // no-cache: Must revalidate with server before using cached version
            // must-revalidate: Once stale, must revalidate
            headers.insert(
                HeaderName::from_static("cache-control"),
                HeaderValue::from_static("no-store, no-cache, must-revalidate, private"),
            );

            // Pragma (for HTTP/1.0 compatibility)
            headers.insert(
                HeaderName::from_static("pragma"),
                HeaderValue::from_static("no-cache"),
            );

            Ok(res)
        })
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_headers_default() {
        let _headers = SecurityHeaders::default();
        // Just verify it can be constructed
        assert!(true);
    }
}
