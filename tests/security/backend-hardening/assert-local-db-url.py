#!/usr/bin/env python3
"""Validate and pin PostgreSQL URI to a literal loopback IP."""
import ipaddress, socket, sys
from urllib.parse import urlsplit, urlunsplit

def fail(msg):
    print("ERREUR hôte PostgreSQL: "+msg, file=sys.stderr)
    raise SystemExit(2)

if len(sys.argv)!=2: fail("URI PostgreSQL requise")
try: u=urlsplit(sys.argv[1])
except Exception: fail("URI invalide")
if u.scheme not in ("postgres","postgresql") or not u.hostname or not u.path or u.path=="/":
    fail("schéma, hôte et base explicites requis")
if u.query or u.fragment or "%" in u.hostname:
    fail("query, fragment, encodage ou zone d'interface interdits")
if u.username is None: fail("utilisateur PostgreSQL explicite requis")
try: port=u.port
except ValueError: fail("port invalide")
if port is not None and not 1<=port<=65535: fail("port hors limites")
host=u.hostname.lower()
if host=="localhost":
    try: resolved={x[4][0].split("%",1)[0] for x in socket.getaddrinfo(host,port or 5432,type=socket.SOCK_STREAM)}
    except OSError: fail("résolution localhost impossible")
    if not resolved: fail("localhost ne résout vers aucune adresse")
    addrs=[]
    for value in resolved:
        try: ip=ipaddress.ip_address(value)
        except ValueError: fail("adresse résolue invalide")
        if not ip.is_loopback: fail("localhost résout vers une adresse non loopback")
        addrs.append(ip)
    addrs.sort(key=lambda x:(x.version!=4,x.compressed))
    target=addrs[0]
else:
    try: target=ipaddress.ip_address(host)
    except ValueError: fail("seuls localhost ou une IP loopback littérale sont autorisés")
    if not target.is_loopback: fail("IP non loopback")
userinfo=u.netloc.rsplit("@",1)[0]+"@" if "@" in u.netloc else ""
h=f"[{target.compressed}]" if target.version==6 else target.compressed
print(urlunsplit((u.scheme,f"{userinfo}{h}{':'+str(port) if port else ''}",u.path,"","")))
