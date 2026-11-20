
const net = require("net");

const HOST = "localhost";
const PORT = 3000;

const connect = () => {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: HOST, port: PORT }, () => {
            resolve(socket);
        });

        socket.once("error", reject);
    });
};

// Reads complete HTTP responses using Content-Length.
// This test client assumes responses have Content-Length
// and does not test chunked transfer encoding.
const createResponseReader = (socket) => {
    let buffer = Buffer.alloc(0);
    let pending = [];
    let ended = false;

    const processBuffer = () => {
        while (pending.length > 0) {
            const headerEnd = buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) return;

            const headerText = buffer.subarray(0, headerEnd).toString();
            const headers = {};

            for (const line of headerText.split("\r\n").slice(1)) {
                const index = line.indexOf(":");
                if (index !== -1) {
                    headers[line.slice(0, index).toLowerCase()] =
                        line.slice(index + 1).trim();
                }
            }

            const contentLength = Number(headers["content-length"] || 0);
            const responseLength = headerEnd + 4 + contentLength;

            if (buffer.length < responseLength) return;

            const response = buffer.subarray(0, responseLength);
            buffer = buffer.subarray(responseLength);

            pending.shift().resolve(response);
        }
    };

    socket.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);
        processBuffer();
    });

    socket.on("end", () => {
        ended = true;
        for (const item of pending) {
            item.reject(new Error("Connection closed before response arrived"));
        }
        pending = [];
    });

    socket.on("error", (err) => {
        for (const item of pending) item.reject(err);
        pending = [];
    });

    return {
        nextResponse() {
            if (ended) {
                return Promise.reject(new Error("Socket already closed"));
            }

            return new Promise((resolve, reject) => {
                pending.push({ resolve, reject });
                processBuffer();
            });
        }
    };
};

const sendRequest = (socket, reader, request, label) => {
    return new Promise(async (resolve, reject) => {
        try {
            const responsePromise = reader.nextResponse();
            socket.write(request);

            const response = await responsePromise;

            console.log(`\n--- ${label} ---`);
            console.log(response.toString());

            resolve(response);
        } catch (err) {
            reject(err);
        }
    });
};

const getRequest = (path, connection = "keep-alive") => {
    return [
        `GET ${path} HTTP/1.1`,
        `Host: ${HOST}:${PORT}`,
        `Connection: ${connection}`,
        "",
        ""
    ].join("\r\n");
};

const postRequest = (path, data, connection = "keep-alive") => {
    const body = JSON.stringify(data);

    return [
        `POST ${path} HTTP/1.1`,
        `Host: ${HOST}:${PORT}`,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(body)}`,
        `Connection: ${connection}`,
        "",
        body
    ].join("\r\n");
};

// TEST 1: Multiple sequential requests on one socket
const testSequentialRequests = async () => {
    console.log("\n========== TEST 1: SEQUENTIAL REQUESTS ==========");

    const socket = await connect();
    const reader = createResponseReader(socket);

    await sendRequest(
        socket,
        reader,
        getRequest("/users"),
        "GET /users"
    );

    await sendRequest(
        socket,
        reader,
        postRequest("/users", { name: "Omkar", role: "developer" }),
        "POST /users"
    );

    await sendRequest(
        socket,
        reader,
        getRequest("/users/123?page=2&limit=10"),
        "GET /users/123"
    );

    await sendRequest(
        socket,
        reader,
        getRequest("/users/123/posts/456"),
        "GET /users/123/posts/456"
    );

    await sendRequest(
        socket,
        reader,
        [
            "DELETE /users/123 HTTP/1.1",
            `Host: ${HOST}:${PORT}`,
            "Connection: keep-alive",
            "",
            ""
        ].join("\r\n"),
        "DELETE /users/123 (204)"
    );

    socket.end();
};

// TEST 2: Static file requests on one socket
const testStaticFiles = async () => {
    console.log("\n========== TEST 2: STATIC FILES ==========");

    const socket = await connect();
    const reader = createResponseReader(socket);

    await sendRequest(socket, reader, getRequest("/"), "GET /");

    await sendRequest(
        socket,
        reader,
        getRequest("/style.css"),
        "GET /style.css"
    );

    await sendRequest(
        socket,
        reader,
        getRequest("/missing-file.html"),
        "GET missing file"
    );

    socket.end();
};

// TEST 3: Fragmented request
const testFragmentedRequest = async () => {
    console.log("\n========== TEST 3: FRAGMENTED REQUEST ==========");

    const socket = await connect();
    const reader = createResponseReader(socket);

    const request = postRequest("/users", {
        name: "Fragmented Client",
        city: "Mumbai"
    });

    const responsePromise = reader.nextResponse();

    socket.write(request.slice(0, 25));

    setTimeout(() => {
        socket.write(request.slice(25, 70));
    }, 100);

    setTimeout(() => {
        socket.write(request.slice(70));
    }, 200);

    const response = await responsePromise;

    console.log("\n--- Fragmented POST /users ---");
    console.log(response.toString());

    socket.end();
};

// TEST 4: Two simultaneous clients
const testConcurrentClients = async () => {
    console.log("\n========== TEST 4: CONCURRENT CLIENTS ==========");

    const clientA = await connect();
    const clientB = await connect();

    const readerA = createResponseReader(clientA);
    const readerB = createResponseReader(clientB);

    const responseA = sendRequest(
        clientA,
        readerA,
        postRequest("/users", { name: "Client A" }),
        "CLIENT A"
    );

    const responseB = sendRequest(
        clientB,
        readerB,
        postRequest("/users", { name: "Client B" }),
        "CLIENT B"
    );

    await Promise.all([responseA, responseB]);

    clientA.end();
    clientB.end();
};

// TEST 5: Connection close
const testConnectionClose = async () => {
    console.log("\n========== TEST 5: CONNECTION CLOSE ==========");

    const socket = await connect();
    const reader = createResponseReader(socket);

    await sendRequest(
        socket,
        reader,
        getRequest("/users", "close"),
        "GET /users with Connection: close"
    );

    await new Promise((resolve) => {
        socket.once("close", resolve);
    });

    console.log("Server closed the connection as requested.");
};

const runTests = async () => {
    try {
        await testSequentialRequests();
        await testStaticFiles();
        await testFragmentedRequest();
        await testConcurrentClients();
        await testConnectionClose();

        console.log("\n========== ALL TESTS COMPLETED ==========");
    } catch (err) {
        console.error("\nTEST FAILED:", err.message);
        process.exitCode = 1;
    }
};

runTests();
