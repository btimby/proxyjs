const net = require('net');

let host = '127.0.0.1';
let port = 1337;

function parseProxyProtocol(buffer)
{
    // This function parses the first line sent by the FTP backend server.
    // This line dictates what local address to use and what address and
    // port to connect to.
    // http://www.haproxy.org/download/1.8/doc/proxy-protocol.txt
    let nl = buffer.indexOf('\r\n');

    if (nl == -1) {
        throw new Error('No newline received');
    }

    let line = buffer.subarray(0, nl).toString();
    let remainder = buffer.subarray(nl + 2);

    if (!line.indexOf('PROXY TCP4') == 0) {
        throw new Error('Unsupported proxy protocol');
    }

    let [src, sport, dst, dport] = line.substr(11).split(' ');

    return [src, parseInt(sport), dst, parseInt(dport), remainder];
}

let server = net.createServer((socket) => {
    socket.once('data', (buffer) => {
        let addr = socket.address();
        console.log(`Server connected: ${addr.address}:${addr.port}`);

        try {
            // We expect the client to speak the HAProxy PROXY PROTOCOL. The client should
            // tell use what source IP address to use and what client address to connect to.
            // This service is used for active FTP connections.
            let [src, sport, dst, dport, remainder] = parseProxyProtocol(buffer);

            console.log(`Received proxyLine: ${src}:${sport} -> ${dst}:${dport}`);

            // TODO: check a whitelist here. Only certain hosts should be allowed to proxy
            // through this server.

            let client = net.createConnection({
                port: dport,
                host: dst,
                localAddress: src,
                localPort: sport
            }, () => {
                console.log('Client socket connected')

                // We consumed the first line, anything else needs to be forwarded.
                if (remainder.length) {
                    console.log(`Remaining data: ${remainder}`);
                    client.write(remainder);
                }

                // Now we can connect client and server.
                console.log('Piping client <-> server');
                client.pipe(socket);
                socket.pipe(client);
            });

    // The rest is just error handling. If a client socket fails, we want to disconnect the
    // server as well. 
            client.on('error', (e) => {
                console.log('Client socket error');
                client.destroy();
                socket.destroy();
            });
    
            client.on('close', () => {
                console.log('Client socket closed');
                client.destroy();
                socket.destroy();
            });

        } catch (e) {
            console.log(e);
            socket.destroy();
        }
    });

    socket.on('error', (e) => {
        console.log('Server socket error')
        socket.destroy();
    });

    socket.on('close', (e) => {
        console.log('Server socket closed')
        socket.destroy();
    });
});

server.listen(port, host);
