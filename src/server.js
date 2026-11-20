const { registerRoute, findRoute, findRouteByPathname } = require("./router")
const { getStaticFile } = require("./static/staticFileHandler");

const net = require("net")

const MAX_BODY_SIZE = 1024 * 1024;

const staticFileErrorsMap = {
    400: "Bad Request",
    403: "Forbidden",
    404: "File not found",
    500: "Internal Server Error"
};

const fileSystemErrorMap = {
    BAD_PATH: 400,
    INVALID_PATH: 403,
    ENOENT: 404,
    ENOTDIR: 404,
    EISDIR: 404
};

const STATUS_TEXT = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    413: "Payload Too Large",
    431: "Request Header Fields Too Large",
    500: "Internal Server Error"
};

const server = net.createServer((socket) => {
    let incomingBuffer = Buffer.alloc(0)
    let isProcessing = false;
    let closed = false;

    socket.on("data", async (data) => {
        if (closed) return;
        incomingBuffer = Buffer.concat([incomingBuffer, data])

        if (isProcessing) return;

        await processBuffer();
    })

    socket.on("close", () => { closed = true; });

    socket.on("error", (err) => {
        console.error("Socket error:", err.message);
    });

    const processBuffer = async () => {
        isProcessing = true;
        try {
            while (true) {
                const parsedReqRes = parseRequest(incomingBuffer)

                if (!parsedReqRes) break;

                if (parsedReqRes.error) {
                    sendError(parsedReqRes.status, parsedReqRes.error)
                    return;
                }

                incomingBuffer = incomingBuffer.subarray(parsedReqRes.consumed);

                const shouldClose = (parsedReqRes.headers["connection"] || "").toLowerCase() === "close";
                const response = await handleRequest(parsedReqRes, shouldClose)

                if (socket.destroyed) return;

                if (shouldClose) {
                    socket.end(response)
                    return;
                }
                socket.write(response)
            }
        } catch (err) {
            console.error("Handler error:", err.message);
            if (!socket.destroyed) sendError(500, "Internal Server Error");
            return;
        } finally {
            isProcessing = false
        }

    }

    const sendError = (status, message) => {
        const body = JSON.stringify({ error: message })
        socket.end(responseBuilder(status, STATUS_TEXT[status], {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "Connection": "close"
        }, body))
    }


    const handleRequest = async (request, shouldClose) => {
        let body = request.body.toString();

        const contentType = (request.headers["content-type"] || "").split(";")[0].trim().toLowerCase()

        const existingRoutes = findRouteByPathname(request.pathname)
        if (existingRoutes.length === 0) {
            if (request.method !== "GET") {
                return jsonResponse(404, { error: "Route Not found" }, {}, shouldClose)
            }

            const file = await getStaticFile(request.pathname.slice(1));
            if (file.error) {
                const status = fileSystemErrorMap[file.error.code] || 500;
                return jsonResponse(status, { error: staticFileErrorsMap[status] }, {}, shouldClose)
            }

            const headers = {
                "Content-Type": file.mimeType,
                "Content-Length": file.bytes
            };
            if (shouldClose) headers["Connection"] = "close";

            const head = responseBuilder(200, "OK", headers);
            return Buffer.concat([Buffer.from(head), file.data]);
        }

        const route = findRoute(request.method, request.pathname);

        if (!route) {
            const allowed = existingRoutes.map((route) => route.method).join(", ");
            return jsonResponse(405, { error: "Method not allowed" }, { Allow: allowed }, shouldClose)
        }

        if (contentType === 'application/json' && body.length > 0) {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return jsonResponse(400, { error: "Invalid JSON" }, {}, shouldClose);
            }
        }

        const queryParams = Object.fromEntries(new URLSearchParams(request.query));

        const req = {
            method: request.method,
            pathname: request.pathname,
            query: queryParams,
            headers: request.headers,
            body,
            params: route.params
        };

        let result;
        try {
            result = await route.handler(req);
        } catch (err) {
            console.error("Route handler threw:", err.message);
            return jsonResponse(500, { error: "Internal Server Error" }, {}, shouldClose);
        }

        if (!result || typeof result.status !== "number") {
            return jsonResponse(500, { error: "Handler returned an invalid response" }, {}, shouldClose);
        }

        if (result.status === 204) {
            const headers = shouldClose ? { Connection: "close" } : {};
            return responseBuilder(204, "No Content", headers);
        }

        return jsonResponse(result.status, result.body ?? null, {}, shouldClose);
    };

    const jsonResponse = (status, obj, extraHeaders = {}, shouldClose = false) => {
        const body = JSON.stringify(obj);
        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...extraHeaders
        };
        if (shouldClose) headers["Connection"] = "close";
        return responseBuilder(status, STATUS_TEXT[status], headers, body);
    };

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
registerRoute("POST", "/users", (req) => {
    return {
        status: 201,
        statusText: "Created",
        body: {
            received: req.body

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

const MAX_HEADER_SIZE = 8 * 1024;

const parseRequest = (buffer) => {
    const bodyStart = buffer.indexOf("\r\n\r\n")

    if (bodyStart === -1) {
        if (buffer.length > MAX_HEADER_SIZE) {
            return { error: "Headers too large", status: 431 }
        }
        return null;
    }

    if (bodyStart > MAX_HEADER_SIZE) {
        return { error: "Headers too large", status: 431 }
    }

    const requestArr = buffer.subarray(0, bodyStart).toString().split('\r\n')
    const parts = requestArr[0].trim().split(/\s+/);

    if (parts.length !== 3) {
        return { error: "Malformed Request", status: 400 };
    };

    // Request Line with method, target and version
    const [method, target, version] = parts

    if (!method || !target || version !== "HTTP/1.1") {
        return { error: "Invalid Header", status: 400 }
    }



    const queryStart = target.indexOf("?")
    const pathname = queryStart === -1 ? target : target.slice(0, queryStart);
    const query = queryStart === -1 ? "" : target.slice(queryStart + 1);


    // Headers Array
    const headers = {}

    for (let header of requestArr.slice(1)) {
        const firstColon = header.indexOf(':')
        if (firstColon <= 0 || header.slice(0, firstColon).trim() === "") {
            return { error: "Invalid Header", status: 400 }
        }

        const name = header.slice(0, firstColon).trim().toLowerCase()
        headers[name] = header.slice(firstColon + 1).trim()
    }

    const rawLength = headers["content-length"] ?? "0"
    if (!/^\d+$/.test(rawLength)) {
        return { error: "Invalid Content-Length", status: 400 }
    }

    const contentLength = Number(rawLength);

    if (contentLength > MAX_BODY_SIZE) {
        return { error: "Body Length cannot exceed 1MB", status: 413 }
    }

    const totalLength = bodyStart + 4 + contentLength;
    if (buffer.length < totalLength) return null;  // Body not fully arrived

    const body = buffer.subarray(bodyStart + 4, totalLength);

    return { method, pathname, query, headers, body, consumed: totalLength }
}

