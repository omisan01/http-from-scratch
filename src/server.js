const { registerRoute, findRoute, findRouteByPathname } = require("./router")
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
                socket.end(responseBuilder(400, "Bad Request", {
                    "Content-Type": "application/json",
                    "Content-Length": reqErrByteLength
                }, reqLineErr))
                return;
            };


            // Request Line with method, target and version
            [method, target, version] = parts

            if (!method || !target || version !== "HTTP/1.1") {
                const reqLineErr = JSON.stringify({ error: "Invalid Request" })
                const reqErrByteLength = Buffer.byteLength(reqLineErr);

                socket.end(responseBuilder(400, "Bad Request", {
                    "Content-Type": "application/json",
                    "Content-Length": reqErrByteLength
                }, reqLineErr))
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
                    socket.end(responseBuilder(400, "Bad Request", {
                        "Content-Type": "application/json",
                        "Content-Length": headerErrByteLength
                    }, headerErr))
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

                socket.end(responseBuilder(413, "Payload Too Large", {
                    "Content-Type": "application/json",
                    "Content-Length": bodyErrByteLength
                }, bodyLengthErr))
                return;
            }
            headersParsed = true
        } else {
            incomingBodyChunks = Buffer.concat([incomingBodyChunks, data])
            bodyBytes += data.length
            if (bodyBytes > MAX_BODY_SIZE) {
                const bodyLengthErr = JSON.stringify({ error: "Body length cannot exceed 1 MB" })
                const bodyErrByteLength = Buffer.byteLength(bodyLengthErr)

                socket.end(responseBuilder(413, "Payload Too Large", {
                    "Content-Type": "application/json",
                    "Content-Length": bodyErrByteLength
                }, bodyLengthErr))
                return;
            }
        }
        const expectedLength = Number(finalHeaders["content-length"] || 0);

        if (expectedLength > MAX_BODY_SIZE) {
            const bodyLengthErr = JSON.stringify({ error: "Body length cannot exceed 1 MB" })
            const bodyErrByteLength = Buffer.byteLength(bodyLengthErr)

            socket.end(responseBuilder(413, "Payload Too Large", {
                "Content-Type": "application/json",
                "Content-Length": bodyErrByteLength
            }, bodyLengthErr))
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
                    const res = responseBuilder(400, "Bad Request", {
                        "Content-Type": "application/json",
                        "Content-Length": errByteLength
                    }, errorResponseBody)
                    socket.end(res)
                    return;
                }
            }

            const existingRoutes = findRouteByPathname(pathname)
            if (existingRoutes.length === 0) {
                const routeErr = JSON.stringify({ error: "Route not found" })
                const routeErrByteLength = Buffer.byteLength(routeErr)
                socket.end(responseBuilder(404, "Not Found", {
                    "Content-Type": "application/json",
                    "Content-Length": routeErrByteLength
                }, routeErr))
                return;
            }

            const route = findRoute(method, pathname)
            if (!route) {
                const allowedMethods = existingRoutes.map((route) => route.method).join(", ")
                const routeMethodErr = JSON.stringify({ error: "Method not allowed" })
                const routeErrByteLength = Buffer.byteLength(routeMethodErr)
                socket.end(responseBuilder(405, "Method Not Allowed", {
                    "Content-Type": "application/json",
                    "Content-Length": routeErrByteLength,
                    "Allow": allowedMethods
                }, routeMethodErr))
                return;
            }

            const queryParams = Object.fromEntries(new URLSearchParams(query))

            const request = {
                method,
                pathname,
                query: queryParams,
                headers: finalHeaders,
                body,
                params: route.params
            }

            const { status, statusText, body: resBody } = route.handler(request)

            if (status === 204) {
                socket.end(responseBuilder(204, "No Content"))
                return
            }

            const responseString = JSON.stringify(resBody);
            const byteLength = Buffer.byteLength(responseString)

            const res = responseBuilder(status, statusText, {
                "Content-Type": "application/json",
                "Content-Length": byteLength
            }, responseString)
            socket.end(res)
        }
    })

    socket.on("error", (err) => {
        console.error("Socket error:", err.message);
    });

})

registerRoute("GET", "/users", (req, res) => {
    return {
        status: 200,
        statusText: "OK",
        body: {
            message: "Users fetched"
        }
    };

});
registerRoute("POST", "/users", () => {
    return {
        status: 201,
        statusText: "Created",
        body: {
            message: "User created"
        }
    };

});
registerRoute("GET", "/users/:userId/posts/:postId", (req) => {
    return {
        status: 200,
        statusText: "OK",
        body: {
            userId: req.params.userId,
            postId: req.params.postId
        }
    };
});
registerRoute("GET", "/users/:id", (req) => {
    return {
        status: 200,
        statusText: "OK",
        body: {
            userId: req.params.id,
            page: req.query.page,
            limit: req.query.limit

        }
    };
});
registerRoute("DELETE", "/users/:id", (req) => {
    return {
        status: 204,
        statusText: "No Content",
        body: null
    };
});

server.listen(3000, "localhost", () => {
    console.log("server listenign to port 3000")
})



const responseBuilder = (status, statusCode, headers = {}, body = "", version = "HTTP/1.1") => {
    const additionalHeaders = Object.entries(headers).map(([key, value]) => {
        return `${key}: ${value}\r\n`
    }).join("")
    return `${version} ${status} ${statusCode}\r\n${additionalHeaders}\r\n${body}`
} 