#!/usr/bin/env python3
"""Preview the project page locally and open it in the default browser.

Usage (from this folder):  python3 serve.py [port]
Serves the folder over HTTP with caching disabled, so edits always show on reload.
If the port is busy, the next free port is used. Stop with Ctrl+C.
"""
import functools, http.server, os, socket, sys, threading, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Static files with caching disabled and HTTP Range support (for video seeking/looping)."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self._range = None
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not header or not header.startswith('bytes=') or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start_text, _, end_text = header[6:].split(',')[0].strip().partition('-')
        try:
            if start_text:
                start, end = int(start_text), int(end_text) if end_text else size - 1
            else:
                start, end = max(0, size - int(end_text)), size - 1
        except ValueError:
            return super().send_head()
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.end_headers()
            return None
        end = min(end, size - 1)
        f = open(path, 'rb')
        f.seek(start)
        self._range = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(self._range))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        try:
            if getattr(self, '_range', None) is None:
                return super().copyfile(source, outputfile)
            remaining = self._range
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser cancelled a download (reload, seek, navigation); harmless

    def log_message(self, fmt, *args):
        if os.environ.get('VERBOSE'):
            super().log_message(fmt, *args)


def free_port(start):
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise SystemExit('No free port found near %d' % start)


def main():
    port = free_port(int(sys.argv[1]) if len(sys.argv) > 1 else 8877)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    class Server(http.server.ThreadingHTTPServer):
        daemon_threads = True

        def handle_error(self, request, client_address):
            if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
                return  # cancelled transfer, not an error
            super().handle_error(request, client_address)

    server = Server(('127.0.0.1', port), handler)
    url = 'http://127.0.0.1:%d/' % port
    print('Inkinesis page: %s  (Ctrl+C to stop)' % url)
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
