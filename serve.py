# Local preview server that tells browsers to revalidate every file, so edits never load against stale cached scripts.
# usage: python3 serve.py <port> [bind address]
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
ThreadingHTTPServer((bind, port), partial(NoCache, directory=".")).serve_forever()
