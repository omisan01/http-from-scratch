const net = require("net")

const server = net.createServer((socket) => {
    let headersParsed = false;
    let incomingBuffer = Buffer.alloc(0)

    // Route, Queries and Headers
    let requestLine = ""
    let query = "";
    let pathname = "";
    let method, target, version = "";
    const finalHeaders = {}

    // Body
    let incomingBodyChunks = Buffer.alloc(0);
    let bodyBytes = 0;

    socket.on("data", (data) => {
        // If headers are parsed then dont parse it again
        if (!headersParsed) {
            incomingBuffer = Buffer.concat([incomingBuffer, data])
            const bodyStart = incomingBuffer.indexOf("\r\n\r\n");
            if (bodyStart === - 1) return;

            const requestArr = incomingBuffer.subarray(0, bodyStart).toString().split('\r\n')
            requestLine = requestArr[0];
            // Request Line with method, target and version
            [method, target, version] = requestLine.split(" ")
            const queryStart = target.indexOf("?")
            if (queryStart === -1) {
                pathname = target
            } else {
                pathname = target.slice(0, queryStart)
                query = target.slice(queryStart + 1)
            }

            // Headers Array
            const headersArray = requestArr.slice(1)

            for (let header of headersArray) {
                const firstColon = header.indexOf(':')
                finalHeaders[header.slice(0, firstColon).toLowerCase()] = header.slice(firstColon + 1).trim()
            }

            // Set incoming body chunks
            incomingBodyChunks = incomingBuffer.subarray(bodyStart + 4)
            bodyBytes = incomingBodyChunks.length
            headersParsed = true
        } else {
            incomingBodyChunks = Buffer.concat([incomingBodyChunks, data])
            bodyBytes += data.length
        }
        const expectedLength = Number(finalHeaders["content-length"] || 0);
        if (bodyBytes === expectedLength) {
            let body = incomingBodyChunks.toString();

            if (finalHeaders["content-type"] === 'application/json') {
                body = JSON.parse(body)
            }

            const responseBody = {
                message: "Request received successfully",
                method,
                pathname,
                query,
                headers: finalHeaders,
                body
            };

            const responseString = JSON.stringify(responseBody);
            const byteLength = Buffer.byteLength(responseString)

            const res = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${byteLength}\r\n\r\n${responseString}`
            socket.end(res)
        }
    })




})

server.listen(3000, "localhost", () => {
    console.log("server listenign to port 3000")
})