# -*- coding: utf-8 -*-
"""
SPIKE 04 - SQLite 桥接 worker（开发机后端）

通过 JSON-lines 协议在 Node 与 python3 sqlite3 之间执行 SQL。
仅用于开发机逻辑验证：Win7 实机使用锁定 better-sqlite3（Electron ABI 110）。
python3 sqlite3 为 SQLite 3.43.2，与锁定 3.43.1 同系列；此处不产出性能证据。

协议（stdin/stdout，每行一个 JSON）：
  请求: {"id":1,"op":"open","path":...}
        {"id":1,"op":"exec","sql":...}
        {"id":1,"op":"pragma","sql":..., "simple":bool}
        {"id":1,"op":"prepare","sql":...}            -> 语句句柄
        {"id":1,"op":"run","stmt":N,"params":[...]}
        {"id":1,"op":"get","stmt":N,"params":[...]}
        {"id":1,"op":"all","stmt":N,"params":[...]}
        {"id":1,"op":"finalize","stmt":N}
        {"id":1,"op":"begin"|"commit"|"rollback"}
        {"id":1,"op":"close"}
  响应: {"id":1,"ok":true,"result":...}
        {"id":1,"ok":false,"error":"..."}
"""

import json
import os
import sqlite3
import sys


class Bridge(object):
    def __init__(self):
        self.db = None
        self.stmts = {}  # stmt_id -> {"cursor": cursor, "sql": str}
        self.next_stmt = 1
        self._in_tx = False

    def _err(self, msg):
        return {"ok": False, "error": str(msg)}

    def handle(self, req):
        op = req.get("op")
        try:
            if op == "open":
                path = req["path"]
                self.db = sqlite3.connect(path)
                self.db.row_factory = sqlite3.Row
                return {"ok": True, "result": {"sqlite_version": sqlite3.sqlite_version}}

            if op == "exec":
                self.db.executescript(req["sql"])
                self.db.commit()
                return {"ok": True, "result": None}

            if op == "pragma":
                simple = req.get("simple", False)
                cur = self.db.execute(req["sql"])
                if simple:
                    row = cur.fetchone()
                    return {"ok": True, "result": row[0] if row else None}
                rows = [dict(r) for r in cur.fetchall()]
                return {"ok": True, "result": rows}

            if op == "prepare":
                stmt = self.next_stmt
                self.next_stmt += 1
                self.stmts[stmt] = {"cursor": self.db.cursor(), "sql": req["sql"]}
                return {"ok": True, "result": {"stmt": stmt}}

            if op == "run":
                stmt = req["stmt"]
                entry = self.stmts[stmt]
                entry["cursor"].execute(entry["sql"], req.get("params", []))
                # 显式事务内（db.js transaction）不 commit，原子性由 begin/commit/rollback 驱动；
                # 事务外（裸 CRUD）python sqlite3 会隐式开启事务，需在此提交避免
                # "cannot start a transaction within a transaction"。
                if not self._in_tx:
                    self.db.commit()
                return {"ok": True, "result": {"changes": entry["cursor"].rowcount, "lastrowid": entry["cursor"].lastrowid}}

            if op == "get":
                stmt = req["stmt"]
                entry = self.stmts[stmt]
                entry["cursor"].execute(entry["sql"], req.get("params", []))
                row = entry["cursor"].fetchone()
                return {"ok": True, "result": dict(row) if row else None}

            if op == "all":
                stmt = req["stmt"]
                entry = self.stmts[stmt]
                entry["cursor"].execute(entry["sql"], req.get("params", []))
                rows = [dict(r) for r in entry["cursor"].fetchall()]
                return {"ok": True, "result": rows}

            if op == "finalize":
                stmt = req["stmt"]
                entry = self.stmts.pop(stmt, None)
                if entry is not None:
                    entry["cursor"].close()
                return {"ok": True, "result": None}

            if op == "begin":
                self.db.execute("BEGIN")
                self._in_tx = True
                return {"ok": True, "result": None}

            if op == "commit":
                self.db.commit()
                self._in_tx = False
                return {"ok": True, "result": None}

            if op == "rollback":
                self.db.rollback()
                self._in_tx = False
                return {"ok": True, "result": None}

            if op == "close":
                try:
                    if self.db is not None:
                        self.db.close()
                finally:
                    self.db = None
                return {"ok": True, "result": None}

            return self._err("unknown op: " + str(op))
        except Exception as exc:  # noqa: BLE001
            return self._err(exc)


def main():
    bridge = Bridge()
    stdin = getattr(sys.stdin, "buffer", None)
    if stdin is not None:
        for line in stdin:
            if not line:
                continue
            text = line.decode("utf-8", "replace").strip()
            if not text:
                continue
            try:
                req = json.loads(text)
            except Exception as exc:  # noqa: BLE001
                sys.stdout.write(json.dumps({"ok": False, "error": "bad json: %s" % exc}) + "\n")
                sys.stdout.flush()
                continue
            resp = bridge.handle(req)
            resp["id"] = req.get("id")
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    else:
        # 交互式/非管道：逐行读文本
        for line in sys.stdin:
            text = line.strip()
            if not text:
                continue
            try:
                req = json.loads(text)
            except Exception as exc:  # noqa: BLE001
                sys.stdout.write(json.dumps({"ok": False, "error": "bad json: %s" % exc}) + "\n")
                sys.stdout.flush()
                continue
            resp = bridge.handle(req)
            resp["id"] = req.get("id")
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
