"""Filesystem and explicit encoding checks."""

import os
import shutil
import tempfile
from typing import Any, Dict

from ..result import CheckResult, FAIL, PASS, ProbeError


def _failure(check_id: str, details: Dict[str, Any], exc: Exception) -> CheckResult:
    code = "PATH_TOO_LONG" if getattr(exc, "errno", None) == 36 else "FS_OP_FAILED"
    return CheckResult(check_id, FAIL, details,
                       error=ProbeError(code, str(exc), type(exc).__name__))


def check_tempfile_basic(ctx: Any) -> CheckResult:
    """Create, roundtrip, and remove a temporary file and directory."""
    details = {"file_removed": False, "directory_removed": False}
    file_path = None
    directory = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False,
                                         dir=ctx.workdir, prefix="cap_probe_") as handle:
            file_path = handle.name
            handle.write("probe")
        with open(file_path, "r", encoding="utf-8", newline="") as reader:
            if reader.read() != "probe":
                raise OSError("temporary file content mismatch")
        directory = tempfile.mkdtemp(dir=ctx.workdir, prefix="cap_probe_")
        os.remove(file_path)
        file_path = None
        os.rmdir(directory)
        directory = None
        details["file_removed"] = True
        details["directory_removed"] = True
    except (OSError, UnicodeError) as exc:
        return _failure("tempfile.basic", details, exc)
    finally:
        if file_path is not None and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as exc:
                details["cleanup_file_error"] = str(exc)
        if directory is not None and os.path.exists(directory):
            try:
                shutil.rmtree(directory)
            except OSError as exc:
                details["cleanup_directory_error"] = str(exc)
    return CheckResult("tempfile.basic", PASS, details)


def check_unicode_paths(ctx: Any) -> CheckResult:
    """Verify Chinese and space-containing paths using UTF-8 text."""
    names = (("Chinese", "中文目录", "测 试 文件.txt"),
             ("spaces", "space directory", "file name.txt"),
             ("mixed", "中文 space directory", "中文 file name.txt"))
    root = os.path.join(ctx.workdir, "unicode_paths")
    details = {"cases": []}
    try:
        for label, directory_name, file_name in names:
            directory = os.path.join(root, directory_name)
            path = os.path.join(directory, file_name)
            os.makedirs(directory)
            with open(path, "w", encoding="utf-8", newline="") as writer:
                writer.write("Chinese text: 中文")
            with open(path, "r", encoding="utf-8", newline="") as reader:
                ok = reader.read() == "Chinese text: 中文"
            os.remove(path)
            os.rmdir(directory)
            details["cases"].append({"name": label, "roundtrip_ok": ok,
                                     "removed": not os.path.exists(path)})
            if not ok:
                raise OSError("unicode path roundtrip mismatch")
    except (OSError, UnicodeError) as exc:
        return _failure("fs.unicode_paths", details, exc)
    finally:
        if os.path.exists(root):
            try:
                shutil.rmtree(root)
            except OSError as exc:
                details["cleanup_error"] = str(exc)
    return CheckResult("fs.unicode_paths", PASS, details)


def check_encodings(ctx: Any) -> CheckResult:
    """Verify the five explicitly selected encodings without auto detection."""
    sample = "ASCII Chinese 中文 Fullwidth："
    encodings = ("utf-8", "utf-8-sig", "gbk", "utf-16", "utf-16-le")
    details = {"encodings": {}, "gbk_strict_raises": False}
    root = os.path.join(ctx.workdir, "encodings")
    try:
        os.makedirs(root)
        for encoding in encodings:
            path = os.path.join(root, encoding + ".txt")
            with open(path, "w", encoding=encoding, newline="") as writer:
                writer.write(sample)
            with open(path, "r", encoding=encoding, newline="") as reader:
                details["encodings"][encoding] = {"roundtrip_ok": reader.read() == sample}
            if not details["encodings"][encoding]["roundtrip_ok"]:
                raise UnicodeError("encoding roundtrip mismatch: " + encoding)
        try:
            "emoji: 😀".encode("gbk", "strict")
        except UnicodeEncodeError:
            details["gbk_strict_raises"] = True
        if not details["gbk_strict_raises"]:
            raise UnicodeError("GBK unexpectedly encoded an emoji")
    except (OSError, UnicodeError) as exc:
        return CheckResult("fs.encodings", FAIL, details,
                           error=ProbeError("ENCODING_MISMATCH", str(exc), type(exc).__name__))
    finally:
        if os.path.exists(root):
            try:
                shutil.rmtree(root)
            except OSError as exc:
                details["cleanup_error"] = str(exc)
    return CheckResult("fs.encodings", PASS, details)


def check_crlf_preserve(ctx: Any) -> CheckResult:
    """Ensure explicit newline handling preserves CRLF bytes."""
    path = os.path.join(ctx.workdir, "crlf.txt")
    details = {"bytes_preserved": False, "read_preserved": False}
    try:
        with open(path, "w", encoding="utf-8", newline="") as writer:
            writer.write("a\r\nb\r\n")
        with open(path, "rb") as reader:
            content = reader.read()
        with open(path, "r", encoding="utf-8", newline="") as reader:
            text = reader.read()
        details["bytes_preserved"] = b"\r\n" in content and b"\r\r\n" not in content
        details["read_preserved"] = text == "a\r\nb\r\n"
        if not details["bytes_preserved"] or not details["read_preserved"]:
            raise OSError("CRLF was transformed")
    except OSError as exc:
        return CheckResult("fs.crlf_preserve", FAIL, details,
                           error=ProbeError("CRLF_NOT_PRESERVED", str(exc), type(exc).__name__))
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError as exc:
            details["cleanup_error"] = str(exc)
    return CheckResult("fs.crlf_preserve", PASS, details)
