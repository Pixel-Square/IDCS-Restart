import socket
import ssl
import threading
import sys

LOCAL_HOST = '127.0.0.1'
SSL_PORT = 8443
CERT_FILE = '/home/iqac2/Desktop/idcs-mt/KR Tracker/ssl/cert.pem'
KEY_FILE = '/home/iqac2/Desktop/idcs-mt/KR Tracker/ssl/key.pem'

def get_active_port():
    for p in (8056, 8055):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect((LOCAL_HOST, p))
            s.close()
            return p
        except Exception:
            pass
    return 8056

def forward(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass

def handle_client(client_sock):
    target_port = get_active_port()
    try:
        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        target_sock.connect((LOCAL_HOST, target_port))
        t1 = threading.Thread(target=forward, args=(client_sock, target_sock), daemon=True)
        t2 = threading.Thread(target=forward, args=(target_sock, client_sock), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
    except Exception as e:
        try:
            client_sock.close()
        except Exception:
            pass

def main():
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)

    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind(('0.0.0.0', SSL_PORT))
    server_sock.listen(128)
    print(f"HTTPS proxy listening on 0.0.0.0:{SSL_PORT} -> auto (8056/8055)", flush=True)

    with context.wrap_socket(server_sock, server_side=True) as ssl_server:
        while True:
            try:
                client_sock, addr = ssl_server.accept()
                threading.Thread(target=handle_client, args=(client_sock,), daemon=True).start()
            except Exception as e:
                pass

if __name__ == '__main__':
    main()
