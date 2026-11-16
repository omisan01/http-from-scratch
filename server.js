const net = require("net")

const MAX_BODY_SIZE = 1024 * 1024;

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
            const parts = requestLine.trim().split(/\s+/);

            if (parts.length !== 3) {
                const reqLineErr = JSON.stringify({ error: "Malformed Request" })
                const reqErrByteLength = Buffer.byteLength(reqLineErr);
                socket.end(responseBuilder(400, "Bad Request", "application/json", reqErrByteLength, reqLineErr))
                return;
            };


            // Request Line with method, target and version
            [method, target, version] = parts

            if (!method || !target || version !== "HTTP/1.1") {
                const reqLineErr = JSON.stringify({ error: "Invalid Request" })
                const reqErrByteLength = Buffer.byteLength(reqLineErr);

                socket.end(responseBuilder(400, "Bad Request", "application/json", reqErrByteLength, reqLineErr))
                return;
            }

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
                const headerErr = JSON.stringify({ error: "Invalid Header" })
                const headerErrByteLength = Buffer.byteLength(headerErr);
                const firstColon = header.indexOf(':')
                if (firstColon <= 0 || header.slice(0, firstColon).trim() === "") {
                    socket.end(responseBuilder(400, "Bad Request", "application/json", headerErrByteLength, headerErr))
                    return;
                }

                const headerName = header.slice(0, firstColon).trim().toLowerCase()
                finalHeaders[headerName] = header.slice(firstColon + 1).trim()
            }

            // Set incoming body chunks
            incomingBodyChunks = incomingBuffer.subarray(bodyStart + 4)
            bodyBytes = incomingBodyChunks.length
            if (bodyBytes > MAX_BODY_SIZE) {
                const bodyLengthErr = JSON.stringify({ error: "Body length cannot exceed 1 MB" })
                const bodyErrByteLength = Buffer.byteLength(bodyLengthErr)

                socket.end(responseBuilder(413, "Payload Too Large", "application/json", bodyErrByteLength, bodyLengthErr))
                return;
            }
            headersParsed = true
        } else {
            incomingBodyChunks = Buffer.concat([incomingBodyChunks, data])
            bodyBytes += data.length
            if (bodyBytes > MAX_BODY_SIZE) {
                const bodyLengthErr = JSON.stringify({ error: "Body length cannot exceed 1 MB" })
                const bodyErrByteLength = Buffer.byteLength(bodyLengthErr)

                socket.end(responseBuilder(413, "Payload Too Large", "application/json", bodyErrByteLength, bodyLengthErr))
                return;
            }
        }
        const expectedLength = Number(finalHeaders["content-length"] || 0);

        if (expectedLength > MAX_BODY_SIZE) {
            const bodyLengthErr = JSON.stringify({ error: "Body length cannot exceed 1 MB" })
            const bodyErrByteLength = Buffer.byteLength(bodyLengthErr)

            socket.end(responseBuilder(413, "Payload Too Large", "application/json", bodyErrByteLength, bodyLengthErr))
            return;
        }

        if (bodyBytes === expectedLength) {
            let body = incomingBodyChunks.toString();

            const contentType = (finalHeaders["content-type"] || "").split(";")[0].trim().toLowerCase()

            if (contentType === 'application/json') {
                try {
                    body = JSON.parse(body)
                } catch (e) {
                    const errorResponseBody = JSON.stringify({ error: "Invalid JSON" })
                    const errByteLength = Buffer.byteLength(errorResponseBody)
                    const res = responseBuilder(400, "Bad Request", "application/json", errByteLength, errorResponseBody)
                    socket.end(res)
                    return;
                }
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

            const res = responseBuilder(200, "OK", "application/json", byteLength, responseString)
            socket.end(res)
        }
    })

    socket.on("error", (err) => {
        console.error("Socket error:", err.message);
    });

})

server.listen(3000, "localhost", () => {
    console.log("server listenign to port 3000")
})


const responseBuilder = (status, statusCode, contentType, contentLength, body, version = "HTTP/1.1") => {
    return `${version} ${status} ${statusCode}\r\nContent-Type: ${contentType}\r\nContent-Length: ${contentLength}\r\n\r\n${body}`
} 