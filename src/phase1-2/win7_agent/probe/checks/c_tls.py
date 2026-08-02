"""Offline Python TLS runtime introspection."""

import os
from typing import Any, Dict

from ..result import CheckResult, DEGRADED, PASS, ProbeError


def check_tls_python_runtime(ctx: Any) -> CheckResult:
    """Inspect Python ssl locally; this check performs no network operation."""
    details: Dict[str, Any] = {"ssl_importable": False, "openssl_version": None,
                               "default_context_ok": False, "default_verify_paths": None,
                               "has_sni": False, "has_alpn": False,
                               "has_tlsv1_2": False, "has_tlsv1_3": False,
                               "root_cert_count": "skipped"}
    try:
        import ssl
        details["ssl_importable"] = True
        details["openssl_version"] = ssl.OPENSSL_VERSION
        context = ssl.create_default_context()
        details["default_context_ok"] = context is not None
        paths = ssl.get_default_verify_paths()
        details["default_verify_paths"] = {"cafile": paths.cafile,
                                           "capath": paths.capath,
                                           "openssl_cafile": paths.openssl_cafile,
                                           "openssl_capath": paths.openssl_capath}
        details["has_sni"] = bool(getattr(ssl, "HAS_SNI", False))
        details["has_alpn"] = bool(getattr(ssl, "HAS_ALPN", False))
        details["has_tlsv1_2"] = bool(getattr(ssl, "HAS_TLSv1_2", False))
        details["has_tlsv1_3"] = bool(getattr(ssl, "HAS_TLSv1_3", False))
        details["has_protocol_tls_client"] = hasattr(ssl, "PROTOCOL_TLS_CLIENT")
        if os.name == "nt":
            try:
                details["root_cert_count"] = len(ssl.enum_certificates("ROOT"))
                details["enum_certificates_ok"] = True
            except (OSError, ssl.SSLError) as exc:
                details["root_cert_count"] = None
                details["enum_certificates_ok"] = False
                details["enum_certificates_error"] = str(exc)
        else:
            details["enum_certificates_ok"] = "skipped"
        if not details["default_context_ok"] or not details["has_tlsv1_2"]:
            return CheckResult("tls.python_runtime", DEGRADED, details,
                               error=ProbeError("TLS_UNAVAILABLE", "TLS 1.2 capability unavailable"))
    except (ImportError, OSError, ValueError) as exc:
        return CheckResult("tls.python_runtime", DEGRADED, details,
                           error=ProbeError("TLS_UNAVAILABLE", str(exc), type(exc).__name__))
    return CheckResult("tls.python_runtime", PASS, details)
