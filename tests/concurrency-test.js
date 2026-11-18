
const net = require("net");

function createClient(name, chunks, delay = 0) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(3000, "localhost");
        let response = "";

        socket.on("connect", async () => {
            for (const chunk of chunks) {
                socket.write(chunk);

                if (delay) {
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        });

        socket.on("data", (data) => {
            response += data.toString();
        });

        socket.on("end", () => {
            console.log(`\n${name} response:\n${response}`);
            resolve(response);
        });

        socket.on("error", reject);
    });
}

async function runTest() {
    const clientA = createClient("Client A", [
        "POST /users HTTP/1.1\r\nHost: localhost:3000\r\nContent-Type: application/json\r\nContent-Length: 19\r\n\r\n",
        '{"name":"Client ',
        'A"}'
    ], 500);

    await new Promise((r) => setTimeout(r, 100));

    const clientB = createClient("Client B", [
        "POST /users HTTP/1.1\r\nHost: localhost:3000\r\nContent-Type: application/json\r\nContent-Length: 19\r\n\r\n",
        '{"name":"Client B"}'
    ]);

    await Promise.all([clientA, clientB]);
    console.log("\nBoth clients completed.");
}

runTest().catch(console.error);
